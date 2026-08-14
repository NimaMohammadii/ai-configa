import * as core from "./openai-agent-tools-core.js";
import { buildAiCodingTaskInstructions, getAiCodingTaskState } from "./ai-coding-task.js";

export {
  buildOpenAiAgentInstructions,
  isOpenAiApplyPatchCall,
  prepareOpenAiToolReplayItems,
  refreshOpenAiCodingWorkspace,
} from "./openai-agent-tools-core.js";

const BILLING_ONLY_CONTAINER_PREFIX = "billing-shell:";

export async function prepareOpenAiAgentTools(env, userId, options = {}) {
  const state = await core.prepareOpenAiAgentTools(env, userId, options);
  const pinnedTaskId = cleanVexaTaskId(env?.AI_CODING_TASK_ID);
  if (!pinnedTaskId || !options.githubContext) return state;
  const exactTask = await getAiCodingTaskState(env, userId, options.githubContext, pinnedTaskId).catch(() => null);
  if (!exactTask) return state;
  if (/^[a-f0-9]{40}$/i.test(String(exactTask.commitSha || ""))) {
    await core.refreshOpenAiCodingWorkspace(
      env,
      userId,
      state.tools,
      state,
      exactTask.commitSha,
    ).catch((error) => {
      console.error("Pinned coding workspace refresh failed", error?.message || error);
    });
  }
  state.runtimeInstructions = [
    String(state.runtimeInstructions || ""),
    `INTERNAL DURABLE TASK PIN: this execution phase belongs specifically to coding task ${pinnedTaskId}. This exact task pin overrides any generic active-task hint from another concurrent workflow. The hosted shell has been prepared from this task's saved commit when available. Call github_resume_task with exactly ${pinnedTaskId} before repository work and never switch to another task unless the user explicitly asks to do so.`,
    buildAiCodingTaskInstructions(exactTask),
  ].filter(Boolean).join(" ");
  return state;
}

export async function executeOpenAiApplyPatchCalls(env, userId, calls, onStatus, activity = null) {
  const items = (Array.isArray(calls) ? calls : []).filter(core.isOpenAiApplyPatchCall);
  if (!items.length) return [];
  const paths = items
    .map((call) => cleanRepoPath(call?.operation?.path))
    .filter(Boolean);
  const missing = unresolvedInstructionTargets(activity, paths);
  if (missing.length) {
    const message = "Project instructions were not resolved on the current working branch for every patch target. Call github_project_instructions for these exact paths before writing: "
      + missing.slice(0, 12).join(", ");
    return items.map((call) => ({
      type: "apply_patch_call_output",
      call_id: call.call_id,
      status: "failed",
      output: message,
    }));
  }
  const outputs = await core.executeOpenAiApplyPatchCalls(env, userId, items, onStatus, activity);
  if ((Array.isArray(outputs) ? outputs : []).some((item) => String(item?.status || "") === "completed")) {
    clearResolvedInstructionTargets(activity);
  }
  return outputs;
}

export function inspectOpenAiShellUsage(output) {
  const items = Array.isArray(output) ? output : [];
  const base = core.inspectOpenAiShellUsage(items);
  const shellCalls = items.filter((item) => item?.type === "shell_call");
  const shellOutputs = items.filter((item) => item?.type === "shell_call_output");
  const anyUsed = shellCalls.length > 0 || shellOutputs.length > 0 || Boolean(base?.used);

  const outputByCallId = new Map();
  for (const item of shellOutputs) {
    const callId = String(item?.call_id || "").trim();
    if (!callId) continue;
    const bucket = outputByCallId.get(callId) || [];
    bucket.push(item);
    outputByCallId.set(callId, bucket);
  }

  const validationCalls = [];
  for (const call of shellCalls) {
    const commands = Array.isArray(call?.action?.commands)
      ? call.action.commands.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const matchingCommands = commands.filter(isDeterministicValidationCommand);
    if (!matchingCommands.length) continue;
    const callId = String(call?.call_id || "").trim();
    const outputs = callId ? (outputByCallId.get(callId) || []) : [];
    validationCalls.push({
      callId,
      commands: matchingCommands,
      passed: outputs.length > 0 && outputs.every(shellOutputCompletedSuccessfully),
    });
  }

  const validationPassed = validationCalls.length > 0 && validationCalls.every((entry) => entry.passed);
  const validationFailed = validationCalls.some((entry) => !entry.passed);
  const containerIds = Array.isArray(base?.containerIds)
    ? base.containerIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (anyUsed && !containerIds.length) {
    const ids = [...shellCalls, ...shellOutputs]
      .map((item) => String(item?.call_id || item?.id || "").trim())
      .filter(Boolean)
      .sort();
    containerIds.push(BILLING_ONLY_CONTAINER_PREFIX + (ids.join("-").slice(0, 180) || "unidentified"));
  }

  return {
    used: validationPassed,
    anyUsed,
    validationPassed,
    validationFailed,
    validationCommands: validationCalls.flatMap((entry) => entry.commands).slice(0, 20),
    containerIds: Array.from(new Set(containerIds)),
  };
}

