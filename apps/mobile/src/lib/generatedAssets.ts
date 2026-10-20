export const generatedAssetFiles = {
  homeHeroWeekendBoost: 'apps/mobile/assets/generated/home_hero_weekend_boost.png',
  offerPreregisterThumb: 'apps/mobile/assets/generated/thumb_offer_preregister.png',
  newsDigestThumb: 'apps/mobile/assets/generated/thumb_news_digest.png',
  pointsCardTexture: 'apps/mobile/assets/generated/texture_points_card.png',
  exchangeGameCodeThumb: 'apps/mobile/assets/generated/thumb_exchange_game_code.png',
  emptyMissions: 'apps/mobile/assets/generated/empty_missions.png',
} as const;

export type GeneratedAssetKey = keyof typeof generatedAssetFiles;
