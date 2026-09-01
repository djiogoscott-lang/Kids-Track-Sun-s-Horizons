import type { UserRole } from "@/lib/constants/roles";

export interface DemoSessionPayload {
  userId: string;
  name: string;
  role: UserRole;
}

export const DEMO_SESSION_COOKIE = "kt_demo_session";

// Demo mode only runs when no Supabase project is configured (see src/lib/env.ts),
// i.e. never in a real deployment with real children's data. This signature only
// stops a browser from handing itself an admin role by editing the cookie value;
// it is not a substitute for Supabase Auth, which real deployments use instead.
const DEMO_SESSION_SECRET = process.env.DEMO_SESSION_SECRET ?? "kids-track-demo-mode-not-for-production";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(DEMO_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function encodeDemoSession(payload: DemoSessionPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const payloadPart = bytesToBase64Url(new TextEncoder().encode(json));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payloadPart));
  return `${payloadPart}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * Fails closed on anything it does not recognise, and never throws.
 *
 * The whole body is guarded, not just the JSON parse: base64UrlToBytes calls
 * atob, which throws on a value that is not valid base64. A cookie of
 * "a.b.c" — a stale cookie from another app on localhost is enough — used to
 * raise InvalidCharacterError out of getCurrentUser(), and since that runs
 * inside every server component the visitor got a 500 page they could not
 * escape: the error fired before any redirect to /login could happen, and
 * the offending cookie was still there on reload. An unreadable session is
 * simply no session.
 */
export async function decodeDemoSession(cookieValue: string | undefined): Promise<DemoSessionPayload | null> {
  if (!cookieValue) return null;

  try {
    const [payloadPart, signaturePart] = cookieValue.split(".");
    if (!payloadPart || !signaturePart) return null;

    const valid = await crypto.subtle.verify("HMAC", await hmacKey(), base64UrlToBytes(signaturePart), new TextEncoder().encode(payloadPart));
    if (!valid) return null;

    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as DemoSessionPayload;
    // A correctly signed cookie can still carry a shape this app never wrote
    // (an older format, a hand-crafted payload signed with a leaked secret).
    // Anything without the three fields is not a session.
    if (typeof decoded?.userId !== "string" || typeof decoded?.name !== "string" || (decoded?.role !== "ADMIN" && decoded?.role !== "MONITOR")) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