export function reuseOpenAiShellContainer(tools, containerId) {
  const cleanId = String(containerId || "").trim();
  if (!cleanId || cleanId.startsWith(BILLING_ONLY_CONTAINER_PREFIX)) return false;
  return core.reuseOpenAiShellContainer(tools, cleanId);
}

function shellOutputCompletedSuccessfully(item) {
  const status = String(item?.status || "completed").toLowerCase();
  if (status !== "completed") return false;
  const chunks = Array.isArray(item?.output) ? item.output : [];
  if (!chunks.length) return false;
  return chunks.every((chunk) => {
    const outcome = chunk?.outcome || {};
    return String(outcome?.type || "").toLowerCase() === "exit"
      && Number(outcome?.exit_code) === 0;
  });
}

function isDeterministicValidationCommand(value) {
  const command = String(value || "").trim().toLowerCase();
  if (!command) return false;
  const patterns = [
    /(?:^|[;&|]\s*)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|type-check|check)(?:\s|$)/,
    /(?:^|[;&|]\s*)(?:npx|bunx|pnpm\s+exec|yarn\s+exec)\s+(?:tsc|eslint|biome|prettier|vitest|jest)(?:\s|$)/,
    /(?:^|[;&|]\s*)(?:tsc\s+--noemit|eslint(?:\s|$)|biome\s+check|prettier\s+--check|node\s+--check)(?:\s|$)/,
    /(?:^|[;&|]\s*)(?:pytest|python(?:3)?\s+-m\s+pytest|python(?:3)?\s+-m\s+compileall)(?:\s|$)/,
    /(?:^|[;&|]\s*)go\s+(?:test|vet)(?:\s|$)/,
    /(?:^|[;&|]\s*)cargo\s+(?:test|check|clippy|build)(?:\s|$)/,
    /(?:^|[;&|]\s*)dotnet\s+(?:test|build)(?:\s|$)/,
    /(?:^|[;&|]\s*)(?:mvn|mvnw)\s+(?:test|verify|package)(?:\s|$)/,
    /(?:^|[;&|]\s*)(?:gradle|\.\/gradlew|gradlew)\s+(?:test|build|check)(?:\s|$)/,
    /(?:^|[;&|]\s*)(?:phpunit|composer\s+test|mix\s+test|swift\s+test|shellcheck)(?:\s|$)/,
    /(?:^|[;&|]\s*)deno\s+(?:test|check|lint)(?:\s|$)/,
    /(?:^|[;&|]\s*)(?:npx\s+)?wrangler\s+(?:deploy\s+--dry-run|types)(?:\s|$)/,
  ];
  return patterns.some((pattern) => pattern.test(command));
}

function unresolvedInstructionTargets(activity, paths) {
  const resolved = activity?.resolvedProjectInstructionTargets instanceof Set
    ? activity.resolvedProjectInstructionTargets
    : new Set();
  return Array.from(new Set((Array.isArray(paths) ? paths : []).filter(Boolean)))
    .filter((path) => !resolved.has(path));
}

function clearResolvedInstructionTargets(activity) {
  if (!activity) return;
  activity.resolvedProjectInstructionTargets = new Set();
}

function cleanRepoPath(value) {
  const path = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!path || path.length > 500 || path.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return path;
}

function cleanVexaTaskId(value) {
  const id = String(value || "").trim();
  return id.startsWith("vexa/ai-") && id.length <= 255 && !id.includes("..") && !/[~^:?*[\\\s]/.test(id)
    ? id
    : "";
}
