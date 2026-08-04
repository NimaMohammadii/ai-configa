export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json;charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

export function htmlResponse(html, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "text/html;charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  return new Response(html, {
    status,
    headers,
  });
}

export function emptyResponse(status = 204, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: extraHeaders,
  });
}

export function oauthError(error, description, status = 400) {
  return jsonResponse(
    {
      error,
      error_description: description,
    },
    status,
  );
}

export async function readBody(request) {
  const contentType = String(request.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType === "application/json") {
    return await request.json().catch(() => ({}));
  }

  if (contentType === "application/x-www-form-urlencoded") {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }

  return {};
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function methodNotAllowed(allowedMethods) {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      Allow: allowedMethods.join(", "),
      "Cache-Control": "no-store",
    },
  });
}
