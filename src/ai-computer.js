import puppeteer from "@cloudflare/puppeteer";

const VIEWPORT = Object.freeze({ width: 1365, height: 768 });
const MAX_BROWSER_ACTIONS = 24;
const NAVIGATION_TIMEOUT_MS = 20000;

export function getAiComputerTools(env) {
  if (!env?.BROWSER) return [];
  return [
    {
      type: "function",
      name: "browser_open_url",
      description: "Open a public HTTPS URL in the isolated browser used by Computer Use. Use this before computer actions when UI verification needs a specific public preview or deployed page.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public HTTPS URL to open for visual verification." },
        },
        required: ["url"],
        additionalProperties: false,
      },
      strict: true,
    },
    { type: "computer" },
  ];
}

export function isAiComputerFunctionCall(item) {
  return item?.type === "function_call" && item?.name === "browser_open_url";
}

export function isAiComputerCall(item) {
  return item?.type === "computer_call" && item?.call_id;
}

export function createAiComputerSession(env) {
  let browser = null;
  let page = null;
  let startedAt = 0;

  const ensurePage = async () => {
    if (!env?.BROWSER) throw new Error("Browser Run is not configured.");
    if (!browser) {
      browser = await puppeteer.launch(env.BROWSER);
      startedAt = Date.now();
    }
    if (!page) {
      page = await browser.newPage();
      await page.setViewport(VIEWPORT);
    }
    return page;
  };

  const openUrl = async (rawUrl) => {
    const target = normalizePublicHttpsUrl(rawUrl);
    const activePage = await ensurePage();
    await activePage.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    return {
      ok: true,
      url: activePage.url(),
      title: await activePage.title().catch(() => ""),
      viewport: VIEWPORT,
    };
  };

  const executeComputerCall = async (call) => {
    const activePage = await ensurePage();
    const actions = Array.isArray(call?.actions) ? call.actions.slice(0, MAX_BROWSER_ACTIONS) : [];
    if (!actions.length) throw new Error("Computer Use returned no actions.");
    for (const action of actions) {
      await executeAction(activePage, action);
    }
    const screenshot = await activePage.screenshot({ type: "png", fullPage: false });
    return {
      type: "computer_call_output",
      call_id: call.call_id,
      output: {
        type: "computer_screenshot",
        image_url: "data:image/png;base64," + bytesToBase64(screenshot),
        detail: "original",
      },
    };
  };

  const usage = () => ({
    used: Boolean(startedAt),
    durationMs: startedAt ? Math.max(0, Date.now() - startedAt) : 0,
  });

  const close = async () => {
    const current = browser;
    browser = null;
    page = null;
    if (current) await current.close().catch(() => {});
  };

  return { openUrl, executeComputerCall, usage, close };
}

async function executeAction(page, action) {
  const type = String(action?.type || "");
  if (type === "click") {
    await page.mouse.click(number(action.x), number(action.y), { button: mouseButton(action.button) });
    return;
  }
  if (type === "double_click") {
    await page.mouse.click(number(action.x), number(action.y), { clickCount: 2, delay: 80 });
    return;
  }
  if (type === "move") {
    await page.mouse.move(number(action.x), number(action.y));
    return;
  }
  if (type === "drag") {
    const path = Array.isArray(action.path) ? action.path : [];
    if (!path.length) return;
    await page.mouse.move(number(path[0].x), number(path[0].y));
    await page.mouse.down();
    for (const point of path.slice(1)) {
      await page.mouse.move(number(point.x), number(point.y), { steps: 4 });
    }
    await page.mouse.up();
    return;
  }
  if (type === "scroll") {
    await page.mouse.move(number(action.x), number(action.y));
    await page.mouse.wheel({ deltaX: number(action.scroll_x), deltaY: number(action.scroll_y) });
    return;
  }
  if (type === "keypress") {
    for (const key of Array.isArray(action.keys) ? action.keys : []) {
      await page.keyboard.press(normalizeKey(key));
    }
    return;
  }
  if (type === "type") {
    await page.keyboard.type(String(action.text || ""), { delay: 8 });
    return;
  }
  if (type === "wait") {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return;
  }
  if (type === "screenshot") return;
  throw new Error(`Unsupported Computer Use action: ${type || "unknown"}`);
}

function normalizePublicHttpsUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Browser URL is invalid.");
  }
  if (url.protocol !== "https:") throw new Error("Browser verification only allows HTTPS URLs.");
  const host = url.hostname.toLowerCase();
  if (isBlockedHost(host)) throw new Error("Browser verification cannot open local or private network addresses.");
  return url.toString();
}

function isBlockedHost(host) {
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0" || host.startsWith("127.")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  return host.startsWith("169.254.");
}

function normalizeKey(value) {
  const key = String(value || "");
  const aliases = {
    ENTER: "Enter",
    TAB: "Tab",
    ESC: "Escape",
    ESCAPE: "Escape",
    BACKSPACE: "Backspace",
    DELETE: "Delete",
    SPACE: "Space",
    ARROWUP: "ArrowUp",
    ARROWDOWN: "ArrowDown",
    ARROWLEFT: "ArrowLeft",
    ARROWRIGHT: "ArrowRight",
  };
  return aliases[key.toUpperCase()] || key;
}

function mouseButton(value) {
  const button = String(value || "left").toLowerCase();
  return button === "right" || button === "middle" ? button : "left";
}

function number(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}
