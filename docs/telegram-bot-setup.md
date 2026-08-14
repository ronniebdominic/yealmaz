# Telegram + Local AI Agent — Lab Machine Setup

This is the infrastructure half of the Telegram business-Q&A bot — the
part that happens on the physical PC/server at the lab, outside this
repo. The backend code (already deployed) is inert until this is done:
every piece is guarded by an env var, so the app boots and runs normally
either way, it just won't answer Telegram messages yet.

Do these steps in order. Each one is checkable before moving to the next.

## 1. Install Ollama and pull the model

Download and install Ollama for your OS from https://ollama.com.

```
ollama pull hermes3:8b
```

Check the exact tag is still correct at https://ollama.com/library/hermes3
at setup time — if it's moved, pick the closest tool-calling-capable tag
in that family (avoid dropping below 8B; smaller models are meaningfully
worse at reliable tool-calling).

**Hardware note:** a 4-bit-quantized 8B model needs roughly 5–6GB of VRAM
for reasonable response times. A single consumer GPU (e.g. an RTX 3060
12GB or better) is comfortable. CPU-only will work but responses will be
noticeably slower — acceptable for an occasional Telegram Q&A bot, less
so if you want snappy replies.

Confirm it's running:
```
ollama run hermes3:8b "Say hello in one sentence."
```

## 2. Set the context window

Ollama's default context window (2k–4k tokens) is too small for this
bot's system prompt + 11 tool definitions + multi-round tool results —
without raising it, the model will silently lose earlier context partway
through a conversation. The bot's own requests set `num_ctx` explicitly
(see `backend/src/utils/localLlmClient.js`), so no action needed here —
this is just a note that if you ever call Ollama directly for something
else, remember the default is too small for this use case.

## 3. Put a minimal auth proxy in front of Ollama

**Ollama has zero built-in authentication** — anyone who can reach port
11434 can use your model and see everything it has access to. It must
never be exposed directly to the internet.

The simplest option is [Caddy](https://caddyserver.com) (a single static
binary, no dependencies). Install it, then create a `Caddyfile`:

```
:8443 {
	@authorized {
		header Authorization "Bearer YOUR_OLLAMA_PROXY_SECRET_HERE"
	}
	handle @authorized {
		reverse_proxy localhost:11434
	}
	handle {
		respond 401
	}
}
```

Replace `YOUR_OLLAMA_PROXY_SECRET_HERE` with a long random string (e.g.
`openssl rand -hex 32` or any password generator) — this is the value
you'll set as `OLLAMA_PROXY_SECRET` on the Railway backend. Run Caddy:

```
caddy run
```

Confirm the proxy is enforcing auth:
```
curl http://localhost:8443/api/tags
# should return 401

curl -H "Authorization: Bearer YOUR_OLLAMA_PROXY_SECRET_HERE" http://localhost:8443/api/tags
# should return Ollama's model list
```

## 4. Cloudflare Tunnel — get a stable public HTTPS URL

This gives Railway a way to reach the lab machine without opening any
port on your router or exposing your home/office IP.

1. Sign up for a free Cloudflare account if you don't have one.
2. Install `cloudflared`: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
3. Authenticate and create a **named tunnel** (not a quick/ephemeral one —
   the URL needs to stay stable):
   ```
   cloudflared tunnel login
   cloudflared tunnel create yealmaz-ollama
   ```
4. Point the tunnel at the Caddy proxy (not directly at Ollama):
   ```
   cloudflared tunnel route dns yealmaz-ollama ollama-lab.yourdomain.com
   ```
   (Needs a domain on Cloudflare. If you don't have one, Cloudflare Zero
   Trust's free tier can also issue a stable subdomain without you owning
   a domain — check current Cloudflare docs for the exact free-tier setup,
   since this changes over time.)
5. Add a config file (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: yealmaz-ollama
   credentials-file: /path/to/yealmaz-ollama-credentials.json
   ingress:
     - hostname: ollama-lab.yourdomain.com
       service: http://localhost:8443
     - service: http_status:404
   ```
6. Run it:
   ```
   cloudflared tunnel run yealmaz-ollama
   ```

Confirm end-to-end from *outside* the lab network (e.g. your phone on
mobile data, not lab WiFi):
```
curl -H "Authorization: Bearer YOUR_OLLAMA_PROXY_SECRET_HERE" https://ollama-lab.yourdomain.com/api/tags
# should return Ollama's model list, same as the local test above
```

## 5. Auto-start everything on boot

Ollama, Caddy, and `cloudflared` all need to survive a machine reboot
unattended — a routine restart (Windows Update, a power blip) should not
silently take the bot offline until someone notices.

- **Windows**: set each as a service (Ollama installs one automatically;
  for Caddy and `cloudflared`, use `sc.exe create` or Task Scheduler with
  "run at startup," or install `cloudflared` as a Windows service via
  `cloudflared service install`).
- **Linux**: a `systemd` unit for each (`ollama serve` already ships a
  systemd service on Linux installs; add one each for Caddy and
  `cloudflared` — `cloudflared service install` does this for you too).

Test by actually rebooting the machine once, waiting a minute, then
re-running the curl check from step 4.

## 6. Configure the Railway backend

Once steps 1–5 are confirmed working, set these on Railway (Project →
Variables), matching what's documented in `backend/.env.example`:

| Var | Value |
|---|---|
| `OLLAMA_BASE_URL` | `https://ollama-lab.yourdomain.com` (from step 4) |
| `OLLAMA_MODEL` | `hermes3:8b` (or whatever tag you pulled) |
| `OLLAMA_PROXY_SECRET` | the same secret from step 3's Caddyfile |
| `TELEGRAM_BOT_TOKEN` | from @BotFather on Telegram (create a bot with `/newbot` if you haven't) |
| `TELEGRAM_WEBHOOK_SECRET` | another long random string, your own choice |
| `TELEGRAM_ALLOWED_CHAT_IDS` | your Telegram chat ID (message [@userinfobot](https://t.me/userinfobot) to get it) — comma-separated if more than one |

Redeploy, then run the webhook registration script once (see the backend
README/`.env.example` for the exact command) to point Telegram at the
live backend.

## Ongoing operational notes

- Treat `OLLAMA_PROXY_SECRET` and `TELEGRAM_WEBHOOK_SECRET` with the same
  care as any other production secret in this system (`JWT_SECRET`,
  `CHAPA_SECRET_KEY`) — anyone with either one can reach the same data an
  ADMIN dashboard login sees.
- If the bot stops responding, check in this order: is the lab machine
  powered on and connected → is Ollama running (`ollama run hermes3:8b
  "test"`) → is Caddy running and enforcing auth (step 3's curl checks) →
  is the Cloudflare Tunnel connected (`cloudflared tunnel info
  yealmaz-ollama`) → is Railway's `OLLAMA_BASE_URL` still correct.
- There's no monitoring/alerting on any of this in v1 — a silent outage
  (e.g. the lab machine losing power overnight) will just mean the bot
  doesn't reply until someone notices and checks the chain above.
