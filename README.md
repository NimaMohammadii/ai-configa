# ai-configa

Telegram text-to-speech bot built for Cloudflare Workers, D1, and ElevenLabs. 

## Features

- Cloudflare Worker webhook bot, no polling server needed
- `/image` command for GPT Image 2 image generation
- ElevenLabs `eleven_v3` model
- Voice menu matching the requested layout
- Selected voice shows `✔️`
- Selected output shows `✔️`
- Two pages of voices
- Demo button
- Output selector: MP3 or Voice
- D1 user state storage
- D1 permanent demo audio cache, so each voice demo is generated once
- Per-user numbered output file names: `Vexa 0001.mp3`, `Vexa 0002.mp3`, and so on
- No caption/text on audio files

## Required secrets

Use exactly these environment secret names:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ELEVEN_API
npx wrangler secret put GPT_API
```

`BOT_TOKEN` is your Telegram bot token.
`ELEVEN_API` is your ElevenLabs API key.
`GPT_API` is your OpenAI API key for GPT text and image features.

## D1 setup

Create the database:

```bash
npx wrangler d1 create ai-configa-db
```

Cloudflare returns a `database_id`. Add this block to `wrangler.toml` and replace the id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-configa-db"
database_id = "YOUR_REAL_DATABASE_ID"
```

Apply the migration:

```bash
npx wrangler d1 migrations apply ai-configa-db --remote
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
GPT_API=openai_api_key
```

## Deploy to Cloudflare Workers

```bash
npm install
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ELEVEN_API
npx wrangler secret put GPT_API
npm run deploy
```

After deploy, set the Telegram webhook:

```bash
BOT_TOKEN=telegram_bot_token node scripts/set-webhook.js https://ai-configa.vexaagent.workers.dev
```

## File structure

```text
src/worker.js            Worker entrypoint
src/bot.js               Telegram update logic
src/telegram-api.js      Telegram API base wrapper
src/telegram-actions.js  Telegram message/audio helpers
src/elevenlabs.js        ElevenLabs API client
src/ui.js                Menu text and inline keyboard
src/state.js             D1 user state helpers
src/demo-cache.js        D1 demo audio cache
src/voices.js            Voice IDs
migrations/0001_init.sql D1 schema
schema.sql               D1 schema copy
scripts/set-webhook.js   Webhook setup helper
wrangler.toml            Cloudflare Worker config
wrangler.toml.example    D1 binding example
```
