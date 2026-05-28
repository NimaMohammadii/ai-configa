# ai-configa

Telegram text-to-speech bot built for Cloudflare Workers and ElevenLabs.

## Features

- Cloudflare Worker webhook bot, no polling server needed
- ElevenLabs text-to-speech
- Voice menu matching the requested layout
- Two pages of voices
- Demo button
- Output selector: MP3 or Voice
- Works without KV for simple deploy
- Optional KV support for durable user selections

## Required secrets

Use exactly these environment secret names:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ELEVEN_API
```

`BOT_TOKEN` is your Telegram bot token.
`ELEVEN_API` is your ElevenLabs API key.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Put local secrets inside `.dev.vars`:

```env
BOT_TOKEN=telegram_bot_token
ELEVEN_API=elevenlabs_api_key
```

## Deploy to Cloudflare Workers

```bash
npm install
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ELEVEN_API
npm run deploy
```

After deploy, set the Telegram webhook:

```bash
BOT_TOKEN=telegram_bot_token node scripts/set-webhook.js https://your-worker.your-subdomain.workers.dev
```

## Optional KV setup

The bot deploys without KV now. Without KV, user selections are stored only in Worker memory and may reset when Cloudflare restarts the isolate.

If you want persistent user selections, create a KV namespace:

```bash
npx wrangler kv namespace create USER_STATE
```

Then uncomment the KV block in `wrangler.toml` and replace the id with the real namespace id:

```toml
[[kv_namespaces]]
binding = "USER_STATE"
id = "your_real_kv_namespace_id"
```

Never deploy with a placeholder KV id.

## File structure

```text
src/worker.js            Worker entrypoint
src/bot.js               Telegram update logic
src/telegram-api.js      Telegram API base wrapper
src/telegram-actions.js  Telegram message/audio helpers
src/elevenlabs.js        ElevenLabs API client
src/ui.js                Menu text and inline keyboard
src/state.js             state helpers with memory fallback and optional KV
src/voices.js            Voice IDs
scripts/set-webhook.js   Webhook setup helper
wrangler.toml            Cloudflare Worker config
```

## Notes

Cloudflare Workers handle incoming requests with a `fetch` handler. Secrets are provided through Worker environment bindings. Telegram bots on Workers should use webhooks via `setWebhook`, not long polling.
