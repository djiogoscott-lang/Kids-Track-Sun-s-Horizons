import { describe, expect, it } from "vitest";
import { decodeDemoSession, encodeDemoSession } from "./demo-session";

/**
 * The local sign-in cookie is the only thing standing between a browser and
 * an admin session when passwordless sign-in is on. It is signed precisely so
 * that a browser cannot hand itself a role by editing the value, and these
 * tests pin that: every one of them is a forgery attempt that must come back
 * as "no session" rather than as a session with attacker-chosen contents.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const encodePayload = (payload: unknown) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));

describe("demo session cookie", () => {
  it("round-trips a session it signed itself", async () => {
    const token = await encodeDemoSession({ userId: "u-1", name: "Moniteur 3", role: "MONITOR" });
    expect(await decodeDemoSession(token)).toEqual({ userId: "u-1", name: "Moniteur 3", role: "MONITOR" });
  });

  it("rejects a payload edited to grant ADMIN, keeping the original signature", async () => {
    const token = await encodeDemoSession({ userId: "u-1", name: "Moniteur 3", role: "MONITOR" });
    const signature = token.split(".")[1];
    const forged = `${encodePayload({ userId: "u-1", name: "Moniteur 3", role: "ADMIN" })}.${signature}`;

    expect(await decodeDemoSession(forged)).toBeNull();
  });

  it("rejects a payload edited to impersonate another user id", async () => {
    const token = await encodeDemoSession({ userId: "u-1", name: "Moniteur 3", role: "MONITOR" });
    const signature = token.split(".")[1];
    const forged = `${encodePayload({ userId: "someone-else", name: "Moniteur 3", role: "MONITOR" })}.${signature}`;

    expect(await decodeDemoSession(forged)).toBeNull();
  });

  it("rejects an unsigned payload", async () => {
    expect(await decodeDemoSession(encodePayload({ userId: "u-1", name: "X", role: "ADMIN" }))).toBeNull();
  });

  it("rejects a token whose signature is not valid base64/HMAC", async () => {
    const token = await encodeDemoSession({ userId: "u-1", name: "X", role: "ADMIN" });
    expect(await decodeDemoSession(`${token.split(".")[0]}.not-a-signature`)).toBeNull();
  });

  it("treats a missing or empty cookie as no session", async () => {
    expect(await decodeDemoSession(undefined)).toBeNull();
    expect(await decodeDemoSession("")).toBeNull();
  });

  it("treats a malformed cookie as no session rather than throwing", async () => {
    expect(await decodeDemoSession("garbage")).toBeNull();
    expect(await decodeDemoSession(".")).toBeNull();
    expect(await decodeDemoSession("a.b.c")).toBeNull();
  });

  it("rejects a signed token whose payload is not JSON", async () => {
    // Correctly signed, but the body is nonsense: the signature check passes
    // and the parse must fail closed rather than surface a broken session.
    const payloadPart = bytesToBase64Url(new TextEncoder().encode("not json at all"));
    const token = await encodeDemoSession({ userId: "x", name: "x", role: "ADMIN" });
    const forged = `${payloadPart}.${token.split(".")[1]}`;
    expect(await decodeDemoSession(forged)).toBeNull();
  });
});

describe("a correctly signed cookie carrying a shape this app never wrote", () => {
  it("rejects a signed payload with an unknown role", async () => {
    const payload = { userId: "u-1", name: "X", role: "SUPER_ADMIN" };
    const token = await encodeDemoSession(payload as never);
    expect(await decodeDemoSession(token)).toBeNull();
  });

  it("rejects a signed payload missing its fields", async () => {
    expect(await decodeDemoSession(await encodeDemoSession({} as never))).toBeNull();
  });
});
