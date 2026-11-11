// 저장 — 읽기·검사·옮기기(마이그레이션)·백업 합치기. 화면 코드 없음(Node 시험 가능).
// 원칙: ① 읽지 못한 저장 내용 위에 절대 덮어쓰지 않음 ② 옛 키(kana-lab-v1)는 건드리지 않음 ③ 기록 내용은 고치지 않고, 검사에 걸린 기록은 따로 보관
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  const KEY_V1 = 'kana-lab-v1', KEY = 'hangeoreum-v2';
  const MODES = ['read', 'write', 'typing', 'pair'], SCRIPTS = ['h', 'k', 'mix'], KINDS = ['kana', 'word', 'sequence'];
  const LIMIT = { attempts: 300000, sessions: 50000, str: 300, file: 30e6 };
  const isStr = (v, max = LIMIT.str) => typeof v === 'string' && v.length <= max;
  const isTime = v => isStr(v, 40) && Number.isFinite(Date.parse(v));
  const optBool = v => v === undefined || typeof v === 'boolean';
  const optNum = (v, lo, hi) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi);

  function checkAttempt(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return '기록이 객체가 아님';
    if (!isStr(a.id, 100) || !a.id) return 'id';
    if (!isStr(a.itemId, 200) || !/^(h|k|w|seq|p):/.test(a.itemId)) return 'itemId';
    if (a.sessionId !== undefined && !isStr(a.sessionId, 100)) return 'sessionId';
    if (!isStr(a.text, 120)) return 'text';
    if (!Array.isArray(a.answers) || a.answers.length > 30 || !a.answers.every(s => isStr(s, 80))) return 'answers';
    if (a.parts !== undefined && a.parts !== null) {
      if (!Array.isArray(a.parts) || a.parts.length > 10) return 'parts';
      for (const p of a.parts) if (!p || !isStr(p.text, 20) || !Array.isArray(p.answers) || !p.answers.every(s => isStr(s, 40))) return 'parts';
    }
    if (a.kind !== undefined && !KINDS.includes(a.kind)) return 'kind';
    if (a.script !== undefined && !SCRIPTS.includes(a.script)) return 'script';
    if (!MODES.includes(a.mode)) return 'mode';
    if (!optNum(a.n, 0, 1e7)) return 'n';
    if (!isTime(a.time)) return 'time';
    if (typeof a.elapsedMs !== 'number' || !Number.isFinite(a.elapsedMs) || a.elapsedMs < 0 || a.elapsedMs > 864e5) return 'elapsedMs';
    if (typeof a.correct !== 'boolean') return 'correct';
    if (a.input !== undefined && !isStr(a.input, 300)) return 'input';
    if (a.source !== undefined && !isStr(a.source, 40)) return 'source';
    if (!optBool(a.assisted) || !optBool(a.hesitant) || !optBool(a.corrected) || !optBool(a.originalCorrect)) return 'flags';
    if (!optNum(a.shapeScore, -1e3, 1e3)) return 'shapeScore';
    if (a.recognition !== undefined && !isStr(a.recognition, 400)) return 'recognition';
    return '';
  }
  function checkSession(s) {
    if (!s || typeof s !== 'object' || !isStr(s.id, 100) || !s.id) return 'id';
    if (!isTime(s.start)) return 'start';
    if (s.end !== undefined && s.end !== null && !isTime(s.end)) return 'end';
    if (s.mode !== undefined && !MODES.includes(s.mode)) return 'mode';
    if (s.script !== undefined && !SCRIPTS.includes(s.script)) return 'script';
    if (!optNum(s.n, 0, 1e7)) return 'n';
    return '';
  }
  function checkPack(p) {
    return p && isStr(p.id, 80) && isStr(p.name, 80) && Array.isArray(p.words) && p.words.length <= 2000 &&
      p.words.every(w => w && isStr(w.text, 40) && /^[ぁ-ゖァ-ヺー・]+$/.test(w.text) && Array.isArray(w.answers) && w.answers.length && w.answers.every(s => isStr(s, 60)) && (w.meaning === undefined || isStr(w.meaning, 120)));
  }
  // 필기 표본·내 글씨 본보기: {text, strokes:[[[x,y],...]], at, ok?}
  function checkSample(x) {
    return x && isStr(x.text, 4) && Array.isArray(x.strokes) && x.strokes.length <= 40 &&
      x.strokes.every(st => Array.isArray(st) && st.length <= 2000 && st.every(p => Array.isArray(p) && p.length >= 2 && p.every(v => typeof v === 'number' && Number.isFinite(v))));
  }
  function emptyDB() { return { version: 2, attempts: [], sessions: [], packs: [], settings: {}, quarantine: [], samples: [], hints: {}, mine: {}, meta: { created: new Date().toISOString() } }; }

  // 어떤 판(v1·v2)의 객체든 v2 로. 기록(attempt)은 내용을 바꾸지 않고 그대로 옮김.
  function toV2(x, from) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('저장 내용이 객체가 아니에요.');
    if (!Array.isArray(x.attempts) || !Array.isArray(x.sessions)) throw Error('attempts·sessions 목록이 없어요.');
    if (![1, 2].includes(x.version)) throw Error('알 수 없는 판 번호(version ' + String(x.version).slice(0, 10) + ')예요.');
    if (x.attempts.length > LIMIT.attempts || x.sessions.length > LIMIT.sessions) throw Error('기록 수가 너무 많아요.');
    const db = emptyDB();
    const bad = [];
    for (const a of x.attempts) { const why = checkAttempt(a); if (why) bad.push({ kind: 'attempt', why, raw: a }); else db.attempts.push(a); }
    for (const s of x.sessions) { const why = checkSession(s); if (why) bad.push({ kind: 'session', why, raw: s }); else db.sessions.push(s); }
    if (x.version === 2) {
      if (Array.isArray(x.packs)) for (const p of x.packs) { if (checkPack(p)) db.packs.push(p); else bad.push({ kind: 'pack', why: 'pack', raw: p }); }
      if (x.settings && typeof x.settings === 'object' && !Array.isArray(x.settings)) db.settings = sanitizeSettings(x.settings);
      if (Array.isArray(x.quarantine)) db.quarantine.push(...x.quarantine.slice(0, 5000));
      if (x.meta && typeof x.meta === 'object') db.meta = { ...db.meta, ...x.meta };
      if (Array.isArray(x.samples)) db.samples = x.samples.filter(checkSample).slice(-2000);
      if (x.hints && typeof x.hints === 'object') { db.hints = {}; for (const [k, v] of Object.entries(x.hints)) if (isStr(k, 4) && isStr(v, 120)) db.hints[k] = v; }
      if (x.mine && typeof x.mine === 'object') { db.mine = {}; for (const [k, v] of Object.entries(x.mine)) if (isStr(k, 4) && Array.isArray(v)) { const ok = v.filter(checkSample).slice(-5); if (ok.length) db.mine[k] = ok; } }
    } else {
      db.meta.migratedFrom = { key: from || KEY_V1, version: 1, at: new Date().toISOString(), attempts: x.attempts.length, sessions: x.sessions.length };
    }
    db.quarantine.push(...bad);
    return db;
  }
  const SETTING_KEYS = { script: ['h', 'k', 'mix'], newLimit: [5, 10, 15, 20], tolerance: ['strict', 'normal', 'relaxed'], palm: ['auto', 'pen', 'all'], range: null, onboarded: [true, false], wordsFirst: [true, false], usePacks: [true, false], collect: [true, false], learnMine: [true, false], study: ['adaptive', 'normal', 'review'], typeKind: ['words', 'chars'] };
  function sanitizeSettings(s) {
    const out = {};
    for (const [k, allowed] of Object.entries(SETTING_KEYS)) {
      if (!(k in s)) continue;
      if (k === 'range') { if (Array.isArray(s.range)) out.range = s.range.filter(x => ['basic', 'voiced', 'yoon', 'ext'].includes(x)); continue; }
      if (allowed.includes(s[k])) out[k] = s[k];
    }
    return out;
  }

  // 저장소 읽기. 결과 {db, status, raw?, error?, key?}
  // status: 'new' | 'ok' | 'migrated' | 'corrupt' — corrupt 일 때는 save()가 막힘(덮어쓰기 방지)
  function load(ls) {
    let raw2 = null, raw1 = null;
    try { raw2 = ls.getItem(KEY); raw1 = ls.getItem(KEY_V1); } catch (e) { return { db: emptyDB(), status: 'nostorage', error: e.message }; }
    if (raw2 !== null) {
      try { const db = toV2(JSON.parse(raw2), KEY); return { db, status: 'ok' }; }
      catch (e) { return { db: emptyDB(), status: 'corrupt', raw: raw2, key: KEY, error: e.message }; }
    }
    if (raw1 !== null) {
      try { const db = toV2(JSON.parse(raw1), KEY_V1); return { db, status: 'migrated' }; }
      catch (e) { return { db: emptyDB(), status: 'corrupt', raw: raw1, key: KEY_V1, error: e.message }; }
    }
    return { db: emptyDB(), status: 'new' };
  }
  function makeStore(ls) {
    const st = load(ls);
    const store = {
      db: st.db, status: st.status, corrupt: st.status === 'corrupt' ? { raw: st.raw, key: st.key, error: st.error } : null, lastError: '',
      save() {
        if (store.corrupt) return false; // 손상된 원본을 지키기 위해 저장하지 않음
        try { ls.setItem(KEY, JSON.stringify(store.db)); store.lastError = ''; return true; } catch (e) { store.lastError = e.message || String(e); return false; }
      },
      // 손상 원본을 다른 키로 옮겨 둔 뒤 새로 시작 (원본은 지우지 않음)
      setAsideCorrupt() {
        if (!store.corrupt) return true;
        const k0 = store.corrupt.key;
        const k = 'hangeoreum-corrupt-' + new Date().toISOString().replace(/[:.]/g, '-');
        try { ls.setItem(k, store.corrupt.raw); if (k0 === KEY) ls.removeItem(KEY); } catch (e) { store.lastError = e.message; return false; }
        store.corrupt = null; store.status = 'new'; store.savedAside = k;
        // 새 키만 망가졌고 옛 키(v1)가 멀쩡하면 그 기록을 다시 옮겨 옴
        if (k0 === KEY) { try { const v1 = ls.getItem(KEY_V1); if (v1 !== null) { store.db = toV2(JSON.parse(v1), KEY_V1); store.status = 'migrated'; } } catch (e) { } }
        return store.save();
      }
    };
    if (st.status === 'migrated') store.save();
    return store;
  }

  // 백업 합치기: 문제가 있는 파일이면 아무것도 바꾸지 않음 (먼저 사본에서 검사)
  function mergeBackup(db, text) {
    if (typeof text !== 'string' || text.length > LIMIT.file) throw Error('30MB 이하 백업 파일을 골라 주세요.');
    let x; try { x = JSON.parse(text); } catch (e) { throw Error('JSON 형식이 아니에요. 백업 파일이 맞는지 확인해 주세요.'); }
    const inc = toV2(x, 'backup');
    const ids = new Set(db.attempts.map(a => a.id)), sids = new Set(db.sessions.map(s => s.id)), pids = new Set(db.packs.map(p => p.id));
    const add = { attempts: inc.attempts.filter(a => !ids.has(a.id)), sessions: inc.sessions.filter(s => !sids.has(s.id)), packs: inc.packs.filter(p => !pids.has(p.id)) };
    const result = { added: add.attempts.length, sessions: add.sessions.length, packs: add.packs.length, duplicates: inc.attempts.length - add.attempts.length, rejected: inc.quarantine.length - (x.quarantine?.length || 0), from: x.version };
    db.attempts.push(...add.attempts); db.sessions.push(...add.sessions); db.packs.push(...add.packs);
    if (result.rejected > 0) db.quarantine.push(...inc.quarantine.slice(-result.rejected).map(q => ({ ...q, from: 'import' })));
    db.attempts.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    return result;
  }
  // 새로고침 등으로 끝 정보가 없는 회차를 기록에서 복원 (기록은 그대로)
  function recoverSessions(db) {
    const known = new Set(db.sessions.map(s => s.id)); const by = new Map();
    for (const a of db.attempts) if (a.sessionId && !known.has(a.sessionId)) { if (!by.has(a.sessionId)) by.set(a.sessionId, []); by.get(a.sessionId).push(a); }
    for (const [id, a] of by) db.sessions.push({ id, start: a[0].time, end: a.at(-1).time, n: a.length, mode: a[0].mode, script: a[0].script, interrupted: true });
    return by.size;
  }
  KL.store = { checkSample, KEY, KEY_V1, makeStore, load, toV2, mergeBackup, checkAttempt, checkSession, checkPack, recoverSessions, emptyDB, sanitizeSettings };
})(typeof globalThis !== 'undefined' ? globalThis : this);
