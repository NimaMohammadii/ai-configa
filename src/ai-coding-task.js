import {
  clearAiCodingTaskState as clearCoreTaskState,
  getAiCodingTaskState as getCoreTaskState,
  listAiCodingTaskStates as listCoreTaskStates,
  saveAiCodingTaskState as saveCoreTaskState,
} from "./ai-coding-task-core.js";
import {
  deleteAiCodingTaskPlan,
  getAiCodingTaskPlan,
  saveAiCodingTaskPlan,
} from "./ai-coding-plan.js";

export { buildAiCodingTaskInstructions } from "./ai-coding-task-core.js";

export async function getAiCodingTaskState(env, userId, githubContext = null, taskId = "") {
  const task = await getCoreTaskState(env, userId, githubContext, taskId);
  if (!task) return null;
  const plan = await getAiCodingTaskPlan(env, userId, task.taskId).catch(() => null);
  return { ...task, plan };
}

export async function listAiCodingTaskStates(env, userId, githubContext = null, limit = 12) {
  const tasks = await listCoreTaskStates(env, userId, githubContext, limit);
  return Promise.all(tasks.map(async (task) => ({
    ...task,
    plan: await getAiCodingTaskPlan(env, userId, task.taskId).catch(() => null),
  })));
}

export async function saveAiCodingTaskState(env, userId, activity) {
  const task = await saveCoreTaskState(env, userId, activity);
  if (task?.taskId && activity?.plan) {
    await saveAiCodingTaskPlan(env, userId, task.taskId, activity.plan);
  }
  return task ? { ...task, plan: activity?.plan || null } : task;
}

export async function clearAiCodingTaskState(env, userId, taskId = "") {
  const exactTaskId = cleanTaskId(taskId);
  if (!exactTaskId) return null;
  await deleteAiCodingTaskPlan(env, userId, exactTaskId).catch(() => null);
  return clearCoreTaskState(env, userId, exactTaskId);
}

function cleanTaskId(value) {
  const id = String(value || "").trim();
  if (!id.startsWith("vexa/ai-") || id.length > 255 || id.includes("..") || /[~^:?*[\\\s]/.test(id)) return "";
  return id;
}
