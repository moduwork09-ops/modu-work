import type { ImageSourcePropType } from 'react-native';

export type TravelDestinationImageSource =
  | { kind: 'local'; source: ImageSourcePropType }
  | { kind: 'remote'; uri: string };

/** Presentation-only assets; recommendation and save logic use destination IDs. */
export const TRAVEL_DESTINATION_IMAGES: Readonly<Record<string, TravelDestinationImageSource>> = {
  jeju: { kind: 'local', source: require('../../../assets/travel/jeju.webp') },
  fukuoka: { kind: 'local', source: require('../../../assets/travel/fukuoka.webp') },
  osaka: { kind: 'local', source: require('../../../assets/travel/osaka.webp') },
  tokyo: { kind: 'local', source: require('../../../assets/travel/tokyo.webp') },
  sapporo: { kind: 'local', source: require('../../../assets/travel/sapporo.webp') },
  okinawa: { kind: 'local', source: require('../../../assets/travel/okinawa.webp') },
  taipei: { kind: 'local', source: require('../../../assets/travel/taipei.webp') },
  hongkong: { kind: 'local', source: require('../../../assets/travel/hongkong.webp') },
  danang: { kind: 'local', source: require('../../../assets/travel/danang.webp') },
  cebu: { kind: 'local', source: require('../../../assets/travel/cebu.webp') },
  guam: { kind: 'local', source: require('../../../assets/travel/guam.webp') },
  bangkok: { kind: 'local', source: require('../../../assets/travel/bangkok.webp') },
  singapore: { kind: 'local', source: require('../../../assets/travel/singapore.webp') },
};

export function toReactNativeImageSource(image: TravelDestinationImageSource): ImageSourcePropType {
  return image.kind === 'local' ? image.source : { uri: image.uri };
}

export function getTravelDestinationImageSource(destinationId: string): ImageSourcePropType | null {
  const image = Object.prototype.hasOwnProperty.call(TRAVEL_DESTINATION_IMAGES, destinationId)
    ? TRAVEL_DESTINATION_IMAGES[destinationId]
    : undefined;
  return image ? toReactNativeImageSource(image) : null;
}
