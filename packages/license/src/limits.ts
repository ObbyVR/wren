import type { LicenseTier, TierLimits } from "./types";

export const TIER_LIMITS: Record<LicenseTier, TierLimits> = {
  free: {
    maxProjects: 1,
    maxProviders: 1,
    sharedWorkspaces: false,
  },
  pro: {
    maxProjects: -1,
    maxProviders: -1,
    sharedWorkspaces: false,
  },
  team: {
    maxProjects: -1,
    maxProviders: -1,
    sharedWorkspaces: true,
  },
};

export function getLimits(tier: LicenseTier): TierLimits {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}

export function canAddProject(tier: LicenseTier, currentCount: number): boolean {
  const { maxProjects } = getLimits(tier);
  return maxProjects === -1 || currentCount < maxProjects;
}

export function canAddProvider(tier: LicenseTier, currentCount: number): boolean {
  const { maxProviders } = getLimits(tier);
  return maxProviders === -1 || currentCount < maxProviders;
}
