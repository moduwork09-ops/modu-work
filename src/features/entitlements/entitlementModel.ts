export type UserEntitlement = {
  id: string;
  userId: string;
  entitlement: 'premium';
  source: 'beta' | 'event' | 'admin' | 'play_subscription';
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
};
export type RedeemResult = 'redeemed' | 'invalid' | 'expired' | 'already_redeemed' | 'exhausted';

export function isEntitlementActive(value: UserEntitlement, now = new Date()): boolean {
  const starts = Date.parse(value.startsAt);
  const expires = value.expiresAt === null ? null : Date.parse(value.expiresAt);
  return value.isActive && Number.isFinite(starts) && starts <= now.getTime()
    && (expires === null || Number.isFinite(expires) && expires > now.getTime());
}

export function entitlementTitle(value: UserEntitlement): string {
  if (value.source === 'beta' && value.expiresAt === null) return '베타 감사 평생 이용권';
  if (value.source === 'event' && value.expiresAt === null) return '이벤트 평생 이용권';
  return value.source === 'play_subscription' ? '구독 이용권' : value.source === 'event' ? '이벤트 이용권' : 'Premium 이용권';
}

export function entitlementPeriod(value: UserEntitlement): string {
  return value.expiresAt === null ? 'Premium · 평생' : `Premium · ${value.expiresAt.slice(0, 10).replace(/-/g, '.')}까지`;
}

export function redeemResultMessage(result: RedeemResult): string {
  switch (result) {
    case 'redeemed': return '이용권을 등록했어요.';
    case 'invalid': return '코드를 확인해 주세요.';
    case 'expired': return '사용 기간이 지난 코드예요.';
    case 'already_redeemed': return '이미 등록한 코드예요.';
    case 'exhausted': return '사용 가능 횟수가 모두 찬 코드예요.';
  }
}
