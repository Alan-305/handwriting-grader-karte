import { useEffect, useRef } from "react";
import {
  INACTIVITY_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  clearLastActivityAt,
  isInactivityExpired,
  markInactivityLogout,
  readLastActivityAt,
  writeLastActivityAt,
} from "@/lib/session-inactivity";

const ACTIVITY_THROTTLE_MS = 30_000;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;

/**
 * ログイン中に一定時間操作がなければ自動ログアウトする。
 * 最終操作時刻は localStorage に保存し、タブ間でも共有する。
 */
export function useInactivityLogout(
  logout: () => Promise<void>,
  enabled: boolean,
  timeoutMs = INACTIVITY_TIMEOUT_MS,
) {
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let throttleId: ReturnType<typeof setTimeout> | undefined;

    const performInactivityLogout = () => {
      markInactivityLogout();
      clearLastActivityAt();
      void logoutRef.current();
    };

    const scheduleLogout = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);

      const now = Date.now();
      const last = readLastActivityAt();
      if (isInactivityExpired(now, last)) {
        performInactivityLogout();
        return;
      }

      if (last === null) {
        writeLastActivityAt(now);
      }

      const remaining = Math.max(0, timeoutMs - (Date.now() - (readLastActivityAt() ?? now)));
      timeoutId = setTimeout(performInactivityLogout, remaining);
    };

    const bumpActivity = () => {
      writeLastActivityAt();
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutId = setTimeout(performInactivityLogout, timeoutMs);
    };

    const onActivity = () => {
      if (throttleId !== undefined) return;
      throttleId = setTimeout(() => {
        throttleId = undefined;
        bumpActivity();
      }, ACTIVITY_THROTTLE_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const last = readLastActivityAt();
      if (isInactivityExpired(Date.now(), last)) {
        performInactivityLogout();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) {
        scheduleLogout();
      }
    };

    scheduleLogout();

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorage);

    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (throttleId !== undefined) clearTimeout(throttleId);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, timeoutMs]);
}
