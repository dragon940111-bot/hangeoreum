// 출제·간격 복습 규칙 — 자체 규칙(FSRS·SM-2 구현 아님). 화면 코드 없음.
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  const MIN = 60000, DAY = 864e5;
  // 설계값(연구가 정한 최적값이 아님): 10분 → 1일 → 3일 → 7일 → 14일 → 30일, 실패 후 3분
  const GAPS = [10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  const RETRY_GAP = 3; // 틀린 문제는 다른 문제를 적어도 3개 푼 뒤에 다시

  // 시간순 시도 목록 → 기억 상태. 원래 앱과 같은 규칙 + lenient(장음 빠짐 등)는 '헷갈림'과 같게 처리
  function memoryState(attempts) {
    let stage = 0, due = 0, last = 0, lapses = 0, reps = 0;
    for (const a of attempts) {
      // '아는 글자 확인'에서 모른다고 한 것은 아직 안 배운 것으로 둠(기록은 남지만 복습 일정에는 넣지 않음)
      if (a.source === 'placement' && !a.correct) continue;
      const t = Date.parse(a.time); reps++;
      if (!a.correct || a.assisted || a.source === 'unknown') { stage = 0; due = t + 3 * MIN; lapses++; }
      else if (a.hesitant || a.lenient || a.slow) { due = t + 10 * MIN; }
      else if (t >= due) { stage = Math.min(stage + 1, GAPS.length); due = t + GAPS[stage - 1]; }
      last = t;
    }
    return { stage, due, last, lapses, reps };
  }
  function shuffle(arr, rnd = Math.random) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function dayKey(t) { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  // 기록 색인: itemId|mode → 시간순 시도. 큰 기록에서도 매번 전체를 훑지 않게.
  function makeIndex(attempts) {
    const m = new Map(), cache = new Map();
    for (const a of attempts) { const k = a.itemId + '|' + a.mode; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
    return {
      get(id, mode) { return m.get(id + '|' + mode) || []; },
      push(a) { const k = a.itemId + '|' + a.mode; if (!m.has(k)) m.set(k, []); m.get(k).push(a); cache.delete(k); },
      touch(id, mode) { cache.delete(id + '|' + mode); }, // 기록을 정정했을 때
      state(id, mode) { const k = id + '|' + mode; let st = cache.get(k); if (!st) { st = memoryState(this.get(id, mode)); cache.set(k, st); } return st; },
      seen(id, mode) { return this.state(id, mode).reps > 0; }, // 배운 적 있음(확인에서 모른다고 한 것 제외)
      // 오늘 처음 배우기 시작한 항목 수 (아는 글자 확인으로 넘어온 것은 세지 않음)
      startedToday(mode, now) {
        const today = dayKey(now); let n = 0;
        for (const [k, list] of m) { if (!k.endsWith('|' + mode)) continue; const first = list.find(a => !(a.source === 'placement' && !a.correct)); if (first && first.source !== 'placement' && dayKey(Date.parse(first.time)) === today) n++; }
        return n;
      }
    };
  }

  // 한 회차의 출제기. opts: {pool, mode, study:'adaptive'|'normal'|'review', newLimit, index, now, pairs, rnd, attempts(오늘 새 항목 셈용)}
  function makeRun(opts) {
    const rnd = opts.rnd || Math.random, idx = opts.index, mode = opts.mode, now = () => (opts.now ? opts.now() : Date.now());
    const r = { seq: 0, retries: [], last: null, newItems: [], dueAtStart: 0, picks: 0, bag: [] };
    let pool = opts.pool;
    if (opts.study === 'adaptive') {
      const seen = pool.filter(i => idx.seen(i.id, mode));
      // 오늘 새로 시작한 항목 수(이 모드 전체 기준 — 범위를 바꿔도 한도를 넘지 않게)
      const allowance = Math.max(0, opts.newLimit - idx.startedToday(mode, now()));
      let fresh = pool.filter(i => !idx.seen(i.id, mode));
      if (opts.preferKnown) fresh = opts.preferKnown(fresh);
      r.newItems = fresh.slice(0, allowance);
      pool = [...seen, ...r.newItems];
      if (!pool.length) pool = opts.pool.slice(0, Math.max(1, opts.newLimit));
      r.dueAtStart = seen.filter(i => idx.state(i.id, mode).due <= now()).length;
    }
    r.pool = pool;
    const pendingRetry = id => r.retries.some(x => x.item.id === id);
    function eligible(list) { const out = list.filter(i => i.id !== r.last?.id && !pendingRetry(i.id)); return out.length ? out : list.filter(i => i.id !== r.last?.id).length ? list.filter(i => i.id !== r.last?.id) : list; }
    function weight(item) {
      const h = idx.get(item.id, mode), bad = h.filter(a => !a.correct); if (!bad.length) return .15;
      let streak = 0; for (let i = h.length - 1; i >= 0 && h[i].correct; i--) streak++;
      return Math.max(.15, 2 + bad.length * .5 - streak * .8) + (h.at(-1).correct ? 0 : 4);
    }
    r.dueCount = () => r.pool.filter(i => { const s = idx.state(i.id, mode); return s.last && s.due <= now(); }).length;
    r.next = function () {
      r.seq++; r.picks++;
      // ① 준비된 재출제(다른 문제 RETRY_GAP개 뒤)
      const ready = r.retries.find(x => x.after <= r.seq && x.item.id !== r.last?.id);
      if (ready) { r.retries = r.retries.filter(x => x !== ready); return (r.last = ready.item); }
      let item;
      if (opts.study === 'review') {
        const p = eligible(r.pool), w = p.map(weight), tot = w.reduce((a, b) => a + b, 0); let n = rnd() * tot;
        item = p[w.findIndex(x => (n -= x) < 0)] || p[0];
      } else if (opts.study === 'adaptive') {
        const p = eligible(r.pool), t = now();
        const due = p.filter(i => { const s = idx.state(i.id, mode); return s.last && s.due <= t; }).sort((a, b) => idx.state(a.id, mode).due - idx.state(b.id, mode).due);
        const fresh = p.filter(i => !idx.seen(i.id, mode));
        const partner = r.picks % 4 === 0 && r.last && opts.confusable ? opts.confusable(r.last) : null;
        if (due.length) item = due[0];
        else if (fresh.length) item = fresh[0];
        else if (partner && p.some(i => i.id === partner.id) && idx.seen(partner.id, mode)) item = partner;
        else {
          const rec = p.map(i => ({ i, h: idx.get(i.id, mode), s: idx.state(i.id, mode) })).sort((a, b) => a.s.last - b.s.last);
          const fragile = rec.filter(x => !x.h.at(-1)?.correct || x.s.stage < 2);
          item = (fragile[0] || rec[0]).i;
        }
      } else {
        if (!r.bag.length) r.bag = shuffle(r.pool, rnd);
        let k = r.bag.length - 1; while (k > 0 && (r.bag[k].id === r.last?.id || pendingRetry(r.bag[k].id))) k--;
        item = r.bag.splice(k, 1)[0];
      }
      return (r.last = item);
    };
    // 답이 확정·정정될 때마다 부름 — 재출제 줄을 최종 판정과 맞춤 (원래 앱 P0-1 결함 수정)
    r.settle = function (item, correct) {
      r.retries = r.retries.filter(x => x.item.id !== item.id);
      if (!correct) r.retries.push({ item, after: r.seq + RETRY_GAP + 1 });
    };
    return r;
  }
  // 끝이 있는 연습 줄 — 항목마다 한 번 맞히면 빠지고(연속 재학습), 틀리면 다른 문제 gap개 뒤에 다시 나옴
  function makeQueue(items, gap = RETRY_GAP) {
    const q = { pending: [...items], wait: [], seq: 0, last: null, done: 0, total: items.length, doneIds: new Set() };
    q.left = () => q.total - q.done;
    q.next = () => {
      q.seq++;
      let item = null;
      const i = q.wait.findIndex(w => w.after <= q.seq && w.item.id !== (q.last && q.last.id));
      if (i >= 0) item = q.wait.splice(i, 1)[0].item;
      else if (q.pending.length) { let k = q.pending.findIndex(x => x.id !== (q.last && q.last.id)); if (k < 0) k = 0; item = q.pending.splice(k, 1)[0]; }
      else if (q.wait.length) { let k = q.wait.findIndex(w => w.item.id !== (q.last && q.last.id)); if (k < 0) k = 0; item = q.wait.splice(k, 1)[0].item; } // 남은 게 기다리는 것뿐이면 간격을 줄여서라도 냄
      if (item) q.last = item;
      return item;
    };
    // 답이 확정·정정될 때마다 부름
    q.settle = (item, ok) => {
      q.wait = q.wait.filter(w => w.item.id !== item.id);
      if (ok) { if (!q.doneIds.has(item.id)) { q.doneIds.add(item.id); q.done++; } }
      else { if (q.doneIds.delete(item.id)) q.done--; q.wait.push({ item, after: q.seq + gap + 1 }); }
    };
    return q;
  }
  KL.sched = { makeQueue, GAPS, RETRY_GAP, memoryState, shuffle, dayKey, makeIndex, makeRun };
})(typeof globalThis !== 'undefined' ? globalThis : this);
