// 필기 엔진 — 펜 압력·팜 리젝션·부드러운 선. 화면에 붙는 코드지만 채점과 분리돼 있어요.
// 좌표: 획은 '기준 크기(처음 잰 컨테이너 폭)' 좌표로 저장하고, 화면 크기가 바뀌면 비율로 다시 그려요.
// getStrokes()는 지금 화면의 CSS 픽셀 좌표로 돌려줘요(채점은 크기·위치를 스스로 맞춤).
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};

  function create(container, opts = {}) {
    const o = Object.assign({ palm: 'auto', color: '#1d2433', width: 7, onChange: null, onStart: null }, opts);
    const cs = container.style;
    if (getComputedStyle(container).position === 'static') cs.position = 'relative';
    cs.touchAction = 'none'; cs.userSelect = 'none'; cs.webkitUserSelect = 'none'; cs.webkitTouchCallout = 'none';
    cs.msTouchAction = 'none';

    const mk = cls => { const c = document.createElement('canvas'); c.className = cls; Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' }); container.appendChild(c); return c; };
    const baseC = mk('ink-base'), liveC = mk('ink-live');
    const ctxOpt = { desynchronized: true, alpha: true };
    let base = baseC.getContext('2d', ctxOpt) || baseC.getContext('2d');
    let live = liveC.getContext('2d', ctxOpt) || liveC.getContext('2d');

    let refW = 0, cssW = 0, cssH = 0, dpr = 1, scale = 1;
    let strokes = [], ops = [], redoOps = [];
    let tool = 'pen', palm = o.palm, enabled = true, color = o.color, width = o.width;
    let sawPen = false, active = null, rect = null, raf = 0, predicted = [], nextId = 1;
    let eraserAt = null;

    function sizeTo() {
      const r = container.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      if (!refW && r.width > 0) refW = r.width;
      cssW = w; cssH = h; dpr = Math.min(3, g.devicePixelRatio || 1); scale = refW ? cssW / refW : 1;
      for (const c of [baseC, liveC]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      redrawBase(); clearLive();
    }
    function setT(ctx) { ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); }
    function clearCtx(ctx, c) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); }
    function clearLive() { clearCtx(live, liveC); }

    // 획 그리기: p0 → m01 직선, 가운데는 중점 2차 곡선(조절점 = 실제 점), 끝은 m(n-2,n-1) → 끝점 직선.
    // 조각 k의 굵기는 그 자리 점들의 굵기 평균 — 둥근 끝으로 이어 붙여 필압 변화가 자연스럽게.
    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    function style(ctx, s) { ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
    function piece(ctx, s, k, extra) {
      const p = s.pts, n = p.length; style(ctx, s);
      if (n === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], s.w[0] / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath();
      if (k === 0) { const m = n > 2 ? mid(p[0], p[1]) : p[1]; ctx.lineWidth = (s.w[0] + s.w[1]) / 2; ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(m[0], m[1]); if (n === 2 && extra) for (const q of extra) ctx.lineTo(q[0], q[1]); }
      else if (k < n - 1) { const a = mid(p[k - 1], p[k]), b = mid(p[k], p[k + 1]); ctx.lineWidth = (s.w[k - 1] + 2 * s.w[k] + s.w[k + 1]) / 4; ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(p[k][0], p[k][1], b[0], b[1]); }
      else { if (n === 2) return; const a = mid(p[n - 2], p[n - 1]); ctx.lineWidth = (s.w[n - 2] + s.w[n - 1]) / 2; ctx.moveTo(a[0], a[1]); ctx.lineTo(p[n - 1][0], p[n - 1][1]); if (extra) for (const q of extra) ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
    }
    function drawStroke(ctx, s) { const n = s.pts.length; if (n === 1) { piece(ctx, s, 0); return; } for (let k = 0; k < n; k++) piece(ctx, s, k); }
    function redrawBase() {
      clearCtx(base, baseC); setT(base);
      for (const s of strokes) if (!s.gone) drawStroke(base, s);
      if (active && active.stroke && !active.stroke.gone) { const s = active.stroke; const st = s.pts.length >= 3 ? s.pts.length - 1 : 0; for (let k = 0; k < st; k++) piece(base, s, k); active.drawn = st; }
    }

    // 진행 중 획: 안정된 구간은 완성 층에 바로 덧그리고(마지막 구간만), 꼬리와 예측 끝점만 진행 층에 매 프레임
    function frame() {
      raf = 0; clearLive(); setT(live);
      if (active && active.stroke) {
        const s = active.stroke, n = s.pts.length;
        // 안정된 조각(0..n-2)은 완성 층에 한 번만 그림 — 새로 생긴 조각만
        const stable = n >= 3 ? n - 1 : 0; setT(base); while (active.drawn < stable) { piece(base, s, active.drawn); active.drawn++; }
        // 꼬리 조각과 예측 끝점만 진행 층에 (다음 프레임에 지움)
        if (n === 1) piece(live, s, 0); else if (n === 2) piece(live, s, 0, predicted); else piece(live, s, n - 1, predicted);
      }
      if (eraserAt) { live.lineWidth = 1.5 / scale; live.strokeStyle = 'rgba(29,36,51,.45)'; live.beginPath(); live.arc(eraserAt[0], eraserAt[1], ERASE_R / scale, 0, Math.PI * 2); live.stroke(); }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

    const ERASE_R = 14; // CSS px
    function toRef(e) { return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale]; }
    function targetWidth(type, p, v) {
      const base = width / scale;
      if (type === 'pen' && p > 0) return base * (0.35 + 0.95 * Math.pow(Math.min(1, p), 0.75));
      return base * (1 - Math.min(0.22, v * 0.035)); // 마우스·손가락: 빠르면 아주 조금만 가늘게
    }
    function addPoint(e, type) {
      const s = active.stroke, [rx, ry] = toRef(e), t = e.timeStamp || performance.now();
      const last = s.pts[s.pts.length - 1];
      if (last) {
        const dx = (rx - last[0]) * scale, dy = (ry - last[1]) * scale;
        if (dx * dx + dy * dy < 0.36) { active.raw = [rx, ry]; return; } // 0.6px 미만은 건너뜀
        // 가벼운 안정화: 지연이 느껴지지 않게 약하게(새 점 쪽 0.62)
        const k = 0.62, x = last[0] + (rx - last[0]) * k, y = last[1] + (ry - last[1]) * k;
        const dt = Math.max(1, t - last[3]), v = Math.hypot((x - last[0]) * scale, (y - last[1]) * scale) / dt;
        const tw = targetWidth(type, e.pressure, v), pw = s.w[s.w.length - 1];
        s.pts.push([x, y, e.pressure || 0, t]); s.w.push(pw + (tw - pw) * 0.35);
      } else {
        s.pts.push([rx, ry, e.pressure || 0, t]); s.w.push(targetWidth(type, e.pressure, 0));
      }
      active.raw = [rx, ry];
    }
    function eraseAt(e) {
      const [x, y] = toRef(e); eraserAt = [x, y]; const r = ERASE_R / scale;
      let hit = false;
      for (const s of strokes) {
        if (s.gone) continue;
        const p = s.pts; let on = false;
        for (let i = 0; i < p.length && !on; i++) {
          const a = p[i], b = p[Math.min(i + 1, p.length - 1)];
          const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
          let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = a[0] + dx * t - x, ey = a[1] + dy * t - y, rr = r + s.w[i] / 2;
          if (ex * ex + ey * ey <= rr * rr) on = true;
        }
        if (on) { s.gone = true; active.erased.push(s); hit = true; }
      }
      if (hit) redrawBase();
    }

    function allowed(type) {
      if (palm === 'pen') return type === 'pen';
      if (palm === 'auto' && type === 'touch' && sawPen) return false;
      return true;
    }
    function cancelActive() { // 진행 중 획을 기록 없이 버림 (손바닥 터치가 펜에 밀려날 때)
      if (!active) return; const id = active.id;
      if (active.stroke) { const i = strokes.indexOf(active.stroke); if (i >= 0) strokes.splice(i, 1); }
      active = null; predicted = []; try { container.releasePointerCapture?.(id); } catch (_) { }
      redrawBase(); clearLive();
    }
    function down(e) {
      if (!enabled) return;
      const type = e.pointerType || 'mouse';
      if (type === 'pen') sawPen = true;
      if (active && active.id !== e.pointerId) {
        // 터치 획 진행 중 펜이 닿으면 터치 획은 손바닥으로 보고 취소
        if (palm !== 'all' && active.type === 'touch' && type === 'pen') cancelActive();
        else { e.preventDefault(); return; } // 다른 손가락·손바닥은 무시
      }
      if (active) return;
      if (!allowed(type)) { e.preventDefault(); return; }
      if (type === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      rect = container.getBoundingClientRect();
      try { container.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 등 */ }
      if (tool === 'eraser') { active = { id: e.pointerId, type, erased: [] }; eraseAt(e); schedule(); return; }
      const s = { id: nextId++, pts: [], w: [], type, color, gone: false };
      active = { id: e.pointerId, type, stroke: s, drawn: 0 };
      strokes.push(s); addPoint(e, type); predicted = [];
      if (o.onStart) o.onStart(pad);
      schedule();
    }
    function move(e) {
      if (!active || e.pointerId !== active.id) return;
      e.preventDefault();
      const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      const evs = list.length ? list : [e];
      if (tool === 'eraser' && !active.stroke) { for (const c of evs) eraseAt(c); schedule(); return; }
      for (const c of evs) addPoint(c, active.type);
      const pr = (e.getPredictedEvents && e.getPredictedEvents()) || [];
      predicted = pr.slice(0, 3).map(toRef);
      schedule();
    }
    function finish(e) {
      if (!active || (e && e.pointerId !== active.id)) return;
      const a = active; active = null; predicted = []; eraserAt = null;
      try { container.releasePointerCapture?.(a.id); } catch (_) { }
      if (a.stroke) {
        const s = a.stroke;
        // 안정화로 생긴 끝 지연 보정: 실제 마지막 위치로 끝냄
        if (a.raw && s.pts.length) { const l = s.pts[s.pts.length - 1]; if (Math.hypot((a.raw[0] - l[0]) * scale, (a.raw[1] - l[1]) * scale) >= 0.6) { s.pts.push([a.raw[0], a.raw[1], l[2], l[3]]); s.w.push(s.w[s.w.length - 1]); } }
        // 끝을 살짝 가늘게(펜을 뗄 때 자연스럽게)
        if (s.type === 'pen' && s.w.length > 4) { const n = s.w.length; s.w[n - 1] *= 0.82; s.w[n - 2] *= 0.9; s.w[n - 3] *= 0.96; }
        push({ type: 'add', strokes: [s] });
      } else if (a.erased && a.erased.length) push({ type: 'erase', strokes: a.erased });
      redrawBase(); clearLive();
      changed();
    }
    function push(op) { ops.push(op); redoOps = []; }
    function changed() { if (o.onChange) o.onChange(pad); }

    const prevent = e => { if (e.cancelable) e.preventDefault(); };
    container.addEventListener('pointerdown', down);
    container.addEventListener('pointermove', move);
    container.addEventListener('pointerup', finish);
    container.addEventListener('pointercancel', finish);
    container.addEventListener('lostpointercapture', finish);
    container.addEventListener('touchstart', prevent, { passive: false });
    container.addEventListener('touchmove', prevent, { passive: false });
    container.addEventListener('gesturestart', prevent);
    container.addEventListener('contextmenu', prevent);
    container.addEventListener('selectstart', prevent);
    container.addEventListener('dblclick', prevent);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sizeTo()) : null;
    if (ro) ro.observe(container); else g.addEventListener('resize', sizeTo);

    const visible = () => strokes.filter(s => !s.gone);
    const pad = {
      getStrokes: () => visible().map(s => s.pts.map(p => [p[0] * scale, p[1] * scale])),
      getRaw: () => visible().map(s => ({ type: s.type, pts: s.pts.map(p => [+(p[0] * scale).toFixed(1), +(p[1] * scale).toFixed(1), +(+p[2]).toFixed(3), Math.round(p[3])]) })),
      isEmpty: () => !visible().length,
      canUndo: () => ops.length > 0, canRedo: () => redoOps.length > 0,
      undo() {
        if (active) finish(); const op = ops.pop(); if (!op) return false;
        for (const s of op.strokes) s.gone = op.type === 'add';
        redoOps.push(op); redrawBase(); changed(); return true;
      },
      redo() {
        const op = redoOps.pop(); if (!op) return false;
        for (const s of op.strokes) s.gone = op.type !== 'add';
        ops.push(op); redrawBase(); changed(); return true;
      },
      clear() {
        if (active) cancelActive(); const v = visible(); if (!v.length) return false;
        for (const s of v) s.gone = true; push({ type: 'clear', strokes: v }); redrawBase(); changed(); return true;
      },
      reset() { if (active) cancelActive(); strokes = []; ops = []; redoOps = []; redrawBase(); clearLive(); changed(); },
      setTool(t) { if (active) finish(); tool = t === 'eraser' ? 'eraser' : 'pen'; container.dataset.tool = tool; },
      getTool: () => tool,
      setPalm(m) { palm = ['auto', 'pen', 'all'].includes(m) ? m : 'auto'; },
      sawPen: () => sawPen,
      setEnabled(b) { enabled = !!b; if (!enabled && active) finish(); },
      setColor(c) { color = c; }, setWidth(w) { width = w; },
      resize: sizeTo,
      destroy() {
        if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); else g.removeEventListener('resize', sizeTo);
        container.removeEventListener('pointerdown', down); container.removeEventListener('pointermove', move);
        container.removeEventListener('pointerup', finish); container.removeEventListener('pointercancel', finish); container.removeEventListener('lostpointercapture', finish);
        container.removeEventListener('touchstart', prevent); container.removeEventListener('touchmove', prevent);
        container.removeEventListener('gesturestart', prevent); container.removeEventListener('contextmenu', prevent);
        container.removeEventListener('selectstart', prevent); container.removeEventListener('dblclick', prevent);
        baseC.remove(); liveC.remove();
      },
      _debug: () => ({ refW, cssW, scale, dpr, ops: ops.length, redo: redoOps.length, strokes: strokes.length, active: !!active, palm, tool })
    };
    sizeTo();
    return pad;
  }
  KL.ink = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
