// 기기 맞추기 — 같은 '맞추기 열쇠'를 넣은 기기끼리 공부 기록을 합침 (서버: sync-server/worker.js, Cloudflare 무료 플랜)
// 원칙: 기록은 id로 합치기만 함(같은 id는 마지막으로 고친 내용). 숫자를 고치거나 지우지 않음.
//       인터넷이 없으면 '보낼 것'에 모아 두었다가 다음에 보냄. 손글씨 표본·내 글씨체·힌트는 기기마다 따로(크고 기기마다 다름).
(function () {
  'use strict';
  const A = KL.app, S = KL.store;
  const { $, esc, toast } = A;
  const LSKEY = 'hangeoreum-sync';
  const URL0 = 'https://hangeoreum-sync.dragon940111.workers.dev'; // 배포한 Worker 주소
  const KEY_RE = /^hg-[a-z2-7]{24}$/;
  const LOCAL_ONLY = ['palm']; // 기기마다 다른 설정(아이패드는 펜, 휴대폰은 손가락)
  const url = () => { try { return window.__SYNC_URL || A.LS.getItem('hangeoreum-sync-url') || URL0; } catch (e) { return URL0; } };

  function load() {
    try {
      const v = JSON.parse(A.LS.getItem(LSKEY) || 'null');
      if (v && KEY_RE.test(v.key || '')) return { key: v.key, seq: Number.isSafeInteger(v.seq) ? v.seq : 0, out: Array.isArray(v.out) ? v.out.filter(x => Array.isArray(x) && x.length === 2 && typeof x[1] === 'string') : [], full: !!v.full, last: v.last || '', setAt: v.setAt || '' };
    } catch (e) { }
    return null;
  }
  let st = load(), busy = false, again = false, timer = 0, state = st ? 'idle' : 'off', lastErr = '';
  const persist = () => { try { if (st) A.LS.setItem(LSKEY, JSON.stringify({ key: st.key, seq: st.seq, out: st.out, full: st.full, last: st.last, setAt: st.setAt })); else A.LS.removeItem(LSKEY); } catch (e) { } };
  const outSet = () => new Set(st.out.map(x => x[0] + '|' + x[1]));

  function newKey() { const abc = 'abcdefghijklmnopqrstuvwxyz234567', b = new Uint8Array(24); crypto.getRandomValues(b); return 'hg-' + [...b].map(x => abc[x & 31]).join(''); }

  // ── 바뀐 것 표시(보낼 것에 넣기) ──
  function mark(k, id) {
    if (!st || !id) return; const s = outSet(); if (!s.has(k + '|' + id)) { st.out.push([k, String(id)]); persist(); }
    soon(A.sess ? 5000 : 3000);
  }
  function markSettings() { if (!st) return; st.setAt = new Date().toISOString(); mark('set', 'all'); }
  function markAll() { if (!st) return; st.full = true; persist(); soon(2000); }
  function soon(ms) { if (!st) return; clearTimeout(timer); timer = setTimeout(run, ms); }

  // 보낼 내용 만들기
  function bodyOf(k, id, maps) {
    if (k === 'a') { const a = maps.a.get(id); return a ? JSON.stringify(a) : null; }
    if (k === 's') { const s = maps.s.get(id); return s ? JSON.stringify(s) : null; }
    if (k === 'p') { const p = maps.p.get(id); return p ? JSON.stringify(p) : null; }
    if (k === 'set') { const out = { ...A.db.settings }; for (const x of LOCAL_ONLY) delete out[x]; return JSON.stringify({ at: st.setAt || new Date(0).toISOString(), settings: out }); }
    return null;
  }

  // ── 받은 것 합치기 (받은 내용은 남이 보낸 것이라 앱의 검사를 그대로 거침) ──
  function apply(items) {
    let added = 0, changed = 0;
    if (!items.length) return { added, changed }; // 받은 것이 없으면 아무것도 훑지 않음
    const ai = new Map(A.db.attempts.map((a, i) => [a.id, i])), si = new Map(A.db.sessions.map((s, i) => [s.id, i])), pi = new Map((A.db.packs || []).map((p, i) => [p.id, i]));
    const put = (arr, idx, v, b, onChange) => { const i = idx.get(v.id); if (i === undefined) { arr.push(v); idx.set(v.id, arr.length - 1); return 1; } if (JSON.stringify(arr[i]) !== b) { const o = arr[i]; for (const k of Object.keys(o)) delete o[k]; Object.assign(o, v); changed++; if (onChange) onChange(o); } return 0; };
    // 기록 색인은 다시 만들지 않고 새 것만 더함(1만 개를 다 훑으면 느린 기기에서 0.5초 멈췄음). 시간 순서가 어긋난 글자만 그 글자 목록을 정렬
    const lastT = A.db.attempts.length ? Date.parse(A.db.attempts[A.db.attempts.length - 1].time) : 0;
    let outOfOrder = false; const resort = new Map();
    for (const it of items) {
      let v; try { v = JSON.parse(it.b); } catch (e) { continue; }
      if (it.k === 'a') {
        if (S.checkAttempt(v)) continue;
        const n = put(A.db.attempts, ai, v, it.b, o => A.idx.touch(o.itemId, o.mode));
        if (n) { added++; const t = Date.parse(v.time); if (t < lastT) outOfOrder = true; const list = A.idx.get(v.itemId, v.mode); if (list.length && Date.parse(list[list.length - 1].time) > t) resort.set(v.itemId + '|' + v.mode, [v.itemId, v.mode]); A.idx.push(v); }
      }
      else if (it.k === 's') { if (S.checkSession(v)) continue; if (put(A.db.sessions, si, v, it.b)) changed++; }
      else if (it.k === 'p') { if (!S.checkPack(v)) continue; A.db.packs = A.db.packs || []; if (put(A.db.packs, pi, v, it.b)) changed++; }
      else if (it.k === 'set') {
        if (!v || typeof v.at !== 'string' || !v.settings || typeof v.settings !== 'object') continue;
        if (v.at > (st.setAt || '')) { const keep = {}; for (const x of LOCAL_ONLY) if (x in A.db.settings) keep[x] = A.db.settings[x]; A.db.settings = { ...S.sanitizeSettings(v.settings), ...keep }; st.setAt = v.at; changed++; }
      }
    }
    if (outOfOrder) A.db.attempts.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    for (const [id, mode] of resort.values()) { A.idx.get(id, mode).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)); A.idx.touch(id, mode); }
    if (added || changed) A.confCache = null;
    return { added, changed };
  }

  // ── 한 번 맞추기: 보낼 것을 200개씩 보내면서 그 뒤에 바뀐 것을 받아 옴 ──
  // opts.leaving: 창이 닫히거나 숨겨질 때(작으면 keepalive로 — 창이 닫혀도 끝까지 보냄)
  async function run(opts = {}) {
    if (!st) return { ok: false, why: 'off' };
    if (busy) { again = true; return { ok: false, why: 'busy' }; }
    busy = true; clearTimeout(timer); state = 'syncing'; refreshUI();
    let got = 0, sent = 0, changed = 0;
    try {
      // 찾아보기 표는 보낼 것이 있을 때만 만듦(기록이 많을 때 30초마다 1만 개를 훑지 않게)
      let maps = null; const mapsOf = () => maps || (maps = { a: new Map(A.db.attempts.map(a => [a.id, a])), s: new Map(A.db.sessions.map(s => [s.id, s])), p: new Map((A.db.packs || []).map(p => [p.id, p])) });
      let fullList = st.full ? [...A.db.attempts.map(a => ['a', a.id]), ...A.db.sessions.map(s => ['s', s.id]), ...(A.db.packs || []).map(p => ['p', p.id]), ['set', 'all']] : [];
      for (let round = 0; round < 400; round++) {
        const take = [], fromOut = Math.min(st.out.length, 200);
        for (let i = 0; i < fromOut; i++) take.push(st.out[i]);
        const fromFull = fullList.slice(0, 200 - take.length);
        const push = [];
        for (const [k, id] of [...take, ...fromFull]) { const b = bodyOf(k, id, mapsOf()); if (b && b.length <= 20000) push.push({ k, id, b }); }
        // 공부하는 중이거나 창을 떠날 때는 보내기만(받은 기록으로 푸는 화면이 바뀌지 않게) — since를 가장 큰 수로 주면 서버가 아무것도 돌려주지 않음
        const pushOnly = !!A.sess || !!opts.leaving;
        const body = JSON.stringify({ since: pushOnly ? Number.MAX_SAFE_INTEGER : st.seq, push });
        const res = await fetch(url() + '/v1/sync', { method: 'POST', headers: { 'Authorization': 'Bearer ' + st.key, 'Content-Type': 'application/json' }, body, keepalive: !!opts.leaving && body.length < 60000 });
        if (res.status === 401) throw Object.assign(Error('열쇠가 맞지 않아요'), { code: 'key' });
        if (!res.ok) throw Error('서버 ' + res.status);
        const r = await res.json(); if (!r || !r.ok) throw Error((r && r.error) || '서버 응답이 이상해요');
        // 보낸 것 지우기(보내는 사이 새로 들어온 것은 남김)
        st.out.splice(0, fromOut); fullList = fullList.slice(fromFull.length); sent += push.length;
        if (!pushOnly) { const ap = apply(r.items || []); got += ap.added; changed += ap.changed; if (Number.isSafeInteger(r.seq) && r.seq > st.seq) st.seq = r.seq; }
        persist();
        if ((pushOnly || !r.more) && !st.out.length && !fullList.length) break;
      }
      st.full = false; st.last = new Date().toISOString(); state = 'ok'; lastErr = ''; persist();
      if (got || changed) { A.saveSoon(); if (!A.sess && A.view !== 'play' && A.view !== 'prefs') A.render(); } // 저장은 화면을 그린 뒤
      return { ok: true, sent, got, changed };
    } catch (e) {
      state = navigator.onLine === false ? 'offline' : 'error'; lastErr = e.code === 'key' ? '열쇠가 맞지 않아요. 설정에서 다시 넣어 주세요.' : (navigator.onLine === false ? '인터넷이 없어서 나중에 맞춰요.' : '맞추지 못했어요. 나중에 다시 해요.');
      persist(); soon(120000);
      return { ok: false, why: String(e.message || e) };
    } finally {
      busy = false; refreshUI();
      if (again) { again = false; soon(1000); }
    }
  }

  function connect(key, isNew) {
    if (!KEY_RE.test(key)) return false;
    st = { key, seq: 0, out: [], full: true, last: '', setAt: isNew ? new Date().toISOString() : '' }; state = 'idle'; persist(); tick();
    return true;
  }
  function disconnect() { st = null; state = 'off'; clearTimeout(timer); clearTimeout(poll); persist(); refreshUI(); }
  const linkFor = key => location.href.split('#')[0] + '#sync=' + key;

  // ── 설정 화면 ──
  const fmtAgo = t => { if (!t) return '아직 안 맞춤'; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : A.fmt(t); };
  function statusLine() {
    if (!st) return '꺼져 있어요. 켜면 같은 열쇠를 넣은 기기끼리 기록이 합쳐져요.';
    const pend = st.out.length + (st.full ? 1 : 0);
    const s = { syncing: '맞추는 중…', ok: '켜짐', idle: '켜짐', offline: '켜짐 · 인터넷이 없어요', error: '켜짐 · 맞추지 못함' }[state];
    return `${s} · 마지막으로 맞춘 때 ${fmtAgo(st.last)}${pend ? ` · 보낼 것 ${st.full ? '전체' : pend + '개'}` : ''}${lastErr ? `<br><span class="wrong">${esc(lastErr)}</span>` : ''}`;
  }
  A.syncHTML = (li) => st
    ? `${li('기기 맞추기', `<span id="syncStatus">${statusLine()}</span>`, `<button class="btn sm primary" data-act="sync-now">지금 맞추기</button>`)}
       ${li('다른 기기 연결', '다른 기기에서 이 주소를 열면 바로 연결돼요. 주소에 열쇠가 들어 있으니 내 기기로만 보내세요(카톡 나에게 보내기·에어드롭 등).', `<div class="row"><button class="btn sm" data-act="sync-copy">연결 주소 복사</button><button class="btn sm" data-act="sync-show">열쇠 보기</button></div>`)}
       ${li('이 기기에서 끄기', '기록은 이 기기와 저장소에 그대로 남아요. 다시 켜려면 열쇠가 필요해요.', `<button class="btn sm danger" data-act="sync-off">끄기</button>`)}`
    : `${li('기기 맞추기', `<span id="syncStatus">${statusLine()}</span> 기록은 Cloudflare의 이 앱 전용 저장소에 올라가요(무료).`, `<div class="row"><button class="btn sm primary" data-act="sync-new">처음 켜기</button><button class="btn sm" data-act="sync-enter">열쇠 넣기</button></div>`)}`;
  function refreshUI() { const el = document.getElementById('syncStatus'); if (el) el.innerHTML = statusLine(); }

  const copy = text => A.copyText(text).then(() => true, () => false);
  Object.assign(A.acts, {
    'sync-new': () => A.ask('이 기기에서 기기 맞추기를 켤까요? 지금 이 기기의 공부 기록이 저장소에 올라가요. 다른 기기는 이어서 나오는 연결 주소나 열쇠로 연결해요.', '켜기').then(y => { if (!y) return; connect(newKey(), true); A.pages.prefs(); run().then(r => toast(r.ok ? '기기 맞추기를 켰어요. 다른 기기 연결에서 주소를 복사해 내 다른 기기로 보내세요.' : '켰지만 아직 맞추지 못했어요. 인터넷이 되면 다시 해요.')); }),
    'sync-enter': () => {
      A.openSheet(`<div class="sheet-head"><div><h2 class="h2">맞추기 열쇠 넣기</h2><p class="small">다른 기기의 설정 → 다른 기기 연결 → '열쇠 보기'에 나온 열쇠예요. hg-로 시작해요.</p></div></div>
        <div class="form"><input id="syncKey" class="input" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="latin" placeholder="hg-로 시작하는 27글자" aria-label="맞추기 열쇠"><p class="small" id="syncKeyMsg"></p>
        <div class="row"><button class="btn primary" data-act="sync-enter-ok">연결하기</button><button class="btn ghost" data-act="close">취소</button></div></div>`);
      setTimeout(() => { const i = $('#syncKey'); if (i) { i.focus(); i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) A.acts['sync-enter-ok'](); }; } }, 50);
    },
    'sync-enter-ok': () => { const k = ($('#syncKey').value || '').replace(/\s+/g, '').toLowerCase(); if (!connect(k, false)) { $('#syncKeyMsg').innerHTML = '<span class="wrong">열쇠 모양이 아니에요. hg-로 시작하는 27글자예요.</span>'; return; } A.closeSheet(); A.pages.prefs(); run().then(r => toast(r.ok ? `연결했어요. 기록 ${r.got}개를 받아 왔어요.` : '연결했지만 아직 맞추지 못했어요. 인터넷이 되면 다시 해요.')); },
    'sync-now': () => run().then(r => toast(r.ok ? (r.got || r.changed ? `맞췄어요. 새 기록 ${r.got}개를 받아 왔어요.` : '맞췄어요. 새로 받은 기록은 없어요.') : r.why === 'busy' ? '맞추는 중이에요.' : lastErr || '맞추지 못했어요.')),
    'sync-copy': () => copy(linkFor(st.key)).then(ok => toast(ok ? '연결 주소를 복사했어요. 내 다른 기기에서 열어 주세요.' : '복사하지 못했어요. 열쇠 보기로 직접 옮겨 주세요.')),
    'sync-show': () => A.openSheet(`<div class="sheet-head"><div><h2 class="h2">맞추기 열쇠</h2><p class="small">비밀번호처럼 남에게 보여 주지 마세요. 다른 기기의 설정 → 기기 맞추기 → '열쇠 넣기'에 넣어요.</p></div></div>
      <p class="kana" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:20px;word-break:break-all;user-select:all;margin:8px 0 18px">${esc(st.key)}</p>
      <div class="row"><button class="btn primary" data-act="sync-copy-key">복사하기</button><button class="btn ghost" data-act="close">닫기</button></div>`),
    'sync-copy-key': () => copy(st.key).then(ok => toast(ok ? '열쇠를 복사했어요.' : '복사하지 못했어요. 길게 눌러 직접 복사해 주세요.')),
    'sync-off': () => A.ask('이 기기에서 기기 맞추기를 끌까요? 기록은 지워지지 않아요.', '끄기', true).then(y => { if (y) { disconnect(); A.pages.prefs(); toast('기기 맞추기를 껐어요.'); } })
  });

  // 연결 주소(#sync=열쇠)로 열었을 때
  function fromLink() {
    const m = /[#&]sync=(hg-[a-z2-7]{24})/.exec(location.hash); if (!m) return;
    const key = m[1]; history.replaceState(null, '', location.href.split('#')[0] + '#today'); // 주소창·방문 기록에 열쇠를 남기지 않음
    if (st && st.key === key) { toast('이미 연결된 기기예요.'); run(); return; }
    setTimeout(() => A.ask(st ? '다른 열쇠로 바꿔 연결할까요? 지금 기록은 지워지지 않고 새 저장소에 합쳐져요.' : '이 기기를 기기 맞추기에 연결할까요? 이 기기의 기록과 저장소의 기록이 합쳐져요.', '연결하기').then(y => { if (!y) return; connect(key, false); run().then(r => toast(r.ok ? `연결했어요. 기록 ${r.got}개를 받아 왔어요.` : '연결했지만 아직 맞추지 못했어요. 인터넷이 되면 다시 해요.')); if (A.view === 'prefs') A.pages.prefs(); }), 300);
  }

  // ── 주기적으로: 앱이 화면에 떠 있는 동안 30초마다(공부 중엔 보내기만), 돌아오면 바로 ──
  const POLL = () => (window.__SYNC_POLL_MS || 30000);
  let poll = 0;
  function tick() { clearTimeout(poll); if (!st) return; poll = setTimeout(() => { if (!document.hidden && navigator.onLine !== false) run(); tick(); }, POLL()); }
  document.addEventListener('visibilitychange', () => { if (!st) return; if (document.hidden) { if (st.out.length || st.full) run({ leaving: true }); } else { soon(300); tick(); } });
  addEventListener('pagehide', () => { if (st && (st.out.length || st.full)) run({ leaving: true }); });
  A.sync = { mark, markSettings, markAll, run, connect, disconnect, get on() { return !!st; }, get state() { return state; }, get pending() { return st ? st.out.length : 0; }, _st: () => st };
  // 언제 맞추나: 열 때, 바뀐 뒤 3~5초(공부 중엔 보내기만), 화면에 떠 있는 동안 30초마다, 돌아왔을 때, 공부를 끝낼 때, 창을 숨기거나 닫을 때(보내기만, keepalive), 인터넷이 다시 될 때
  Promise.resolve(A.mirrorReady).then(() => { fromLink(); if (st) { soon(800); tick(); } });
  addEventListener('hashchange', () => { if (/[#&]sync=/.test(location.hash)) fromLink(); }); // 이미 열린 창에서 연결 주소를 열었을 때
  addEventListener('online', () => soon(1000));
})();
