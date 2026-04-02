// ═══════════════════════════════════════
// mock-data.js — 목업 데이터 (프록시 미연결 시 사용)
// ═══════════════════════════════════════

export const M={
  users:[], // 사용자 인증은 Supabase Auth로 처리 (Api.login 참조)
  keywords:[
    {id:'kw1',label:'손흥민 해트트릭',src:'이슈링크',score:95,tags:['스포츠','축구'],period:'weekly',related:['토트넘 vs 리버풀','프리미어리그 순위','손흥민 연봉','EPL 득점왕','손흥민 부상']},
    {id:'kw2',label:'비트코인 급등',src:'이슈링크',score:91,tags:['경제','가상화폐'],period:'weekly',related:['이더리움 전망','코인 규제','비트코인 ETF','알트코인 추천','가상화폐 세금']},
    {id:'kw3',label:'이란 미국 전쟁',src:'이슈링크',score:89,tags:['국제','전쟁'],period:'weekly',related:['중동 정세','방산주 추천','유가 전망','이스라엘 하마스','핵무기 협상']},
    {id:'kw4',label:'AI 규제 법안',src:'네이버',score:85,tags:['기술','AI'],period:'monthly',related:['ChatGPT 규제','AI 저작권','딥페이크 처벌','AI 일자리','EU AI법']},
    {id:'kw5',label:'부동산 대출 규제',src:'네이버',score:82,tags:['경제','부동산'],period:'monthly',related:['DSR 규제','전세 사기','아파트 가격','금리 인하','청약 전략']},
    {id:'kw6',label:'대형 연예인 스캔들',src:'이슈링크',score:93,tags:['연예','논란'],period:'weekly',related:['연예인 학폭','K-POP 논란','방송 사고','소속사 갑질','SNS 해명']}
  ],
  voices:[
    {id:'vc1',name:'기서',gender:'남',desc:'차분하고 낮은 톤',sel:false,provider:'google'},
    {id:'vc2',name:'늘봄',gender:'여',desc:'밝고 경쾌한 톤',sel:false,provider:'google'},
    {id:'vc3',name:'성훈',gender:'남',desc:'뉴스 앵커 스타일',sel:false,provider:'google'},
    {id:'vc4',name:'아라',gender:'여',desc:'부드럽고 편안한 톤',sel:true,provider:'google'},
    {id:'vc5',name:'소현',gender:'여',desc:'활기차고 젊은 톤',sel:false,provider:'google'},
    {id:'vc6',name:'영일',gender:'남',desc:'묵직하고 신뢰감 있는 톤',sel:false,provider:'google'},
    {id:'vc7',name:'예린',gender:'여',desc:'감성적이고 따뜻한 톤',sel:false,provider:'google'},
    {id:'vc8',name:'유진',gender:'여',desc:'또렷하고 명확한 톤',sel:false,provider:'google'},
    {id:'vc9',name:'재욱',gender:'남',desc:'에너지 넘치는 톤',sel:false,provider:'google'},
    {id:'el1',name:'현빈',gender:'남',desc:'차분하고 명확한 프로 내레이션 (서울)',sel:false,provider:'elevenlabs',elId:'s07IwTCOrCDCaETjUVjx'},
    {id:'el2',name:'혁',gender:'남',desc:'부드럽고 감성적인 스토리텔링',sel:false,provider:'elevenlabs',elId:'ZJCNdZEjYwkOElxugmW2'},
    {id:'el3',name:'빈',gender:'남',desc:'따뜻하고 진중한 내레이션',sel:false,provider:'elevenlabs',elId:'jB1Cifc2UQbq1gR3wnb0'},
    {id:'el4',name:'안나',gender:'여',desc:'젊고 밝은 내레이션 (서울)',sel:false,provider:'elevenlabs',elId:'uyVNoMrnUku1dZyVEXwD'},
    {id:'el5',name:'셀리',gender:'여',desc:'차분하고 따뜻한 오디오북 스타일',sel:false,provider:'elevenlabs',elId:'ETPP7D0aZVdEj12Aa7ho'},
    {id:'el6',name:'루아',gender:'여',desc:'깊고 영감을 주는 감성 내레이션',sel:false,provider:'elevenlabs',elId:'hWXqitL3DEOLD49pgNWR'}
  ],
  videos:[
    {id:'v1',kw:'kw1',title:'손흥민이 이번엔 진짜 역대급이었습니다',ch:'축구분석소',views:892000,subs:45000,date:'3월 17일',score:94,news:false},
    {id:'v2',kw:'kw1',title:'손흥민 해트트릭 그 날 벌어진 일들',ch:'스포츠투데이',views:1250000,subs:320000,date:'3월 17일',score:72,news:true},
    {id:'v3',kw:'kw1',title:'왼발의 비밀, 손흥민 슈팅 궤적 분석',ch:'전술보드',views:340000,subs:12000,date:'3월 18일',score:97,news:false},
    {id:'v4',kw:'kw2',title:'비트코인 10만 돌파, 다음은 어디?',ch:'코인분석',views:560000,subs:89000,date:'3월 18일',score:81,news:false},
    {id:'v5',kw:'kw2',title:'전문가가 본 비트코인 급등의 진짜 이유',ch:'머니토크',views:230000,subs:8000,date:'3월 17일',score:92,news:false},
    {id:'v6',kw:'kw3',title:'이란 vs 미국, 전쟁 시나리오 3가지',ch:'글로벌이슈',views:780000,subs:56000,date:'3월 16일',score:86,news:false},
    {id:'v7',kw:'kw6',title:'충격 폭로, 연예계 비밀 계약의 실체',ch:'이슈팩토리',views:1100000,subs:28000,date:'3월 18일',score:95,news:false}
  ],
  analysis:{
    summary:"손흥민의 해트트릭 경기에서 왼발 슈팅의 궤적이 물리적으로 어떻게 가능한지를 분석한 콘텐츠입니다. '과학적 분석'이라는 차별화된 앵글로 구독자 대비 28배의 조회수를 기록했습니다.",
    hooks:['도입 5초: "손흥민 왼발에 숨겨진 비밀, 아무도 몰랐습니다"','30초: 슬로우모션 반복 + 궤적선 오버레이','1분 20초: "이게 물리적으로 가능한 각도인가?"'],
    structure:['훅 (0~30초): 결론 먼저 제시','맥락 (30초~2분): 해트트릭 배경','핵심 전개 (2~6분): 골별 궤적 분석','반전 (6~8분): 세 번째 골은 실수?','마무리 (8~9분): 시청자 참여 유도'],
    reasons:['구독자 12K, 조회수 34만 → 28배 비율','썸네일에 궤적선 그래픽 사용','뉴스 아닌 기획형 → 유통기한 김']
  },
  styles:[{id:'s1',name:'충격 이슈형',desc:'빠른 전개, 강한 훅, 커뮤니티 말투'},{id:'s2',name:'정보 요약형',desc:'팩트 중심, 깔끔한 정리, 뉴스 톤'},{id:'s3',name:'스토리텔링형',desc:'이야기식 전개, 궁금증 유발, 반전 구조'}],
  script:{title:'손흥민 왼발의 비밀, 과학으로 풀어봤습니다',content:'손흥민 왼발에 숨겨진 비밀.\n아무도 이걸 몰랐습니다.\n\n지난 주말 토트넘과 맨시티의 경기.\n손흥민은 해트트릭을 기록했습니다.\n그런데 하이라이트만 봐서는 절대 알 수 없는 게 하나 있습니다.\n\n세 골 모두 왼발이었습니다.\n그리고 세 골의 궤적이 전부 다릅니다.\n\n첫 번째 골.\n페널티 에어리어 좌측에서 감아찬 인스윙.\n골키퍼가 반대쪽으로 뛰었습니다.\n공이 휜 각도, 대략 23도.\n이건 바나나킥의 교과서적 수치입니다.\n\n두 번째 골.\n정면에서 쏜 건데 공이 일직선으로 떨어졌습니다.\n이른바 "너클볼".\n회전수가 초당 1.2회전 이하일 때 발생하는 현상입니다.\n\n세 번째 골.\n여기서 반전이 있습니다.\n세 번째 골은 사실 실수에서 나왔습니다.\n크로스를 올리려다 각도가 틀어졌고,\n그게 그대로 골문 상단을 갈랐습니다.\n\n여러분은 어떻게 생각하시나요?\n댓글로 알려주세요.'},
  fcs:[
    {id:'f1',text:'세 골 모두 왼발이었습니다.',st:'safe',note:'경기 기록 확인 — 사실'},
    {id:'f2',text:'공이 휜 각도, 대략 23도.',st:'warning',note:'정확한 수치 확인 필요 — 추정치'},
    {id:'f3',text:'회전수가 초당 1.2회전 이하일 때 발생하는 현상입니다.',st:'uncertain',note:'너클볼 회전수는 조건에 따라 다름'},
    {id:'f4',text:'세 번째 골은 사실 실수에서 나왔습니다.',st:'warning',note:'본인 인터뷰 미확인'}
  ],
  ekw:[
    {v:'손흥민',c:'topic',en:'son heung min'},{v:'해트트릭',c:'topic',en:'hat trick football'},
    {v:'왼발 슈팅',c:'search',en:'left foot shooting'},{v:'너클볼',c:'search',en:'knuckleball kick'},{v:'바나나킥',c:'search',en:'banana kick curve'},{v:'son heung min hat trick',c:'search',en:'son heung min hat trick'},
    {v:'반전',c:'emotion',en:'plot twist dramatic'},{v:'충격',c:'emotion',en:'shocking moment reaction'},
    {v:'슬로우모션 슈팅',c:'visual',en:'slow motion kick football'},{v:'궤적선 오버레이',c:'visual',en:'ball trajectory overlay'},{v:'경기장 항공샷',c:'visual',en:'stadium aerial shot'},{v:'골키퍼 다이빙',c:'visual',en:'goalkeeper diving save'}
  ],
  voice:{provider:'ElevenLabs',name:'남성 내레이터 A',dur:187}
};

