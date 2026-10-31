# 모두의 근무 공식 웹사이트

빌드·설치·로그인 없이 사용하는 HTML/CSS 정적 사이트입니다. 외부 폰트나 추적 스크립트도 사용하지 않습니다.

## GitHub Pages

저장소 반영 후 Settings → Pages → Deploy from a branch에서 실제 배포 브랜치와 `/docs`를 선택하고 Enforce HTTPS를 활성화합니다. 내부 링크는 프로젝트 하위 경로에 대응하는 상대경로입니다. `.nojekyll`로 Jekyll 처리를 생략합니다.

등록할 주소 (실제 배포 후 확정):
- `https://<owner>.github.io/<repository>/`
- `https://<owner>.github.io/<repository>/privacy.html`
- `https://<owner>.github.io/<repository>/delete-account.html`

로컬에서는 index.html을 직접 열거나 `python -m http.server 8080 --directory docs`로 확인할 수 있습니다.

## 현재 확정 사항

- 개인정보처리방침 시행일: 2026년 11월 1일.
- 문의 및 계정 삭제 요청: moduwork09@gmail.com.
- 사용자가 확정한 실제 구현: 계정/로그인, Supabase 인증 및 서버 데이터, Together 그룹/공동 일정, 우리의 틈, 여행 추천, 생활 브리핑, 기본 스티커, Preset, 개인 일정/메모.
- 현재 미도입: 광고, Google Play Billing/Plus 결제, premium sticker pack.
- 현재 제3자 광고 SDK를 사용하지 않습니다.
- 보관 기준: 처리 목적 달성 후 지체 없이 삭제하며, 관계 법령에 따라 보존이 필요한 경우 해당 기간 보관.
- 앱 내 계정 삭제 메뉴 경로는 이 로컬 저장소에서 확인되지 않아 웹페이지에는 이메일 요청 방법만 안내합니다. 로컬 초기화를 서버 계정 삭제로 안내하지 않습니다.

## 작성 근거와 배포

서비스 구현 상태는 사용자가 제공한 최신 확정 사항을 기준으로 합니다. 로컬 저장소에 해당 서버 구현이 보이지 않는다는 이유로 기능 미제공으로 표시하지 않습니다. 인증 제공자별 필드, Supabase 서버 위치, 개별 데이터의 연쇄 삭제 방식 등 확인되지 않은 세부 사항은 임의로 추가하지 않습니다.

실제 GitHub Pages URL은 배포 후 확정하여 Google Play에 등록합니다. 이번 수정은 docs/에 한정하며 앱 수정·커밋·배포를 수행하지 않습니다.
