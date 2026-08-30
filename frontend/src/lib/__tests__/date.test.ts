import { describe, expect, it } from "vitest";
import {
  getStartOfTodayIso,
  getEndOfTodayIso,
  getStartOfWeekIso,
  getStartOfMonthIso,
  getPeriodStartIso,
  isSameLocalDay,
  formatExpiryForDisplay,
  parseShortExpiryInput,
} from "@/lib/date";

describe("Date and Time Utilities", () => {
  it("computes start of today at local midnight accurately", () => {
    const fixedDate = new Date("2026-08-30T14:35:22.123Z");
    const startIso = getStartOfTodayIso(fixedDate);
    const startDate = new Date(startIso);

    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
    expect(startDate.getMilliseconds()).toBe(0);
  });

  it("computes end of today at 23:59:59.999 accurately", () => {
    const fixedDate = new Date("2026-08-30T14:35:22.123Z");
    const endIso = getEndOfTodayIso(fixedDate);
    const endDate = new Date(endIso);

    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    expect(endDate.getSeconds()).toBe(59);
    expect(endDate.getMilliseconds()).toBe(999);
  });

  it("computes start of week accurately", () => {
    // 2026-08-30 is a Sunday
    const sunday = new Date("2026-08-30T12:00:00.000Z");
    const weekStartIso = getStartOfWeekIso(sunday, "sunday");
    const weekStartDate = new Date(weekStartIso);

    expect(weekStartDate.getDay()).toBe(0); // Sunday
    expect(weekStartDate.getHours()).toBe(0);
  });

  it("computes start of month at the 1st of the month", () => {
    const midMonth = new Date("2026-08-15T10:00:00.000Z");
    const monthStartIso = getStartOfMonthIso(midMonth);
    const monthStartDate = new Date(monthStartIso);

    expect(monthStartDate.getDate()).toBe(1);
    expect(monthStartDate.getHours()).toBe(0);
    expect(monthStartDate.getMonth()).toBe(7); // August (0-indexed 7)
  });

  it("maps period correctly using getPeriodStartIso", () => {
    const testDate = new Date("2026-08-30T12:00:00.000Z");
    expect(getPeriodStartIso("today", testDate)).toBe(getStartOfTodayIso(testDate));
    expect(getPeriodStartIso("week", testDate)).toBe(getStartOfWeekIso(testDate));
    expect(getPeriodStartIso("month", testDate)).toBe(getStartOfMonthIso(testDate));
  });

  it("correctly identifies same local calendar day", () => {
    const morning = "2026-08-30T07:15:00.000Z";
    const night = "2026-08-30T21:45:00.000Z";
    const nextDay = "2026-08-31T07:15:00.000Z";

    expect(isSameLocalDay(morning, night)).toBe(true);
    expect(isSameLocalDay(morning, nextDay)).toBe(false);
  });

  it("formats ISO date to dd/mm/yy correctly", () => {
    expect(formatExpiryForDisplay("2026-09-01")).toBe("01/09/26");
    expect(formatExpiryForDisplay("2027-12-31")).toBe("31/12/27");
    expect(formatExpiryForDisplay(null)).toBe("");
    expect(formatExpiryForDisplay("")).toBe("");
  });

  it("parses dd/mm/yy to ISO YYYY-MM-DD correctly", () => {
    expect(parseShortExpiryInput("01/09/26")).toBe("2026-09-01");
    expect(parseShortExpiryInput("31/12/27")).toBe("2027-12-31");
    expect(parseShortExpiryInput("invalid")).toBe(null);
    expect(parseShortExpiryInput("32/01/26")).toBe(null);
    expect(parseShortExpiryInput("15/13/26")).toBe(null);
  });
});
