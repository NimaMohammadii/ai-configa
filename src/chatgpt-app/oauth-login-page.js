import { OAUTH_SCOPES } from "./constants.js";
import {
  escapeHtml,
  htmlResponse,
  safeJsonForHtml,
} from "./http.js";

const TELEGRAM_STATUS_PATH = "/oauth/telegram/status";

export function renderTelegramLoginPage(input) {
  const payload = "oauth_" + input.sessionId;
  const telegramUrl = `https://t.me/${input.botUsername}?start=${encodeURIComponent(payload)}`;
  const browserState = safeJsonForHtml({
    sessionId: input.sessionId,
    browserSecret: input.browserSecret,
    statusUrl: TELEGRAM_STATUS_PATH,
  });
  const scopeLabels = input.scopes.map((scope) => {
    return scope === OAUTH_SCOPES.generate
      ? "ساخت فایل صوتی و کم‌کردن موجودی دلاری"
      : "مشاهده صداها، موجودی و تاریخچه";
  });

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>اتصال Vexa به ChatGPT</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0d0d10;
      color: #f7f4ff;
    }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
      background:
        radial-gradient(circle at top, rgba(130, 82, 255, 0.2), transparent 38%),
        #0d0d10;
    }

    main {
      width: min(100%, 430px);
      padding: 28px;
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      background: rgba(24, 22, 31, 0.92);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
    }

    h1 {
      margin: 0 0 12px;
      font-size: 24px;
    }

    p {
      margin: 0 0 18px;
      color: #c9c3d8;
      line-height: 1.8;
    }

    ul {
      margin: 0 0 22px;
      padding-right: 22px;
      color: #ded8eb;
      line-height: 1.9;
    }

    a {
      display: block;
      padding: 14px 18px;
      border-radius: 14px;
      background: #8d65ff;
      color: white;
      text-align: center;
      text-decoration: none;
      font-weight: 700;
    }

    #status {
      min-height: 28px;
      margin-top: 18px;
      color: #b9adc9;
      text-align: center;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <main>
    <h1>اتصال حساب تلگرام</h1>
    <p>برای استفاده از Vexa داخل ChatGPT، حساب تلگرام فعلی‌ات را تأیید کن.</p>
    <ul>
      ${scopeLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("\n      ")}
    </ul>
    <a href="${escapeHtml(telegramUrl)}">باز کردن ربات تلگرام</a>
    <div id="status">بعد از بازشدن ربات، این صفحه خودکار ادامه می‌دهد.</div>
  </main>

  <script>
    const login = ${browserState};
    const statusElement = document.getElementById("status");
    let stopped = false;

    async function checkStatus() {
      if (stopped) {
        return;
      }

      try {
        const response = await fetch(login.statusUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: login.sessionId,
            browser_secret: login.browserSecret,
          }),
        });

        const result = await response.json();

        if (result.status === "approved" && result.redirect_url) {
          stopped = true;
          statusElement.textContent = "اتصال انجام شد؛ در حال بازگشت به ChatGPT…";
          window.location.replace(result.redirect_url);
          return;
        }

        if (result.status === "expired") {
          stopped = true;
          statusElement.textContent = "زمان این لینک تمام شده است. اتصال را دوباره از ChatGPT شروع کن.";
          return;
        }
      } catch (error) {
        statusElement.textContent = "در حال بررسی اتصال…";
      }

      window.setTimeout(checkStatus, 1500);
    }

    checkStatus();
  </script>
</body>
</html>`;

  return htmlResponse(html, 200, {
    "Content-Security-Policy": [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  });
}
