import { BASIC_STICKER_PACK_ID, basicStickerNames, isBasicStickerKey, type BasicStickerKey } from './stickerPolicy';
export { BASIC_STICKER_PACK_ID, suggestStickerKey, selectRepresentativeSticker } from './stickerPolicy';
export type { BasicStickerKey } from './stickerPolicy';
const basicImages = {
  birthday: require('../../../assets/stickers/basic/birthday.png'),
  anniversary: require('../../../assets/stickers/basic/anniversary.png'),
  cafe: require('../../../assets/stickers/basic/cafe.png'),
  meal: require('../../../assets/stickers/basic/meal.png'),
  shopping: require('../../../assets/stickers/basic/shopping.png'),
  gift: require('../../../assets/stickers/basic/gift.png'),
  call: require('../../../assets/stickers/basic/call.png'),
  important: require('../../../assets/stickers/basic/important.png'),
  travel: require('../../../assets/stickers/basic/travel.png'),
  car: require('../../../assets/stickers/basic/car.png'),
  business_trip: require('../../../assets/stickers/basic/business_trip.png'),
  exercise: require('../../../assets/stickers/basic/exercise.png'),
  hospital: require('../../../assets/stickers/basic/hospital.png'),
  dentist: require('../../../assets/stickers/basic/dentist.png'),
  health: require('../../../assets/stickers/basic/health.png'),
  home_family: require('../../../assets/stickers/basic/home_family.png'),
} as const;
export const basicStickers = Object.fromEntries(
  (Object.keys(basicStickerNames) as BasicStickerKey[]).map(key => [key, { name: basicStickerNames[key], image: basicImages[key] }]),
) as Record<BasicStickerKey, { name: string; image: number }>;
export const stickerPacks = { basic: { free: true, stickers: basicStickers } } as const;
export function getStickerAsset(packId: string | null | undefined, key: string | null | undefined) {
  return isBasicStickerKey(packId, key) ? basicStickers[key] : null;
}
