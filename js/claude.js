// 클로드 구독 연동 — API·키·추가 비용 없음.
// 앱이 학습 요약과 부탁 문장을 만들어 claude.ai 새 대화로 열거나 복사하고, 클로드가 준 JSON(단어 팩·연상 힌트)을 붙여 넣어 가져옴.
// 링크 확인(2026-11-12): Claude 데스크톱 앱용 claude://claude.ai/new?q=… 는 support.claude.com 공식 문서에 있음(입력칸만 채우고 보내기는 사용자가 누름).
// 웹 주소 https://claude.ai/new?q=… 가 브라우저(아이패드 Safari 포함)에서 입력칸을 채우는지는 공식 문서에서 찾지 못함 — 직접 보지 못함. 그래서 항상 '복사'도 같이 제공.
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  const DAY = 864e5, MODES = ['read', 'write', 'typing', 'pair'];
  const MODE_KO = { read: '읽기', write: '쓰기', typing: '단어 읽기', pair: '헷갈리는 글자' };
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
    const knownList = (KANA || []).filter(k => k.group !== 'ext' && at.some(x => x.itemId === k.id && x.mode === 'read' && x.correct && !x.assisted)).map(k => k.text).slice(0, 160);
    return {
      confusions: KL.stats.confusions(at).slice(0, 8), knownList,
      studyDays: days.size, totalTries: at.length, last7, weak: weak.slice(0, 15), knownKana: known,
      unlearnedBasic: { h: basic.filter(k => k.script === 'h' && !seen.has(k.id)).length, k: basic.filter(k => k.script === 'k' && !seen.has(k.id)).length },
      words: (WORDS || []).length
    };
  }
  function summaryText(s) {
    const l7 = MODES.map(m => `${MODE_KO[m]} ${s.last7[m].n}문제${s.last7[m].rate === null ? '' : ' 정답률 ' + s.last7[m].rate + '%'}`).join(', ');
    const weak = s.weak.length ? s.weak.map(w => `- ${w.text} (${w.modeKo}): ${w.tries}번 중 ${w.wrong}번 틀림, 마지막 오답 ${w.lastWrong}${w.lastCorrect ? ', 최근엔 맞힘' : ''}`).join('\n') : '- 아직 틀린 기록이 없어요.';
    const conf = s.confusions && s.confusions.length ? '\n실제로 헷갈린 짝: ' + s.confusions.map(c => `${c.a}↔${c.b} ${c.n}번`).join(', ') : '';
    return `공부한 날: ${s.studyDays}일, 지금까지 ${s.totalTries}문제\n최근 7일: ${l7}\n잘 외운 글자: ${s.knownKana}개\n아직 안 배운 기본 글자: 히라가나 ${s.unlearnedBasic.h}개, 가타카나 ${s.unlearnedBasic.k}개${conf}\n자주 틀린 것:\n${weak}`;
  }
  const PACK_FORMAT = '{"pack":"단어장 이름","words":[{"kana":"かな","reading":["카나"],"meaning":"뜻"}]}';
  const PACK_RULES = `지켜 주세요:
- kana에는 히라가나·가타카나·장음 기호(ー)만 써 주세요. 한자·로마자·숫자·띄어쓰기·문장부호는 넣지 마세요(한자 금지).
- reading은 한국어로 적은 일본어 소리예요. 여러 개 적어도 돼요. 장음은 모음을 한 번 더 써요(コーヒー → 코오히이). 촉음은 받침으로 써요(きっぷ → 킷푸).
- meaning은 짧은 한국어 뜻이에요.`;
  const ME = '저는 한국어를 쓰는 일본어 초보예요. 삿포로 여행을 앞두고 \'일본어 한걸음\' 앱으로 히라가나·가타카나를 익히고 있어요. 카페에서 소리 내지 않고 공부해요.';
  const JSON_ONLY = '답은 앱에 그대로 붙여 넣을 수 있게 JSON 코드 블록 하나로만 주세요. 설명은 코드 블록 밖에 한두 줄만 써 주세요.';
  function buildPrompt(kind, summary, extra = {}) {
    const S = summary ? summaryText(summary) : '(아직 기록이 없어요)';
    const weakChars = summary ? [...new Set(summary.weak.filter(w => [...w.text].length <= 2).map(w => w.text))].slice(0, 10).join(', ') : '';
    const known = summary && summary.knownList && summary.knownList.length ? summary.knownList.join('') : '';
    const knownLine = known ? `제가 읽을 수 있는 글자: ${known}\n되도록 이 글자들만으로 된 말을 골라 주세요.` : '아직 아는 글자가 거의 없어요. 기본 히라가나 위주로 골라 주세요.';
    if (kind === 'plan') return `${ME}\n\n제 공부 기록이에요.\n${S}\n\n이 기록을 보고 ① 제가 어디서 막히는지 ② 이번 주에 무엇을 어떤 순서로 하면 좋을지 알려 주세요. 하루 20~30분 기준이고, 앱에 있는 메뉴 이름으로 말해 주세요: 오늘 공부(복습 → 새 글자 → 써 보기 → 단어 읽기), 읽기, 쓰기, 단어 읽기, 헷갈리는 글자. 짧고 구체적으로 부탁해요.`;
    if (kind === 'pack') return `${ME}\n\n제가 자주 틀리는 글자: ${weakChars || '(아직 없음)'}\n${knownLine}\n\n자주 틀리는 글자가 많이 들어간 여행·생활 단어 20개로 단어장을 만들어 주세요. 형식은 아래와 같아요.\n${PACK_FORMAT}\n${PACK_RULES}\n\n${JSON_ONLY}`;
    if (kind === 'travel') return `${ME}\n\n삿포로 여행에서 간판·메뉴판·안내문으로 자주 보게 될 말로 단어장을 만들어 주세요. 상황: ${extra.situation || '공항, 전철, 렌터카, 식당, 편의점, 온천'}. 25개쯤이면 좋아요. 형식은 아래와 같아요.\n${PACK_FORMAT}\n${PACK_RULES}\n\n${JSON_ONLY}`;
    if (kind === 'sentences') return `${ME}\n\n${knownLine}\n\n여행에서 바로 쓸 수 있는 아주 짧은 문장 12개를 만들어 주세요(한 문장 15자 안팎). 앱의 '단어 읽기'에서 읽기 연습으로 쓸 거예요. 형식은 단어장과 같아요.\n${PACK_FORMAT}\n${PACK_RULES}\n\n${JSON_ONLY}`;
    if (kind === 'hints') return `${ME}\n\n아래 글자가 잘 안 외워져요: ${weakChars || 'ぬ, め, る, ろ, シ, ツ, ソ, ン'}\n${summary && summary.confusions && summary.confusions.length ? '특히 헷갈린 짝: ' + summary.confusions.map(c => c.a + '↔' + c.b).join(', ') + '\n' : ''}\n글자마다 모양과 한국어 소리를 이어 주는 연상 문장을 하나씩 만들어 주세요(40자 안팎). 헷갈리는 짝은 어디가 다른지가 드러나게 해 주세요. 형식은 아래와 같아요.\n{"hints":{"ぬ":"연상 문장"}}\n\n${JSON_ONLY}`;
    if (kind === 'quiz') return `${ME}\n\n제 공부 기록이에요.\n${S}\n\n지금부터 대화로 퀴즈를 내 주세요. 규칙: ① 한 번에 한 문제만 내요. ② 제가 약한 글자와 헷갈린 짝을 먼저 내요. ③ 글자나 짧은 단어를 보여 주면 제가 한글로 소리를 답해요. ④ 틀리면 정답과 외우는 요령을 한 줄로 알려 주고 조금 뒤에 다시 물어봐 주세요. ⑤ 10문제마다 잘한 점과 다시 볼 글자를 정리해 주세요. 첫 문제부터 시작해 주세요.`;
    if (kind === 'handwriting') return `${ME}\n\n함께 보낸 그림은 제가 앱에서 손으로 쓴 가나예요. 칸마다 위에 써야 했던 글자와 소리가 적혀 있고, 아래 큰 칸이 제 글씨예요. 저는 글씨를 잘 못 써요. 획순은 보지 말고, ① 다른 글자로 읽힐 만한 것 ② 모양이 많이 무너진 것만 골라서, 어디를 어떻게 고치면 되는지 글자마다 한 줄로 알려 주세요. 잘 쓴 글자도 한두 개 짚어 주세요.`;
    if (kind === 'project') return `이 프로젝트는 '일본어 한걸음' 앱으로 히라가나·가타카나를 공부하는 저를 돕는 곳이에요.\n\n${ME}\n\n늘 지켜 주세요:\n- 쉬운 한국어로 짧게 답해 주세요. 일본어를 쓸 때는 한자를 쓰지 말고 가나로만 쓰고, 옆에 한국어 소리와 뜻을 붙여 주세요.\n- 제가 앱에서 복사해 온 '공부 기록'을 붙여 넣으면 그걸 바탕으로 답해 주세요.\n- 단어장을 달라고 하면 이 형식의 JSON 코드 블록 하나로 주세요: ${PACK_FORMAT}\n- 연상 힌트를 달라고 하면 이 형식으로 주세요: {"hints":{"ぬ":"연상 문장"}}\n${PACK_RULES}`;
    if (kind === 'explain') return `${ME}\n\n${extra.a}(${extra.ar})와 ${extra.b}(${extra.br})가 자꾸 헷갈려요. 두 글자가 어디가 다른지, 어떻게 외우면 좋은지 세 줄 안으로 알려 주세요. 한자는 쓰지 말아 주세요.`;
    if (kind === 'free') return `${ME}\n\n제 공부 기록이에요.\n${S}\n\n질문: ${String(extra.question || '').slice(0, 1500)}`;
    throw Error('모르는 부탁 종류: ' + kind);
  }
  const MAX_URL = 6000;
  function openUrl(prompt) { const u = 'https://claude.ai/new?q=' + encodeURIComponent(prompt); return u.length > MAX_URL ? null : u; }
  function desktopUrl(prompt) { const u = 'claude://claude.ai/new?q=' + encodeURIComponent(prompt); return u.length > MAX_URL ? null : u; }
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
