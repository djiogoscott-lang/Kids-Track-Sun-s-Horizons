import { describe, expect, it } from "vitest";
import { checkTransition } from "./transitions";

describe("attendance transitions", () => {
  it("allows an expected child to arrive", () => {
    expect(checkTransition("EXPECTED", "ARRIVE").allowed).toBe(true);
  });

  it("allows an absent child to arrive afterwards", () => {
    expect(checkTransition("ABSENT", "ARRIVE").allowed).toBe(true);
  });

  it("allows an excused child to arrive afterwards", () => {
    expect(checkTransition("EXCUSED", "ARRIVE").allowed).toBe(true);
  });

  it("allows an expected child to be marked absent or excused", () => {
    expect(checkTransition("EXPECTED", "ABSENT").allowed).toBe(true);
    expect(checkTransition("EXPECTED", "EXCUSE").allowed).toBe(true);
  });

  it("allows a present child to depart", () => {
    expect(checkTransition("PRESENT", "DEPART").allowed).toBe(true);
  });

  it("refuses a departure without a prior arrival", () => {
    const result = checkTransition("EXPECTED", "DEPART");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("DEPART");
  });

  it("refuses re-arriving a child who has already left, requiring a correction instead", () => {
    expect(checkTransition("LEFT", "ARRIVE").allowed).toBe(false);
  });

  it("refuses marking a present child absent directly", () => {
    expect(checkTransition("PRESENT", "ABSENT").allowed).toBe(false);
  });

  it("refuses departing a child twice", () => {
    expect(checkTransition("LEFT", "DEPART").allowed).toBe(false);
  });
});
