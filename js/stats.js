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
  KL.stats = { summary, overview, byItem, dayStreak, today };
})(typeof globalThis !== 'undefined' ? globalThis : this);
