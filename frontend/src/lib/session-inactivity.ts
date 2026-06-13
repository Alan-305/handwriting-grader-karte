/** 無操作でログアウトするまでの時間（1時間） */
export const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

export const LAST_ACTIVITY_KEY = "hgk_last_activity_at";
export const LOGOUT_REASON_KEY = "hgk_logout_reason";

export function readLastActivityAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastActivityAt(timestamp = Date.now()): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  } catch {
    /* localStorage 不可環境ではスキップ */
  }
}

export function clearLastActivityAt(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* noop */
  }
}

export function isInactivityExpired(now: number, lastActivityAt: number | null): boolean {
  if (lastActivityAt === null) return false;
  return now - lastActivityAt >= INACTIVITY_TIMEOUT_MS;
}

/** ログアウトまでの残りミリ秒。期限切れなら 0、記録なしならフルタイムアウト */
export function msUntilInactivityLogout(
  now: number,
  lastActivityAt: number | null,
  timeoutMs = INACTIVITY_TIMEOUT_MS,
): number {
  if (lastActivityAt === null) return timeoutMs;
  const elapsed = now - lastActivityAt;
  if (elapsed >= timeoutMs) return 0;
  return timeoutMs - elapsed;
}

export function inactivityLogoutMessage(): string {
  return "1時間以上操作がなかったため、自動的にログアウトしました。再度ログインしてください。";
}

export function markInactivityLogout(): void {
  try {
    sessionStorage.setItem(LOGOUT_REASON_KEY, "inactivity");
  } catch {
    /* noop */
  }
}

export function consumeLogoutReasonMessage(): string | null {
  try {
    const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
    sessionStorage.removeItem(LOGOUT_REASON_KEY);
    if (reason === "inactivity") return inactivityLogoutMessage();
    return null;
  } catch {
    return null;
  }
}
