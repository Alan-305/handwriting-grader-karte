import { describe, expect, it } from "vitest";
import {
  INACTIVITY_TIMEOUT_MS,
  isInactivityExpired,
  msUntilInactivityLogout,
} from "./session-inactivity";

describe("session-inactivity", () => {
  it("記録がない場合は期限切れにしない", () => {
    expect(isInactivityExpired(Date.now(), null)).toBe(false);
  });

  it("1時間未満の無操作では期限切れにしない", () => {
    const now = 1_700_000_000_000;
    const last = now - INACTIVITY_TIMEOUT_MS + 1;
    expect(isInactivityExpired(now, last)).toBe(false);
  });

  it("1時間以上の無操作で期限切れにする", () => {
    const now = 1_700_000_000_000;
    const last = now - INACTIVITY_TIMEOUT_MS;
    expect(isInactivityExpired(now, last)).toBe(true);
  });

  it("残り時間を計算する", () => {
    const now = 1_000_000;
    const last = now - 10_000;
    expect(msUntilInactivityLogout(now, last)).toBe(INACTIVITY_TIMEOUT_MS - 10_000);
    expect(msUntilInactivityLogout(now, null)).toBe(INACTIVITY_TIMEOUT_MS);
    expect(msUntilInactivityLogout(now, now - INACTIVITY_TIMEOUT_MS)).toBe(0);
  });
});
