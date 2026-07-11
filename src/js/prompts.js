// ═══════════════════════════════════════
// prompts.js — LLM 프롬프트 템플릿 중앙 관리
// api.js에서 인라인 프롬프트를 이 파일로 외부화
// ═══════════════════════════════════════

export const PROMPT = {
  // ── 영상 분석 (Gemini Video) ──
  ANALYZE_VIDEO: (v) =>
    '당신은 유튜브 콘텐츠 전략 분석가입니다.\n\n이 유튜브 영상을 직접 시청하고 성과를 분석해주세요.\n\n[추가 영상 정보]\n- 제목: ' +
    v.title +
    '\n- 채널: ' +
    v.ch +
    '\n- 조회수: ' +
    v.views +
    '\n- 구독자: ' +
    v.subs +
    '\n\n[분석 항목]\n1. summary: 이 영상이 왜 인기가 있는지 3줄 분석 (하나의 문자열로)\n2. hooks: 영상에서 발견된 훅 포인트 3개 (문자열 배열)\n3. structure: 실제 구조 5단계 분석 (문자열 배열)\n4. reasons: 잘된 이유 3가지 (문자열 배열)\n\n반드시 아래 형식의 순수 JSON만 응답하세요. 마크다운 코드블록(```)으로 감싸지 마세요.\n{"summary":"문자열","hooks":["항목1","항목2","항목3"],"structure":["단계1","단계2","단계3","단계4","단계5"],"reasons":["이유1","이유2","이유3"]}',

  // ── 영상 분석 (텍스트 fallback) ──
  ANALYZE_TEXT: (v, transcript) => {
    const hasT = transcript && transcript.length > 50;
    return (
      '당신은 유튜브 콘텐츠 전략 분석가입니다.\n\n[영상 정보]\n- 제목: ' +
      v.title +
      '\n- 채널: ' +
      v.ch +
      '\n- 조회수: ' +
      v.views +
      '\n- 구독자: ' +
      v.subs +
      '\n- 설명: ' +
      (v.desc || '없음') +
      '\n' +
      (hasT ? '\n[영상 자막 전문]\n' + transcript + '\n' : '') +
      '\n[분석 항목]\n1. summary: 영상 인기 이유 3줄 분석\n2. hooks: 훅 포인트 3개\n3. structure: 적합한 구조 5단계\n4. reasons: 잘된 이유 3가지\n\nJSON 형식으로만 응답: {"summary":"...","hooks":[...],"structure":[...],"reasons":[...]}'
    );
  },

  // ── 롱폼 대본 생성 ──
  GEN_LONGFORM: (ana, styleBlock, transcriptBlock) =>
    '당신은 유튜브 전문 대본 작가입니다.\n\n[분석 결과]\n- 요약: ' +
    ana.summary +
    '\n- 훅: ' +
    ana.hooks.join(', ') +
    '\n- 구조: ' +
    ana.structure.join(', ') +
    '\n- 이유: ' +
    ana.reasons.join(', ') +
    '\n' +
    transcriptBlock +
    styleBlock +
    '\n[롱폼 대본 작성]\n- 6000~8000자 (20분 이상 분량)\n- 구조: 인트로 훅 → 문제 제기 → 핵심 주장 3~5개 → 사례/증거 → 반전/새 관점 → 정리 및 CTA\n- 도입부(Hook): 첫 3문장은 시청자가 즉시 빠져들 강력한 훅. 충격적 사실, 역설적 질문, 공감 유발\n- 뉘앙스: 나열식 X → 자연스러운 대화체. "~거든요", "~잖아요" 등 구어체 적절 혼합\n- 유머 코드: 무거운 주제여도 적절한 위트와 비유로 시청 지속률 향상. 과하지 않게\n- 리듬감: 짧은 문장과 긴 문장 교차. 강조 문장은 단독 줄로 분리\n- 깊이 있는 분석과 구체적 사례 포함\n- 이모지, 특수기호, 마크다운 기호(#, *, **) 절대 사용 금지. 순수 한글/영문/숫자/기본 문장부호만\n\n첫 줄에 제목, 그다음 줄부터 본문을 작성하세요. JSON이나 마크다운 없이 순수 텍스트만.',

  // ── 숏폼 대본 생성 (롱폼 기반) ──
  GEN_SHORTS_FROM_LONGFORM: (longformTitle, longformContent, anaBlock) =>
    '당신은 유튜브 숏폼 전문 대본 작가입니다.\n\n아래 롱폼 대본을 기반으로 숏폼 대본 5개를 작성하세요.\n\n[롱폼 제목]\n' +
    longformTitle +
    '\n\n[롱폼 대본 요약]\n' +
    longformContent.substring(0, 2000) +
    '\n\n' +
    anaBlock +
    '\n\n[숏폼 규칙]\n- 각 150~300자\n- 5개 모두 다른 앵글/관점\n- 훅 → 핵심 → 결론 구조\n- 짧은 문장, 숏폼 화법\n- 이모지, 특수기호 사용 금지. 순수 한글/영문/숫자만 사용\n\nJSON 배열로만 응답: [{"title":"제목1","content":"본문1"},{"title":"제목2","content":"본문2"},...] (5개)',

  // ── 숏폼 전용 생성 ──
  GEN_SHORTS_ONLY: (anaBlock, styleBlock, transcriptBlock) =>
    '당신은 유튜브 숏폼 전문 대본 작가입니다.\n\n' +
    anaBlock +
    '\n' +
    transcriptBlock +
    styleBlock +
    '\n[숏폼 대본 5개 작성]\n- 각 150~300자 (30초~1분 분량)\n- 5개 모두 다른 앵글/관점\n- 도입부(Hook): 첫 1~2문장으로 즉시 관심 끌기\n- 구조: 훅 → 핵심 → 결론(CTA)\n- 짧은 문장, 숏폼 화법, 자연스러운 구어체\n- 이모지, 특수기호 사용 금지. 순수 한글/영문/숫자만\n\nJSON 배열로만 응답: [{"title":"제목1","content":"본문1"},{"title":"제목2","content":"본문2"},...] (5개)',

  // ── 숏폼 단독 ──
  GEN_SHORT_SINGLE: (ana, styleBlock, transcriptBlock) =>
    '당신은 유튜브 숏폼 전문 대본 작가입니다.\n\n[분석 결과]\n- 요약: ' +
    ana.summary +
    '\n- 훅 포인트: ' +
    ana.hooks.join(', ') +
    '\n- 잘된 이유: ' +
    ana.reasons.join(', ') +
    '\n' +
    transcriptBlock +
    styleBlock +
    '\n[작성 규칙]\n- 분량: 200~400자\n- 구조: 훅 → 핵심 → 결론\n- 짧은 문장, 숏폼 화법\n- 수치/사건을 지어내지 말 것\n- 마지막에 팔로우 CTA\n\n대본 제목을 첫 줄에, 그 다음부터 본문을 작성하세요.',

  // ── 팩트체크 ──
  FACTCHECK: (videoTitle, script, transcriptBlock) =>
    '당신은 팩트체크 전문가입니다.\n\n[영상 주제]\n' +
    videoTitle +
    '\n\n[대본]\n' +
    script +
    '\n' +
    transcriptBlock +
    '\n[규칙] 영상 주제 관련 사실만 검증. CTA 제외. 수치/통계/날짜만. 최대 3개. text는 대본에서 정확히 복사.\n\nJSON 배열로만 응답: [{"id":"f1","text":"...","st":"safe|warning|uncertain","note":"..."}]',

  // ── 장면 키워드 추출 ──
  EXTRACT_KW: (videoTitle, script) => {
    const _len = script.length;
    const _min = Math.max(5, Math.round(_len / 300));
    const _max = _min + Math.max(3, Math.round(_min * 0.3));
    const _range = _min + '~' + _max + '개';
    return (
      '당신은 유튜브 영상 편집 전문가입니다.\n\n[영상 주제]\n' +
      videoTitle +
      '\n\n[대본]\n' +
      script +
      '\n\n[규칙]\n- ' +
      _range +
      ' 장면으로 분할 (대본의 모든 주요 내용을 빠짐없이 커버)\n- label 종류: 후킹, 사건설명, 인물소개, 배경설명, 핵심주장, 숫자강조, 긴장감, 전환, 마무리\n- mainEn: Storyblocks 검색용 영문 2~3단어\n- altEn: 대체 영문 키워드 2개\n- ko: 한글 키워드 1개\n- cut: 컷 길이 (예: "2-3초")\n\nJSON 배열로만 응답하세요:\n[{"scene":1,"label":"후킹","text":"해당 대사","purpose":"목적","mainEn":"english keyword","altEn":["alt1","alt2"],"ko":"한글","cut":"2-3초"}]'
    );
  },

  // ── 공통 블록 빌더 ──
  buildAnaBlock: (ana) =>
    '[분석 결과]\n- 요약: ' +
    ana.summary +
    '\n- 훅: ' +
    ana.hooks.join(', ') +
    '\n- 구조: ' +
    ana.structure.join(', ') +
    '\n- 이유: ' +
    ana.reasons.join(', '),

  buildStyleBlock: (sty, styPrompt) =>
    styPrompt ? '\n[스타일 규칙]\n' + styPrompt + '\n' : '\n[스타일: ' + sty + ']\n',

  buildTranscriptBlock: (transcript) =>
    transcript && transcript.length > 50 ? '\n[원본 자막]\n' + transcript + '\n' : '',
};
