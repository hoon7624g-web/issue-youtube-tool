import { describe, it, expect } from 'vitest';
import {
  cleanAI,
  safeUrl,
  isNews,
  isBreaking,
  isPlanned,
  scoreVids,
  extractJSON,
} from '../src/js/pure-utils.mjs';

describe('cleanAI', () => {
  it('빈 입력은 빈 문자열', () => {
    expect(cleanAI('')).toBe('');
    expect(cleanAI(null)).toBe('');
    expect(cleanAI(undefined)).toBe('');
  });

  it('깨진 도형/불릿 기호와 제로폭 공백 제거', () => {
    expect(cleanAI('안녕●하세요◆')).toBe('안녕하세요');
    expect(cleanAI('a​b')).toBe('ab');
  });

  it('마크다운 볼드/헤더/리스트 기호 제거', () => {
    expect(cleanAI('**굵게**')).toBe('굵게');
    expect(cleanAI('# 제목')).toBe('제목');
    expect(cleanAI('- 항목')).toBe('항목');
  });

  it('기본값(keepEmoji 미지정)은 이모지 제거', () => {
    expect(cleanAI('좋아요😀')).toBe('좋아요');
    expect(cleanAI('체크✅')).toBe('체크');
  });

  it('keepEmoji=true면 이모지 유지', () => {
    expect(cleanAI('좋아요😀', true)).toBe('좋아요😀');
  });

  it('앞뒤 공백 trim', () => {
    expect(cleanAI('  안녕  ')).toBe('안녕');
  });

  it('3줄 이상 연속 줄바꿈은 남기지 않는다', () => {
    expect(cleanAI('a\n\n\n\n\nb')).not.toMatch(/\n{3,}/);
  });
});

describe('safeUrl', () => {
  it('https/blob/data는 허용', () => {
    expect(safeUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(safeUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('javascript:/http: 등 비허용 프로토콜은 빈 문자열', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('http://insecure.example.com')).toBe('');
  });

  it('잘못된 URL은 빈 문자열', () => {
    expect(safeUrl('not a url')).toBe('');
  });

  it('allowedHosts로 호스트/서브도메인 화이트리스트', () => {
    expect(safeUrl('https://i.ytimg.com/a.jpg', ['ytimg.com'])).toBe('https://i.ytimg.com/a.jpg');
    expect(safeUrl('https://evil.com/a.jpg', ['ytimg.com'])).toBe('');
  });
});

describe('영상 분류', () => {
  it('isNews: 뉴스 채널명 판별', () => {
    expect(isNews('KBS 뉴스')).toBe(true);
    expect(isNews('연합뉴스TV')).toBe(true);
    expect(isNews('개인 크리에이터')).toBe(false);
  });

  it('isBreaking: 속보성 키워드 판별', () => {
    expect(isBreaking('[속보] 무슨 일')).toBe(true);
    expect(isBreaking('평범한 제목')).toBe(false);
  });

  it('isPlanned: 기획형 키워드 판별', () => {
    expect(isPlanned('심층 분석: 이유')).toBe(true);
    expect(isPlanned('브이로그')).toBe(false);
  });
});

describe('scoreVids', () => {
  const sample = () => [
    { id: 'a', title: '심층 분석', ch: '작은채널', views: 100000, subs: 5000 },
    { id: 'b', title: '속보 뉴스', ch: 'KBS', views: 500000, subs: 2000000 },
  ];

  it('점수를 부여하고 내림차순 정렬한다', () => {
    const out = scoreVids(sample());
    expect(out).toHaveLength(2);
    out.forEach((v) => expect(typeof v.score).toBe('number'));
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it('뉴스/기획 플래그와 점수 근거 문자열을 채운다', () => {
    const out = scoreVids(sample());
    const kbs = out.find((v) => v.id === 'b');
    expect(kbs.news).toBe(true);
    out.forEach((v) => expect(v.scoreReason.length).toBeGreaterThan(0));
  });

  it('작은 채널의 높은 조회수는 대형 채널보다 우대된다', () => {
    const out = scoreVids(sample());
    expect(out[0].id).toBe('a');
  });
});

describe('extractJSON', () => {
  it('순수 JSON 파싱', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
    expect(extractJSON('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('마크다운 코드펜스 제거 후 파싱', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('주변 텍스트에 섞인 JSON 추출', () => {
    expect(extractJSON('결과는 다음과 같습니다: {"ok":true} 끝')).toEqual({ ok: true });
  });

  it('문자열 안의 중괄호에 속지 않는다', () => {
    expect(extractJSON('{"text":"a}b","n":2}')).toEqual({ text: 'a}b', n: 2 });
  });

  it('주변 텍스트 + 문자열 안 이스케이프 따옴표를 처리한다', () => {
    expect(extractJSON('설명 {"s":"a\\"b}c"} 끝')).toEqual({ s: 'a"b}c' });
  });

  it('JSON이 없으면 null', () => {
    expect(extractJSON('그냥 텍스트')).toBeNull();
    expect(extractJSON('')).toBeNull();
    expect(extractJSON(null)).toBeNull();
  });
});
