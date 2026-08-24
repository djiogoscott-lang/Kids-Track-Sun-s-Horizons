import { describe, expect, it } from "vitest";
import { isAdmin, USER_ROLES } from "./roles";

describe("foundation roles", () => {
  it("defines exactly ADMIN and MONITOR", () => {
    expect(USER_ROLES).toEqual(["ADMIN", "MONITOR"]);
  });

  it("recognizes only ADMIN as administrator", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("MONITOR")).toBe(false);
  });
});
