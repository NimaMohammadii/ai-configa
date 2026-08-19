import { VEXA_LIVE_PERSISTENCE_RUNTIME_JS } from "./youtube-live-persistence.js";

const PERSISTENCE_PATH = "/mini-app/vexa-live/persistence.js";
const STALE_MERGE = "const base=state||readLocal()||normalizeState({})||{};";
const FRESH_MERGE = "const local=readLocal();const base=!state?(local||normalizeState({})||{}):(!local||Number(state.updatedAt||0)>=Number(local.updatedAt||0)?state:local);";

const PATCHED_RUNTIME = VEXA_LIVE_PERSISTENCE_RUNTIME_JS.replace(STALE_MERGE, FRESH_MERGE);

if (PATCHED_RUNTIME === VEXA_LIVE_PERSISTENCE_RUNTIME_JS) {
  console.warn("Vexa persistence freshness patch did not match runtime source");
}

export function handlePatchedVexaLivePersistenceRequest(request) {
  if (request.method !== "GET" || new URL(request.url).pathname !== PERSISTENCE_PATH) {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return new Response(PATCHED_RUNTIME, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
