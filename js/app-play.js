// 공부 화면 — 오늘 공부(복습 → 새 글자 → 써 보기 → 단어 읽기), 자유 연습, 아는 글자 확인
(function () {
  'use strict';
  const A = KL.app, { data: D, text: T, sched: SC, stats: ST, recog: R, ink: INK } = KL;
  const { $, $$, esc, uuid, icon, toast, whenDue } = A;
  const set = A.set;
  let pad = null, autoTimer = 0;
  const SLOW_MS = 7000; // 설계값: 글자 하나를 읽는 데 7초 넘게 걸리면 '맞았지만 아직 느림'으로 보고 곧 다시 냄

  // ── 획순 그림 (KanjiVG) ──
  A.strokeSVG = (text, cls = '') => {
    const st = R.kvgStrokes(text); if (!st) return '';
    let delay = 0;
    const paths = st.map(s => { let L = 0; for (let j = 1; j < s.length; j++) L += Math.hypot(s[j][0] - s[j - 1][0], s[j][1] - s[j - 1][1]); const d = 'M' + s.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L'); const out = `<path class="anim" d="${d}" style="--len:${Math.ceil(L + 2)};animation-delay:${delay.toFixed(2)}s"/>`; delay += .6; return out; }).join('');
    const nums = st.map((s, i) => `<text x="${(s[0][0] - 6).toFixed(1)}" y="${(s[0][1] - 2).toFixed(1)}">${i + 1}</text>`).join('');
    return `<svg class="strokes ${cls}" viewBox="0 0 109 109" role="img" aria-label="${esc(text)} 쓰는 순서, ${st.length}획">${paths}${nums}</svg>`;
  };

  // ── 오늘 공부 계획 ──
  A.coursePlan = (now = Date.now()) => {
    const s = set(), idx = A.idx, pool = A.kanaPool(s.script, s.range);
    const dueAll = pool.filter(i => { const st = idx.state(i.id, 'read'); return st.reps && st.due <= now; }).sort((a, b) => idx.state(a.id, 'read').due - idx.state(b.id, 'read').due);
    const due = dueAll.slice(0, 30);
    const left = Math.max(0, s.newLimit - idx.startedToday('read', now));
    const fresh = pool.filter(i => !idx.seen(i.id, 'read')).slice(0, left);
    let write = [];
    if (s.courseWrite) {
      const wDue = pool.filter(i => { const st = idx.state(i.id, 'write'); return st.reps && st.due <= now; }).slice(0, 5);
      write = [...fresh, ...wDue.filter(w => !fresh.includes(w))];
      if (!write.length) write = pool.filter(i => idx.seen(i.id, 'read') && !idx.seen(i.id, 'write')).slice(0, 3); // 읽을 줄만 아는 글자를 조금씩 써 보기
      write = write.slice(0, 8);
    }
    const known = A.knownKana(); for (const f of fresh) known.add(f.text);
    const readable = A.wordPool(s.script).filter(w => { const u = D.units(w.text); return u.length > 1 && u.every(x => known.has(x)); });
    const wDueWords = readable.filter(w => { const st = idx.state(w.id, 'typing'); return st.reps && st.due <= now; });
    const wNew = readable.filter(w => !idx.seen(w.id, 'typing'));
    const words = [...wDueWords, ...wNew].slice(0, 5);
    const minutes = Math.max(1, Math.round((due.length * 6 + fresh.length * 40 + write.length * 22 + words.length * 10) / 60));
    return { due, dueMore: dueAll.length - due.length, fresh, write, words, minutes, total: due.length + fresh.length + write.length + words.length, pool };
  };

  // ── 회차 시작·끝 ──
  function begin(sess, rec) {
    A.closeSheet();
    Object.assign(sess, { id: uuid(), start: new Date().toISOString(), n: 0, c: 0, seq: 0, pi: 0, q: null, answered: false, hidden: 0, hiddenAt: 0, guard: 0, wrongs: [] });
    A.db.sessions.push({ id: sess.id, start: sess.start, end: null, script: sess.script, n: 0, ...rec });
    A.sess = sess; A.save(); A.go('play');
  }
  A.startCourse = () => {
    const p = A.coursePlan(), s = set(), phases = [];
    if (!p.total) { toast('지금은 복습할 글자도 새로 배울 글자도 없어요.'); return; }
    if (p.due.length) phases.push({ key: 'review', label: '복습', mode: 'read', queue: SC.makeQueue(p.due) });
    for (let i = 0; i < p.fresh.length; i += 3) { const batch = p.fresh.slice(i, i + 3); phases.push({ type: 'learn', key: 'learn', label: '새 글자', items: batch, i: 0 }, { key: 'new', label: '새 글자', mode: 'read', queue: SC.makeQueue(SC.shuffle(batch)) }); }
    if (p.fresh.length > 3) phases.push({ key: 'mix', label: '새 글자 섞어서', mode: 'read', queue: SC.makeQueue(SC.shuffle(p.fresh)) });
    if (p.write.length) phases.push({ key: 'write', label: '써 보기', mode: 'write', queue: SC.makeQueue(p.write) });
    if (p.words.length) phases.push({ key: 'words', label: '단어 읽기', mode: 'typing', queue: SC.makeQueue(p.words) });
    begin({ kind: 'course', script: s.script, phases }, { mode: 'course', range: [...s.range], newLimit: s.newLimit });
  };
  A.startPlacement = () => {
    const s = set(), script = s.script === 'mix' ? 'h' : s.script;
    const items = SC.shuffle(A.kanaPool(script, ['basic']));
    begin({ kind: 'placement', script, phases: [{ key: 'placement', label: '아는 글자 확인', mode: 'read', queue: SC.makeQueue(items) }] }, { mode: 'placement' });
  };
  A.startFree = opt => {
    const s = set(), mode = opt.mode, script = opt.script || s.script, range = opt.range || s.range;
    const typeKind = mode === 'typing' ? (opt.typeKind || s.typeKind) : null;
    let study = opt.study || s.study;
    let pool = opt.pool || (mode === 'typing' && typeKind === 'words' ? A.wordPool(script) : A.kanaPool(script, range));
    if (mode === 'pair') pool = pool.filter(i => A.partnersOf(i, 2).real > 0);
    if (!pool.length) { toast(mode === 'pair' ? '이 범위에는 헷갈릴 만한 글자가 없어요.' : '연습할 글자 범위를 하나 이상 골라 주세요.'); return; }
    if (mode === 'typing' && typeKind === 'chars' && study === 'adaptive') study = 'normal';
    let seqPool = null;
    if (mode === 'typing' && typeKind === 'chars' && study === 'review') {
      const m = new Map(); for (const a of A.db.attempts) if (a.kind === 'sequence' && !a.correct && Array.isArray(a.parts) && (script === 'mix' || a.script === script)) m.set(a.itemId, { id: a.itemId, text: a.text, answers: a.answers, parts: a.parts, kind: 'sequence', script: a.script, meaning: '' });
      if (m.size) seqPool = [...m.values()]; else toast('틀린 적 있는 문제가 아직 없어서 새 문제로 연습해요.');
    }
    const known = A.knownKana();
    const preferKnown = mode === 'typing' && s.wordsFirst ? list => { const sc = w => { const u = D.units(w.text); return u.length ? u.filter(x => known.has(x)).length / u.length : 0; }; return [...list].sort((a, b) => sc(b) - sc(a)); } : null;
    const run = SC.makeRun({ pool, mode, study, newLimit: s.newLimit, index: A.idx, attempts: A.db.attempts, confusable: A.confusable, preferKnown });
    const phases = [];
    if (study === 'adaptive' && run.newItems.length && run.newItems[0].kind === 'kana' && mode !== 'pair') phases.push({ type: 'learn', key: 'learn', label: '새 글자', items: run.newItems.slice(0, 6), i: 0 });
    phases.push({ key: 'free', label: A.MODE_KO[mode], mode, run, typeKind, seqPool });
    begin({ kind: 'free', script, range, study, typeKind, phases, freeMode: mode }, { mode, study, typeKind, range: [...range], newLimit: s.newLimit });
  };
  A.endSession = (completed = false) => {
    const sess = A.sess; if (!sess) return;
    clearTimeout(autoTimer);
    const rec = A.db.sessions.find(x => x.id === sess.id);
    if (rec) { rec.end = new Date().toISOString(); rec.n = sess.n; rec.c = sess.c; if (!sess.n) A.db.sessions.splice(A.db.sessions.indexOf(rec), 1); }
    if (pad) { pad.destroy(); pad = null; }
    A.lastResult = { id: sess.id, kind: sess.kind, completed, n: sess.n, c: sess.c, mode: sess.freeMode || sess.kind, wrongs: sess.wrongs, script: sess.script, range: sess.range, typeKind: sess.typeKind };
    if (sess.kind === 'placement' && sess.n) A.setSetting('placed', true);
    A.sess = null; A.save();
  };
  const cur = () => A.sess && A.sess.phases[A.sess.pi];

  // ── 화면 ──
  A.pages.play = () => {
    $('#view').innerHTML = `<div class="play">
      <div class="play-bar"><button class="btn sm ghost" data-act="end" aria-label="공부 끝내기">${icon('close')}<span>끝내기</span></button>
        <span class="label" id="phaseLabel"></span><div class="progress" id="progWrap" aria-hidden="true"><i id="prog"></i></div><span class="play-count" id="count" aria-live="off"></span></div>
      <div class="stage" id="stage"></div></div>`;
    next();
  };
  function updateBar() {
    const sess = A.sess, ph = cur(); if (!sess || !$('#count')) return;
    const pct = sess.n ? Math.round(sess.c / sess.n * 100) + '%' : '';
    if (sess.kind === 'free') { $('#phaseLabel').textContent = `${ph.label} · ${A.SCRIPT_KO[sess.script]}`; $('#progWrap').style.visibility = 'hidden'; $('#count').textContent = sess.n ? `${sess.n}문제 · ${pct}` : ''; return; }
    const qs = sess.phases.filter(p => p.queue), total = qs.reduce((n, p) => n + p.queue.total, 0), done = qs.reduce((n, p) => n + p.queue.done, 0);
    $('#phaseLabel').textContent = ph ? (ph.queue ? `${ph.label} ${ph.queue.done}/${ph.queue.total}` : ph.label) : '';
    $('#prog').style.width = (total ? done / total * 100 : 0) + '%';
    $('#count').textContent = sess.kind === 'placement' ? '' : (sess.n ? `정답 ${pct}` : '');
  }
  function next() {
    const sess = A.sess; if (!sess) return;
    clearTimeout(autoTimer);
    if (pad) { pad.destroy(); pad = null; }
    const ph = cur();
    if (!ph) { A.endSession(true); A.go('result'); return; }
    if (ph.type === 'learn') return renderLearn(ph);
    let q;
    if (ph.queue) q = ph.queue.next();
    else if (ph.mode === 'typing' && ph.typeKind === 'chars') q = ph.seqPool ? ph.seqPool[Math.floor(Math.random() * ph.seqPool.length)] : makeSequence(ph);
    else q = ph.run.next();
    if (!q) { // 이 단계 끝 → 다음 단계
      sess.pi++; const np = cur();
      if (np && np.queue && np.mode !== ph.mode) toast({ write: '이제 손으로 써 볼 차례예요.', typing: '이제 배운 글자로 단어를 읽어 봐요.', read: '이제 읽어 볼 차례예요.' }[np.mode] || '');
      return next();
    }
    sess.mode = ph.mode; sess.q = q; sess.seq++; sess.answered = false; sess.revealed = false; sess.last = null; sess.grade = null; sess.addedMine = false; sess.hidden = 0; sess.pickedId = null;
    sess.opts = ph.mode === 'pair' ? SC.shuffle([q, ...A.partnersOf(q, 2)]) : null;
    if (ph.mode === 'write') renderWrite(); else renderCard();
    sess.readyAt = performance.now();
    updateBar();
  }
  function makeSequence(ph) {
    const n = 3 + Math.floor(Math.random() * 3), parts = [];
    for (let i = 0; i < n; i++) parts.push(ph.run.next());
    return { id: 'seq:' + parts.map(p => p.text).join(''), text: parts.map(p => p.text).join(' '), parts: parts.map(p => ({ text: p.text, answers: p.answers })), answers: [parts.map(p => p.answers[0]).join(' ')], kind: 'sequence', script: A.sess.script, meaning: '' };
  }
  const scriptName = q => q.script === 'h' ? '히라가나' : '가타카나';
  function hintLine(q) {
    const m = A.sess.mode, extra = D.WRITE_HINT[q.text] ? ` (${D.WRITE_HINT[q.text]})` : '';
    if (m === 'write') return `${scriptName(q)}로 써 보세요${extra}`;
    if (m === 'pair') return `이 소리가 나는 ${scriptName(q)}를 골라 보세요${extra}`;
    if (q.kind === 'sequence') return '글자의 소리를 차례대로 이어서 입력해요';
    if (q.kind === 'word') return '뜻이 아니라 소리를 한글로 입력해요';
    return '이 글자의 소리를 한글로 입력해요';
  }

  // ── 새 글자 배우기 (획순 보고 따라 쓰기) ──
  function renderLearn(ph) {
    const it = ph.items[ph.i], last = ph.i === ph.items.length - 1, two = [...it.text].length > 1, hint = A.hintOf(it);
    A.sess.mode = 'learn'; A.sess.q = null; A.sess.answered = false;
    $('#stage').innerHTML = `<div class="write learn">
      <div class="card">
        <div class="q-hint">새 글자 ${ph.i + 1}/${ph.items.length}</div>
        <div class="learn-top"><div id="strokeBox">${A.strokeSVG(it.text)}</div>
          <div class="learn-text"><div class="learn-read">${esc(it.answers[0])}</div>${it.answers.length > 1 ? `<div class="small">${esc(it.answers.slice(1).join(', '))}라고 써도 맞아요</div>` : ''}
          ${hint ? `<p class="learn-hint">${esc(hint)}</p>` : ''}${it.origin ? `<p class="small">한자 <span class="kana">${esc(it.origin)}</span>에서 온 글자예요</p>` : ''}</div></div>
        <div class="row"><button class="btn sm" data-act="replay" data-t="${esc(it.text)}">${icon('play')}쓰는 순서 다시 보기</button></div>
      </div>
      <div class="paper-wrap"><div class="paper" id="paper"><div class="ghost on ${two ? 'two' : ''}" lang="ja">${esc(it.text)}</div><div class="pad" id="pad"></div></div>
        <div class="toolrow"><div class="tools" role="toolbar" aria-label="필기 도구">
            <button class="btn icon" data-act="undo" aria-label="한 획 되돌리기">${icon('undo')}</button><button class="btn icon" data-act="clear" aria-label="모두 지우기">${icon('trash')}</button></div>
          <button class="btn primary big" data-act="learn-next" id="mainBtn">${last ? '이제 맞혀 보기' : '다음 글자'}</button></div>
        <p class="small paper-tip">옅은 글자 위에 따라 써 보세요. 안 써도 넘어갈 수 있어요.</p></div></div>`;
    makePad();
    updateBar();
  }
  function makePad() {
    const el = $('#pad'); if (!el) return;
    pad = INK.create(el, { palm: set().palm, color: '#191C22', width: 7, onChange: updateTools });
    pad.setWidth(Math.max(4.5, Math.min(8, el.getBoundingClientRect().width * 0.0145)));
    updateTools();
  }
  function updateTools() { if (!pad) return; const u = $('[data-act="undo"]'), r = $('[data-act="redo"]'); if (u) u.disabled = !pad.canUndo(); if (r) r.disabled = !pad.canRedo(); }

  // ── 읽기 · 단어 읽기 · 헷갈리는 글자 ──
  function renderCard() {
    const sess = A.sess, q = sess.q, m = sess.mode;
    const glyph = m === 'pair' ? `<div class="q-ko">${esc(q.answers[0])}</div>` : `<div class="q-glyph ${q.kind === 'word' ? 'word' : q.kind === 'sequence' ? 'seq' : ''}" lang="ja">${esc(q.text)}</div>`;
    const body = m === 'pair'
      ? `<div class="pair-opts" role="group" aria-label="보기">${sess.opts.map((o, i) => `<button data-act="pick" data-i="${i}" lang="ja"><span class="g">${esc(o.text)}</span><span class="r"></span><kbd>${i + 1}</kbd></button>`).join('')}</div><div id="fb" class="fb-slot"></div><div class="next-row"><button class="btn primary big" data-act="next" id="mainBtn" hidden>다음</button></div>`
      : `<div id="fb" class="fb-slot"></div>
         <form class="answer" id="answerForm" autocomplete="off" novalidate><input id="answer" type="text" lang="ko" inputmode="text" enterkeyhint="done" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="한글로 입력" aria-label="소리를 한글로 입력"><button class="btn primary big" type="submit" id="mainBtn">확인</button></form>
         <div class="q-actions"><button class="btn sm ghost" type="button" data-act="unknown" id="unknownBtn">모르겠어요</button></div>`;
    $('#stage').innerHTML = `<div class="card q-card ${m}"><div class="q-hint">${esc(hintLine(q))}</div>${glyph}<div class="q-meaning" id="meaning"></div>${body}</div>`;
    if (m !== 'pair') bindAnswer();
  }
  // 한글 입력기: 조합 중 엔터는 글자를 완성하는 데 쓰이므로, 조합이 끝난 다음에 한 번만 제출해요.
  // 크롬: keydown(조합 중) → compositionend / 사파리: compositionend → keydown(229) — 두 순서를 모두 받아요.
  function bindAnswer() {
    const inp = $('#answer'), form = $('#answerForm'); let composing = false, pending = false, compEnd = 0;
    inp.addEventListener('compositionstart', () => { composing = true; });
    inp.addEventListener('compositionend', () => { composing = false; compEnd = performance.now(); if (pending) { pending = false; submitOrNext(); } });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      if (e.isComposing || composing) { pending = true; return; }
      if (e.keyCode === 229 && performance.now() - compEnd > 120) { pending = true; setTimeout(() => { if (pending && !composing) { pending = false; submitOrNext(); } }, 60); return; }
      submitOrNext();
    });
    form.addEventListener('submit', e => { e.preventDefault(); if (composing) { pending = true; return; } submitOrNext(); });
    inp.addEventListener('input', () => { if (A.sess && A.sess.answered && A.sess.last && !composing) inp.value = A.sess.last.source === 'unknown' || A.sess.last.input === '모르겠어요' ? '' : A.sess.last.input; });
    inp.focus({ preventScroll: true });
  }
  function submitOrNext() {
    const sess = A.sess; if (!sess) return;
    if (sess.answered) { if (performance.now() - sess.guard > 250) next(); return; }
    const v = $('#answer').value.trim(); if (!v) return;
    const q = sess.q, r = q.parts ? T.judgeSequence(q.parts, v) : T.judge(q.answers, v);
    const extra = r.lenient ? { lenient: r.lenient } : {};
    if (!r.ok && q.kind === 'kana') { const k = whoseSound(q, v); if (k) extra.mistook = k.text; }
    record(r.ok, v, 'typed', extra);
  }
  // 입력한 소리가 다른 글자의 소리인지 (같은 문자 먼저)
  function whoseSound(q, input) {
    const n = T.norm(input); if (!n) return null;
    const hit = k => k.id !== q.id && k.answers.some(a => T.norm(a) === n) && !q.answers.some(a => T.norm(a) === n);
    return D.KANA.find(k => k.script === q.script && hit(k)) || D.KANA.find(hit) || null;
  }
  const elapsed = () => { const s = A.sess; return Math.max(0, Math.round(performance.now() - s.readyAt - s.hidden - (s.hiddenAt ? performance.now() - s.hiddenAt : 0))); };

  // ── 답 기록 ──
  function record(correct, input, source, extra = {}) {
    const sess = A.sess; if (!sess || sess.answered || !sess.q) return;
    sess.answered = true; sess.guard = performance.now();
    const q = sess.q, ph = cur();
    const a = { id: uuid(), sessionId: sess.id, itemId: q.id, text: q.text, answers: q.answers, kind: q.kind, script: q.script, mode: sess.mode, n: sess.seq, time: new Date().toISOString(), elapsedMs: elapsed(), correct, input: String(input).slice(0, 200), source: sess.kind === 'placement' ? 'placement' : source, assisted: !!sess.revealed, hesitant: false, ...extra };
    if (sess.kind !== 'free') a.phase = ph.key;
    if (q.parts) a.parts = q.parts;
    if (correct && !a.lenient && q.kind === 'kana' && sess.mode === 'read' && sess.kind !== 'placement' && a.elapsedMs > SLOW_MS) a.slow = true;
    A.db.attempts.push(a); A.idx.push(a); sess.last = a; A.confCache = null;
    settle(q, correct && !a.assisted);
    sess.n++; if (correct) sess.c++; else sess.wrongs.push(q);
    const rec = A.db.sessions.find(x => x.id === sess.id); if (rec) { rec.n = sess.n; rec.c = sess.c; }
    A.save(); showFeedback(); updateBar();
    const auto = sess.kind === 'placement' ? (correct ? 650 : 1500) : (set().auto && correct && !a.lenient && !a.slow && sess.mode !== 'write' ? 900 : 0);
    if (auto) autoTimer = setTimeout(() => { if (A.sess === sess && sess.last === a) next(); }, auto);
  }
  function settle(q, ok) { const sess = A.sess, ph = cur(); if (ph.queue) ph.queue.settle(q, sess.kind === 'placement' ? true : ok); else if (!q.parts) ph.run.settle(q, ok); }

  function fbHTML() {
    const sess = A.sess, a = sess.last, q = sess.q, st = A.idx.state(q.id, a.mode), place = sess.kind === 'placement';
    const cls = a.correct ? (a.lenient || a.slow ? 'soft' : 'ok') : 'bad';
    let title;
    if (a.correct) title = a.lenient === 'long' ? '맞았어요. 긴 소리는 모음을 한 번 더 써요' : a.slow ? '맞았어요. 조금 오래 걸렸으니 곧 다시 볼게요' : '맞았어요';
    else if (a.mode === 'write') title = a.assisted ? '보고 썼어요. 조금 뒤에 안 보고 써 봐요' : '모양이 조금 달라요';
    else if (a.input === '모르겠어요') title = '이렇게 읽어요';
    else title = '틀렸어요';
    const ans = q.parts ? q.parts.map(p => `<span class="kana" lang="ja">${esc(p.text)}</span> ${esc(p.answers[0])}`).join(' · ') : `<span class="kana" lang="ja">${esc(q.text)}</span> ${esc(q.answers.join(', '))}`;
    const lines = [];
    if (!a.correct && a.mistook) { const k = A.kanaByText(a.mistook); if (k) lines.push(a.mode === 'read' ? `입력한 ‘${esc(a.input)}’는 <span class="kana" lang="ja">${esc(k.text)}</span>의 소리예요.` : a.mode === 'pair' ? `고른 <span class="kana" lang="ja">${esc(k.text)}</span>는 ‘${esc(k.answers[0])}’예요.` : `<span class="kana" lang="ja">${esc(k.text)}</span>(${esc(k.answers[0])})처럼 보여요.`); }
    if (!a.correct && q.kind === 'kana' && A.hintOf(q) && !place) lines.push('외우는 요령: ' + esc(A.hintOf(q)));
    if (a.correct && !place && !q.parts) lines.push(`다음 복습은 ${whenDue(st.due)} · ${A.STAGE_KO[Math.max(1, st.stage)]}`);
    const side = a.correct && !a.assisted && !place && sess.mode !== 'write' ? `<button class="btn sm ghost fb-side" data-act="hesitant" aria-pressed="false">헷갈렸어요</button>` : (!a.correct && a.mistook && !place ? `<button class="btn sm ghost fb-side" data-act="ai-explain">${icon('spark')}차이 묻기</button>` : '');
    return `<div class="feedback ${cls}" role="status"><span class="mark">${icon(a.correct ? 'check' : 'x')}</span><div class="fb-body"><div class="title">${title}</div><div class="detail">${ans}${q.meaning ? ` <span class="mean">${esc(q.meaning)}</span>` : ''}</div>${lines.map(l => `<div class="extra">${l}</div>`).join('')}</div>${side}</div>`;
  }
  function showFeedback() {
    const sess = A.sess;
    if (sess.mode === 'write') return showWriteFeedback();
    $('#fb').innerHTML = fbHTML();
    const btn = $('#mainBtn');
    if (sess.mode === 'pair') {
      $$('.pair-opts button').forEach((b, i) => { const o = sess.opts[i]; b.disabled = true; if (o.id === sess.q.id) b.classList.add('ok'); else if (o.id === sess.pickedId) b.classList.add('bad'); b.querySelector('.r').textContent = o.answers[0]; });
      btn.hidden = false; btn.focus({ preventScroll: true });
    } else {
      btn.textContent = '다음'; const u = $('#unknownBtn'); if (u) u.hidden = true;
      const inp = $('#answer'); inp.classList.add(sess.last.correct ? 'ok' : 'bad'); if (sess.last.input === '모르겠어요') inp.value = '';
      if (document.activeElement !== inp) btn.focus({ preventScroll: true }); // 입력칸에 있으면 그대로 두어 화면 키보드가 내려가지 않게
    }
    const st = $('#stage'); if (st && btn.getBoundingClientRect().bottom > st.getBoundingClientRect().bottom) btn.scrollIntoView({ block: 'end' }); // 결과가 길어 '다음'이 가려지면 보이게
  }

  // ── 쓰기 ──
  function renderWrite() {
    const sess = A.sess, q = sess.q, two = [...q.text].length > 1;
    $('#stage').innerHTML = `<div class="write">
      <div class="card"><div class="q-hint">${esc(hintLine(q))}</div><div class="q-ko">${esc(q.answers[0])}</div></div>
      <div id="fb" class="fb-slot w-fb"><p class="small">쓰는 순서는 채점하지 않아요. 채점 기준은 ‘${esc(A.TOL_KO[set().tolerance])}’예요.</p></div>
      <div class="paper-wrap"><div class="paper" id="paper"><div class="ghost ${two ? 'two' : ''}" id="ghost" lang="ja">${esc(q.text)}</div><div class="pad" id="pad"></div></div>
        <div class="toolrow"><div class="tools" role="toolbar" aria-label="필기 도구">
            <button class="btn icon" data-act="tool" data-v="pen" aria-pressed="true" aria-label="펜" title="펜 (P)">${icon('pen')}</button>
            <button class="btn icon" data-act="tool" data-v="eraser" aria-pressed="false" aria-label="획 지우개" title="획 지우개 (E)">${icon('eraser')}</button><span class="sep"></span>
            <button class="btn icon" data-act="undo" aria-label="한 획 되돌리기" title="되돌리기 (Ctrl+Z)">${icon('undo')}</button>
            <button class="btn icon" data-act="redo" aria-label="다시 하기" title="다시 하기 (Ctrl+Shift+Z)">${icon('redo')}</button>
            <button class="btn icon" data-act="clear" aria-label="모두 지우기" title="모두 지우기">${icon('trash')}</button><span class="sep"></span>
            <button class="btn icon" data-act="reveal" aria-label="정답 보고 쓰기" title="정답 보고 쓰기">${icon('eye')}</button></div>
          <button class="btn primary big" data-act="main" id="mainBtn">채점</button></div></div></div>`;
    makePad();
  }
  function gradeWrite() {
    const sess = A.sess; if (!sess || sess.answered || !pad) return;
    const strokes = pad.getStrokes(), paper = $('#paper').getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, pts = 0;
    for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); pts++; }
    if (!strokes.length) { toast('먼저 종이에 글자를 써 주세요.'); return; }
    if (pts < 4 || Math.max(x1 - x0, y1 - y0) < paper.width * .16) { toast('글자가 너무 작아요. 조금 더 크게 써 주세요.'); return; }
    const g = R.grade(strokes, sess.q, D.KANA, { tolerance: set().tolerance, personal: A.db.mine });
    sess.grade = g; sess.lastStrokes = strokes;
    const norm = R.normalize(strokes).strokes.map(s => s.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]));
    if (set().collect) { const list = A.db.samples = A.db.samples || []; list.push({ text: sess.q.text, strokes: norm, at: new Date().toISOString(), ok: !!g.ok && !sess.revealed, score: +(g.score || 0).toFixed(2) }); if (list.length > 200) list.splice(0, list.length - 200); }
    const extra = { shapeScore: g.score !== undefined ? +g.score.toFixed(2) : undefined, recognition: sess.revealed ? '정답을 보고 씀' : `모양 비교 · 가장 비슷한 글자 ${g.best ? g.best.text : '-'}` };
    if (!g.ok && g.best && g.best.id !== sess.q.id && g.bestScore <= R.TOL.normal.abs) extra.mistook = g.best.text;
    record(!sess.revealed && !!g.ok, '손글씨', 'shape-match', extra);
  }
  function showWriteFeedback() {
    const sess = A.sess, a = sess.last, g = sess.grade;
    if (pad) pad.setEnabled(false);
    $('#ghost').classList.add('on');
    const paper = $('#paper'); paper.classList.remove('ok', 'bad'); paper.classList.add('judged', a.correct ? 'ok' : 'bad');
    $$('.tools .btn').forEach(b => b.disabled = true);
    const cands = g && g.top ? g.top.slice(0, 3).map(t => `<span class="${t.text === sess.q.text ? 'me' : ''}" lang="ja">${esc(t.text)}</span>`).join('') : '';
    $('#fb').innerHTML = fbHTML() + `<div class="fix-row"><span class="small">비슷하게 보인 글자</span><span class="cands">${cands}</span>
      <span class="small fix-q">채점이 잘못됐나요?</span><button class="btn sm" data-act="fix" data-v="${a.correct ? 0 : 1}">${a.correct ? '틀리게 쓴 거예요' : '맞게 쓴 거예요'}</button></div>`;
    const btn = $('#mainBtn'); btn.textContent = '다음'; btn.focus({ preventScroll: true });
    const fb = $('#fb'), r = fb.getBoundingClientRect(), st = $('#stage'); // 좁은 화면에서는 결과가 종이 아래에 있으니 보이게 내려 줌
    if (st && r.bottom > st.getBoundingClientRect().bottom) fb.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }
  // 채점 고치기 — 처음 채점 결과와 채점 방식은 기록에 그대로 남기고, 다시 낼 문제도 고친 결과에 맞춰요
  function fix(right) {
    const sess = A.sess, a = sess && sess.last; if (!a || a.correct === right) return;
    if (a.originalCorrect === undefined) a.originalCorrect = a.correct;
    a.correct = right; a.corrected = true; a.correctedAt = new Date().toISOString();
    if (right) { sess.c++; sess.wrongs = sess.wrongs.filter(w => w.id !== sess.q.id); } else { sess.c--; sess.wrongs.push(sess.q); }
    A.idx.touch(a.itemId, a.mode); A.confCache = null;
    settle(sess.q, right && !a.assisted);
    const t = sess.q.text, mine = A.db.mine = A.db.mine || {};
    if (right && set().learnMine && !a.assisted && sess.lastStrokes) {
      const list = mine[t] = mine[t] || [];
      list.push({ text: t, strokes: R.normalize(sess.lastStrokes).strokes.map(s => s.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])), at: new Date().toISOString() });
      if (list.length > 5) list.splice(0, list.length - 5);
      sess.addedMine = true;
      toast('이 글씨를 기억해 둘게요. 다음부터 비슷하게 쓰면 맞게 채점해요.');
    }
    // 틀리게 쓴 거라고 고치면: 방금 기억한 글씨(잘못 누른 경우)나, 이 채점을 맞다고 하게 만든 내 글씨 본보기를 뺌
    if (!right && mine[t] && (sess.addedMine || (sess.grade && sess.grade.src === 'mine'))) { mine[t].pop(); if (!mine[t].length) delete mine[t]; sess.addedMine = false; }
    const rec = A.db.sessions.find(x => x.id === sess.id); if (rec) rec.c = sess.c;
    A.save(); showWriteFeedback(); updateBar();
  }

  // ── 누르기 ──
  Object.assign(A.acts, {
    end: () => { const s = A.sess; if (!s) return; const fin = () => { A.endSession(false); A.go('result'); }; if (s.kind === 'course' && s.n && cur()) A.ask('오늘 공부가 아직 남았어요. 여기서 끝낼까요? 푼 문제는 저장돼 있어요.', '끝내기').then(y => y && fin()); else fin(); },
    next: () => { if (A.sess && A.sess.answered) next(); },
    main: () => { const s = A.sess; if (!s) return; if (s.answered) next(); else if (s.mode === 'write') gradeWrite(); },
    'learn-next': () => { const ph = cur(); if (!ph || ph.type !== 'learn') return; if (ph.i < ph.items.length - 1) { ph.i++; if (pad) { pad.destroy(); pad = null; } renderLearn(ph); } else { A.sess.pi++; next(); } },
    replay: (b) => { const box = $('#strokeBox'); if (box) box.innerHTML = A.strokeSVG(b.dataset.t); },
    unknown: () => { record(false, '모르겠어요', 'unknown'); },
    pick: b => { const s = A.sess; if (!s || s.answered) return; const o = s.opts[+b.dataset.i]; s.pickedId = o.id; record(o.id === s.q.id, o.text, 'pick', o.id === s.q.id ? {} : { mistook: o.text }); },
    hesitant: b => { const a = A.sess && A.sess.last; if (!a) return; a.hesitant = !a.hesitant; A.idx.touch(a.itemId, a.mode); A.save(); b.setAttribute('aria-pressed', String(a.hesitant)); b.textContent = a.hesitant ? '곧 다시 볼게요' : '헷갈렸어요'; },
    reveal: b => { const s = A.sess; if (!s || s.answered) return; s.revealed = true; $('#ghost').classList.add('on'); b.disabled = true; toast('정답을 보고 쓰면 조금 뒤에 안 보고 한 번 더 써요.'); },
    tool: (b, v) => { if (!pad) return; pad.setTool(v); $$('[data-act="tool"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === v))); },
    undo: () => { if (pad) { pad.undo(); updateTools(); } },
    redo: () => { if (pad) { pad.redo(); updateTools(); } },
    clear: () => { if (pad) { pad.clear(); updateTools(); } },
    fix: (b, v) => fix(v === '1'),
    'ai-explain': () => { const s = A.sess, a = s && s.last; if (!a || !a.mistook) return; const k = A.kanaByText(a.mistook); A.coachSheet('explain', { a: s.q.text, ar: s.q.answers[0], b: k.text, br: k.answers[0] }); }
  });
  // 키보드: Enter로 채점·다음, 숫자로 보기 고르기, 쓰기 단축키
  document.addEventListener('keydown', e => {
    const sess = A.sess; if (!sess || A.view !== 'play' || !$('#sheet').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'Enter' && !e.isComposing && !e.repeat) {
      if (tag === 'button' && !['next', 'main', 'learn-next'].includes(e.target.dataset.act)) return;
      e.preventDefault();
      if (sess.mode === 'learn') A.acts['learn-next']();
      else if (sess.answered) { if (performance.now() - sess.guard > 250) next(); }
      else if (sess.mode === 'write') gradeWrite();
      return;
    }
    if (sess.mode === 'pair' && !sess.answered && /^[1-3]$/.test(e.key)) { const b = $$('.pair-opts button')[+e.key - 1]; if (b) b.click(); return; }
    if ((sess.mode === 'write' || sess.mode === 'learn') && pad && !sess.answered) {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? pad.redo() : pad.undo(); updateTools(); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === 'e' || k === 'p') && sess.mode === 'write') A.acts.tool(null, k === 'e' ? 'eraser' : 'pen');
    }
  });
  document.addEventListener('visibilitychange', () => {
    const s = A.sess; if (!s) return;
    if (document.hidden) s.hiddenAt = performance.now();
    else if (s.hiddenAt) { s.hidden += performance.now() - s.hiddenAt; s.hiddenAt = 0; }
  });
  window.addEventListener('pagehide', () => { const s = A.sess; if (!s) return; const rec = A.db.sessions.find(x => x.id === s.id); if (rec) { rec.end = new Date().toISOString(); rec.n = s.n; rec.c = s.c; A.save(); } });
  Object.defineProperty(A, 'pad', { get: () => pad });
})();
