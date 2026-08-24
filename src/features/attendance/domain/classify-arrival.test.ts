import { describe, expect, it } from "vitest";
import { classifyArrival } from "./classify-arrival";

describe("classifyArrival", () => {
  const sessionStart = "2026-09-16T13:30:00.000Z";

  it("classifies an arrival within the grace period as on time", () => {
    expect(classifyArrival(sessionStart, 5, "2026-09-16T13:32:00.000Z")).toBe("ON_TIME");
  });

  it("classifies an arrival exactly at the threshold as on time", () => {
    expect(classifyArrival(sessionStart, 5, "2026-09-16T13:35:00.000Z")).toBe("ON_TIME");
  });

  it("classifies an arrival past the threshold as late", () => {
    expect(classifyArrival(sessionStart, 5, "2026-09-16T13:43:00.000Z")).toBe("LATE");
  });

  it("classifies an arrival before the session start as on time", () => {
    expect(classifyArrival(sessionStart, 5, "2026-09-16T13:25:00.000Z")).toBe("ON_TIME");
  });
});
