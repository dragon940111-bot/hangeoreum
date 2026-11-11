// 화면 — 오늘 · 연습 · 가나 지도 · 기록 · 설정. 데이터·채점·출제·저장은 다른 파일(KL.*)에 있어요.
(function () {
  'use strict';
  const { data: D, text: T, store: S, sched: SC, stats: ST, recog: R, ink: INK, claude: C } = KL;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const icon = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const MODE_KO = { read: '읽기', write: '쓰기', typing: '타자', pair: '짝 구별' };
  const SCRIPT_KO = { h: '히라가나', k: '가타카나', mix: '혼합' };
  const GROUP_KO = { basic: '기본', voiced: '탁음·반탁음', yoon: '요음', ext: '외래어 조합' };
  const STAGE_KO = ['아직', '막 배움', '익히는 중', '거의 외움', '외움', '단단히', '오래 기억'];
  const TOL_KO = { strict: '꼼꼼히', normal: '보통', relaxed: '악필 배려' };

  // ── 저장소 ──
  function safeLS() { try { const k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _memory: true }; } }
  const LS = safeLS();
  const store = S.makeStore(LS);
  let db = store.db, idx = SC.makeIndex(db.attempts);
  if (S.recoverSessions(db)) save();
  const DEF = { script: 'h', newLimit: 5, tolerance: 'relaxed', palm: 'auto', range: ['basic'], wordsFirst: true, usePacks: true, collect: false, learnMine: true, study: 'adaptive', typeKind: 'words' };
  const set = () => ({ ...DEF, ...db.settings });
  function setSetting(k, v) { db.settings[k] = v; save(); }
  function save() { const ok = store.save(); if (!ok && !store.corrupt) toast('이 브라우저에 저장하지 못했어요. 설정에서 백업을 내려받아 주세요.'); return ok; }
  function reindex() { idx = SC.makeIndex(db.attempts); }

  // ── 항목 ──
  const hintOf = it => (db.hints && db.hints[it.text]) || it.hint || '';
  function packWords() {
    if (!set().usePacks) return [];
    const out = [];
    for (const p of db.packs || []) for (const w of p.words) out.push({ id: 'w:' + w.text, text: w.text, answers: w.answers, meaning: w.meaning || '', script: /[ァ-ヺ]/.test(w.text) ? 'k' : 'h', kind: 'word', group: 'word', pack: p.name });
    return out;
  }
  function allWords() { const m = new Map(); for (const w of [...D.WORDS, ...packWords()]) if (!m.has(w.id)) m.set(w.id, w); return [...m.values()]; }
  function kanaPool(script, range) { return D.KANA.filter(k => range.includes(k.group) && (script === 'mix' || k.script === script)); }
  function wordPool(script) { return allWords().filter(w => script === 'mix' || w.script === script); }
  const byText = new Map(D.KANA.map(k => [k.script + ':' + k.text, k]));
  function partnersOf(item, n = 2) {
    if (item.kind !== 'kana') return [];
    const out = [];
    for (const p of D.PAIRS) if (p.includes(item.text)) for (const c of p) if (c !== item.text) { const k = D.KANA.find(x => x.text === c && x.kind === 'kana'); if (k && !out.some(o => o.id === k.id)) out.push(k); }
    // 탁점·반탁점만 다른 글자
    const bare = t => t.normalize('NFD').replace(/[゙゚]/g, '');
    for (const k of D.KANA) if (k.id !== item.id && k.script === item.script && [...k.text].length === [...item.text].length && bare(k.text) === bare(item.text) && !out.some(o => o.id === k.id)) out.push(k);
    if (out.length < n) { const same = SC.shuffle(D.KANA.filter(k => k.script === item.script && k.group === item.group && k.id !== item.id && !out.some(o => o.id === k.id))); out.push(...same.slice(0, n - out.length)); }
    return out.slice(0, Math.max(n, 0));
  }
  function confusable(item) { if (item.kind !== 'kana') return null; const p = D.PAIRS.find(x => x.includes(item.text)); if (!p) return null; return D.KANA.find(k => k.script === item.script && k.text !== item.text && p.includes(k.text)) || null; }
  function knownKana() { const s = new Set(); for (const k of D.KANA) if (idx.get(k.id, 'read').some(a => a.correct && !a.assisted)) s.add(k.text); return s; }
  function preferKnownWords(list) {
    if (!set().wordsFirst) return list;
    const known = knownKana();
    const score = w => { const u = D.units(w.text); return u.length ? u.filter(x => known.has(x)).length / u.length : 0; };
    return [...list].sort((a, b) => score(b) - score(a));
  }
  const dayKey = SC.dayKey;
  function startedToday(mode) {
    const t = dayKey(Date.now()); const ids = new Set();
    for (const a of db.attempts) if (a.mode === mode && dayKey(Date.parse(a.time)) === t) { const h = idx.get(a.itemId, mode); if (h.length && dayKey(Date.parse(h[0].time)) === t) ids.add(a.itemId); }
    return ids.size;
  }

  // ── 작은 도구 ──
  let toastTimer = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800); }
  function download(name, text, type) { const b = new Blob([text], { type }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const fmt = t => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtFull = t => new Date(t).toLocaleString('ko-KR');
  function whenDue(t) { if (!t) return '처음 배우기'; const n = t - Date.now(); if (n <= 0) return '지금'; if (n < 36e5) return Math.ceil(n / 6e4) + '분 뒤'; if (n < 864e5) return Math.ceil(n / 36e5) + '시간 뒤'; return Math.ceil(n / 864e5) + '일 뒤'; }
  function seg(name, opts, value, attrs = '') { return `<div class="seg" role="group" ${attrs}>${opts.map(([v, l]) => `<button type="button" data-seg="${esc(name)}" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div>`; }
  function corruptBanner() {
    if (store.corrupt) return `<div class="note bad" style="margin-bottom:22px"><b>저장된 기록을 읽지 못했어요.</b> 원본은 지우거나 덮어쓰지 않고 그대로 두었어요(${esc(store.corrupt.error)}). 지금 푼 문제는 저장되지 않아요.
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="raw-download">원본 내려받기</button><button class="btn sm" data-act="go-backup">백업 가져오기</button><button class="btn sm" data-act="set-aside">원본은 따로 보관하고 새로 시작</button></div></div>`;
    if (LS._memory) return `<div class="note" style="margin-bottom:22px">이 브라우저는 기록 저장을 막고 있어요(개인 정보 보호 모드 등). 끝내기 전에 설정 → 백업에서 내려받아 주세요.</div>`;
    return '';
  }

  // ── 시트 ──
  let sheetClose = null;
  function openSheet(html, onClose) {
    const sh = $('#sheet'), bd = $('#backdrop');
    sh.innerHTML = html; sh.hidden = false; bd.hidden = false; sheetClose = onClose || null;
    requestAnimationFrame(() => { sh.classList.add('on'); bd.classList.add('on'); });
    const f = sh.querySelector('[autofocus], button, textarea'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
  }
  function closeSheet() {
    const sh = $('#sheet'), bd = $('#backdrop'); if (sh.hidden) return;
    sh.classList.remove('on'); bd.classList.remove('on');
    setTimeout(() => { sh.hidden = true; bd.hidden = true; sh.innerHTML = ''; }, 260);
    if (sheetClose) { const f = sheetClose; sheetClose = null; f(); }
  }
  $('#backdrop').addEventListener('click', closeSheet);

  // 확인 판 — window.confirm은 일부 환경(미리보기 틀)에서 막혀서 앱 안에서 물어봄
  function ask(msg, ok, danger) {
    return new Promise(res => {
      let done = false; const fin = v => { if (done) return; done = true; res(v); };
      openSheet(`<h2 class="h2">${esc(msg)}</h2><div class="row" style="margin-top:22px"><button class="btn ${danger ? 'danger' : 'primary'}" id="askOk">${esc(ok)}</button><button class="btn ghost" id="askNo">취소</button></div>`, () => fin(false));
      $('#askOk').onclick = () => { fin(true); closeSheet(); }; $('#askNo').onclick = () => closeSheet();
    });
  }
  // 내보내기: 내려받기가 막힌 환경을 위해 복사 판도 같이
  function exportSheet(title, name, text, type) {
    download(name, text, type);
    openSheet(`<div class="sheet-head"><h2 class="h2" style="margin:0">${esc(title)}</h2><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <p class="small">파일이 저장되지 않았다면 아래 글을 복사해 메모 앱·파일에 붙여 넣어 보관하세요. 가져올 때는 설정 → 백업의 '붙여 넣어 가져오기'.</p>
      <textarea id="exportText" readonly style="min-height:220px">${esc(text.length > 2e6 ? text.slice(0, 2e6) : text)}</textarea>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="copy-export">복사</button></div>`);
  }
  function copyText(t) { return (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }); }

  // ── 길잡이(라우터) ──
  let view = '';
  function go(v) { if (location.hash !== '#' + v) location.hash = v; else render(); }
  window.addEventListener('hashchange', () => {
    if (sess && location.hash !== '#play') {
      const to = location.hash; history.replaceState(null, '', '#play');
      if (!sess.n) { endSession(false); history.replaceState(null, '', to); render(); return; }
      ask('연습을 끝낼까요? 지금까지 푼 문제는 저장돼 있어요.', '끝내기').then(y => { if (y) { endSession(false); history.replaceState(null, '', to); render(); } });
      return;
    }
    render();
  });
  function render() {
    const h = (location.hash || '#today').slice(1);
    if (!set().onboarded && !db.attempts.length) return renderOnboard();
    if (h === 'play' && !sess) { history.replaceState(null, '', '#today'); return render(); }
    if (h === 'settings') { history.replaceState(null, '', '#prefs'); }
    view = ['today', 'map', 'stats', 'prefs', 'play', 'result'].includes(h === 'settings' ? 'prefs' : h) ? (h === 'settings' ? 'prefs' : h) : 'today';
    $('#app').classList.toggle('focus', view === 'play');
    $$('.rail a').forEach(a => a.setAttribute('aria-current', a.dataset.nav === view || (view === 'result' && a.dataset.nav === 'today') ? 'page' : 'false'));
    ({ today: renderToday, map: renderMap, stats: renderStats, prefs: renderSettings, play: renderPlay, result: renderResult })[view]();
    if (view !== 'play') window.scrollTo(0, 0);
  }

  // ── 처음 ──
  function renderOnboard() {
    $('#app').classList.add('focus');
    $('#view').innerHTML = `<div class="onboard"><div class="brand-mark" style="margin:0 auto 22px;width:56px;height:56px;font-size:34px;border-radius:16px">歩</div>
      <h1 class="h1">어떤 글자부터 시작할까요?</h1><p class="sub">로그인 없이 바로 써요. 기록은 이 기기의 브라우저에 저장돼요.</p>
      <div class="opts">
        <button data-act="onboard" data-v="h"><span class="g">あ</span><span class="li-body"><b>히라가나</b><span>처음이라면 여기부터. 일본어의 기본 글자예요.</span></span></button>
        <button data-act="onboard" data-v="k"><span class="g">ア</span><span class="li-body"><b>가타카나</b><span>메뉴·간판에 많은 외래어 글자예요.</span></span></button>
        <button data-act="onboard" data-v="mix"><span class="g">あア</span><span class="li-body"><b>혼합</b><span>두 글자를 다 배워 본 적이 있을 때.</span></span></button>
      </div></div>`;
  }

  // ── 오늘 ──
  function todayPlan() {
    const s = set(), pool = kanaPool(s.script, s.range), now = Date.now();
    const due = pool.filter(i => { const st = idx.state(i.id, 'read'); return st.last && st.due <= now; });
    const newLeft = Math.max(0, s.newLimit - startedToday('read'));
    const fresh = pool.filter(i => !idx.get(i.id, 'read').length).slice(0, newLeft);
    return { due, fresh, newLeft, pool };
  }
  function stampOnce() { const k = 'hangeoreum-stamp', d = dayKey(Date.now()); try { if (sessionStorage.getItem(k) === d) return false; sessionStorage.setItem(k, d); } catch (e) { } return true; }
  function weekNew() { const t = Date.now() - 7 * 864e5; let n = 0; for (const k of D.KANA) { const h = idx.get(k.id, 'read'); if (h.length && Date.parse(h[0].time) >= t && h.some(a => a.correct && !a.assisted)) n++; } return n; }
  function renderToday() {
    const s = set(), plan = todayPlan(), streak = ST.dayStreak(db.attempts), today = ST.today(db.attempts);
    const nothing = !plan.due.length && !plan.fresh.length;
    const glyphs = [...plan.due.slice(0, 10).map(i => `<span class="due">${esc(i.text)}</span>`), ...plan.fresh.slice(0, Math.max(0, 14 - Math.min(10, plan.due.length))).map(i => `<span>${esc(i.text)}</span>`)].join('');
    const mins = Math.max(1, Math.round((plan.due.length * 8 + plan.fresh.length * 30) / 60));
    const basic = kanaPool(s.script === 'mix' ? 'h' : s.script, ['basic']);
    const solid = basic.filter(i => idx.state(i.id, 'read').stage >= 2).length;
    const suggest = !s.range.includes('voiced') && solid >= basic.length * .8 ? `<div class="note info section" style="margin-top:22px">기본 글자 ${solid}개가 손에 익었어요. 범위에 탁음·반탁음(が·ぱ)을 더해 볼까요? <button class="btn sm" data-act="add-range" data-v="voiced" style="margin-left:6px">탁음 더하기</button></div>` : '';
    const wrongAny = db.attempts.some(a => !a.correct);
    $('#view').innerHTML = `${corruptBanner()}
      <div class="today-top"><div><h1 class="h1">${nothing && today.n ? '오늘 할 일을 마쳤어요' : '오늘의 한걸음'}</h1><p class="sub" style="margin:0">${today.n ? `오늘 ${today.n}문제 · 정답 ${Math.round(today.c / today.n * 100)}%` : '복습부터, 그다음 새 글자 몇 개.'}</p></div>
        ${seg('script', [['h', '히라가나'], ['k', '가타카나'], ['mix', '혼합']], s.script, 'aria-label="문자"')}</div>
      <section class="hero">
        <div><h2 class="h2" style="margin:0">${nothing ? '새로 배울 글자와 복습이 없어요' : '오늘의 학습'}</h2>
          <ul class="hero-plan"><li><b>${plan.due.length}</b><span>복습할 글자</span></li><li><b>${plan.fresh.length}</b><span>새 글자 (하루 ${s.newLimit}개)</span></li><li><b>${nothing ? '–' : '약 ' + mins + '분'}</b><span>걸리는 시간</span></li></ul>
          ${glyphs ? `<div class="hero-glyphs" aria-label="오늘 나올 글자">${glyphs}</div>` : ''}</div>
        <div class="row" style="gap:18px">${nothing && today.n ? `<span class="hanko ${stampOnce() ? 'stamp' : ''}" role="img" aria-label="오늘 할 일 완료" lang="ja">済</span>` : ''}${nothing ? `<button class="btn big" data-act="start" data-mode="read" data-study="normal">더 연습하기</button>` : `<button class="btn primary big" data-act="today">시작하기</button>`}</div>
      </section>${suggest}
      <div class="section"><div class="spread"><h2 class="h2" style="margin:0">골라서 연습</h2><span class="small">${esc(SCRIPT_KO[s.script])} · ${s.range.map(r => GROUP_KO[r]).join(', ')}</span></div>
      <div class="list">
        <button data-act="setup" data-mode="read"><span class="li-ico">${icon('read')}</span><span class="li-body"><b>읽기</b><span>글자를 보고 한글 발음을 입력해요</span></span><span class="li-end">${icon('chev')}</span></button>
        <button data-act="setup" data-mode="write"><span class="li-ico">${icon('pen')}</span><span class="li-body"><b>쓰기</b><span>발음을 보고 손으로 써요 · 획순은 채점하지 않아요</span></span><span class="li-end">${icon('chev')}</span></button>
        <button data-act="setup" data-mode="typing"><span class="li-ico">${icon('keys')}</span><span class="li-body"><b>타자</b><span>가나 단어·글자 줄을 한글로 빠르게 읽어요</span></span><span class="li-end">${icon('chev')}</span></button>
        <button data-act="setup" data-mode="pair"><span class="li-ico">${icon('pair')}</span><span class="li-body"><b>짝 구별</b><span>シ·ツ, ぬ·め처럼 헷갈리는 글자를 골라요</span></span><span class="li-end">${icon('chev')}</span></button>
        ${wrongAny ? `<button data-act="start" data-mode="read" data-study="review"><span class="li-ico">${icon('undo')}</span><span class="li-body"><b>틀린 것 위주로</b><span>자주 틀린 읽기 문제를 먼저 내요</span></span><span class="li-end">${icon('chev')}</span></button>` : ''}
      </div>
      <div class="week"><span>연속 <b>${streak.streak}</b>일${streak.studiedToday ? '' : streak.streak ? ' · 오늘 하면 이어져요' : ''}</span><span>이번 주 새로 익힌 글자 <b>${weekNew()}</b></span><span>공부한 날 <b>${streak.days}</b></span></div></div>`;
  }
  function setupSheet(mode) {
    const s = set();
    const ranges = [['basic', '기본 46'], ['voiced', '탁음·반탁음 25'], ['yoon', '요음 33'], ['ext', '외래어 조합 13 (가타카나)']];
    openSheet(`<div class="sheet-head"><div><h2 class="h2" style="margin:0">${esc(MODE_KO[mode])} 연습</h2><p class="small" style="margin:4px 0 0">${{ read: '글자 → 한글 발음', write: '한글 발음 → 손글씨', typing: '단어·글자 줄 → 한글 발음', pair: '발음 → 맞는 글자 고르기' }[mode]}</p></div><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <div class="form" style="margin-top:18px">
        <div class="field"><span class="lab">문자</span>${seg('script', [['h', '히라가나'], ['k', '가타카나'], ['mix', '혼합']], s.script)}</div>
        ${mode === 'typing' ? `<div class="field"><span class="lab">문제</span>${seg('typeKind', [['words', '단어 (한자 없음)'], ['chars', '글자 줄 3~5개']], s.typeKind)}</div>` : ''}
        ${mode !== 'typing' || s.typeKind === 'chars' ? `<div class="field"><span class="lab">글자 범위</span><div class="chips">${ranges.map(([v, l]) => `<button class="chip" data-act="range" data-v="${v}" aria-pressed="${s.range.includes(v)}">${l}</button>`).join('')}</div><p class="small">요음은 작은 ゃ·ゅ·ょ가 붙은 한 묶음으로 나와요.</p></div>` : ''}
        <div class="field"><span class="lab">출제 방식</span>${seg('study', [['adaptive', '추천'], ['normal', '골고루'], ['review', '틀린 것 위주']], s.study)}
          <p class="small">${{ adaptive: '복습할 때가 된 글자 → 오늘의 새 글자(하루 ' + s.newLimit + '개) → 약한 글자 순이에요.', normal: '범위 안 글자를 골고루 섞어 반복해요.', review: '틀린 기록이 많을수록 자주 나와요.' }[s.study]}</p></div>
        <button class="btn primary big wide" data-act="start" data-mode="${mode}">시작하기</button>
        <p class="small" style="text-align:center;margin:0">끝낼 때까지 계속 나와요. 언제든 끝내기를 누르세요.</p>
      </div>`);
    $('#sheet').dataset.mode = mode;
  }

  // ── 연습 회차 ──
  let sess = null;
  function startSession(opt) {
    const s = set();
    const mode = opt.mode, script = opt.script || s.script, range = opt.range || s.range, typeKind = mode === 'typing' ? (opt.typeKind || s.typeKind) : null;
    let study = opt.study || s.study;
    let pool = opt.pool || (mode === 'typing' && typeKind === 'words' ? wordPool(script) : kanaPool(script, range));
    if (mode === 'pair') pool = pool.filter(i => partnersOf(i).length);
    if (!pool.length) { toast('연습할 글자 범위를 하나 이상 골라 주세요.'); return; }
    if (mode === 'typing' && typeKind === 'chars' && study === 'adaptive') study = 'normal';
    let seqPool = null;
    if (mode === 'typing' && typeKind === 'chars' && study === 'review') {
      const m = new Map(); for (const a of db.attempts) if (a.kind === 'sequence' && !a.correct && Array.isArray(a.parts) && (script === 'mix' || a.script === script)) m.set(a.itemId, { id: a.itemId, text: a.text, answers: a.answers, parts: a.parts, kind: 'sequence', script: a.script, meaning: '틀렸던 글자 줄' });
      if (m.size) seqPool = [...m.values()]; else toast('틀린 글자 줄이 아직 없어 새 글자 줄로 연습해요.');
    }
    const run = SC.makeRun({ pool, mode, study, newLimit: s.newLimit, index: idx, attempts: db.attempts, confusable, preferKnown: mode === 'typing' ? preferKnownWords : null });
    closeSheet();
    sess = { id: uuid(), mode, script, range, typeKind, study, run, seqPool, label: opt.label || '', start: new Date().toISOString(), n: 0, c: 0, seq: 0, q: null, answered: false, hidden: 0, hiddenAt: 0, guard: 0, wrongs: [] };
    db.sessions.push({ id: sess.id, start: sess.start, end: null, mode, script, study, typeKind, range: [...range], newLimit: s.newLimit, n: 0 });
    save();
    sess.intro = (study === 'adaptive' && run.newItems.length && mode !== 'typing') ? run.newItems : (study === 'adaptive' && mode === 'typing' && run.newItems.length ? run.newItems : null);
    go('play');
  }
  function endSession(fromNav) {
    if (!sess) return true;
    const rec = db.sessions.find(x => x.id === sess.id);
    if (rec) { rec.end = new Date().toISOString(); rec.n = sess.n; rec.c = sess.c; }
    if (pad) { pad.destroy(); pad = null; }
    lastResult = { id: sess.id, n: sess.n, c: sess.c, mode: sess.mode, wrongs: sess.wrongs, script: sess.script, study: sess.study, range: sess.range, typeKind: sess.typeKind };
    if (!sess.n && rec) db.sessions.splice(db.sessions.indexOf(rec), 1);
    sess = null; save();
    return true;
  }
  let lastResult = null, pad = null;

  function renderPlay() {
    const total = sess.run.dueAtStart + sess.run.newItems.length;
    $('#view').innerHTML = `<div class="play">
      <div class="play-bar"><button class="btn sm ghost" data-act="end">${icon('close')}끝내기</button>
        <span class="label">${esc(MODE_KO[sess.mode])}${sess.mode === 'typing' ? ' · ' + (sess.typeKind === 'words' ? '단어' : '글자 줄') : ''} · ${esc(SCRIPT_KO[sess.script])}</span>
        <div class="progress" aria-hidden="true"><i id="prog"></i></div><span class="play-count" id="count"></span></div>
      <div class="stage" id="stage"></div></div>`;
    sess.total = total;
    if (sess.intro) renderIntro(); else nextQuestion();
  }
  function updateBar() {
    const c = $('#count'); if (!c) return;
    c.textContent = sess.n ? `${sess.n}문제 · ${Math.round(sess.c / sess.n * 100)}%` : '첫 문제';
    const p = $('#prog'); if (p) { const goal = Math.max(sess.total || 0, 10); p.style.width = Math.min(100, sess.n / goal * 100) + '%'; }
  }
  function renderIntro() {
    const items = sess.intro; sess.intro = null;
    $('#stage').innerHTML = `<div class="intro"><h1 class="h1">오늘 새로 만날 ${items.length}개</h1><p class="sub">모양과 소리를 이어 보세요. 다 보면 정답을 가리고 떠올려요.</p>
      <div class="intro-grid">${items.map(i => i.kind === 'word' ? `<div class="intro-card"><div class="g" style="font-size:40px;line-height:1.5">${esc(i.text)}</div><b>${esc(i.answers[0])}</b><p>${esc(i.meaning)}</p></div>` :
      `<div class="intro-card"><div class="g">${esc(i.text)}</div><b>${esc(i.answers.join(' / '))}</b>${hintOf(i) ? `<p>${esc(hintOf(i))}</p>` : ''}${i.origin ? `<p class="org">유래 한자 <span class="kana">${esc(i.origin)}</span></p>` : ''}</div>`).join('')}</div>
      <button class="btn primary big" data-act="intro-done" autofocus>가리고 떠올려 볼게요</button></div>`;
    $('[data-act="intro-done"]').focus();
  }
  function makeSequence() {
    const n = 3 + Math.floor(Math.random() * 3), parts = [];
    for (let i = 0; i < n; i++) parts.push(sess.run.next());
    return { id: 'seq:' + parts.map(p => p.text).join(''), text: parts.map(p => p.text).join(' '), parts: parts.map(p => ({ text: p.text, answers: p.answers })), answers: [parts.map(p => p.answers[0]).join(' ')], kind: 'sequence', script: sess.script, meaning: '' };
  }
  function nextQuestion() {
    if (!sess) return;
    if (pad) { pad.destroy(); pad = null; }
    const m = sess.mode;
    let q;
    if (m === 'typing' && sess.typeKind === 'chars') q = sess.seqPool ? sess.seqPool[Math.floor(Math.random() * sess.seqPool.length)] : makeSequence();
    else q = sess.run.next();
    sess.q = q; sess.seq++; sess.answered = false; sess.revealed = false; sess.last = null; sess.grade = null; sess.hidden = 0;
    sess.opts = m === 'pair' ? SC.shuffle([q, ...partnersOf(q, 2)]) : null;
    if (m === 'write') renderWrite(); else renderCardQ();
    sess.readyAt = performance.now();
    updateBar();
  }
  function hintLine(q) {
    if (sess.mode === 'write') return `${q.script === 'h' ? '히라가나' : '가타카나'}로 써 보세요${D.WRITE_HINT[q.text] ? ' · ' + D.WRITE_HINT[q.text] : ''}`;
    if (sess.mode === 'pair') return `‘${q.answers[0]}’ 소리가 나는 ${q.script === 'h' ? '히라가나' : '가타카나'}를 골라요${D.WRITE_HINT[q.text] ? ' · ' + D.WRITE_HINT[q.text] : ''}`;
    if (q.kind === 'sequence') return '글자마다 소리를 이어서 입력해요';
    if (q.kind === 'word') return '일본어 소리를 한글로 입력해요 (뜻 말고 소리)';
    return '이 글자는 어떻게 읽을까요?';
  }
  function renderCardQ() {
    const q = sess.q, m = sess.mode;
    const glyph = m === 'pair' ? `<div class="q-ko">${esc(q.answers[0])}</div>` : `<div class="q-glyph ${q.kind === 'word' ? 'word' : q.kind === 'sequence' ? 'seq' : ''}" lang="ja">${esc(q.text)}</div>`;
    const body = m === 'pair'
      ? `<div class="pair-opts">${sess.opts.map((o, i) => `<button data-act="pick" data-i="${i}" lang="ja" aria-label="${esc(o.text)}">${esc(o.text)}</button>`).join('')}</div>`
      : `<form class="answer" id="answerForm" autocomplete="off"><input id="answer" type="text" inputmode="text" enterkeyhint="done" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="한글로 입력" aria-label="한글 발음"><button class="btn primary big" type="submit">확인</button></form>
         <div class="q-actions"><button class="btn sm ghost" type="button" data-act="unknown">모르겠어요</button></div>`;
    $('#stage').innerHTML = `<div class="card"><div class="q-hint">${esc(hintLine(q))}</div>${glyph}<div class="q-meaning" id="meaning"></div>${body}<div id="fb"></div></div>`;
    if (m !== 'pair') bindAnswer();
  }
  // 한국어 입력기: 조합 중 엔터는 조합을 끝내는 데 쓰고, 조합이 끝나면(compositionend) 그때 제출 — 엔터 한 번이 두 번 처리되지 않게
  function bindAnswer() {
    const inp = $('#answer'), form = $('#answerForm'); let composing = false, pending = false;
    inp.addEventListener('compositionstart', () => { composing = true; });
    inp.addEventListener('compositionend', () => { composing = false; if (pending) { pending = false; setTimeout(submitTyped, 0); } });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      if (e.isComposing || composing || e.keyCode === 229) { pending = true; return; }
      submitTyped();
    });
    form.addEventListener('submit', e => { e.preventDefault(); if (!composing) submitTyped(); });
    setTimeout(() => inp.focus({ preventScroll: true }), 30);
  }
  function submitTyped() {
    if (!sess || sess.answered) return;
    const v = $('#answer').value.trim(); if (!v) return;
    const q = sess.q;
    const r = q.parts ? T.judgeSequence(q.parts, v) : T.judge(q.answers, v);
    record(r.ok, v, 'typed', r.lenient ? { lenient: r.lenient } : {});
  }
  function elapsed() { return Math.max(0, Math.round(performance.now() - sess.readyAt - sess.hidden - (sess.hiddenAt ? performance.now() - sess.hiddenAt : 0))); }
  function record(correct, input, source, extra = {}) {
    if (!sess || sess.answered) return;
    sess.answered = true; sess.guard = performance.now();
    const q = sess.q;
    const a = { id: uuid(), sessionId: sess.id, itemId: q.id, text: q.text, answers: q.answers, kind: q.kind, script: q.script, mode: sess.mode, n: sess.seq, time: new Date().toISOString(), elapsedMs: elapsed(), correct, input: String(input).slice(0, 200), source, assisted: !!sess.revealed, hesitant: false, ...extra };
    if (q.parts) a.parts = q.parts;
    db.attempts.push(a); idx.push(a); sess.last = a;
    if (!q.parts) sess.run.settle(q, correct && !a.assisted);
    sess.n++; if (correct) sess.c++; else sess.wrongs.push(q);
    const rec = db.sessions.find(x => x.id === sess.id); if (rec) rec.n = sess.n;
    save(); showFeedback(); updateBar();
    if (sess.run.dueAtStart && !sess.dueDone && sess.run.dueCount() === 0) { sess.dueDone = true; toast('오늘 복습을 다 했어요. 지금부터는 더 하는 연습이에요.'); }
  }
  function feedbackHTML() {
    const a = sess.last, q = sess.q, st = idx.state(q.id, sess.mode);
    const partner = !a.correct ? confusable(q) : null;
    const cls = a.correct ? (a.lenient || a.assisted ? 'soft' : 'ok') : 'bad';
    const title = a.correct ? (a.lenient === 'long' ? '맞았어요 · 장음도 길게 써 봐요' : a.assisted ? '맞았어요 · 정답을 보고 썼어요' : '맞았어요') : a.source === 'unknown' ? '괜찮아요, 지금 외우면 돼요' : '아쉬워요';
    const ans = q.parts ? q.parts.map(p => `<span class="kana">${esc(p.text)}</span> ${esc(p.answers.join('/'))}`).join(' · ') : `<span class="kana">${esc(q.text)}</span> → ${esc(q.answers.join(' / '))}`;
    let extra = `기억 단계 ${STAGE_KO[st.stage]} · 다음 복습 ${whenDue(st.due)}`;
    if (!a.correct && a.source === 'typed') extra = `내 답 ‘${esc(a.input)}’ · ` + extra;
    const hint = q.kind === 'kana' && !a.correct && hintOf(q) ? `<div class="extra">힌트: ${esc(hintOf(q))}</div>` : '';
    const comp = partner ? `<div class="extra">비교: <span class="kana" style="font-size:18px">${esc(q.text)}</span> ${esc(q.answers[0])} ↔ <span class="kana" style="font-size:18px">${esc(partner.text)}</span> ${esc(partner.answers[0])} — 다른 곳을 하나 찾아보세요</div>` : '';
    const hes = a.correct && !a.assisted ? `<button class="btn sm ghost" data-act="hesitant" aria-pressed="${a.hesitant}" style="margin-left:auto">${a.hesitant ? '헷갈림으로 표시함' : '사실 헷갈렸어요'}</button>` : '';
    return `<div class="feedback ${cls}"><span class="mark">${icon(a.correct ? 'check' : 'x')}</span><div class="title">${title}</div><div class="detail">${ans}${q.meaning ? ` <span class="small">· ${esc(q.meaning)}</span>` : ''}</div><div class="extra">${extra}</div>${hint}${comp}</div>
      <div class="row next"><button class="btn primary big" data-act="next" id="nextBtn">다음 <span class="kbd">Enter</span></button>${hes}</div>`;
  }
  function showFeedback() {
    if (sess.mode === 'write') return showWriteFeedback();
    const fb = $('#fb'); fb.innerHTML = feedbackHTML();
    const inp = $('#answer'); if (inp) inp.disabled = true;
    $$('[data-act="unknown"]').forEach(b => b.disabled = true);
    if (sess.mode === 'pair') $$('.pair-opts button').forEach((b, i) => { const o = sess.opts[i]; b.disabled = true; if (o.id === sess.q.id) b.classList.add('ok'); else if (o.id === sess.pickedId) b.classList.add('bad'); b.insertAdjacentHTML('beforeend', `<span style="display:block;font:600 13px var(--sans);color:var(--ink-3)">${esc(o.answers[0])}</span>`); });
    if (sess.q.meaning) $('#meaning').textContent = sess.q.meaning;
    $('#nextBtn').focus({ preventScroll: true });
  }

  // ── 쓰기 ──
  function renderWrite() {
    const q = sess.q, two = [...q.text].length > 1;
    $('#stage').innerHTML = `<div class="write">
      <div class="card"><div class="q-hint">${esc(hintLine(q))}</div><div class="q-ko">${esc(q.answers[0])}</div>
        <p class="small" style="margin:6px 0 0">채점: ${esc(TOL_KO[set().tolerance])} · 획순은 보지 않아요</p>
        <div id="fb"></div>
        <div class="row" style="margin-top:22px" id="writeActs"><button class="btn primary big" data-act="grade" id="gradeBtn">채점하기 <span class="kbd">Enter</span></button><button class="btn ghost" data-act="reveal">${icon('eye')}정답 보고 쓰기</button></div>
      </div>
      <div class="paper-wrap"><div class="paper" id="paper"><div class="ghost ${two ? 'two' : ''}" id="ghost" lang="ja">${esc(q.text)}</div><div class="pad" id="pad"></div></div>
        <div class="tools" role="toolbar" aria-label="필기 도구">
          <button class="btn icon" data-act="tool" data-v="pen" aria-pressed="true" aria-label="펜 (P)" title="펜 (P)">${icon('pen')}</button>
          <button class="btn icon" data-act="tool" data-v="eraser" aria-pressed="false" aria-label="획 지우개 (E)" title="획 지우개 (E)">${icon('eraser')}</button><span class="sep"></span>
          <button class="btn icon" data-act="undo" aria-label="되돌리기" title="되돌리기 (Ctrl+Z)">${icon('undo')}</button>
          <button class="btn icon" data-act="redo" aria-label="다시 하기" title="다시 하기 (Ctrl+Shift+Z)">${icon('redo')}</button>
          <button class="btn icon" data-act="clear" aria-label="모두 지우기" title="모두 지우기">${icon('trash')}</button>
        </div></div></div>`;
    pad = INK.create($('#pad'), { palm: set().palm, color: '#191C22', width: 7, onChange: updateTools });
    updateTools();
  }
  function updateTools() { if (!pad) return; const u = $('[data-act="undo"]'), r = $('[data-act="redo"]'); if (u) u.disabled = !pad.canUndo(); if (r) r.disabled = !pad.canRedo(); }
  function gradeWrite() {
    if (!sess || sess.answered || !pad) return;
    const strokes = pad.getStrokes();
    const paper = $('#paper').getBoundingClientRect();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, pts = 0;
    for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); pts++; }
    if (!strokes.length || pts < 4 || Math.max(x1 - x0, y1 - y0) < paper.width * .16) { toast(strokes.length ? '조금 더 크게 써 주세요.' : '먼저 글자를 써 주세요.'); return; }
    const g = R.grade(strokes, sess.q, D.KANA, { tolerance: set().tolerance, personal: db.mine });
    sess.grade = g; sess.lastStrokes = strokes;
    if (set().collect) { db.samples = db.samples || []; db.samples.push({ text: sess.q.text, strokes: R.normalize(strokes).strokes.map(s => s.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])), at: new Date().toISOString(), ok: g.ok, score: +(g.score || 0).toFixed(2) }); if (db.samples.length > 2000) db.samples.splice(0, db.samples.length - 2000); }
    const ok = !sess.revealed && !!g.ok;
    record(ok, '그림 제출', 'shape-match', { shapeScore: g.score !== undefined ? +g.score.toFixed(2) : undefined, recognition: sess.revealed ? '정답을 보고 씀 · 복습으로 기록' : `모양 비교 · 가장 가까운 글자 ${g.best ? g.best.text : '-'}` });
  }
  function showWriteFeedback() {
    const a = sess.last, g = sess.grade;
    pad && pad.setEnabled(false);
    $('#ghost').classList.add('on');
    $('#paper').classList.add('judged', a.correct ? 'ok' : 'bad');
    $('#writeActs').innerHTML = '';
    const cands = g && g.top ? `<div class="cands" aria-label="모양이 가까운 글자">${g.top.slice(0, 3).map(t => `<span class="${t.text === sess.q.text ? 'me' : ''}" lang="ja">${esc(t.text)}</span>`).join('')}</div>` : '';
    const why = a.correct ? '' : g && g.reason === 'confusable' ? `<div class="extra">비슷한 글자 ‘${esc(g.best.text)}’에 더 가까워 보여요.</div>` : g && g.reason === 'far' ? '<div class="extra">본보기와 모양 차이가 커요.</div>' : '';
    $('#fb').innerHTML = feedbackHTML() + `<div style="margin-top:14px"><span class="small">모양이 가까운 순서</span>${cands}${why}
      <div class="correct-row"><span class="small" style="align-self:center">판정이 틀렸나요?</span>${a.correct ? `<button class="btn sm" data-act="fix" data-v="0">틀리게 썼어요</button>` : `<button class="btn sm" data-act="fix" data-v="1">맞게 썼어요</button>`}</div></div>`;
    $('#nextBtn').focus({ preventScroll: true });
  }
  // 판정 정정 — 처음 판정(originalCorrect)과 채점 방식(source)은 그대로 두고, 재출제 줄도 최종 판정에 맞춤
  function fixJudgement(right) {
    const a = sess && sess.last; if (!a || a.correct === right) return;
    if (a.originalCorrect === undefined) a.originalCorrect = a.correct;
    a.correct = right; a.corrected = true; a.correctedAt = new Date().toISOString();
    if (right) { sess.c++; sess.wrongs = sess.wrongs.filter(w => w.id !== sess.q.id); } else { sess.c--; sess.wrongs.push(sess.q); }
    sess.run.settle(sess.q, right && !a.assisted);
    const t = sess.q.text;
    if (right && set().learnMine && !a.assisted && sess.lastStrokes) {
      db.mine = db.mine || {}; const list = db.mine[t] = db.mine[t] || [];
      list.push({ text: t, strokes: R.normalize(sess.lastStrokes).strokes.map(s => s.map(p => [+p[0].toFixed(3), +p[1].toFixed(3)])), at: new Date().toISOString() });
      if (list.length > 5) list.splice(0, list.length - 5);
      toast('내 글씨를 이 글자의 본보기로 기억했어요.');
    }
    if (!right && sess.grade && sess.grade.src === 'mine' && db.mine && db.mine[t]) { db.mine[t].pop(); if (!db.mine[t].length) delete db.mine[t]; }
    save(); showWriteFeedback(); updateBar();
    $('#paper').classList.remove('ok', 'bad'); $('#paper').classList.add(right ? 'ok' : 'bad');
  }

  // ── 결과 ──
  function renderResult() {
    const r = lastResult; if (!r) { history.replaceState(null, '', '#today'); return renderToday(); }
    const list = db.attempts.filter(a => a.sessionId === r.id), o = ST.overview(list);
    const wrongs = [...new Map(r.wrongs.map(w => [w.id, w])).values()];
    $('#view').innerHTML = `<h1 class="h1">${r.n ? `${r.n}문제를 풀었어요` : '연습을 마쳤어요'}</h1><p class="sub">${esc(MODE_KO[r.mode])} · ${esc(SCRIPT_KO[r.script])}</p>
      ${r.n ? `<div class="metrics"><div><b>${Math.round(o.c / o.n * 100)}%</b><span>정답률</span></div><div><b>${o.wrong}</b><span>틀린 문제</span></div><div><b>${o.max}</b><span>최장 연속 정답</span></div><div><b>${o.avgSec.toFixed(1)}초</b><span>평균 응답 시간</span></div>${o.typingPerMin ? `<div><b>${Math.round(o.typingPerMin)}</b><span>타자 · 분당 정답 음절</span></div>` : ''}</div>` : ''}
      ${wrongs.length ? `<div class="section"><h2 class="h2">다시 볼 글자</h2><div class="hero-glyphs">${wrongs.slice(0, 30).map(w => `<span class="due" style="width:auto;padding:0 10px" lang="ja">${esc(w.text)}</span>`).join('')}</div></div>` : ''}
      <div class="row section">${wrongs.length && r.mode !== 'typing' ? `<button class="btn primary big" data-act="retry-wrongs">틀린 것만 다시</button>` : ''}<button class="btn big" data-act="go" data-v="today">오늘로</button><button class="btn big ghost" data-act="go-stats" data-v="${esc(r.id)}">이번 기록 자세히</button></div>`;
  }

  // ── 가나 지도 ──
  let mapScript = null, mapMode = 'read';
  const GOJUON = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や_ゆ_よ', 'らりるれろ', 'わ___を', 'ん____'];
  function tileHTML(k) {
    if (!k) return '<div class="tile empty" aria-hidden="true"></div>';
    const st = idx.state(k.id, mapMode), due = st.last && st.due <= Date.now();
    return `<button class="tile ${due ? 'due' : ''}" data-s="${st.last ? Math.max(1, st.stage) : 0}" data-act="detail" data-id="${esc(k.id)}" aria-label="${esc(k.text)} ${esc(k.answers[0])}, ${STAGE_KO[st.last ? Math.max(1, st.stage) : 0]}${due ? ', 복습할 때' : ''}"><span class="g" lang="ja">${esc(k.text)}</span><span class="r">${esc(k.answers[0])}</span></button>`;
  }
  function renderMap() {
    const sc = mapScript || (set().script === 'k' ? 'k' : 'h');
    const conv = t => sc === 'h' ? t : D.kata(t);
    const get = t => byText.get(sc + ':' + t);
    const basic = GOJUON.map(r => [...r].map(c => c === '_' ? '' : tileHTML(get(conv(c)))).map(x => x || tileHTML(null)).join('')).join('');
    const voiced = ['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'].map(r => [...r].map(c => tileHTML(get(conv(c)))).join('')).join('');
    const yoon = D.KANA.filter(k => k.group === 'yoon' && k.script === sc).map(tileHTML).join('');
    const ext = sc === 'k' ? D.KANA.filter(k => k.group === 'ext').map(tileHTML).join('') : '';
    const seen = D.KANA.filter(k => k.script === sc && idx.get(k.id, mapMode).length).length, all = D.KANA.filter(k => k.script === sc).length;
    $('#view').innerHTML = `${corruptBanner()}<div class="map-head"><div><h1 class="h1">가나 지도</h1><p class="sub" style="margin:0">${esc(MODE_KO[mapMode])} 기준 · ${seen}/${all}개 만나 봄 · 칸을 누르면 획순과 기록이 나와요</p></div>
      <div class="row">${seg('mapScript', [['h', '히라가나'], ['k', '가타카나']], sc)}${seg('mapMode', [['read', '읽기'], ['write', '쓰기']], mapMode)}</div></div>
      <div class="legend">${[0, 1, 2, 3, 4, 6].map(s => `<span><i style="background:var(--m${s})"></i>${STAGE_KO[s]}</span>`).join('')}<span><i style="background:var(--shu);border-radius:50%;border:0;width:8px;height:8px"></i>복습할 때</span></div>
      <div class="map-block"><h2 class="h2">기본</h2><div class="grid5">${basic}</div></div>
      <div class="map-block"><h2 class="h2">탁음·반탁음</h2><div class="grid5">${voiced}</div></div>
      <div class="map-block"><h2 class="h2">요음</h2><div class="grid3">${yoon}</div></div>
      ${ext ? `<div class="map-block"><h2 class="h2">외래어 조합</h2><div class="grid5">${ext}</div></div>` : ''}`;
  }
  function strokeSVG(text) {
    const st = R.kvgStrokes(text); if (!st) return '';
    let delay = 0;
    const paths = st.map((s, i) => { let L = 0; for (let j = 1; j < s.length; j++) L += Math.hypot(s[j][0] - s[j - 1][0], s[j][1] - s[j - 1][1]); const d = 'M' + s.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L'); const out = `<path class="anim" d="${d}" style="--len:${Math.ceil(L + 2)};animation-delay:${delay.toFixed(2)}s"/>`; delay += .62; return out; }).join('');
    const nums = st.map((s, i) => `<text x="${(s[0][0] - 6).toFixed(1)}" y="${(s[0][1] - 2).toFixed(1)}">${i + 1}</text>`).join('');
    return `<svg class="strokes" viewBox="0 0 109 109" role="img" aria-label="${esc(text)} 획순 ${st.length}획">${paths}${nums}</svg>`;
  }
  function detailSheet(id) {
    const k = D.KANA.find(x => x.id === id); if (!k) return;
    const rows = ['read', 'write', 'pair'].map(m => { const h = idx.get(k.id, m); if (!h.length) return ''; const s = ST.summary(h), st = SC.memoryState(h), lw = h.filter(a => !a.correct).at(-1);
      return `<dt>${MODE_KO[m]}</dt><dd>${h.length}번 중 ${s.wrong}번 틀림 · ${STAGE_KO[st.stage]} · 다음 복습 ${whenDue(st.due)}${lw ? `<br><span class="small">최근 틀린 때 ${esc(fmt(lw.time))}</span>` : ''}</dd>`; }).join('');
    const partner = confusable(k);
    openSheet(`<div class="sheet-head"><span class="small">${esc(GROUP_KO[k.group])} · ${k.script === 'h' ? '히라가나' : '가타카나'}</span><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <div class="detail-glyph" lang="ja">${esc(k.text)}</div><p style="text-align:center;font-size:22px;font-weight:700;margin:0">${esc(k.answers.join(' / '))}</p>
      ${hintOf(k) ? `<p style="text-align:center;color:var(--ink-2);margin:8px 0 0">${esc(hintOf(k))}</p>` : ''}
      <div style="margin-top:22px" id="strokeBox">${strokeSVG(k.text)}</div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm" data-act="replay" data-t="${esc(k.text)}">${icon('play')}획순 다시 보기</button></div>
      <dl class="facts">${k.origin ? `<dt>유래 한자</dt><dd><span class="kana" style="font-size:20px">${esc(k.origin)}</span></dd>` : ''}${partner ? `<dt>헷갈리는 짝</dt><dd><span class="kana" style="font-size:20px">${esc(partner.text)}</span> ${esc(partner.answers[0])}</dd>` : ''}${rows || '<dt>기록</dt><dd>아직 없어요</dd>'}</dl>
      <div class="row"><button class="btn primary" data-act="drill" data-id="${esc(k.id)}" data-mode="write">이 글자 쓰기</button><button class="btn" data-act="drill" data-id="${esc(k.id)}" data-mode="read">읽기</button>${partnersOf(k).length ? `<button class="btn" data-act="drill" data-id="${esc(k.id)}" data-mode="pair">짝 구별</button>` : ''}</div>
      <p class="small" style="margin-top:18px">획순 그림: KanjiVG (CC BY-SA 3.0). 쓰기 채점은 획순을 보지 않아요.</p>`);
  }

  // ── 기록 ──
  let statMode = 'all', statSession = '', statLimit = 40, dueLimit = 40;
  function renderStats() {
    let sel = db.attempts;
    if (statSession) sel = sel.filter(a => a.sessionId === statSession);
    if (statMode !== 'all') sel = sel.filter(a => a.mode === statMode);
    const o = ST.overview(sel), rows = ST.byItem(sel), bad = sel.filter(a => !a.correct);
    const dm = statMode === 'all' ? 'read' : statMode;
    const dueList = [...D.KANA, ...allWords()].filter(i => idx.get(i.id, dm).length).map(i => ({ i, s: idx.state(i.id, dm) })).sort((a, b) => a.s.due - b.s.due);
    const sessions = [...db.sessions].sort((a, b) => Date.parse(b.start) - Date.parse(a.start)).slice(0, 300);
    const pct = o.n ? Math.round(o.c / o.n * 100) + '%' : '–';
    $('#view').innerHTML = `${corruptBanner()}<div class="spread"><div><h1 class="h1">기록</h1><p class="sub" style="margin:0">실제로 푼 기록으로만 셈해요. 응답 시간은 다른 앱으로 나가 있던 시간을 뺀 값이에요.</p></div><button class="btn sm" data-act="csv">CSV 내보내기</button></div>
      <div class="row" style="margin:22px 0 18px">${seg('statMode', [['all', '전체'], ['read', '읽기'], ['write', '쓰기'], ['typing', '타자'], ['pair', '짝 구별']], statMode)}
        <select id="sessionFilter" aria-label="회차"><option value="">모든 회차</option>${sessions.map(x => `<option value="${esc(x.id)}" ${x.id === statSession ? 'selected' : ''}>${esc(fmt(x.start))} · ${esc(MODE_KO[x.mode] || x.mode || '')} · ${Number.isFinite(+x.n) ? +x.n : 0}문제${x.interrupted ? ' · 중단' : ''}</option>`).join('')}</select></div>
      <div class="metrics"><div><b>${o.n}</b><span>푼 문제</span></div><div><b>${pct}</b><span>정답률</span></div><div><b>${o.pure}</b><span>스스로 맞힘</span></div><div><b>${o.assisted}</b><span>정답 보고 맞힘</span></div><div><b class="${o.wrong ? 'wrong' : ''}">${o.wrong}</b><span>틀림</span></div><div><b>${o.max}</b><span>최장 연속 정답</span></div><div><b>${o.streak}</b><span>마지막 연속 정답</span></div><div><b>${o.avgSec ? o.avgSec.toFixed(1) + '초' : '–'}</b><span>평균 응답 시간</span></div><div><b>${o.typingPerMin ? Math.round(o.typingPerMin) : '–'}</b><span>타자 · 분당 정답 음절</span></div><div><b>${rows.filter(r => r.s.wrong).length}</b><span>틀린 적 있는 문제</span></div></div>
      ${!sel.length ? `<div class="section note info">아직 기록이 없어요. 오늘 탭에서 시작해 보세요.</div>` : `
      <div class="section"><h2 class="h2">글자·단어별</h2><p class="small" style="margin:-6px 0 12px">● 맞음 · × 틀림. ‘n번째’는 그 문제를 푼 누적 순서, ‘회차 n번’은 그 회차 안의 문제 번호예요.</p>
      <div class="table-wrap"><table><thead><tr><th>문제</th><th>틀림 / 시도</th><th>정답률</th><th>연속 지금 / 최장</th><th>정답 뒤 실수 · 안정 시작</th><th>최근 틀린 때</th><th>흐름</th></tr></thead><tbody>
      ${rows.slice(0, statLimit).map(({ list, s }) => { const last = list.filter(a => !a.correct).at(-1);
        return `<tr><td><span class="kana" lang="ja">${esc(list[0].text)}</span><br><span class="small">${esc(MODE_KO[list[0].mode] || list[0].mode)}</span></td><td><span class="wrong">${s.wrong}</span> / ${s.n}</td><td>${Math.round(s.c / s.n * 100)}%</td><td>${s.streak} / ${s.max}</td>
          <td>${s.afterCorrect.length ? s.afterCorrect.slice(-3).map(b => `${b.n}번째: ${b.streak}연속 뒤 실수 <span class="small">(${esc(fmt(b.time))})</span>`).join('<br>') : '없음'}<br><span class="small">${s.stableStart ? s.stableStart + '번째부터 ' + s.streak + '연속 정답 (' + esc(fmt(s.stableSince)) + '부터)' : '마지막이 틀림'}</span></td>
          <td>${last ? esc(fmt(last.time)) : '–'}</td>
          <td><div class="flow">${list.slice(-30).map(b => b.correct ? '<span class="o">●</span>' : '<span class="x">×</span>').join('')}</div><details><summary>전부 보기</summary>${list.map((b, i) => `<div class="tl"><b>${i + 1}번째 · ${b.correct ? '맞음' : '틀림'}</b>${b.assisted ? ' · 정답 보고' : ''}${b.corrected ? ' · 판정 정정' : ''}${b.lenient ? ' · 장음 빠짐' : ''} <span class="small">(회차 ${Number.isFinite(+b.n) ? +b.n : '?'}번)</span><br>${esc(fmtFull(b.time))} · ${(b.elapsedMs / 1000).toFixed(1)}초 · ${esc(b.input)}</div>`).join('')}<p class="small">최장 연속 틀림 ${s.maxWrong}번</p></details></td></tr>`; }).join('')}
      </tbody></table></div>${rows.length > statLimit ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="more-stats">${rows.length - statLimit}개 더 보기</button></div>` : ''}</div>
      <div class="section"><h2 class="h2">최근 틀린 문제</h2>${bad.slice(-20).reverse().map(a => `<div class="tl"><b class="kana" lang="ja" style="font-size:20px">${esc(a.text)}</b> → ${esc(a.answers.join(' / '))} <span class="small">${esc(MODE_KO[a.mode] || a.mode)} · ${esc(fmtFull(a.time))} · 회차 ${Number.isFinite(+a.n) ? +a.n : '?'}번 · 입력 ${esc(a.input)}</span></div>`).join('') || '<p class="small">이 범위에는 틀린 문제가 없어요.</p>'}</div>`}
      <div class="section"><h2 class="h2">다음 복습 · ${esc(MODE_KO[dm])}</h2><p class="small" style="margin:-6px 0 12px">회차 선택과 상관없이 이 모드의 전체 기록으로 계산해요. 간격(10분·1일·3일·7일·14일·30일)은 이 앱의 설계값이에요.</p>
      ${dueList.length ? `<div class="table-wrap"><table><thead><tr><th>문제</th><th>기억 단계</th><th>다음 복습</th><th>틀린 횟수</th></tr></thead><tbody>${dueList.slice(0, dueLimit).map(x => `<tr><td><span class="kana" lang="ja">${esc(x.i.text)}</span></td><td>${STAGE_KO[x.s.stage]}</td><td>${whenDue(x.s.due)}</td><td>${x.s.lapses}</td></tr>`).join('')}</tbody></table></div>${dueList.length > dueLimit ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="more-due">${dueList.length - dueLimit}개 더 보기</button></div>` : ''}` : '<p class="small">아직 없어요.</p>'}</div>`;
    $('#sessionFilter').onchange = e => { statSession = e.target.value; statLimit = 40; renderStats(); };
  }
  function exportCSV() {
    const rows = [['시간', '회차', '회차내번호', '모드', '문제', '정답발음', '입력', '정오', '응답초', '채점방식', '도움받음', '헷갈림', '장음관대', '정정여부', '처음판정']];
    for (const a of db.attempts) rows.push([a.time, a.sessionId, a.n, a.mode, a.text, (a.answers || []).join('|'), a.input, a.correct ? '정답' : '오답', (a.elapsedMs / 1000).toFixed(2), a.source, a.assisted ? '예' : '', a.hesitant ? '예' : '', a.lenient || '', a.corrected ? '정정' : '', a.originalCorrect === undefined ? '' : a.originalCorrect ? '정답' : '오답']);
    download('hangeoreum-records-' + new Date().toISOString().slice(0, 10) + '.csv', '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }

  // ── 설정 ──
  function sw(name, on, label, sub) { return `<div class="li"><span class="li-body"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</span>${seg(name, [['1', '켬'], ['0', '끔']], on ? '1' : '0')}</div>`; }
  function renderSettings() {
    const s = set(), mineN = Object.values(db.mine || {}).reduce((n, l) => n + l.length, 0);
    $('#view').innerHTML = `${corruptBanner()}<h1 class="h1">설정</h1><p class="sub">로그인 없이 이 브라우저에 저장돼요.</p>
      <h2 class="h2">학습</h2><div class="list">
        <div class="li"><span class="li-body"><b>하루 새 글자</b><span>모드마다 하루에 새로 만나는 수예요. 범위를 바꿔도 이 수를 넘지 않아요.</span></span>${seg('newLimit', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], s.newLimit)}</div>
        ${sw('wordsFirst', s.wordsFirst, '아는 글자로 된 단어 먼저', '타자 연습에서 읽기로 맞힌 글자가 많은 단어부터 내요.')}
        ${sw('usePacks', s.usePacks, '가져온 단어 팩 쓰기', `클로드가 만든 단어 ${(db.packs || []).reduce((n, p) => n + p.words.length, 0)}개를 타자 연습에 섞어요.`)}
      </div>
      <h2 class="h2 section">손글씨</h2><div class="list">
        <div class="li"><span class="li-body"><b>채점 허용 폭</b><span>악필 배려가 가장 너그러워요. 그래도 헷갈리는 짝(ぬ·め, ば·ぱ 등)은 엄격히 봐요.</span></span>${seg('tolerance', [['strict', '꼼꼼히'], ['normal', '보통'], ['relaxed', '악필 배려']], s.tolerance)}</div>
        <div class="li"><span class="li-body"><b>손바닥 무시</b><span>자동: Apple Pencil이 한 번 닿으면 그다음부터 손가락·손바닥을 무시해요.</span></span>${seg('palm', [['auto', '자동'], ['pen', '펜만'], ['all', '모두']], s.palm)}</div>
        ${sw('learnMine', s.learnMine, '내 글씨 배우기', `‘맞게 썼어요’로 정정하면 그 글씨를 본보기로 기억해요(글자마다 5개, 지금 ${mineN}개).`)}
        ${sw('collect', s.collect, '필기 표본 모으기', `채점 정확도를 다시 재 보려고 쓴 획을 이 기기에 모아요(지금 ${(db.samples || []).length}개).`)}
        <div class="li"><span class="li-body"><b>필기 표본</b><span>획 좌표만 저장돼요. 내보낸 파일로 채점 시험을 다시 돌릴 수 있어요.</span></span><div class="row"><button class="btn sm" data-act="export-samples">내보내기</button><button class="btn sm danger" data-act="clear-mine">내 글씨 본보기 지우기</button></div></div>
      </div>
      <p class="small" style="margin-top:10px">손글씨 채점은 인식 AI가 아니라 KanjiVG 획 본보기와의 모양 비교예요. 아이패드 설정 → Apple Pencil → ‘손글씨 입력(Scribble)’을 끄면 획이 글자로 바뀌어 사라지는 일을 막을 수 있어요.</p>
      <h2 class="h2 section">클로드에게 부탁하기</h2><p class="small" style="margin:-6px 0 12px">API·키·추가 비용 없이 쓰는 클로드 구독으로 열어요. 앱이 개인정보 없는 학습 요약과 부탁 문장을 만들어 줘요.</p>
      <div class="list">
        <button data-act="claude" data-kind="plan"><span class="li-ico">${icon('spark')}</span><span class="li-body"><b>약점 분석과 이번 주 계획</b><span>틀린 기록을 보고 연습 순서를 짜 달라고 해요</span></span><span class="li-end">${icon('chev')}</span></button>
        <button data-act="claude" data-kind="pack"><span class="li-ico">${icon('box')}</span><span class="li-body"><b>약한 글자로 단어 팩 만들기</b><span>받은 JSON을 붙여 넣으면 타자 연습에 들어가요</span></span><span class="li-end">${icon('chev')}</span></button>
        <button data-act="claude" data-kind="travel"><span class="li-ico">${icon('box')}</span><span class="li-body"><b>삿포로 여행 단어 팩</b><span>공항·전철·렌터카·식당·편의점·온천</span></span><span class="li-end">${icon('chev')}</span></button>
        <button data-act="claude" data-kind="hints"><span class="li-ico">${icon('spark')}</span><span class="li-body"><b>새 연상 힌트 받기</b><span>마음에 드는 힌트로 바꿔요</span></span><span class="li-end">${icon('chev')}</span></button>
        <button data-act="claude" data-kind="free"><span class="li-ico">${icon('spark')}</span><span class="li-body"><b>자유롭게 묻기</b><span>내 기록 요약을 붙여서 질문해요</span></span><span class="li-end">${icon('chev')}</span></button>
      </div>
      ${(db.packs || []).length ? `<h2 class="h2 section">가져온 단어 팩</h2><div class="list">${db.packs.map(p => `<div class="li"><span class="li-body"><b>${esc(p.name)}</b><span>${p.words.length}개 · ${esc(p.words.slice(0, 6).map(w => w.text).join(' '))}</span></span><button class="btn sm danger" data-act="del-pack" data-id="${esc(p.id)}">빼기</button></div>`).join('')}</div>` : ''}
      <h2 class="h2 section">백업</h2><div class="list">
        <div class="li"><span class="li-body"><b>기록 내보내기</b><span>다른 기기·새 주소로 옮길 때 JSON을 저장해 두세요. 예전 가나연습실 백업도 가져올 수 있어요.</span></span><div class="row"><button class="btn sm primary" data-act="export-json">JSON 저장</button><button class="btn sm" data-act="csv">CSV</button></div></div>
        <div class="li"><span class="li-body"><b>백업 가져오기 · 합치기</b><span id="backupStatus">같은 기록은 한 번만 들어가요. 문제가 있는 기록은 들어가지 않고, 지금 기록은 그대로예요.</span></span><div class="row"><label class="btn sm"><input type="file" id="importFile" accept=".json,application/json" class="vh">파일 고르기</label><button class="btn sm" data-act="paste-import">붙여 넣기</button></div></div>
      </div>
      <h2 class="h2 section">기록 지우기</h2><div class="list"><div class="li"><span class="li-body"><b>모든 학습 기록 삭제</b><span>백업이 없으면 되돌릴 수 없어요. 예전 가나연습실 저장 공간(kana-lab-v1)은 건드리지 않아요.</span></span><button class="btn sm danger" data-act="reset">삭제</button></div></div>
      <p class="small section">일본어 한걸음 · 데이터 ${esc(D.VERSION)} · 가나 ${D.KANA.length}개 · 기본 단어 ${D.WORDS.length}개<br>획 데이터 KanjiVG (Ulrich Apel, CC BY-SA 3.0) · 글꼴 Klee One, Pretendard (SIL OFL 1.1) · 한글 발음은 근사 표기예요(원어민 검수 전).</p>`;
    $('#importFile').onchange = importBackup;
  }
  async function importBackup(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 30e6) { $('#backupStatus').textContent = '가져오지 못했어요: 30MB 이하 백업 파일을 골라 주세요. 지금 기록은 바뀌지 않았어요.'; return; }
    importText(await f.text());
  }
  function pasteImportSheet() {
    openSheet(`<div class="sheet-head"><h2 class="h2" style="margin:0">붙여 넣어 가져오기</h2><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <p class="small">복사해 둔 백업 JSON 전체를 붙여 넣으세요. 같은 기록은 한 번만 들어가고, 지금 기록은 지워지지 않아요.</p><textarea id="pasteText" style="min-height:200px"></textarea>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="paste-import-go">가져오기</button></div><p class="small" id="pasteMsg"></p>`);
  }
  function importText(text) {
    const st = $('#backupStatus') || $('#pasteMsg'), msg = t => { if ($('#backupStatus')) $('#backupStatus').textContent = t; if ($('#pasteMsg')) $('#pasteMsg').textContent = t; };
    try {
      const copy = JSON.parse(JSON.stringify(db)); // 실패하면 원래 기록을 그대로 두기 위해 사본에서 먼저 합침
      const r = S.mergeBackup(copy, text);
      db.attempts = copy.attempts; db.sessions = copy.sessions; db.packs = copy.packs; db.quarantine = copy.quarantine;
      reindex(); save();
      msg(`${r.added}개 기록을 합쳤어요${r.duplicates ? ` (이미 있던 ${r.duplicates}개는 건너뜀)` : ''}${r.rejected > 0 ? ` · 형식이 맞지 않는 ${r.rejected}개는 넣지 않았어요` : ''}.`);
      toast('백업을 합쳤어요.');
    } catch (err) { msg('가져오지 못했어요: ' + err.message + ' 지금 기록은 바뀌지 않았어요.'); }
  }
  function claudeSheet(kind) {
    const title = { plan: '약점 분석과 이번 주 계획', pack: '약한 글자로 단어 팩', travel: '삿포로 여행 단어 팩', hints: '새 연상 힌트', free: '자유롭게 묻기' }[kind];
    const imp = kind === 'pack' || kind === 'travel' || kind === 'hints';
    openSheet(`<div class="sheet-head"><h2 class="h2" style="margin:0">${title}</h2><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <div class="form" style="margin-top:14px">
        ${kind === 'free' ? `<div class="field"><label for="q">질문</label><textarea id="q" style="min-height:90px" placeholder="예: ぬ와 め를 어떻게 구별하면 좋을까요?"></textarea></div>` : ''}
        <div class="field"><label for="prompt">클로드에게 보낼 글</label><textarea id="prompt" readonly></textarea><p class="small">글자·정답률·날짜만 들어가요. 내가 입력한 답이나 기기 정보는 넣지 않아요.</p></div>
        <div class="row"><button class="btn primary" data-act="claude-copy">복사</button><a class="btn" id="openWeb" href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai에서 열기</a><a class="btn ghost" id="openDesk" href="claude://claude.ai/new">데스크톱 앱에서 열기</a></div>
        <p class="small" style="margin:0">claude.ai 주소로 열 때 입력칸이 채워지는지는 확인하지 못했어요. 비어 있으면 복사한 글을 붙여 넣으세요. 데스크톱 앱 링크는 Claude 공식 도움말에 나온 방식이에요.</p>
        ${imp ? `<div class="field" style="margin-top:8px"><label for="reply">클로드의 답(JSON)을 붙여 넣기</label><textarea id="reply" placeholder="코드 블록을 통째로 붙여 넣어도 돼요"></textarea></div><button class="btn primary" data-act="claude-import" data-kind="${kind}">가져오기</button><p class="small" id="importMsg"></p>` : ''}
      </div>`);
    const fill = () => { const t = C.buildPrompt(kind, C.summarize(db, D.KANA, allWords()), { question: $('#q') ? $('#q').value : '' }) || ''; $('#prompt').value = t; $('#openWeb').href = C.openUrl(t) || 'https://claude.ai/new'; $('#openDesk').href = C.desktopUrl(t) || 'claude://claude.ai/new'; };
    fill(); if ($('#q')) $('#q').addEventListener('input', fill);
  }
  function claudeImport(kind) {
    const text = $('#reply').value, msg = $('#importMsg');
    if (kind === 'hints') {
      const r = C.parseHints(text, D.KANA);
      if (!r.ok) { msg.textContent = r.errors.join(' '); return; }
      db.hints = Object.assign(db.hints || {}, r.hints); save();
      msg.textContent = `${Object.keys(r.hints).length}개 힌트를 바꿨어요.` + (r.errors.length ? ' ' + r.errors.slice(0, 3).join(' ') : ''); return;
    }
    const r = C.parsePack(text, D.WORDS);
    if (!r.ok) { msg.textContent = (r.errors[0] || '가져올 단어가 없어요.') + (r.skipped ? ` 기본 단어와 겹친 ${r.skipped}개는 건너뛰었어요.` : ''); return; }
    db.packs = db.packs || []; db.packs.push(r.pack); save();
    msg.textContent = `‘${r.pack.name}’ ${r.pack.words.length}개를 넣었어요.${r.skipped ? ` 기본 단어와 겹친 ${r.skipped}개는 건너뜀.` : ''}${r.errors.length ? ' ' + r.errors.slice(0, 2).join(' ') : ''}`;
  }

  // ── 누르기 처리 (위임) ──
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-seg]'); if (!b) return;
    if (b.dataset.seg) return onSeg(b.dataset.seg, b.dataset.v, b);
    const act = b.dataset.act, v = b.dataset.v;
    switch (act) {
      case 'onboard': setSetting('script', v); setSetting('onboarded', true); $('#app').classList.remove('focus'); go('today'); break;
      case 'today': startSession({ mode: 'read', study: 'adaptive' }); break;
      case 'setup': setupSheet(b.dataset.mode); break;
      case 'start': startSession({ mode: b.dataset.mode || $('#sheet').dataset.mode, study: b.dataset.study }); break;
      case 'range': { const s = set(); let r = s.range.includes(v) ? s.range.filter(x => x !== v) : [...s.range, v]; if (!r.length) { toast('범위를 하나 이상 남겨 주세요.'); return; } setSetting('range', r); b.setAttribute('aria-pressed', String(r.includes(v))); if (view === 'today') renderToday(); break; }
      case 'add-range': setSetting('range', [...new Set([...set().range, v])]); renderToday(); toast('범위에 탁음·반탁음을 더했어요.'); break;
      case 'close': closeSheet(); break;
      case 'skip': $('#view').focus(); break;
      case 'end': if (endSession(false)) go('result'); break;
      case 'intro-done': nextQuestion(); break;
      case 'next': if (sess && sess.answered) nextQuestion(); break;
      case 'unknown': record(false, '모르겠어요', 'unknown'); break;
      case 'pick': { if (!sess || sess.answered) return; const o = sess.opts[+b.dataset.i]; sess.pickedId = o.id; record(o.id === sess.q.id, o.text, 'pick'); break; }
      case 'hesitant': if (sess && sess.last) { sess.last.hesitant = !sess.last.hesitant; save(); b.setAttribute('aria-pressed', String(sess.last.hesitant)); b.textContent = sess.last.hesitant ? '헷갈림으로 표시함' : '사실 헷갈렸어요'; } break;
      case 'grade': gradeWrite(); break;
      case 'reveal': if (sess && !sess.answered) { sess.revealed = true; $('#ghost').classList.add('on'); b.disabled = true; toast('정답을 보고 쓰면 복습할 글자로 기록돼요.'); } break;
      case 'tool': if (pad) { pad.setTool(v); $$('[data-act="tool"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === v))); } break;
      case 'undo': pad && pad.undo(); updateTools(); break;
      case 'redo': pad && pad.redo(); updateTools(); break;
      case 'clear': pad && pad.clear(); updateTools(); break;
      case 'fix': fixJudgement(v === '1'); break;
      case 'retry-wrongs': { const r = lastResult; const pool = [...new Map(r.wrongs.map(w => [w.id, w])).values()]; startSession({ mode: r.mode, study: 'normal', pool, script: r.script }); break; }
      case 'go': go(v); break;
      case 'go-stats': statSession = v; statMode = 'all'; go('stats'); break;
      case 'detail': detailSheet(b.dataset.id); break;
      case 'replay': $('#strokeBox').innerHTML = strokeSVG(b.dataset.t); break;
      case 'drill': { const k = D.KANA.find(x => x.id === b.dataset.id); const m = b.dataset.mode; startSession({ mode: m, study: 'normal', pool: m === 'pair' ? [k] : [k, ...partnersOf(k, 2)], script: k.script }); break; }
      case 'more-stats': statLimit += 60; renderStats(); break;
      case 'more-due': dueLimit += 60; renderStats(); break;
      case 'csv': exportCSV(); break;
      case 'export-json': exportSheet('기록 백업', 'hangeoreum-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(db), 'application/json'); break;
      case 'export-samples': exportSheet('필기 표본', 'hangeoreum-handwriting-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ kind: 'handwriting-samples', version: 1, samples: db.samples || [], mine: db.mine || {} }), 'application/json'); break;
      case 'clear-mine': ask('내 글씨 본보기를 모두 지울까요? 기록(정오)은 그대로예요.', '지우기', true).then(y => { if (y) { db.mine = {}; save(); renderSettings(); } }); break;
      case 'del-pack': { const id = b.dataset.id; ask('이 단어 팩을 뺄까요? 이미 푼 기록은 남아요.', '빼기', true).then(y => { if (y) { db.packs = db.packs.filter(p => p.id !== id); save(); renderSettings(); } }); break; }
      case 'reset': ask('모든 학습 기록을 삭제할까요? 백업이 없으면 되돌릴 수 없어요.', '모두 삭제', true).then(y => { if (y) { const keep = db.settings; db = store.db = S.emptyDB(); db.settings = keep; reindex(); save(); toast('기록을 삭제했어요.'); renderSettings(); } }); break;
      case 'claude': claudeSheet(b.dataset.kind); break;
      case 'claude-copy': copyText($('#prompt').value).then(() => toast('복사했어요. 클로드에 붙여 넣으세요.')); break;
      case 'copy-export': copyText($('#exportText').value).then(() => toast('복사했어요.')); break;
      case 'paste-import': pasteImportSheet(); break;
      case 'paste-import-go': importText($('#pasteText').value); break;
      case 'claude-import': claudeImport(b.dataset.kind); break;
      case 'raw-download': exportSheet('읽지 못한 원본', 'hangeoreum-unreadable-original-' + Date.now() + '.txt', store.corrupt.raw, 'text/plain'); break;
      case 'go-backup': go('prefs'); break;
      case 'set-aside': ask('읽지 못한 원본을 다른 이름으로 이 브라우저에 보관하고 새로 시작할까요? 원본을 먼저 내려받아 두는 걸 권해요.', '따로 보관하고 새로 시작').then(y => { if (y) { if (store.setAsideCorrupt()) { db = store.db; reindex(); toast('원본을 따로 보관했어요: ' + store.savedAside); render(); } else toast('보관하지 못했어요: ' + store.lastError); } }); break;
    }
  });
  function onSeg(name, v, b) {
    const group = b.parentElement; group.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    switch (name) {
      case 'script': setSetting('script', v); if (view === 'today' && $('#sheet').hidden) renderToday(); break;
      case 'typeKind': setSetting('typeKind', v); setupSheet('typing'); break;
      case 'study': setSetting('study', v); setupSheet($('#sheet').dataset.mode); break;
      case 'mapScript': mapScript = v; renderMap(); break;
      case 'mapMode': mapMode = v; renderMap(); break;
      case 'statMode': statMode = v; statLimit = 40; dueLimit = 40; renderStats(); break;
      case 'newLimit': setSetting('newLimit', +v); break;
      case 'tolerance': setSetting('tolerance', v); break;
      case 'palm': setSetting('palm', v); break;
      case 'wordsFirst': case 'usePacks': case 'collect': case 'learnMine': setSetting(name, v === '1'); renderSettings(); break;
    }
  }
  // 키보드: 엔터로 다음/채점, 쓰기 단축키
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#sheet').hidden) { closeSheet(); return; }
    if (!sess || view !== 'play') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && tag !== 'textarea' && !(tag === 'input' && !sess.answered)) {
      if (tag === 'button' && e.target.dataset.act && e.target.dataset.act !== 'next') return; // 버튼 자체 동작에 맡김
      e.preventDefault();
      if (sess.answered) { if (performance.now() - sess.guard > 250) nextQuestion(); }
      else if (sess.mode === 'write' && pad) gradeWrite();
      return;
    }
    if (sess.mode === 'write' && pad && !sess.answered) {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? pad.redo() : pad.undo(); updateTools(); }
      else if (!e.ctrlKey && !e.metaKey && (k === 'e' || k === 'p')) { const v = k === 'e' ? 'eraser' : 'pen'; pad.setTool(v); $$('[data-act="tool"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === v))); }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!sess) return;
    if (document.hidden) sess.hiddenAt = performance.now();
    else if (sess.hiddenAt) { sess.hidden += performance.now() - sess.hiddenAt; sess.hiddenAt = 0; }
  });
  window.addEventListener('beforeunload', () => { if (sess) { const rec = db.sessions.find(x => x.id === sess.id); if (rec) { rec.end = new Date().toISOString(); rec.n = sess.n; rec.c = sess.c; save(); } } });

  if (store.status === 'migrated' && db.attempts.length) setTimeout(() => toast(`예전 가나연습실 기록 ${db.attempts.length}개를 옮겨 왔어요. 원래 기록도 그대로 있어요.`), 400);
  window.KanaApp = { get db() { return db; }, get sess() { return sess; }, store, startSession, go, get pad() { return pad; } };
  render();
})();
