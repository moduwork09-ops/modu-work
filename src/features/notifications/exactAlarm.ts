import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type ExactAlarmModule = {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): Promise<boolean>;
};
const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<ExactAlarmModule>('ModuWorkExactAlarm')
  : null;

export const showsExactAlarmSettings = Platform.OS === 'android' && Number(Platform.Version) >= 31;

/** Unknown (old development build / native error) must never block normal notifications. */
export function getExactAlarmCapability(): boolean | null {
  if (Platform.OS !== 'android') return null;
  if (Number(Platform.Version) < 31) return true;
  try { return native?.canScheduleExactAlarms() ?? null; }
  catch { return null; }
}

export async function openExactAlarmSettings(): Promise<void> {
  if (!showsExactAlarmSettings) return;
  if (!native) throw new Error('정확한 알림 설정을 사용하려면 새 앱 빌드가 필요해요.');
  try {
    if (!await native.openExactAlarmSettings()) throw new Error('unsupported');
  } catch {
    throw new Error('설정 화면을 열지 못했어요. 기기 설정의 알람 및 리마인더에서 허용해 주세요.');
  }
}
