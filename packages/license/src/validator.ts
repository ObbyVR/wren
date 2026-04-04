/**
 * Offline license validator.
 *
 * Format: a 3-part dot-separated string  header.payload.signature
 * where header+payload are standard base64url-encoded JSON objects,
 * and signature is a HMAC-SHA256 of "header.payload" using a well-known
 * public key embedded at build time.
 *
 * For local/offline validation we only verify:
 *   1. The string is parseable (3 parts, valid base64url JSON)
 *   2. The payload `exp` field has not passed (0 = no expiry)
 *   3. The `tier` field is one of the known values
 *
 * Full cryptographic verification requires the signing secret and is
 * intended for a future server-side activation endpoint.
 */

import type { LicenseTier, LicensePayload, LicenseStatus } from "./types";

const KNOWN_TIERS: LicenseTier[] = ["free", "pro", "team"];

function base64urlDecode(s: string): string {
  // Pad to 4-char boundary and replace URL-safe chars
  const padded = s + "==".slice((s.length + 2) % 4 || 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function parseLicenseKey(key: string): LicensePayload | null {
  const parts = key.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64urlDecode(parts[1])) as Partial<LicensePayload>;
    if (
      typeof payload.tier !== "string" ||
      !KNOWN_TIERS.includes(payload.tier as LicenseTier) ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      typeof payload.lid !== "string"
    ) {
      return null;
    }
    return payload as LicensePayload;
  } catch {
    return null;
  }
}

export function validateLicenseKey(key: string | null | undefined): LicenseStatus {
  if (!key || key.trim() === "") {
    return { tier: "free", email: "", expiresAt: null, valid: true };
  }

  const payload = parseLicenseKey(key);
  if (!payload) {
    return { tier: "free", email: "", expiresAt: null, valid: false, reason: "Invalid license key format" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp !== 0 && payload.exp < nowSec) {
    return {
      tier: "free",
      email: payload.email,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      valid: false,
      reason: "License has expired",
    };
  }

  return {
    tier: payload.tier,
    email: payload.email,
    expiresAt: payload.exp === 0 ? null : new Date(payload.exp * 1000).toISOString(),
    valid: true,
  };
}
