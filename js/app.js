// 앱 뼈대 — 저장소 연결, 공용 도구, 화면 길잡이, 누르기 처리. 화면별 코드는 app-play / app-pages / app-coach 에 있어요.
(function () {
  'use strict';
  const { data: D, store: S, sched: SC, stats: ST } = KL;
  const A = KL.app = { VERSION: '0.2.1', pages: {}, acts: {}, segs: {} };
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const icon = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;

  // ── 화면에 쓰는 말 ──
  A.MODE_KO = { read: '읽기', write: '쓰기', typing: '단어 읽기', pair: '헷갈리는 글자', course: '오늘 공부', placement: '아는 글자 확인' };
  A.SCRIPT_KO = { h: '히라가나', k: '가타카나', mix: '둘 다' };
  A.GROUP_KO = { basic: '기본 글자', voiced: '탁음·반탁음', yoon: '요음', ext: '외래어 표기' };
  A.STAGE_KO = ['안 배움', '방금 배움', '익히는 중', '익숙해짐', '외움', '잘 외움', '완전히 외움'];
  A.TOL_KO = { strict: '엄격하게', normal: '보통', relaxed: '너그럽게' };

  // ── 저장소 ──
  function safeLS() { try { const k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _memory: true }; } }
  const LS = A.LS = safeLS();
  const store = A.store = S.makeStore(LS);
  A.db = store.db; A.idx = SC.makeIndex(A.db.attempts);
  const DEF = { script: 'h', newLimit: 5, tolerance: 'relaxed', palm: 'auto', range: ['basic'], wordsFirst: true, usePacks: true, collect: true, learnMine: true, study: 'adaptive', typeKind: 'words', auto: false, courseWrite: true };
  const set = A.set = () => ({ ...DEF, ...A.db.settings });
  A.setSetting = (k, v) => { A.db.settings[k] = v; save(); };
  function save() { const ok = store.save(); if (!ok && !store.corrupt) toast('이 브라우저에 저장하지 못했어요. 설정에서 기록을 백업해 주세요.'); return ok; }
  A.save = save;
  A.reindex = () => { A.idx = SC.makeIndex(A.db.attempts); A.confCache = null; };
  if (S.recoverSessions(A.db)) save();

  // ── 글자·단어 ──
  A.hintOf = it => (A.db.hints && A.db.hints[it.text]) || it.hint || '';
  function packWords() {
    if (!set().usePacks) return [];
    const out = [];
    for (const p of A.db.packs || []) for (const w of p.words) out.push({ id: 'w:' + w.text, text: w.text, answers: w.answers, meaning: w.meaning || '', script: /[ァ-ヺ]/.test(w.text) ? 'k' : 'h', kind: 'word', group: 'word', pack: p.name });
    return out;
  }
  A.allWords = () => { const m = new Map(); for (const w of [...D.WORDS, ...packWords()]) if (!m.has(w.id)) m.set(w.id, w); return [...m.values()]; };
  A.kanaPool = (script, range) => D.KANA.filter(k => range.includes(k.group) && (script === 'mix' || k.script === script));
  A.wordPool = script => A.allWords().filter(w => script === 'mix' || w.script === script);
  const byText = new Map(); for (const k of D.KANA) if (!byText.has(k.text)) byText.set(k.text, k);
  A.kanaByText = t => byText.get(t);
  A.confCache = null;
  A.conf = () => A.confCache || (A.confCache = ST.confusions(A.db.attempts)); // 내가 실제로 헷갈린 짝 (기록이 바뀌면 다시 셈)
  const bare = t => t.normalize('NFD').replace(/[゙゚]/g, '');
  // 헷갈리는 글자 후보: 내가 실제로 헷갈린 짝 → 모양이 비슷한 묶음 → 탁점·반탁점만 다른 글자 → 같은 묶음에서 아무 글자
  A.partnersOf = (item, n = 2) => {
    if (item.kind !== 'kana') return [];
    const out = [], add = k => { if (k && k.id !== item.id && !out.some(o => o.id === k.id)) out.push(k); };
    for (const c of A.conf()) { if (c.a === item.text) add(byText.get(c.b)); else if (c.b === item.text) add(byText.get(c.a)); }
    for (const p of D.PAIRS) if (p.includes(item.text)) for (const c of p) if (c !== item.text) add(byText.get(c));
    for (const k of D.KANA) if (k.script === item.script && [...k.text].length === [...item.text].length && bare(k.text) === bare(item.text)) add(k);
    const real = out.length;
    if (out.length < n) for (const k of SC.shuffle(D.KANA.filter(k => k.script === item.script && k.group === item.group))) { if (out.length >= n) break; add(k); }
    const res = out.slice(0, n); res.real = Math.min(real, n);
    return res;
  };
  A.hasPartner = item => item.kind === 'kana' && (D.PAIRS.some(p => p.includes(item.text)) || D.KANA.some(k => k.id !== item.id && k.script === item.script && [...k.text].length === [...item.text].length && bare(k.text) === bare(item.text)));
  A.confusable = item => { if (item.kind !== 'kana') return null; const p = D.PAIRS.find(x => x.includes(item.text)); if (!p) return null; return D.KANA.find(k => k.script === item.script && k.text !== item.text && p.includes(k.text)) || null; };
  A.knownKana = () => { const s = new Set(); for (const k of D.KANA) if (A.idx.get(k.id, 'read').some(a => a.correct && !a.assisted)) s.add(k.text); return s; };

  // ── 작은 도구 ──
  let toastTimer = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3000); }
  function download(name, text, type) { try { const b = text instanceof Blob ? text : new Blob([text], { type }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch (e) { } }
  const fmt = t => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtFull = t => new Date(t).toLocaleString('ko-KR');
  function whenDue(t) { if (!t) return '아직'; const n = t - Date.now(); if (n <= 0) return '지금'; if (n < 36e5) return Math.ceil(n / 6e4) + '분 뒤'; if (n < 864e5) return Math.ceil(n / 36e5) + '시간 뒤'; return Math.ceil(n / 864e5) + '일 뒤'; }
  function seg(name, opts, value, attrs = '') { return `<div class="seg" role="group" ${attrs}>${opts.map(([v, l]) => `<button type="button" data-seg="${esc(name)}" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div>`; }
  function copyText(t) { return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); }); }
  function notice() {
    if (store.corrupt) return `<div class="note bad" role="alert"><b>저장된 기록을 읽지 못했어요.</b> 원본은 지우거나 덮어쓰지 않고 그대로 두었어요. 지금 푸는 문제는 저장되지 않아요.
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="raw-download">원본 내려받기</button><button class="btn sm" data-act="go" data-v="prefs">백업에서 가져오기</button><button class="btn sm" data-act="set-aside">원본은 따로 두고 새로 시작</button></div></div>`;
    if (LS._memory) return `<div class="note" role="alert">이 브라우저가 기록 저장을 막고 있어요(개인 정보 보호 모드일 수 있어요). 창을 닫기 전에 설정에서 기록을 백업해 주세요.</div>`;
    return '';
  }
  Object.assign(A, { $, $$, esc, uuid, icon, toast, download, fmt, fmtFull, whenDue, seg, copyText, notice });

  // ── 옆·아래에서 나오는 판 ──
  let sheetClose = null, sheetOpener = null;
  A.openSheet = (html, onClose) => {
    const sh = $('#sheet'), bd = $('#backdrop');
    sheetOpener = document.activeElement;
    sh.innerHTML = html; sh.hidden = false; bd.hidden = false; sheetClose = onClose || null; sh.scrollTop = 0;
    requestAnimationFrame(() => { sh.classList.add('on'); bd.classList.add('on'); });
    const f = sh.querySelector('[autofocus]') || sh.querySelector('button, a[href], textarea, input'); if (f) f.focus({ preventScroll: true });
  };
  A.closeSheet = () => {
    const sh = $('#sheet'), bd = $('#backdrop'); if (sh.hidden) return;
    sh.classList.remove('on'); bd.classList.remove('on');
    setTimeout(() => { if (!sh.classList.contains('on')) { sh.hidden = true; bd.hidden = true; sh.innerHTML = ''; } }, 240);
    if (sheetClose) { const f = sheetClose; sheetClose = null; f(); }
    if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
  };
  $('#backdrop').addEventListener('click', () => A.closeSheet());
  // 확인 판 (브라우저 confirm은 미리보기 틀에서 막힘)
  A.ask = (msg, ok, danger) => new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; res(v); };
    A.openSheet(`<h2 class="h2">${esc(msg)}</h2><div class="row" style="margin-top:22px"><button class="btn ${danger ? 'danger-solid' : 'primary'}" id="askOk">${esc(ok)}</button><button class="btn ghost" id="askNo">취소</button></div>`, () => fin(false));
    $('#askOk').onclick = () => { fin(true); A.closeSheet(); }; $('#askNo').onclick = () => A.closeSheet();
  });
  // 내보내기: 파일 저장이 막힌 곳을 위해 복사할 수 있는 판도 같이
  A.exportSheet = (title, name, text, type) => {
    download(name, text, type);
    A.openSheet(`<div class="sheet-head"><h2 class="h2">${esc(title)}</h2><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <p class="small">파일이 저장되지 않았다면 아래 내용을 복사해서 메모 앱에 붙여 두세요. 다시 넣을 때는 설정 → 기록 가져오기 → 붙여 넣기를 쓰면 돼요.</p>
      <textarea id="exportText" readonly style="min-height:200px">${esc(text.length > 2e6 ? text.slice(0, 2e6) : text)}</textarea>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="copy-export">${icon('copy')}복사</button></div>`);
  };

  // ── 화면 길잡이 ──
  A.view = '';
  A.go = v => { if (location.hash !== '#' + v) location.hash = v; else render(); };
  const OLD = { map: 'chart', settings: 'prefs' };
  function render() {
    let h = (location.hash || '#today').slice(1);
    if (OLD[h]) { h = OLD[h]; history.replaceState(null, '', '#' + h); }
    if (!set().onboarded && !A.db.attempts.length && !store.corrupt) h = 'welcome';
    if (h === 'play' && !A.sess) { history.replaceState(null, '', '#today'); h = 'today'; }
    if (!A.pages[h]) h = 'today';
    A.view = h;
    const focus = h === 'play' || h === 'welcome';
    $('#app').classList.toggle('focus', focus);
    $$('.rail a').forEach(a => { const on = a.dataset.nav === h || (h === 'result' && a.dataset.nav === 'today'); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    A.pages[h]();
    if (h !== 'play') window.scrollTo(0, 0);
  }
  A.render = render;
  window.addEventListener('hashchange', () => {
    if (A.sess && location.hash !== '#play') {
      const to = location.hash; history.replaceState(null, '', '#play');
      if (!A.sess.n) { A.endSession(); history.replaceState(null, '', to); render(); return; }
      A.ask('공부를 여기서 끝낼까요? 지금까지 푼 문제는 저장돼 있어요.', '끝내기').then(y => { if (y) { A.endSession(); history.replaceState(null, '', to); render(); } });
      return;
    }
    A.closeSheet(); render();
  });

  // ── 누르기 처리 (한곳에서 받아 나눠 줌) ──
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-seg]'); if (!b || b.disabled) return;
    if (b.dataset.seg) { b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); const f = A.segs[b.dataset.seg]; if (f) f(b.dataset.v, b); return; }
    const f = A.acts[b.dataset.act]; if (f) f(b, b.dataset.v, e);
  });
  Object.assign(A.acts, {
    close: () => A.closeSheet(),
    skip: () => $('#view').focus(),
    go: (b, v) => A.go(v),
    'copy-export': () => copyText($('#exportText').value).then(() => toast('복사했어요.')),
    'raw-download': () => A.exportSheet('읽지 못한 원본', 'hangeoreum-unreadable-' + Date.now() + '.txt', store.corrupt.raw, 'text/plain'),
    'set-aside': () => A.ask('읽지 못한 원본을 이 브라우저 안에 따로 보관하고 새로 시작할까요? 먼저 원본을 내려받아 두는 걸 권해요.', '따로 두고 새로 시작').then(y => { if (!y) return; if (store.setAsideCorrupt()) { A.db = store.db; A.reindex(); toast('원본을 따로 보관했어요.'); render(); } else toast('보관하지 못했어요: ' + store.lastError); })
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) { e.preventDefault(); A.closeSheet(); } });

  // 손가락·펜을 쓸 수 있는 기기면 누르는 곳을 크게 (트랙패드를 붙인 아이패드도 포함되게 터치 지원 여부로 판단)
  A.touch = (navigator.maxTouchPoints || 0) > 0 || (typeof matchMedia === 'function' && matchMedia('(any-pointer: coarse)').matches);
  document.documentElement.classList.toggle('touch', A.touch);
  // 화면 키보드가 올라와도 문제와 입력칸이 보이게 — 보이는 높이를 CSS 변수로
  const vv = window.visualViewport;
  function setVH() {
    const h = vv ? vv.height : window.innerHeight, kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0, st = document.documentElement.style;
    st.setProperty('--vvh', h + 'px'); st.setProperty('--kb', (kb > 80 ? kb : 0) + 'px'); // 80px 넘게 줄면 화면 키보드로 봄
    if (A.view === 'play' && kb > 80) window.scrollTo(0, 0);
  }
  if (vv) { vv.addEventListener('resize', setVH); vv.addEventListener('scroll', setVH); } window.addEventListener('resize', setVH); setVH();

  // 인터넷 없이도 열리게 (GitHub Pages·내 컴퓨터에서만; 미리보기 틀에서는 건너뜀)
  A.offline = { state: 'none' };
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      A.offline.state = 'on';
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('새 판을 받았어요. 앱을 닫았다 열면 바뀌어요.'); }); });
    }).catch(() => { A.offline.state = 'failed'; });
  }

  window.KanaApp = A;
  // 다른 파일이 화면을 다 등록한 뒤에 첫 화면을 그림
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') setTimeout(render, 0);
  if (store.status === 'migrated' && A.db.attempts.length) setTimeout(() => toast(`예전 가나연습실 기록 ${A.db.attempts.length}개를 가져왔어요.`), 500);
})();
