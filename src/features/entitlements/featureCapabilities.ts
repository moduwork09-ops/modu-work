import { isEntitlementActive, type UserEntitlement } from './entitlementModel';

export const FREE_FEATURES = new Set([
  'shift_schedule',
  'calendar',
  'personal_events',
  'memos',
  'basic_widgets',
  'basic_stickers',
  'shift_presets',
  'together',
  'shared_events',
  'common_availability',
  'basic_backup_restore',
] as const);

export const PLUS_FEATURES = new Set([
  'travel_recommendation',
  'life_briefing',
  'premium_stickers',
  'sticker_size_control',
  'advanced_statistics',
  'remove_ads',
] as const);

export type FreeFeatureKey = typeof FREE_FEATURES extends Set<infer Key> ? Key : never;
export type PlusFeatureKey = typeof PLUS_FEATURES extends Set<infer Key> ? Key : never;
export type FeatureKey = FreeFeatureKey | PlusFeatureKey;

// Entry points that exist today, plus the reserved keys for planned Plus controls.
// This map documents ownership; it does not lock the first Play test build.
export const PLUS_FEATURE_ENTRY_KEYS = {
  togetherTravel: 'travel_recommendation',
  lifeBriefing: 'life_briefing',
  premiumStickerPacks: 'premium_stickers',
  stickerSizeControl: 'sticker_size_control',
  advancedStatistics: 'advanced_statistics',
  removeAds: 'remove_ads',
} as const satisfies Record<string, PlusFeatureKey>;

export const PLUS_ROUTE_FEATURES = {
  '/together-travel': 'travel_recommendation',
  '/together-travel-destinations': 'travel_recommendation',
  '/life-briefing': 'life_briefing',
} as const satisfies Record<string, PlusFeatureKey>;

export function canUseFeature(
  feature: FeatureKey,
  entitlement: UserEntitlement | readonly UserEntitlement[] | null | undefined,
  now = new Date(),
): boolean {
  if (FREE_FEATURES.has(feature as FreeFeatureKey)) return true;
  if (!PLUS_FEATURES.has(feature as PlusFeatureKey)) return false;
  const entitlements = Array.isArray(entitlement) ? entitlement : entitlement ? [entitlement] : [];
  return entitlements.some((item) => item.entitlement === 'premium' && isEntitlementActive(item, now));
}
