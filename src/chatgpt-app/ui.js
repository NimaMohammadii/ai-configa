import {
  VOICE_RESULT_RESOURCE_MIME,
  VOICE_RESULT_RESOURCE_URI,
} from "./constants.js";

export function voiceResultResource(origin) {
  return {
    contents: [
      {
        uri: VOICE_RESULT_RESOURCE_URI,
        mimeType: VOICE_RESULT_RESOURCE_MIME,
        text: voiceResultHtml(),
        _meta: {
          ui: {
            prefersBorder: true,
            domain: origin,
            csp: {
              connectDomains: [origin],
              resourceDomains: [origin],
            },
          },
        },
      },
    ],
  };
}

function voiceResultHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      margin: 0;
      padding: 12px;
      background: transparent;
    }

    .card {
      display: grid;
      gap: 12px;
      padding: 16px;
      border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
      border-radius: 18px;
      background: color-mix(in srgb, Canvas 94%, transparent);
    }

    .title {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
    }

    .details {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 13px;
      opacity: 0.72;
    }

    .badge {
      padding: 5px 9px;
      border-radius: 999px;
      background: color-mix(in srgb, currentColor 8%, transparent);
    }

    audio {
      width: 100%;
    }

    .download {
      width: fit-content;
      font-size: 13px;
      font-weight: 650;
      color: inherit;
    }

    .error {
      color: #d33a4a;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <section class="card">
    <h2 class="title" id="title">Generated voice</h2>
    <div class="details">
      <span class="badge" id="voice">Voice</span>
      <span class="badge" id="credits">Credits</span>
      <span class="badge" id="balance">Balance</span>
    </div>
    <audio id="audio" controls preload="metadata"></audio>
    <a class="download" id="download" target="_blank" rel="noopener noreferrer">Open audio</a>
    <div class="error" id="error" hidden></div>
  </section>

  <script>
    const titleElement = document.getElementById("title");
    const voiceElement = document.getElementById("voice");
    const creditsElement = document.getElementById("credits");
    const balanceElement = document.getElementById("balance");
    const audioElement = document.getElementById("audio");
    const downloadElement = document.getElementById("download");
    const errorElement = document.getElementById("error");

    function text(value, fallback) {
      const cleanValue = String(value ?? "").trim();
      return cleanValue || fallback;
    }

    function safeAudioUrl(value) {
      try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" ? url.href : "";
      } catch {
        return "";
      }
    }

    function render(output) {
      if (!output || typeof output !== "object") {
        return;
      }

      const audioUrl = safeAudioUrl(output.audio_url);
      titleElement.textContent = text(output.filename, "Generated voice");
      voiceElement.textContent = "Voice: " + text(output.voice, "Unknown");
      creditsElement.textContent = "Used: " + Number(output.credits_used || 0).toLocaleString();
      balanceElement.textContent = "Balance: " + Number(output.balance || 0).toLocaleString();

      if (!audioUrl) {
        audioElement.hidden = true;
        downloadElement.hidden = true;
        errorElement.hidden = false;
        errorElement.textContent = "The audio link is unavailable.";
        return;
      }

      audioElement.hidden = false;
      downloadElement.hidden = false;
      errorElement.hidden = true;
      audioElement.src = audioUrl;
      downloadElement.href = audioUrl;
    }

    window.addEventListener(
      "message",
      (event) => {
        if (event.source !== window.parent) {
          return;
        }

        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") {
          return;
        }

        if (message.method === "ui/notifications/tool-result") {
          render(message.params?.structuredContent);
        }
      },
      { passive: true },
    );

    if (window.openai?.toolOutput) {
      render(window.openai.toolOutput);
    }
  </script>
</body>
</html>`;
}
