import { getLanguageSettings } from "../admin.js";
import { normalizeLang } from "../i18n.js";
import { grantInitialStartBonusOnce } from "../start-bonus.js";
import { getState, saveState } from "../state.js";

export async function initializeMiniAppUser(env, user) {
  const state = await getState(env, user.id);

  if (!state.language) {
    const settings = await getLanguageSettings(env);
    state.language = normalizeLang(settings.defaultLanguage || user.language_code || "en");
    await saveState(env, user.id, state);
  }

  const bonus = await grantInitialStartBonusOnce(env, user.id, state.language);
  return { state, bonus };
}
