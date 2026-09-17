// Minimal static-IP forwarding proxy for Paystack API calls.
//
// Purpose: Supabase Edge Functions don't have a static outbound IP, which
// Paystack's IP whitelisting requires. This tiny service runs on Fly.io
// (which *does* give you a static IPv4), and simply forwards whatever
// request it receives straight through to https://api.paystack.co,
// then returns Paystack's response unchanged.
//
// It only ever talks to api.paystack.co — nothing else — and only accepts
// requests that carry a shared secret in the X-Proxy-Auth header, so
// random internet traffic can't use it as an open relay.

import http from "node:http";
import https from "node:https";

const PORT = process.env.PORT || 8080;
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN;
const PAYSTACK_HOST = "api.paystack.co";

if (!PROXY_AUTH_TOKEN) {
  console.error("FATAL: PROXY_AUTH_TOKEN env var is not set. Refusing to start.");
  process.exit(1);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // Simple health check, no auth required, so Fly's health checker
    // (and you, curling it) can confirm the service is up.
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    const suppliedToken = req.headers["x-proxy-auth"];
    if (suppliedToken !== PROXY_AUTH_TOKEN) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const body = await readBody(req);

    // Forward everything else straight through to Paystack, on the
    // same path/method/headers the caller sent (minus hop-by-hop /
    // host-specific headers), over HTTPS.
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders["host"];
    delete forwardHeaders["x-proxy-auth"];
    delete forwardHeaders["content-length"]; // let https module recompute it

    const upstreamReq = https.request(
      {
        hostname: PAYSTACK_HOST,
        port: 443,
        path: req.url,
        method: req.method,
        headers: forwardHeaders,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on("error", (err) => {
      console.error("Upstream request to Paystack failed:", err.message);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream_error", message: err.message }));
    });

    if (body.length > 0) upstreamReq.write(body);
    upstreamReq.end();
  } catch (err) {
    console.error("Proxy error:", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "proxy_error", message: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Paystack static-IP proxy listening on :${PORT}`);
});
