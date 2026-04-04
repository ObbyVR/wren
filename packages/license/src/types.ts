// ── License tiers ─────────────────────────────────────────────────────────────

/** Available license tiers */
export type LicenseTier = "free" | "pro" | "team";

/**
 * Decoded license payload stored as a local JWT.
 * Validation is offline-only: signature check + expiry check.
 */
export interface LicensePayload {
  /** License tier */
  tier: LicenseTier;
  /** Email address the license was issued to */
  email: string;
  /** Unix timestamp (seconds) — license expiry; 0 = no expiry */
  exp: number;
  /** Unix timestamp (seconds) — issued-at */
  iat: number;
  /** Opaque license ID for support lookups */
  lid: string;
}

/** Result returned by the validator */
export interface LicenseStatus {
  tier: LicenseTier;
  email: string;
  /** ISO date string or null for perpetual licenses */
  expiresAt: string | null;
  valid: boolean;
  /** Human-readable reason when valid === false */
  reason?: string;
}

/** Tier limits enforced by feature gating */
export interface TierLimits {
  maxProjects: number;    // -1 = unlimited
  maxProviders: number;   // -1 = unlimited
  sharedWorkspaces: boolean;
}
