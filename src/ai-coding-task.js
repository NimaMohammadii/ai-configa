import { clearAiCodingTaskState as clearCoreTaskState } from "./ai-coding-task-core.js";

export {
  buildAiCodingTaskInstructions,
  getAiCodingTaskState,
  listAiCodingTaskStates,
  saveAiCodingTaskState,
} from "./ai-coding-task-core.js";

export async function clearAiCodingTaskState(env, userId, taskId = "") {
  const exactTaskId = cleanTaskId(taskId);
  if (!exactTaskId) return null;
  return clearCoreTaskState(env, userId, exactTaskId);
}

function cleanTaskId(value) {
  const id = String(value || "").trim();
  if (!id.startsWith("vexa/ai-") || id.length > 255 || id.includes("..") || /[~^:?*[\\\s]/.test(id)) return "";
  return id;
}
