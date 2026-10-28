import { describe, it, expect } from "vitest";
import { timeAgo, formatIDR, formatDate, formatDateTime } from "./utils.ts";
import { ApiError } from "./types.ts";

describe("timeAgo", () => {
  const baseTime = new Date("2026-10-28T12:00:00Z");

  it("returns 'Never' for null or empty dates", () => {
    expect(timeAgo(null, baseTime)).toBe("Never");
    expect(timeAgo(undefined, baseTime)).toBe("Never");
    expect(timeAgo("", baseTime)).toBe("Never");
    expect(timeAgo("invalid-date-string", baseTime)).toBe("Never");
  });

  it("handles future dates gracefully", () => {
    const future = new Date("2026-10-28T12:05:00Z").toISOString();
    expect(timeAgo(future, baseTime)).toBe("just now");
  });

  it("returns 'just now' for diff < 60s", () => {
    const past = new Date("2026-10-28T11:59:30Z").toISOString();
    expect(timeAgo(past, baseTime)).toBe("just now");
  });

  it("returns minutes ago format", () => {
    const past15m = new Date("2026-10-28T11:45:00Z").toISOString();
    expect(timeAgo(past15m, baseTime)).toBe("15m ago");
  });

  it("returns hours ago format", () => {
    const past2h = new Date("2026-10-28T10:00:00Z").toISOString();
    expect(timeAgo(past2h, baseTime)).toBe("2h ago");
  });

  it("returns days ago format", () => {
    const past3d = new Date("2026-10-25T12:00:00Z").toISOString();
    expect(timeAgo(past3d, baseTime)).toBe("3d ago");
  });

  it("returns months ago format", () => {
    const past60d = new Date("2026-08-25T12:00:00Z").toISOString();
    expect(timeAgo(past60d, baseTime)).toBe("2mo ago");
  });
});

describe("formatIDR", () => {
  it("formats numbers with Rp prefix", () => {
    expect(formatIDR(0)).toContain("0");
    expect(formatIDR(150000)).toMatch(/Rp\s*150[.,]000/);
    expect(formatIDR(1000000)).toMatch(/Rp\s*1[.,]000[.,]000/);
  });

  it("handles NaN gracefully", () => {
    expect(formatIDR(NaN)).toBe("Rp 0");
  });
});

describe("formatDate and formatDateTime", () => {
  it("handles valid dates", () => {
    const valid = "2026-10-28T10:30:00Z";
    expect(formatDate(valid)).not.toBe("-");
    expect(formatDateTime(valid)).not.toBe("-");
  });

  it("returns '-' for empty or invalid dates", () => {
    expect(formatDate("")).toBe("-");
    expect(formatDate("invalid")).toBe("-");
    expect(formatDateTime("")).toBe("-");
    expect(formatDateTime("invalid")).toBe("-");
  });
});

describe("ApiError class", () => {
  it("correctly stores error envelope properties", () => {
    const err = new ApiError("Stock limit reached", "INSUFFICIENT_STOCK", 409, {
      sku: "WIDGET-01",
      available: 2,
    });

    expect(err.name).toBe("ApiError");
    expect(err.message).toBe("Stock limit reached");
    expect(err.code).toBe("INSUFFICIENT_STOCK");
    expect(err.status).toBe(409);
    expect(err.sku).toBe("WIDGET-01");
    expect(err.available).toBe(2);
  });

  it("correctly stores validation details", () => {
    const details = { "items[0].sku": "unknown sku", customer: "required" };
    const err = new ApiError("Validation failed", "VALIDATION_ERROR", 400, {
      details,
    });

    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.status).toBe(400);
    expect(err.details).toEqual(details);
  });
});
