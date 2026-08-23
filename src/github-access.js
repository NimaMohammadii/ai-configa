import { formatUsdBalanceFromCredits, getBalance } from "./credits.js";

export const GITHUB_MINIMUM_CREDITS = 10_000;

export async function getGitHubCreditAccess(env, userId) {
  const balance = Math.max(0, Math.floor(Number(await getBalance(env, userId)) || 0));
  return {
    allowed: balance >= GITHUB_MINIMUM_CREDITS,
    balance,
    requiredCredits: GITHUB_MINIMUM_CREDITS,
  };
}

export async function requireGitHubCreditAccess(env, userId, purpose = "use GitHub") {
  const access = await getGitHubCreditAccess(env, userId);
  if (access.allowed) return access;

  const error = new Error(githubCreditAccessMessage(access, purpose));
  error.status = 402;
  error.code = "insufficient_github_credits";
  error.balance = access.balance;
  error.requiredCredits = access.requiredCredits;
  throw error;
}

export function githubCreditAccessMessage(access = {}, purpose = "use GitHub") {
  const required = Math.max(0, Number(access.requiredCredits || GITHUB_MINIMUM_CREDITS));
  const balance = Math.max(0, Number(access.balance || 0));
  return `You need at least ${formatUsdBalanceFromCredits(required)} to ${purpose}. Your USD balance is ${formatUsdBalanceFromCredits(balance)}.`;
}
