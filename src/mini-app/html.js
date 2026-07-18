export const MINI_APP_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Vexa Voice</title>
  <link rel="stylesheet" href="/mini-app/styles.css" />
</head>
<body>
  <main class="shell">
    <section class="hero" aria-labelledby="app-title">
      <p class="eyebrow">Vexa Mini App</p>
      <h1 id="app-title">تبدیل متن به صدا</h1>
      <p class="subtitle">متن خود را بنویسید و با همان تنظیمات و اعتبار ربات، خروجی صوتی بگیرید.</p>
    </section>

    <section class="panel" aria-label="Text to speech form">
      <div class="meta-grid">
        <div>
          <span>صدا</span>
          <strong id="voiceName">—</strong>
        </div>
        <div>
          <span>اعتبار</span>
          <strong id="balance">—</strong>
        </div>
      </div>

      <label class="field-label" for="ttsText">متن</label>
      <textarea id="ttsText" maxlength="5000" placeholder="اینجا بنویسید..."></textarea>
      <div class="counter"><span id="charCount">0</span> / 5000</div>

      <button id="convertButton" type="button">تبدیل به صدا</button>
      <p id="status" class="status" role="status"></p>

      <audio id="audioPlayer" class="player" controls hidden></audio>
    </section>
  </main>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script type="module" src="/mini-app/app.js"></script>
</body>
</html>`;
