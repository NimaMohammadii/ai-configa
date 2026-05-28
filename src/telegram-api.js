const TG_HOST = "https://api.telegram.org";

export function botMethodUrl(env, method) {
  if (!env.BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
  const tokenPart = ["bot", env.BOT_TOKEN].join("");
  return [TG_HOST, tokenPart, method].join("/");
}

export async function tgJson(env, method, payload = {}) {
  const res = await fetch(botMethodUrl(env, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(method + " failed: " + JSON.stringify(json));
  }
  return json.result;
}

export async function tgForm(env, method, form) {
  const res = await fetch(botMethodUrl(env, method), {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(method + " failed: " + JSON.stringify(json));
  }
  return json.result;
}
