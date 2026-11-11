// 손글씨 채점 — 인식 AI가 아니라 '모양 비교'예요. 화면 코드 없음(Node 시험 가능).
// 비교 기준(본보기): KanjiVG 획 데이터 + 사용자가 '맞았어요'로 정정한 내 글씨(기기 안에만 저장).
// 획순은 보지 않고(순서 무관 짝짓기), 획 방향도 보지 않아요. 획을 이어 쓰거나 나눠 써도 크게 깎지 않아요.
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  const SIZE = 40, PAD = 4, R = 1.7, NPT = 12;

  function bbox(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const p of s) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  // 전체 획을 한 상자에 맞춰 0~1로 (가로세로 비율 유지, 가운데 정렬)
  function normalize(strokes) {
    const b = bbox(strokes); const m = Math.max(b.w, b.h) || 1;
    const ox = (m - b.w) / 2, oy = (m - b.h) / 2;
    return { strokes: strokes.map(s => s.map(p => [(p[0] - b.x0 + ox) / m, (p[1] - b.y0 + oy) / m])), ratio: (b.w + m * .08) / (b.h + m * .08), size: m };
  }
  function length(s) { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; }
  function resample(s, n = NPT) {
    if (s.length === 1) return Array.from({ length: n }, () => s[0]);
    const L = length(s); if (!L) return Array.from({ length: n }, () => s[0]);
    const out = [s[0]]; const step = L / (n - 1); let acc = 0, prev = s[0];
    for (let i = 1; i < s.length && out.length < n - 1; i++) {
      let cur = s[i], d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      while (acc + d >= step && out.length < n - 1 && d > 0) { const t = (step - acc) / d; const q = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]; out.push(q); prev = q; d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]); acc = 0; }
      acc += d; prev = cur;
    }
    while (out.length < n) out.push(s.at(-1));
    return out;
  }
  // 정규화된 획 → 40×40 점 그림 (같은 굵기로 그려서 펜 압력·화면 굵기와 무관하게 비교)
  function raster(strokes) {
    const b = new Uint8Array(SIZE * SIZE), sc = SIZE - PAD * 2;
    for (const s0 of strokes) {
      const s = s0.map(p => [PAD + p[0] * sc, PAD + p[1] * sc]);
      const segs = s.length === 1 ? [[s[0], s[0]]] : s.slice(1).map((p, i) => [s[i], p]);
      for (const [a, c] of segs) {
        const minx = Math.max(0, Math.floor(Math.min(a[0], c[0]) - R)), maxx = Math.min(SIZE - 1, Math.ceil(Math.max(a[0], c[0]) + R));
        const miny = Math.max(0, Math.floor(Math.min(a[1], c[1]) - R)), maxy = Math.min(SIZE - 1, Math.ceil(Math.max(a[1], c[1]) + R));
        const dx = c[0] - a[0], dy = c[1] - a[1], LL = dx * dx + dy * dy;
        for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
          const px = x + .5, py = y + .5; let t = LL ? ((px - a[0]) * dx + (py - a[1]) * dy) / LL : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = a[0] + dx * t - px, ey = a[1] + dy * t - py; if (ex * ex + ey * ey <= R * R) b[y * SIZE + x] = 1;
        }
      }
    }
    return b;
  }
  function distanceField(b) {
    const d = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) d[i] = b[i] ? 0 : 100;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const i = y * SIZE + x; if (x) d[i] = Math.min(d[i], d[i - 1] + 1); if (y) d[i] = Math.min(d[i], d[i - SIZE] + 1); if (x && y) d[i] = Math.min(d[i], d[i - SIZE - 1] + 1.4); if (x < SIZE - 1 && y) d[i] = Math.min(d[i], d[i - SIZE + 1] + 1.4); }
    for (let y = SIZE - 1; y >= 0; y--) for (let x = SIZE - 1; x >= 0; x--) { const i = y * SIZE + x; if (x < SIZE - 1) d[i] = Math.min(d[i], d[i + 1] + 1); if (y < SIZE - 1) d[i] = Math.min(d[i], d[i + SIZE] + 1); if (x < SIZE - 1 && y < SIZE - 1) d[i] = Math.min(d[i], d[i + SIZE + 1] + 1.4); if (x && y < SIZE - 1) d[i] = Math.min(d[i], d[i + SIZE - 1] + 1.4); }
    return d;
  }
  // 특징 묶음: 정규화 획, 재표본 획, 점 그림, 거리장
  function features(rawStrokes) {
    const st = rawStrokes.filter(s => s && s.length);
    if (!st.length) return null;
    const n = normalize(st); const b = raster(n.strokes);
    const rs = n.strokes.map(s => resample(s));
    return { strokes: n.strokes, rs, ls: rs.map(local), ex: n.strokes.map(extent), lens: n.strokes.map(length), b, d: distanceField(b), ratio: n.ratio, count: st.length };
  }
  // 그림 거리: 양방향 거리장 평균(칸 단위, 8에서 자름) + 가로세로 비율 차이
  function imageDist(a, t) {
    let s = 0, n = 0, u = 0, m = 0;
    for (let i = 0; i < a.b.length; i++) { if (a.b[i]) { s += Math.min(t.d[i], 8); n++; } if (t.b[i]) { u += Math.min(a.d[i], 8); m++; } }
    return (s / (n || 1) + u / (m || 1)) / 2 + Math.min(1.5, Math.abs(Math.log(a.ratio / t.ratio)) * .6);
  }
  // 획 하나를 제 크기로 정규화(무게중심 0, 최대 폭 1) — 작은 획(탁점·반탁점·작은 ゃ)의 '모양'을 보려고
  function local(s) {
    let cx = 0, cy = 0; for (const p of s) { cx += p[0]; cy += p[1]; } cx /= s.length; cy /= s.length;
    let m = 0; for (const p of s) m = Math.max(m, Math.abs(p[0] - cx), Math.abs(p[1] - cy));
    m = Math.max(m, .02); return s.map(p => [(p[0] - cx) / m, (p[1] - cy) / m]);
  }
  function pd(p, q, rev) { let f = 0; const n = p.length; for (let i = 0; i < n; i++) { const b = rev ? q[n - 1 - i] : q[i]; f += Math.hypot(p[i][0] - b[0], p[i][1] - b[1]); } return f / n; }
  // 위치 거리 + 제 모양 거리 (방향 무관: 정방향·역방향 중 가까운 쪽)
  function strokeCost(p, q, lp, lq, small) {
    const w = small ? LOCAL_SMALL : LOCAL;
    const f = pd(p, q, false) + w * pd(lp, lq, false), r = pd(p, q, true) + w * pd(lp, lq, true);
    return Math.min(f, r);
  }
  const LOCAL = .06, LOCAL_SMALL = .3, SMALL = .22;
  function extent(s) { let x0 = 9, y0 = 9, x1 = -9, y1 = -9; for (const p of s) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return Math.max(x1 - x0, y1 - y0); }
  function coverage(points, strokes) { // points 각각에서 strokes 의 가장 가까운 점까지 평균 거리
    let s = 0; for (const p of points) { let best = 9; for (const st of strokes) for (const q of st) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best) best = d; } s += best; } return s / points.length;
  }
  // 획 거리: 순서 무관 짝짓기(가까운 쌍부터). 짝 없는 획은 다른 쪽 획 위에 겹쳐 있으면(이어 쓰기·나눠 쓰기) 조금만 깎음.
  function strokeDist(a, t) {
    const nu = a.rs.length, nt = t.rs.length; const pairs = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nt; j++) pairs.push([strokeCost(a.rs[i], t.rs[j], a.ls[i], t.ls[j], Math.min(a.ex[i], t.ex[j]) < SMALL), i, j]);
    pairs.sort((x, y) => x[0] - y[0]);
    const ui = new Set(), tj = new Set(); let sum = 0, k = 0;
    for (const [c, i, j] of pairs) { if (ui.has(i) || tj.has(j)) continue; ui.add(i); tj.add(j); sum += c; k++; if (k === Math.min(nu, nt)) break; }
    let pen = 0;
    for (let j = 0; j < nt; j++) if (!tj.has(j)) { const cv = coverage(t.rs[j], a.rs); pen += cv < .06 && t.ex[j] >= SMALL ? .03 : .08 + cv * 1.2 + Math.min(.15, t.lens[j] * .2); }
    for (let i = 0; i < nu; i++) if (!ui.has(i)) { const cv = coverage(a.rs[i], t.rs); pen += cv < .06 && a.ex[i] >= SMALL ? .03 : .08 + cv * 1.2 + Math.min(.15, a.lens[i] * .2); }
    return (sum + pen) / Math.max(nu, nt);
  }
  // 합친 거리 (작을수록 비슷). 무게는 tests/handwriting 의 합성 표본으로 맞춘 설계값.
  const W = { img: 1, stroke: 9 };
  function distance(a, t) { return W.img * imageDist(a, t) + W.stroke * strokeDist(a, t); }

  // 본보기 만들기
  const SMALLK = { 'ゃ': 'ゃ', 'ゅ': 'ゅ', 'ょ': 'ょ', 'ャ': 'ャ', 'ュ': 'ュ', 'ョ': 'ョ', 'ァ': 'ァ', 'ィ': 'ィ', 'ゥ': 'ゥ', 'ェ': 'ェ', 'ォ': 'ォ' };
  const cache = new Map(), FCACHE = new WeakMap(); // 내 글씨 특징은 저장 객체에 붙이지 않음(백업 JSON이 커지지 않게)
  function kvgStrokes(text) {
    const S = KL.STROKES || {};
    const cs = [...text];
    if (cs.length === 1) return S[text] ? S[text].map(s => s.map(p => [p[0], p[1]])) : null;
    // 두 글자 묶음(요음·외래어): 큰 글자는 왼쪽, 작은 글자는 오른쪽 아래 — 109 좌표 기준 배치
    const big = S[cs[0]], small = S[cs[1]]; if (!big || !small) return null;
    const out = big.map(s => s.map(p => [p[0] * .62, p[1]]));
    for (const s of small) out.push(s.map(p => [62 + p[0] * .62, 12 + p[1] * .9]));
    return out;
  }
  function templatesFor(text, personal) {
    const key = text; let base = cache.get(key);
    if (!base) { const s = kvgStrokes(text); base = s ? [{ f: features(s), src: 'kvg' }] : []; cache.set(key, base); }
    const mine = (personal && personal[text] || []).map(s => { let f = FCACHE.get(s); if (!f) { f = features(s.strokes); FCACHE.set(s, f); } return { f, src: 'mine' }; }).filter(x => x.f);
    return base.concat(mine);
  }
  // 비교 후보: 같은 문자 체계. 요음·외래어 문제는 두 글자 묶음끼리, 나머지는 한 글자끼리
  function candidatesFor(item, KANA) {
    const two = [...item.text].length > 1;
    return KANA.filter(k => k.script === item.script && ([...k.text].length > 1) === two);
  }
  // 허용 폭(설계값, 합성 표본으로 맞춤): abs = 정답 본보기와의 거리 상한, margin = 가장 가까운 다른 글자보다 얼마나 멀어도 되나
  const TOL = { strict: { abs: 2.4, margin: 0.2, marginConf: 0 }, normal: { abs: 3.4, margin: 0.5, marginConf: 0.06 }, relaxed: { abs: 4.6, margin: 0.8, marginConf: 0.12 } };
  const bare = c => c.normalize('NFD').replace(/[\u3099\u309A]/g, '');
  let PAIRSET = null;
  function confusable(a, b) {
    if (!PAIRSET) { PAIRSET = new Map(); for (const p of (KL.data && KL.data.PAIRS) || []) for (const x of p) for (const y of p) if (x !== y) { if (!PAIRSET.has(x)) PAIRSET.set(x, new Set()); PAIRSET.get(x).add(y); } }
    const A = [...a], B = [...b];
    if (A.length !== B.length) return false;
    let diff = 0; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) { diff++; if (!(bare(A[i]) === bare(B[i]) || PAIRSET.get(A[i])?.has(B[i]) || i > 0)) return false; }
    return diff === 1;
  }
  function grade(rawStrokes, item, KANA, opts = {}) {
    const f = features(rawStrokes); if (!f) return { ok: false, reason: 'empty' };
    const tol = TOL[opts.tolerance] || TOL.relaxed;
    const ranks = candidatesFor(item, KANA).map(k => {
      const ts = templatesFor(k.text, opts.personal);
      let best = Infinity, src = ''; for (const t of ts) { const d = distance(f, t.f); if (d < best) { best = d; src = t.src; } }
      return { item: k, score: best, src };
    }).filter(r => Number.isFinite(r.score)).sort((a, b) => a.score - b.score);
    const target = ranks.find(r => r.item.id === item.id);
    if (!target) return { ok: false, reason: 'notemplate', ranks };
    const best = ranks[0], rank = ranks.indexOf(target) + 1;
    // 가장 가까운 글자가 '헷갈리는 짝'(탁점·반탁점 차이, 작은 글자 차이, 비슷한 모양 묶음)이면 훨씬 엄격하게
    const conf = best.item.id !== target.item.id && confusable(item.text, best.item.text);
    const margin = conf ? tol.marginConf : tol.margin;
    const ok = target.score <= tol.abs && target.score - best.score <= margin;
    return { ok, conf, score: target.score, rank, best: best.item, bestScore: best.score, src: target.src, top: ranks.slice(0, 4).map(r => ({ text: r.item.text, score: +r.score.toFixed(2) })), reason: ok ? '' : target.score > tol.abs ? 'far' : conf ? 'confusable' : 'closer-other' };
  }
  function decide(r, tolName) { const t = TOL[tolName] || TOL.relaxed; return r.score !== undefined && r.score <= t.abs && r.score - r.bestScore <= (r.conf ? t.marginConf : t.margin); }
  KL.recog = { decide, confusable, features, grade, distance, imageDist, strokeDist, templatesFor, candidatesFor, kvgStrokes, TOL, W, raster, normalize, SIZE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
