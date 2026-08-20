export type PlaceSearchResult = {
  id: string;
  name: string;
  category?: string;
  roadAddress: string;
  address?: string;
  latitude: number;
  longitude: number;
  kakaoPlaceUrl?: string;
  phone?: string;
};

export const RECOMMENDED_PLACES: PlaceSearchResult[] = [
  { id: 'starfield-goyang', name: '스타필드 고양', category: '쇼핑몰', roadAddress: '경기 고양시 덕양구 고양대로 1955', address: '동산동 370', latitude: 37.6469, longitude: 126.8947 },
  { id: 'ikea-goyang', name: '이케아 고양점', category: '가구·인테리어', roadAddress: '경기 고양시 덕양구 권율대로 420', address: '도내동', latitude: 37.629, longitude: 126.863 },
  { id: 'ilsan-lake-park', name: '일산호수공원', category: '공원', roadAddress: '경기 고양시 일산동구 호수로 595', latitude: 37.659, longitude: 126.768 },
];

let pendingPlaceSelection: PlaceSearchResult | null = null;

type KakaoPlaceDocument = {
  id?: unknown;
  place_name?: unknown;
  category_name?: unknown;
  category_group_name?: unknown;
  road_address_name?: unknown;
  address_name?: unknown;
  x?: unknown;
  y?: unknown;
  place_url?: unknown;
  phone?: unknown;
};

type KakaoPlaceResponse = {
  documents?: unknown;
};

export class PlaceSearchConfigurationError extends Error {
  constructor() {
    super('카카오 장소검색 API 키가 설정되지 않았습니다.');
    this.name = 'PlaceSearchConfigurationError';
  }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const apiKey = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  if (!apiKey) throw new PlaceSearchConfigurationError();

  // TODO: Move Kakao Local API request behind a backend proxy before production.
  const params = new URLSearchParams({ query: trimmedQuery, size: '15' });
  const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params.toString()}`, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Kakao Local API request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as KakaoPlaceResponse;
  if (!Array.isArray(payload.documents)) {
    throw new Error('Kakao Local API response is invalid.');
  }

  return (payload.documents as KakaoPlaceDocument[]).flatMap((document) => {
    const latitude = typeof document.y === 'string' && document.y.trim() ? Number(document.y) : Number.NaN;
    const longitude = typeof document.x === 'string' && document.x.trim() ? Number(document.x) : Number.NaN;
    if (typeof document.id !== 'string'
      || typeof document.place_name !== 'string'
      || !document.place_name.trim()
      || !Number.isFinite(latitude)
      || !Number.isFinite(longitude)) return [];

    const roadAddress = typeof document.road_address_name === 'string' && document.road_address_name
      ? document.road_address_name
      : typeof document.address_name === 'string' ? document.address_name : '';

    return [{
      id: document.id,
      name: document.place_name,
      category: typeof document.category_name === 'string' && document.category_name
        ? document.category_name
        : typeof document.category_group_name === 'string' ? document.category_group_name : undefined,
      roadAddress,
      address: typeof document.address_name === 'string' ? document.address_name : undefined,
      latitude,
      longitude,
      kakaoPlaceUrl: typeof document.place_url === 'string' ? document.place_url : undefined,
      phone: typeof document.phone === 'string' ? document.phone : undefined,
    }];
  });
}

export function setPendingPlaceSelection(place: PlaceSearchResult) {
  pendingPlaceSelection = place;
}

export function consumePendingPlaceSelection() {
  const selection = pendingPlaceSelection;
  pendingPlaceSelection = null;
  return selection;
}
