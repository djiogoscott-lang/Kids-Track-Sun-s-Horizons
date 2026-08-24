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

export async function decodeDemoSession(cookieValue: string | undefined): Promise<DemoSessionPayload | null> {
  if (!cookieValue) return null;
  const [payloadPart, signaturePart] = cookieValue.split(".");
  if (!payloadPart || !signaturePart) return null;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(payloadPart),
  );
  if (!valid) return null;

  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as DemoSessionPayload;
  } catch {
    return null;
  }
}
