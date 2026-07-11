-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️  코드 추론본 (schema.inferred.sql) — 운영 DB와 다를 수 있음, 실제 덤프로 교체 필요
-- ═══════════════════════════════════════════════════════════════════════
-- 이 파일은 supabase/functions/proxy/*.ts 의 쿼리(.from/.select/.insert/.upsert/.eq …)에서
-- 역추론한 스키마입니다. Supabase 프로젝트 접근이 없어 실제 덤프 대신 작성했습니다.
--
-- 코드로 확인 불가하여 여기에 포함되지 않은 항목:
--   • 정확한 컬럼 타입/길이/정밀도 (아래는 사용처 기반 추정)
--   • DEFAULT 값, NOT NULL 제약, CHECK 제약
--   • 인덱스 (성능상 필요한 것은 하단에 '권장'으로만 표기)
--   • RLS(Row Level Security) 정책 — Edge Function은 service_role로 접근하므로 코드에 안 드러남
--   • 외래키(FK), 트리거, 시퀀스
--
-- 실제 스키마 확보 시 교체 방법:
--   supabase db dump --schema public -f supabase/schema/schema.sql
--   (또는 Dashboard → SQL Editor → 스키마 export)
-- 확보 후 이 파일은 삭제하고 schema.sql 로 커밋할 것.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- profiles — 사용자 프로필 + 승인 상태 (auth.users 와 1:1)
--   참조: auth.ts(upsert), admin.ts(select/update), utils.ts(validateUser select)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                     uuid primary key,            -- = auth.users.id (FK 추정)
  email                  text,
  full_name              text,
  name                   text,
  phone                  text,
  cohort                 text,                         -- 기수 등 분류값
  role                   text default 'user',          -- 'user' | 'admin' (admin.ts 권한 분기)
  approval_status        text default '대기중',        -- '대기중' | '승인완료' (승인 워크플로)
  must_change_password   boolean default false,
  created_at             timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- usage_logs — API 호출 로그 + IP/계정 Rate Limit + brute-force 카운트
--   참조: index.ts(insert/count), admin.ts(usage 통계/cleanup)
--   ※ user_id 는 UUID(로그인 사용자) / IP 문자열(비인증 signup·login·refresh) /
--     이메일 SHA-256 해시(login-account) 를 모두 담으므로 uuid 가 아닌 text.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.usage_logs (
  id            bigint generated always as identity primary key,  -- (타입 추정)
  user_id       text,                    -- UUID | IP | email-hash (위 주석 참고)
  endpoint      text,                    -- signup|login|login-account|refresh|llm|tts|elevenlabs|youtube|gas|trends|gas_cache …
  status_code   integer,
  response_ms   integer,
  created_at    timestamptz default now()
);
-- 권장 인덱스(코드의 count 쿼리 패턴 기반, 실제 존재 여부 미확인):
--   create index on public.usage_logs (endpoint, user_id, created_at);
--   create index on public.usage_logs (created_at);   -- /admin/cleanup 의 lt(created_at) 배치 삭제용

-- ─────────────────────────────────────────────────────────────────────
-- rate_config — 엔드포인트별 Rate Limit 설정 (DB 기반, 코드에 하드코딩 fallback 있음)
--   참조: utils.ts(getRateConfig select), admin.ts(rate-config upsert onConflict:endpoint)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.rate_config (
  endpoint        text primary key,       -- onConflict:"endpoint" → unique/PK
  max_requests    integer,
  window_seconds  integer,
  description     text default '',
  updated_at      timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- demo_bypass — 웨비나/데모용 Rate Limit 면제 (한시적)
--   참조: admin.ts(demo-bypass upsert onConflict:user_id / update / select),
--        utils.ts(checkRate: select id where active & expires_at>now)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.demo_bypass (
  id           bigint generated always as identity primary key,  -- utils.ts 가 id 를 select 함
  user_id      uuid unique,             -- onConflict:"user_id" (타입 uuid 추정)
  active       boolean default true,
  expires_at   timestamptz,
  created_by   text,                    -- 'admin' 등
  note         text
);

-- ─────────────────────────────────────────────────────────────────────
-- telemetry_events — 익명 사용 텔레메트리 (스텝 진입/기능 사용 등)
--   참조: index.ts(/api/telemetry insert)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.telemetry_events (
  id           bigint generated always as identity primary key,  -- (타입 추정)
  user_id      uuid,
  event_type   text,                    -- 코드에서 최대 50자로 잘라 저장
  event_data   text,                    -- JSON.stringify 결과 문자열(최대 500자). jsonb 일 수도 있음
  client_ts    bigint,                  -- 클라이언트 epoch ms (Date.now())
  created_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- youtube_cache — 범용 응답 캐시 (테이블명과 달리 gas/issuelink/trends/실검 등 공용)
--   참조: gas.ts, issuelink.ts, trends.ts, realtime-keywords.ts (upsert onConflict:cache_key),
--        admin.ts(cleanup-cache: delete where expires_at<now)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.youtube_cache (
  cache_key    text primary key,        -- 예: "gas:issuelink:all" (onConflict:"cache_key")
  endpoint     text,                    -- 'gas' 등 캐시 출처 태그
  result       jsonb,                   -- 캐시된 응답 본문(객체)
  expires_at   timestamptz
);
-- 권장 인덱스: create index on public.youtube_cache (expires_at);  -- 만료 캐시 정리용

-- ═══════════════════════════════════════════════════════════════════════
-- 끝 — 다시 강조: 이 파일은 코드 추론본이며 운영 DB의 실제 스키마와 다를 수 있습니다.
-- ═══════════════════════════════════════════════════════════════════════
