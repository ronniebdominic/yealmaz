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
		reverse_proxy localhost:11434 {
			header_up Host localhost:11434
		}
	}
	handle {
		respond 401
	}
}
```

**The `header_up Host localhost:11434` line is required, not optional.**
Ollama has its own built-in DNS-rebinding protection: it rejects any
request whose `Host` header isn't `localhost`/`127.0.0.1`-shaped. Without
this line, Caddy forwards the *original* external Host header (e.g. your
tunnel's public hostname) straight through, and Ollama silently 403s
every request — even ones that passed Caddy's own auth check. If you ever
see a 403 (not 401) coming back through the tunnel with `Via: 1.1 Caddy`
in the response headers, this is almost certainly why — the request got
past Caddy's auth and got rejected by Ollama itself.

Replace `YOUR_OLLAMA_PROXY_SECRET_HERE` with a long random string (e.g.
`openssl rand -hex 32` or any password generator) — this is the value
you'll set as `OLLAMA_PROXY_SECRET` on the Railway backend. Run Caddy:

```
caddy run
```

Confirm the proxy is enforcing auth AND that Ollama actually answers:
```
curl http://localhost:8443/api/tags
# should return 401

curl -H "Authorization: Bearer YOUR_OLLAMA_PROXY_SECRET_HERE" http://localhost:8443/api/tags
# should return Ollama's model list (a 403 here means the Host-header fix above is missing)
```

## 4. Get a stable public HTTPS URL

This gives Railway a way to reach the lab machine without opening any
port on your router or exposing your home/office IP. Cloudflare Tunnel is
one option, but requires a domain with its DNS hosted on Cloudflare
(either the whole domain's nameservers, or a single delegated subdomain
via an NS record at your existing registrar) — real but fiddly setup if
you don't already have that. **ngrok is simpler if you don't want to deal
with domains at all** — a free account includes one static subdomain
with no DNS work.

**Using ngrok (no domain needed):**
1. Sign up free at [ngrok.com](https://ngrok.com) → dashboard → copy your
   **Authtoken** → dashboard → **Cloud Edge → Domains** → claim a free
   static domain (e.g. `something.ngrok-free.dev`).
2. **Download the portable zip directly from ngrok.com/download — do NOT
   install via winget/Microsoft Store.** The Store/MSIX-packaged build
   cannot be launched under the Windows SYSTEM account (needed for
   auto-start), and will fail scheduled tasks with error `2147944320`
   (`ERROR_CANT_ACCESS_FILE`, Windows' generic "this is a packaged app"
   error). Extract `ngrok.exe` to a plain folder instead.
3. **Windows Defender will very likely flag `ngrok.exe` as "potentially
   unwanted software"** the moment you try to download or extract it —
   this is a well-known false positive for tunneling tools in general,
   not anything specific to this build. Add an exclusion first:
   ```powershell
   Add-MpPreference -ExclusionPath "C:\yealmaz-bot"
   ```
   (adjust the path to wherever you put `ngrok.exe`), then download/extract.
4. Run it, pointed at the Caddy proxy (not directly at Ollama):
   ```
   ngrok http 8443 --domain=your-static-domain.ngrok-free.dev --authtoken=YOUR_AUTHTOKEN
   ```
   Confirm you see `Session Status: online` and the `Forwarding` line
   showing your domain, then Ctrl+C.
5. Register it as a Windows scheduled task so it survives reboots and
   runs under SYSTEM, passing the authtoken directly on the command line
   (simpler and more reliable than trying to get SYSTEM to find a
   per-user config file):
   ```powershell
   $action = New-ScheduledTaskAction -Execute "C:\yealmaz-bot\ngrok.exe" -Argument "http 8443 --domain=your-static-domain.ngrok-free.dev --authtoken=YOUR_AUTHTOKEN"
   $trigger = New-ScheduledTaskTrigger -AtStartup
   $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
   $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
   Register-ScheduledTask -TaskName "YealmazNgrokTunnel" -Action $action -Trigger $trigger -Principal $principal -Settings $settings
   Start-ScheduledTask -TaskName "YealmazNgrokTunnel"
   ```

**Using Cloudflare Tunnel instead**, once you have a Cloudflare-hosted
zone (full domain or delegated subdomain):
```
cloudflared tunnel login
cloudflared tunnel create yealmaz-ollama
cloudflared tunnel route dns yealmaz-ollama ollama-lab.yourdomain.com
```
Then a config file (`~/.cloudflared/config.yml`):
```yaml
tunnel: yealmaz-ollama
credentials-file: /path/to/yealmaz-ollama-credentials.json
ingress:
  - hostname: ollama-lab.yourdomain.com
    service: http://localhost:8443
  - service: http_status:404
