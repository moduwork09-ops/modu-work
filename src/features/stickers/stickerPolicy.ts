export const BASIC_STICKER_PACK_ID = 'basic';
export const basicStickerNames = {
  birthday: '생일', anniversary: '기념일', cafe: '카페', meal: '식사',
  shopping: '쇼핑', gift: '선물', call: '전화', important: '중요',
  travel: '여행', car: '차량', business_trip: '출장', exercise: '운동',
  hospital: '병원', dentist: '치과', health: '건강', home_family: '가족',
} as const;
export type BasicStickerKey = keyof typeof basicStickerNames;
export function isBasicStickerKey(packId: string | null | undefined, key: string | null | undefined): key is BasicStickerKey {
  return (!packId || packId === BASIC_STICKER_PACK_ID) && !!key && Object.prototype.hasOwnProperty.call(basicStickerNames, key);
}
const TITLE_HINTS: { key: BasicStickerKey; pattern: RegExp }[] = [
  { key: 'birthday', pattern: /생일/ }, { key: 'travel', pattern: /여행/ },
  { key: 'hospital', pattern: /병원/ }, { key: 'dentist', pattern: /치과/ },
  { key: 'cafe', pattern: /카페|커피/ }, { key: 'meal', pattern: /식사|맛집/ },
  { key: 'shopping', pattern: /쇼핑|장보기/ }, { key: 'home_family', pattern: /가족/ },
];
export function suggestStickerKey(title: string): BasicStickerKey | null {
  return TITLE_HINTS.find(({ pattern }) => pattern.test(title))?.key ?? null;
}
export type StickerCandidate = { id: string; stickerKey?: string | null; stickerPackId?: string | null; allDay: boolean; startTime: string | null };
export function selectRepresentativeSticker(candidates: StickerCandidate[]) {
  const valid = candidates.filter(item => isBasicStickerKey(item.stickerPackId, item.stickerKey));
  valid.sort((a, b) => Number(b.allDay) - Number(a.allDay)
    || (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') || a.id.localeCompare(b.id));
  const first = valid[0];
  return first ? { stickerKey: first.stickerKey!, stickerPackId: first.stickerPackId || BASIC_STICKER_PACK_ID, additionalCount: valid.length - 1 } : null;
}
