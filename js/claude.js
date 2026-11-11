// 클로드 구독 연동 — API·키·추가 비용 없음.
// 앱이 학습 요약과 부탁 문장을 만들어 claude.ai 새 대화로 열거나 복사하고, 클로드가 준 JSON(단어 팩·연상 힌트)을 붙여 넣어 가져옴.
// 링크 확인(2026-11-12): Claude 데스크톱 앱용 claude://claude.ai/new?q=… 는 support.claude.com 공식 문서에 있음(입력칸만 채우고 보내기는 사용자가 누름).
// 웹 주소 https://claude.ai/new?q=… 가 브라우저(아이패드 Safari 포함)에서 입력칸을 채우는지는 공식 문서에서 찾지 못함 — 직접 보지 못함. 그래서 항상 '복사'도 같이 제공.
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  const DAY = 864e5, MODES = ['read', 'write', 'typing', 'pair'];
  const MODE_KO = { read: '읽기', write: '쓰기', typing: '타자', pair: '짝 구별' };
  const dateOnly = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // 개인정보 없는 학습 요약 (글자·정답률·날짜만, 입력한 답·시각·기기 정보는 넣지 않음)
  function summarize(db, KANA, WORDS, now = Date.now()) {
    const at = (db && db.attempts) || [];
    const days = new Set(at.map(a => dateOnly(Date.parse(a.time))));
    const recent = at.filter(a => Date.parse(a.time) >= now - 7 * DAY);
    const last7 = {};
    for (const m of MODES) { const l = recent.filter(a => a.mode === m); last7[m] = { n: l.length, rate: l.length ? Math.round(l.filter(a => a.correct).length / l.length * 100) : null }; }
    const by = new Map();
    for (const a of at) { const k = a.itemId + '|' + a.mode; if (!by.has(k)) by.set(k, []); by.get(k).push(a); }
    const weak = [];
    let known = 0;
    const knownIds = new Set();
    for (const [k, list] of by) {
      const wrong = list.filter(a => !a.correct);
      const st = KL.sched.memoryState(list);
      if (st.stage >= 3 && list[0].kind !== 'word' && list[0].kind !== 'sequence') knownIds.add(list[0].itemId);
      if (!wrong.length) continue;
      weak.push({ text: list[0].text, mode: list[0].mode, modeKo: MODE_KO[list[0].mode] || list[0].mode, wrong: wrong.length, tries: list.length, lastWrong: dateOnly(Date.parse(wrong.at(-1).time)), lastCorrect: !!list.at(-1).correct });
    }
    known = knownIds.size;
    weak.sort((a, b) => (b.wrong / b.tries) - (a.wrong / a.tries) || b.wrong - a.wrong);
    const seen = new Set(at.map(a => a.itemId));
    const basic = (KANA || []).filter(k => k.group === 'basic');
    return {
      studyDays: days.size, totalTries: at.length, last7, weak: weak.slice(0, 15), knownKana: known,
      unlearnedBasic: { h: basic.filter(k => k.script === 'h' && !seen.has(k.id)).length, k: basic.filter(k => k.script === 'k' && !seen.has(k.id)).length },
      words: (WORDS || []).length
    };
  }
  function summaryText(s) {
    const l7 = MODES.map(m => `${MODE_KO[m]} ${s.last7[m].n}문제${s.last7[m].rate === null ? '' : ' 정답률 ' + s.last7[m].rate + '%'}`).join(', ');
    const weak = s.weak.length ? s.weak.map(w => `- ${w.text} (${w.modeKo}): ${w.tries}번 중 ${w.wrong}번 틀림, 마지막 오답 ${w.lastWrong}${w.lastCorrect ? ', 최근엔 맞힘' : ''}`).join('\n') : '- 아직 틀린 기록이 없어요.';
    return `공부한 날: ${s.studyDays}일, 전체 ${s.totalTries}문제\n최근 7일: ${l7}\n잘 아는 글자(간격 복습 3단계 이상): ${s.knownKana}개\n아직 안 배운 기본 글자: 히라가나 ${s.unlearnedBasic.h}개, 가타카나 ${s.unlearnedBasic.k}개\n자주 틀린 것:\n${weak}`;
  }
  const PACK_FORMAT = '{"pack":"팩 이름","words":[{"kana":"かな","reading":["카나"],"meaning":"뜻"}]}';
  const PACK_RULES = `규칙:
- kana에는 히라가나·가타카나·장음 기호(ー)만 써 주세요. 한자·로마자·숫자는 쓰지 마세요(한자 금지).
- reading은 한국어 근사 발음이에요. 여러 개 써도 돼요. 장음은 모음을 이어 써요(コーヒー → 코오히이). 촉음은 받침으로 써요(きっぷ → 킷푸).
- meaning은 짧은 한국어 뜻이에요.`;
  const ME = '저는 한국어 사용자이고 일본어 초보예요. 삿포로 여행을 준비하며 \'일본어 한걸음\' 앱으로 히라가나·가타카나를 연습하고 있어요. 소리를 내지 않고 공부해요.';
  const JSON_ONLY = '이 앱에 붙여 넣을 JSON만 코드 블록 하나로 주세요. 설명은 코드 블록 밖에 짧게만 써 주세요.';
  function buildPrompt(kind, summary, extra = {}) {
    const S = summary ? summaryText(summary) : '(아직 기록 없음)';
    const weakChars = summary ? [...new Set(summary.weak.map(w => w.text))].slice(0, 10).join(', ') : '';
    if (kind === 'plan') return `${ME}\n\n제 학습 기록 요약이에요.\n${S}\n\n약점을 분석하고, 이번 주 연습 계획을 하루 20~30분 기준으로 짜 주세요. 앱에 있는 기능 이름으로 제안해 주세요: 오늘의 학습(복습+새 글자), 읽기(글자 보고 한글 발음 입력), 쓰기(발음 보고 손으로 쓰기), 타자(단어·글자 행렬), 짝 구별(헷갈리는 글자 고르기). 헷갈리는 글자는 무엇과 섞어 연습하면 좋을지도 알려 주세요. 근거가 약한 내용은 추측이라고 표시해 주세요.`;
    if (kind === 'pack') return `${ME}\n\n제가 자주 틀리는 글자: ${weakChars || '(없음 — 기본 글자 위주로)'}\n\n이 글자들이 많이 들어간 여행·생활 단어 20개를 아래 형식의 JSON으로만 만들어 주세요.\n${PACK_FORMAT}\n${PACK_RULES}\n\n${JSON_ONLY}`;
    if (kind === 'travel') return `${ME}\n\n삿포로 여행에서 바로 쓸 가나 단어 팩을 만들어 주세요. 상황: ${extra.situation || '공항·전철·렌터카·식당·편의점·온천'}. 표지판·메뉴·안내문에서 자주 보는 가나 단어 위주로 25개, 아래 형식의 JSON으로만.\n${PACK_FORMAT}\n${PACK_RULES}\n\n${JSON_ONLY}`;
    if (kind === 'hints') return `${ME}\n\n다음 글자의 모양과 한국어 발음을 연결하는 새 연상 힌트를 글자마다 한 문장(40자 안팎)으로 만들어 주세요: ${weakChars || 'ぬ, め, る, ろ, シ, ツ, ソ, ン'}\n헷갈리는 짝이 있으면 다른 점이 드러나게 해 주세요. 형식: {"hints":{"ぬ":"힌트 문장"}}\n\n${JSON_ONLY}`;
    if (kind === 'free') return `${ME}\n\n제 학습 기록 요약이에요.\n${S}\n\n질문: ${String(extra.question || '').slice(0, 1500)}`;
    throw Error('알 수 없는 부탁 종류: ' + kind);
  }
  const MAX_URL = 6000;
  function openUrl(prompt) { const u = 'https://claude.ai/new?q=' + encodeURIComponent(prompt); return u.length > MAX_URL ? null : u; }
  function desktopUrl(prompt) { const u = 'claude://claude.ai/new?q=' + encodeURIComponent(prompt); return u.length > MAX_URL ? null : u; }

  // 붙여 넣은 글에서 JSON 꺼내기: ```json 코드 블록 → 첫 { 부터 마지막 } 까지
  function extractJSON(text) {
    const s = String(text || '');
    const blocks = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]);
    const tries = [...blocks, s];
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i >= 0 && j > i) tries.push(s.slice(i, j + 1));
    for (const t of tries) { try { return JSON.parse(t.trim()); } catch (e) { /* 다음 */ } }
    return null;
  }
  const KANA_ONLY = /^[ぁ-ゖァ-ヺー]+$/;
  const HANGUL_READ = /^[가-힣ㄱ-ㅎ\s:：ー\-~]+$/;
  function parsePack(text, WORDS) {
    const errors = []; let skipped = 0;
    const x = extractJSON(text);
    if (!x || typeof x !== 'object') return { ok: false, errors: ['JSON을 찾지 못했어요. 클로드가 준 코드 블록을 통째로 붙여 넣어 주세요.'], skipped };
    const list = Array.isArray(x.words) ? x.words : null;
    if (!list) return { ok: false, errors: ['words 목록이 없어요.'], skipped };
    const base = new Set(((WORDS !== undefined ? WORDS : KL.data && KL.data.WORDS) || []).map(w => w.text));
    const seen = new Set(), words = [];
    for (const w of list.slice(0, 500)) {
      const kana = w && typeof w.kana === 'string' ? w.kana.trim() : '';
      if (!kana || kana.length > 40 || !KANA_ONLY.test(kana)) { errors.push(`'${String(w && w.kana).slice(0, 20)}': 가나가 아닌 글자(한자·영문 등)가 있어 건너뜀`); continue; }
      const reads = (Array.isArray(w.reading) ? w.reading : typeof w.reading === 'string' ? [w.reading] : []).map(r => String(r).trim()).filter(r => r && r.length <= 60 && HANGUL_READ.test(r)).slice(0, 6);
      if (!reads.length) { errors.push(`'${kana}': 한글 발음이 없어 건너뜀`); continue; }
      if (seen.has(kana)) continue;
      seen.add(kana);
      if (base.has(kana)) { skipped++; continue; }
      words.push({ text: kana, answers: reads, meaning: typeof w.meaning === 'string' ? w.meaning.slice(0, 120) : '' });
    }
    if (list.length > 500) errors.push('500개까지만 가져왔어요.');
    const name = typeof x.pack === 'string' && x.pack.trim() ? x.pack.trim().slice(0, 80) : '클로드 단어 팩';
    return { ok: words.length > 0, pack: { id: 'pack-' + Date.now().toString(36), name, words, created: new Date().toISOString() }, errors, skipped };
  }
  function parseHints(text, KANA) {
    const x = extractJSON(text);
    if (!x || typeof x !== 'object' || !x.hints || typeof x.hints !== 'object') return { ok: false, hints: {}, errors: ['{"hints":{…}} 형식의 JSON을 찾지 못했어요.'] };
    const known = new Set(((KANA !== undefined ? KANA : KL.data && KL.data.KANA) || []).map(k => k.text));
    const hints = {}, errors = [];
    for (const [k, v] of Object.entries(x.hints)) {
      if (!known.has(k)) { errors.push(`'${String(k).slice(0, 10)}': 앱에 없는 글자라 건너뜀`); continue; }
      if (typeof v !== 'string' || !v.trim()) continue;
      hints[k] = v.trim().slice(0, 80);
    }
    return { ok: Object.keys(hints).length > 0, hints, errors };
  }
  KL.claude = { summarize, summaryText, buildPrompt, openUrl, desktopUrl, extractJSON, parsePack, parseHints, MAX_URL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
