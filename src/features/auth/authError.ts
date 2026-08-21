type AuthAction = 'sign-in' | 'sign-up' | 'sign-out';

export function getAuthErrorMessage(error: unknown, action: AuthAction) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호를 확인해 주세요.';
  }
  if (message.includes('already registered') || message.includes('user already exists')) {
    return '이미 가입된 이메일입니다.';
  }
  if (message.includes('password')) {
    return '비밀번호 조건을 확인해 주세요.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  }
  if (action === 'sign-out') {
    return '로그아웃에 실패했어요. 잠시 후 다시 시도해 주세요.';
  }
  if (action === 'sign-up') {
    return '회원가입에 실패했어요. 잠시 후 다시 시도해 주세요.';
  }
  return '로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
}

export function logAuthError(action: AuthAction, error: unknown) {
  const details = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  console.error(`Supabase ${action} failed`, {
    code: details.code,
    name: details.name,
    status: details.status,
  });
}
