// 통계 — 실제 기록에서만 셈. 기록을 고치지 않음.
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  // 시도 목록 → 연속 정답·정답 뒤 실수·마지막 연속 시작 (원래 앱과 같은 정의)
  function summary(a) {
    let streak = 0, max = 0, wrongRun = 0, maxWrong = 0, afterCorrect = [], lastWrong = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i].correct) { streak++; max = Math.max(max, streak); wrongRun = 0; }
      else { if (streak) afterCorrect.push({ n: i + 1, streak, sessionN: a[i].n, time: a[i].time }); streak = 0; wrongRun++; maxWrong = Math.max(maxWrong, wrongRun); lastWrong = i; }
    }
    const c = a.filter(x => x.correct).length;
    return { n: a.length, c, wrong: a.length - c, assisted: a.filter(x => x.correct && x.assisted).length, pure: a.filter(x => x.correct && !x.assisted).length,
      streak, max, maxWrong, afterCorrect, lastWrong, stableStart: streak ? lastWrong + 2 : null, stableSince: streak ? a[lastWrong + 1].time : null };
  }
  function overview(attempts) {
    const s = summary(attempts);
    const ms = attempts.reduce((n, a) => n + a.elapsedMs, 0);
    const typed = attempts.filter(a => a.mode === 'typing');
    const typedMs = typed.reduce((n, a) => n + a.elapsedMs, 0);
    const chars = typed.filter(a => a.correct).reduce((n, a) => n + KL.text.norm(a.input || '').length, 0);
    return { ...s, avgSec: s.n ? ms / s.n / 1000 : null, typingPerMin: typedMs ? chars / (typedMs / 60000) : null, totalMin: ms / 60000 };
  }
  function byItem(attempts) {
    const m = new Map();
    for (const a of attempts) { const k = a.mode + '|' + a.itemId; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
    return [...m.values()].map(list => ({ list, s: summary(list) })).sort((x, y) => y.s.wrong - x.s.wrong || y.list.length - x.list.length);
  }
  // 공부한 날 연속 (기기 날짜 기준)
  function dayStreak(attempts, now = Date.now()) {
    const days = new Set(attempts.map(a => KL.sched.dayKey(Date.parse(a.time))));
    let n = 0, t = now; if (!days.has(KL.sched.dayKey(t))) t -= 864e5; // 오늘 아직 안 했으면 어제부터 셈
    while (days.has(KL.sched.dayKey(t))) { n++; t -= 864e5; }
    return { streak: n, studiedToday: days.has(KL.sched.dayKey(now)), days: days.size };
  }
  function today(attempts, now = Date.now()) {
    const k = KL.sched.dayKey(now); const list = attempts.filter(a => KL.sched.dayKey(Date.parse(a.time)) === k);
    return { n: list.length, c: list.filter(a => a.correct).length, min: list.reduce((n, a) => n + a.elapsedMs, 0) / 60000 };
  }
  // 실제로 헷갈린 짝: 틀렸을 때 다른 글자의 소리를 입력했거나(읽기), 다른 글자를 골랐거나(헷갈리는 글자), 다른 글자처럼 썼을 때(쓰기)
  function confusions(attempts) {
    const m = new Map();
    for (const a of attempts) { if (a.correct || !a.mistook || a.mistook === a.text) continue; const k = [a.text, a.mistook].sort().join('|'); const o = m.get(k) || { a: a.text, b: a.mistook, n: 0, last: a.time }; o.n++; o.last = a.time; m.set(k, o); }
    return [...m.values()].sort((x, y) => y.n - x.n || Date.parse(y.last) - Date.parse(x.last));
  }
  // 최근 days일 동안 날마다 푼 문제 수와 맞힌 수
  function daily(attempts, days = 14, now = Date.now()) {
    const out = []; const by = new Map();
    for (const a of attempts) { const k = KL.sched.dayKey(Date.parse(a.time)); const o = by.get(k) || { n: 0, c: 0 }; o.n++; if (a.correct) o.c++; by.set(k, o); }
    for (let i = days - 1; i >= 0; i--) { const t = now - i * 864e5, d = new Date(t), o = by.get(KL.sched.dayKey(t)) || { n: 0, c: 0 }; out.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), day: '일월화수목금토'[d.getDay()], n: o.n, c: o.c }); }
    return out;
  }
  KL.stats = { confusions, daily, summary, overview, byItem, dayStreak, today };
})(typeof globalThis !== 'undefined' ? globalThis : this);
