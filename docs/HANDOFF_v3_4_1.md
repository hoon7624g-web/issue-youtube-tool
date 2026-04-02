# HANDOFF v3.4.1 — Admin 리팩토링 + Signup 보상 로직

## 변경 요약

### Task 1: Admin 두 벌 → 공유 모듈 추출

`admin-shared/` 디렉토리에 4개 공유 모듈을 추출하여 양쪽 HTML이 참조하는 구조로 전환.

| 파일 | LOC | 역할 |
|------|-----|------|
| `admin-shared/admin-core.css` | 181 | CSS 변수, 레이아웃, 카드, 버튼, 테이블, 모달, 토스트, 반응형 — 100% 공유 |
| `admin-shared/admin-utils.js` | 152 | `$()`, `esc()`, `toast()`, `oM()/cM()`, 데이터(D), 사이드바 탭, 다크모드, **이벤트 위임 엔진** |
| `admin-shared/admin-users.js` | 155 | 사용자 관리 (rU, filterUsers, renderUserTable, approve/reject/bulk) |
| `admin-shared/admin-styles.js` | 95 | 스타일 관리 (rS, oSt, sSt, dSt, tSt) |

**호스트별 차이 (공유 불가)**:
- `admin-web/index.html` — Supabase Auth (Bearer token), 사용량 모니터링 탭, Rate Limit 설정, 데모 모드, v3.4 대시보드
- `src/admin.html` — Admin Secret (X-Admin-Secret 헤더), 구버전 설정 페이지

### Task 2: 인라인 이벤트 전면 제거

모든 `onclick`, `oninput`, `onchange` 인라인 핸들러를 `data-action`, `data-on-input`, `data-on-change` 어트리뷰트 + 글로벌 이벤트 위임으로 전환.

**이벤트 위임 패턴**:
```js
// 등록
ACTIONS['approve-user'] = function(el) { approveUser(el.dataset.uid); };

// HTML
<button data-action="approve-user" data-uid="abc123">승인</button>

// 위임 (admin-utils.js에서 한 번만 등록)
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, e);
});
```

**결과**: 인라인 이벤트 핸들러 0개 (admin-web 35개 → 0, src/admin 27개 → 0)

### Task 3: Admin 토큰 sessionStorage 전환

`admin-web/index.html`의 admin 세션 저장소를 `localStorage` → `sessionStorage`로 변경.

- `getAdminToken()` / `setAdminToken()` / `getAdminUser()` / `setAdminUser()` / `clearAdmin()` 모두 `sessionStorage` 사용
- 탭 닫으면 자동 로그아웃 (브라우저 탭 단위 소멸)
- `src/admin.html`의 Admin Secret은 Electron 내부 용도이므로 `localStorage` 유지

### Task 4: Signup 보상 로직 (Compensation)

`supabase/functions/proxy/index.ts` — `handleSignup()`

**기존 문제**: `auth.admin.createUser()` 성공 후 `profiles.upsert()` 실패하면 auth 테이블에만 유저가 남아 orphan 상태.

**수정**:
```typescript
const { error: profileErr } = await svc.from("profiles").upsert({...});

if (profileErr) {
  try { await svc.auth.admin.deleteUser(data.user.id); } catch (_) {}
  await notifySlack("signup", 500, `Profile upsert 실패 → auth user 롤백: ${email}`, "system");
  return json(cors, { error: "회원가입 처리 중 오류가 발생했습니다. 다시 시도해주세요." }, 500);
}
```

- Best-effort 롤백: auth user 삭제 실패 시에도 에러 전파 안 함
- Slack 알림으로 관리자가 수동 확인 가능

## 줄 수 비교

| | Before | After |
|--|--------|-------|
| `admin-web/index.html` | 583 | 356 |
| `src/admin.html` | 340 | 156 |
| 공유 모듈 (4개) | 0 | 583 |
| **총합** | **923** | **1,095** |

총 줄 수는 172줄 증가했지만, **중복 제거**된 공유 코드 583줄이 핵심. 호스트별 코드는 923 → 512로 45% 감소.

## 배포 시 주의

1. **admin-shared 경로**: `admin-web/index.html`이 `../admin-shared/`를 참조하므로 디렉토리 구조 유지 필수
2. **CSP 변경 없음**: `script-src 'self' 'unsafe-inline'`이므로 외부 JS 파일 로드 가능
3. **Edge Function 재배포**: signup 보상 로직 반영을 위해 `supabase functions deploy proxy` 필요
4. **sessionStorage 전환**: admin-web 기존 사용자는 로그인 세션이 초기화됨 (1회 재로그인 필요)
