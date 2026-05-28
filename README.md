# ai-configa

Telegram text-to-speech bot built for Cloudflare Workers and ElevenLabs.

## Features

- Cloudflare Worker webhook bot, no polling server needed
- ElevenLabs text-to-speech
- Voice menu matching the requested layout
- Two pages of voices
- Demo button
- Output selector: MP3 or Voice
- User selection saved in Cloudflare KV

## Required secrets

Use exactly these environment secret names:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ELEVEN_API
```

`BOT_TOKEN` is your Telegram bot token.
`ELEVEN_API` is your ElevenLabs API key.

## KV setup

Create a KV namespace:

```bash
npx wrangler kv namespace create USER_STATE
```

Copy the returned namespace id into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "USER_STATE"
id = "your_namespace_id"
```

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

## File structure

```text
src/worker.js            Worker entrypoint
src/bot.js               Telegram update logic
src/telegram-api.js      Telegram API base wrapper
src/telegram-actions.js  Telegram message/audio helpers
src/elevenlabs.js        ElevenLabs API client
src/ui.js                Menu text and inline keyboard
src/state.js             KV state helpers
src/voices.js            Voice IDs
scripts/set-webhook.js   Webhook setup helper
wrangler.toml            Cloudflare Worker config
```

## Notes

Cloudflare Workers handle incoming requests with a `fetch` handler. Secrets are provided through Worker environment bindings. KV is used here to keep each Telegram user's selected voice, output type, and current voice page. Telegram bots on Workers should use webhooks via `setWebhook`, not long polling.
