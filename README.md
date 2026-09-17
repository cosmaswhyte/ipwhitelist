# Paystack Static-IP Proxy (Fly.io)

A tiny forwarding proxy so your Supabase Edge Functions can call Paystack
from a **fixed IP address**, so you can safely turn on Paystack's IP
whitelisting.

It does one thing: forward whatever request it gets to
`https://api.paystack.co`, and return Paystack's response unchanged. It
only accepts requests that include the correct `X-Proxy-Auth` header, so
it can't be used by anyone else as an open relay.

## 1. Install flyctl (one-time, on your own machine)

```bash
curl -L https://fly.io/install.sh | sh
```

Then sign up / log in:

```bash
fly auth signup   # or: fly auth login
```

## 2. Launch the app

From this folder:

```bash
fly launch --no-deploy
```

- Pick a unique app name when prompted (or accept the one in `fly.toml`).
- Choose a region close to Nigeria/Paystack — `lhr` (London) is a good default.
- Say **no** to Postgres/Redis if asked — this app needs neither.

## 3. Set the shared secret

Generate a long random token and set it as a Fly secret (do NOT hardcode it):

```bash
fly secrets set PROXY_AUTH_TOKEN="$(openssl rand -hex 32)"
```

Save that same value — you'll paste it into Lovable's secrets next.
To see the value again later: `fly secrets list` won't show it (secrets
are write-only), so save it somewhere safe now, e.g. a password manager.

## 4. Deploy

```bash
fly deploy
```

## 5. Get your static IP

```bash
fly ips allocate-v4
fly ips list
```

This is the IP address you paste into **Paystack Dashboard → Settings →
API Keys & Webhooks → IP Whitelist**.

## 6. Confirm it's up

```bash
curl https://<your-app-name>.fly.dev/healthz
# should return: ok
```

## 7. Give Claude/Lovable what it needs

Once deployed, give these two values back so the app's edge functions can
be pointed at the proxy:

- **Proxy URL**: `https://<your-app-name>.fly.dev`
- **PROXY_AUTH_TOKEN**: the value you generated in step 3

These get added as new secrets in Lovable (e.g. `PAYSTACK_PROXY_URL` and
`PAYSTACK_PROXY_AUTH_TOKEN`), and the Paystack-calling code gets updated to
route through this proxy instead of calling `api.paystack.co` directly.

## Cost

Fly.io's free allowance covers a single always-on shared-cpu-1x machine
with this footprint in many cases; if you're above the free tier, this
size machine typically runs a few dollars a month — far cheaper than a
per-request proxy service. A static IPv4 address is a small additional
monthly charge on top (check Fly's current pricing).