```
Run it (`cloudflared tunnel run yealmaz-ollama`), and install it as a
service for auto-start: `cloudflared service install` (unlike Caddy,
`cloudflared` has this built in, no manual scheduled task needed).

Whichever you use, confirm end-to-end from *outside* the lab network
(e.g. your phone on mobile data, not lab WiFi):
```
curl -H "Authorization: Bearer YOUR_OLLAMA_PROXY_SECRET_HERE" https://<your-tunnel-hostname>/api/tags
# should return Ollama's model list, same as the local test above
```

## 5. Auto-start everything on boot

Ollama, Caddy, and the tunnel (ngrok or `cloudflared`) all need to
survive a machine reboot unattended — a routine restart (Windows Update,
a power blip) should not silently take the bot offline until someone
notices.

- **Windows**: Ollama installs a startup entry automatically. For Caddy,
  register a Scheduled Task (`AtStartup` trigger, `SYSTEM` principal) —
  see the pattern above. For `cloudflared`, prefer its own
  `cloudflared service install`; for the portable ngrok build, use a
  Scheduled Task the same way as Caddy (see step 4).
- **Linux**: a `systemd` unit for each (`ollama serve` already ships a
  systemd service on Linux installs; `cloudflared service install` does
  this for you too on Linux).

Test by actually rebooting the machine once, waiting a minute, then
re-running the curl check from step 4.

## 6. Configure the Railway backend

Once steps 1–5 are confirmed working, set these on Railway (Project →
Variables), matching what's documented in `backend/.env.example`:

| Var | Value |
|---|---|
| `OLLAMA_BASE_URL` | `https://<your-tunnel-hostname>` (from step 4) |
| `OLLAMA_MODEL` | `hermes3:8b` (or whatever tag you pulled) |
| `OLLAMA_PROXY_SECRET` | the same secret from step 3's Caddyfile |
| `TELEGRAM_BOT_TOKEN` | from @BotFather on Telegram (create a bot with `/newbot` if you haven't) |
| `TELEGRAM_WEBHOOK_SECRET` | another long random string, your own choice |
| `TELEGRAM_ALLOWED_CHAT_IDS` | your Telegram chat ID — **use [@userinfobot](https://t.me/userinfobot) or @RawDataBot specifically**, not a generic "ID lookup" bot (those often show someone else's ID, a paywalled/ad-laden UI, or — confusingly — your *bot's* ID instead of yours if you forward/share anything to them mid-conversation). Comma-separated if more than one person needs access. |

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
  "test"`) → is Caddy running and enforcing auth *and* forwarding the
  right Host header (step 3's curl checks — a 403 specifically means the
  Host-header fix regressed) → is the tunnel connected (ngrok: check
  `Get-ScheduledTask -TaskName "YealmazNgrokTunnel"` shows `Running`, or
  `cloudflared tunnel info yealmaz-ollama`) → is Railway's
  `OLLAMA_BASE_URL` still correct.
- A reply of "Sorry, I couldn't reach the AI model just now" from the bot
  means the chain broke somewhere between Railway and Ollama — check the
  above in order rather than guessing. A reply of "I'm still working on
  your last question" is normal, not an error — it means a previous
  message is still being answered (local inference is slow, especially
  the first request after Ollama's been idle); just wait for a reply
  before sending the next message.
- There's no monitoring/alerting on any of this in v1 — a silent outage
  (e.g. the lab machine losing power overnight) will just mean the bot
  doesn't reply until someone notices and checks the chain above.
