// ── Auth Handlers: 회원가입, 로그인, 토큰 갱신 ──

import { json, notifySlack, createClient } from './utils.ts';

// P2-11: auth 전용 anon client 생성 헬퍼 (boilerplate 축소)
// Note: signInWithPassword/refreshSession은 클라이언트 내부에 세션 상태를 보관하므로
// 동시 요청 충돌 방지를 위해 요청당 새 client 생성 유지
function newAnonClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
}

export async function handleSignup(cors: Record<string, string>, req: Request, svc: any) {
  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
  }
  const { email, password, name, phone, cohort } = body;
  if (!email || !password) return json(cors, { error: '이메일과 비밀번호를 입력하세요' }, 400);
  if (password.length < 8) return json(cors, { error: '비밀번호는 8자 이상이어야 합니다' }, 400);
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return json(cors, { error: '비밀번호에 영문과 숫자를 모두 포함해주세요' }, 400);
  }

  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (error.message.includes('already'))
      return json(cors, { error: '이미 가입된 이메일입니다' }, 409);
    return json(cors, { error: error.message }, 400);
  }

  const { error: profileErr } = await svc.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: name || '',
    name: name || '',
    phone: phone || '',
    cohort: cohort || '',
    role: 'user',
    approval_status: '대기중',
    must_change_password: false,
  });

  if (profileErr) {
    try {
      await svc.auth.admin.deleteUser(data.user.id);
    } catch (_) {
      /* best-effort rollback */
    }
    await notifySlack(
      'signup',
      500,
      `Profile upsert 실패 → auth user 롤백: ${email} / ${profileErr.message}`,
      'system'
    );
    return json(cors, { error: '회원가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.' }, 500);
  }

  return json(cors, {
    message: '회원가입 완료. 관리자 승인 후 이용 가능합니다.',
    status: '대기중',
  });
}

export async function handleLogin(cors: Record<string, string>, req: Request, svc: any) {
  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
  }
  const { email, password } = body;
  if (!email || !password) return json(cors, { error: '이메일과 비밀번호를 입력하세요' }, 400);

  const anonClient = newAnonClient();
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) return json(cors, { error: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401);

  const { data: profile } = await svc
    .from('profiles')
    .select('full_name, name, cohort, role, approval_status')
    .eq('id', data.user.id)
    .single();

  // 3-3: 고아 유저 복구 — auth에 있지만 profile이 없는 경우 자동 생성
  if (!profile) {
    const email = data.user.email || '';
    const { error: recoverErr } = await svc.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: email.split('@')[0],
      name: email.split('@')[0],
      phone: '',
      cohort: '',
      role: 'user',
      approval_status: '대기중',
      must_change_password: false,
    });
    if (recoverErr) {
      await notifySlack(
        'login',
        500,
        `고아 유저 profile 복구 실패: ${email} / ${recoverErr.message}`,
        data.user.id
      );
      return json(cors, { error: '계정에 문제가 있습니다. 관리자에게 문의해주세요.' }, 500);
    }
    await notifySlack('login', 200, `고아 유저 profile 자동 복구: ${email}`, 'system');
    return json(cors, { error: '계정이 복구되었습니다. 관리자 승인 후 이용 가능합니다.' }, 403);
  }

  return json(cors, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: profile.full_name || profile.name || '',
      cohort: profile.cohort || '',
      role: profile.role || 'user',
      approval_status: profile.approval_status,
    },
  });
}

export async function handleRefresh(cors: Record<string, string>, req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
  }
  const { refresh_token } = body;
  if (!refresh_token) return json(cors, { error: 'refresh_token required' }, 400);
  try {
    const anonClient = newAnonClient();
    const { data, error } = await anonClient.auth.refreshSession({ refresh_token });
    if (error || !data.session) return json(cors, { error: '토큰 갱신 실패' }, 401);
    return json(cors, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    });
  } catch (_) {
    return json(cors, { error: '토큰 갱신 실패' }, 401);
  }
}
