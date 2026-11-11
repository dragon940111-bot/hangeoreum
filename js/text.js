// 한글 답 채점 — 정규화, 장음 표기, 허용 답안, 글자 행렬
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  const S0 = 0xAC00, SN = 11172;
  // 중성 번호 → 이어서 길게 낼 때 붙는 모음 글자
  // ㅏ0 ㅐ1 ㅑ2 ㅒ3 ㅓ4 ㅔ5 ㅕ6 ㅖ7 ㅗ8 ㅘ9 ㅙ10 ㅚ11 ㅛ12 ㅜ13 ㅝ14 ㅞ15 ㅟ16 ㅠ17 ㅡ18 ㅢ19 ㅣ20
  const LONG = { 0: '아', 2: '아', 4: '어', 5: '에', 6: '어', 7: '에', 8: '오', 12: '오', 13: '우', 17: '우', 18: '우', 20: '이', 9: '아', 14: '어', 16: '이', 19: '이', 1: '에', 3: '에', 10: '에', 11: '에', 15: '에' };
  function vowelOf(ch) { const c = ch.charCodeAt(0) - S0; if (c < 0 || c >= SN) return -1; return Math.floor((c % 588) / 28); }
  function hasFinal(ch) { const c = ch.charCodeAt(0) - S0; return c >= 0 && c < SN && c % 28 !== 0; }

  // 콜론·하이픈·물결·ー 장음 표기를 앞 글자의 모음으로 늘림: '코:히:' → '코오히이'
  function expandLong(s) {
    return s.replace(/([가-힣])[:：ːー\-~〜]+/g, (m, ch) => hasFinal(ch) ? ch : ch + (LONG[vowelOf(ch)] || ''));
  }
  function norm(s) {
    return expandLong(String(s).normalize('NFC').toLowerCase().trim()).replace(/[\s:：ː\-·.,!?！。、~〜'"’]/g, '');
  }
  // 장음(같은 모음 이어 쓰기)을 한 글자로 줄인 꼴 — '코히'와 '코오히이'를 같은 꼴로 봄
  const SAME = { 아: [0, 2, 9], 이: [20, 16, 19, 5, 7], 우: [13, 17, 18, 8, 12], 에: [5, 7, 1, 3], 오: [8, 12] };
  function collapseLong(s) {
    const cs = [...s]; let out = '';
    for (let i = 0; i < cs.length; i++) {
      const prev = out.slice(-1);
      if (i && SAME[cs[i]] && prev && !hasFinal(prev) && SAME[cs[i]].includes(vowelOf(prev))) continue;
      out += cs[i];
    }
    return out;
  }
  // 결과: {ok, lenient?} — lenient:'long' 은 장음을 빼먹었지만 나머지가 맞은 경우(정답으로 치되 간격 단계는 올리지 않음)
  function judge(answers, input) {
    const n = norm(input);
    if (!n) return { ok: false };
    if (answers.some(a => norm(a) === n)) return { ok: true };
    const c = collapseLong(n);
    if (c.length >= 2 && answers.some(a => collapseLong(norm(a)) === c)) return { ok: true, lenient: 'long' };
    return { ok: false };
  }
  function acceptable(item, s) { return judge(item.answers, s).ok; }
  // 글자 행렬: 구성 글자의 허용 답을 모두 조합해 비교 (조합 수 상한 5000)
  function judgeSequence(parts, input) {
    const n = norm(input); if (!n) return { ok: false };
    let poss = [''];
    for (const p of parts) { poss = poss.flatMap(x => p.answers.map(a => x + norm(a))); if (poss.length > 5000) poss = poss.slice(0, 5000); }
    return { ok: poss.includes(n) };
  }
  KL.text = { norm, judge, acceptable, judgeSequence, expandLong, collapseLong };
})(typeof globalThis !== 'undefined' ? globalThis : this);
