import { answerCallback } from "./telegram-actions.js";

export function isEmotionCallback() {
  return false;
}

export async function handleEmotionCallback(query, env) {
  if (query?.id) {
    await answerCallback(env, query.id, "Emotion Enhancer is disabled", false);
  }
}

export async function handleEmotionMessage() {
  return false;
}

export async function isEmotionActive() {
  return false;
}
