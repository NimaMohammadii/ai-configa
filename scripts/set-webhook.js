const token = process.env.BOT_TOKEN;
const workerUrl = process.argv[2];

if (!token) {
  console.error("BOT_TOKEN env is required");
  process.exit(1);
}

if (!workerUrl) {
  console.error("Usage: BOT_TOKEN=xxx node scripts/set-webhook.js https://your-worker.workers.dev");
  process.exit(1);
}

const url = "https://api.telegram.org/bot" + token + "/setWebhook";
const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: workerUrl,
    allowed_updates: ["message", "callback_query"],
  }),
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));

if (!data.ok) process.exit(1);
