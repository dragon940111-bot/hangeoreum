// AI 코치 — 내 Claude 구독으로 공부를 돕는 화면. API 키·추가 요금 없음.
// 바로 묻기: Claude 안에서 연 화면이면 그 자리에서 답을 받아요(KL.ai).  보내기: 그 밖에서는 부탁 글을 Claude 앱으로 보내고, 받은 답을 붙여 넣어 앱에 넣어요.
(function () {
  'use strict';
  const A = KL.app, { data: D, claude: C, ai: AI } = KL;
  const { $, $$, esc, icon, toast, copyText, notice } = A;

  const KINDS = {
    plan: { title: '내 공부 진단', sub: '기록을 보고 어디서 막히는지, 이번 주에 무엇을 하면 좋을지 알려 줘요.', ico: 'chart', type: 'chat', go: '진단 받기' },
    hints: { title: '헷갈리는 글자 외우는 법', sub: '자주 틀린 글자마다 외우는 요령을 받아서 앱에 넣어요. 틀렸을 때 그 요령이 나와요.', ico: 'pair', type: 'hints', go: '요령 받기' },
    pack: { title: '내 수준에 맞는 단어장', sub: '읽을 수 있는 글자와 자주 틀리는 글자로 단어 20개를 받아서 단어 읽기에 넣어요.', ico: 'words', type: 'pack', go: '단어장 받기' },
    travel: { title: '삿포로 여행 단어장', sub: '간판·메뉴판·안내문에서 볼 말을 받아서 단어 읽기에 넣어요.', ico: 'box', type: 'pack', go: '단어장 받기' },
    sentences: { title: '짧은 문장 읽기', sub: '여행에서 바로 쓸 짧은 문장 12개를 받아서 읽기 연습에 넣어요.', ico: 'read', type: 'pack', go: '문장 받기' },
    handwriting: { title: '내 글씨 봐 달라고 하기', sub: '최근에 쓴 글씨를 그림 한 장으로 모아서 보여 주고, 고칠 곳을 들어요.', ico: 'hand', type: 'image', go: '글씨 보여 주기' },
    quiz: { title: '대화로 퀴즈 풀기', sub: '약한 글자부터 한 문제씩 물어봐요. 틀리면 외우는 요령도 알려 줘요.', ico: 'chat', type: 'chat', go: '퀴즈 시작' },
    free: { title: '궁금한 것 물어보기', sub: '일본어 글자나 공부 방법에 대해 무엇이든 물어봐요. 내 공부 기록을 함께 보내요.', ico: 'spark', type: 'chat', go: '물어보기' },
    explain: { title: '두 글자의 차이', sub: '', ico: 'pair', type: 'chat', go: '물어보기' },
    project: { title: 'Claude 프로젝트 지침', sub: 'Claude 앱에 ‘일본어 공부’ 프로젝트를 만들고 이 글을 지침에 붙여 두면, 그 안의 대화가 늘 같은 규칙으로 답해요.', ico: 'copy', type: 'copy', go: '' }
  };
  const SITS = ['공항·전철', '렌터카·주유소', '식당·이자카야', '편의점·마트', '온천·호텔', '눈·날씨'];
  const summary = () => C.summarize(A.db, D.KANA, A.allWords());
  const isJSON = K => K.type === 'pack' || K.type === 'hints';
  const coarse = () => !!A.touch;
  // 답에 섞인 간단한 마크다운만 보기 좋게 (나머지는 글자 그대로)
  function md(t) {
    return esc(t).replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '<pre>$1</pre>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>').replace(/^(\s*)[-*]\s+/gm, '$1• ');
  }

  // ── 화면 ──
  A.pages.coach = () => {
    const on = AI.state === 'on', n = A.db.attempts.length, sN = (A.db.samples || []).length;
    const row = k => { const K = KINDS[k]; return `<button data-act="coach" data-v="${k}"><span class="li-ico">${icon(K.ico)}</span><span class="li-body"><b>${K.title}</b><span>${K.sub}</span></span>${icon('chev')}</button>`; };
    const how = on
      ? `<div class="note info">여기서 바로 Claude에게 물어볼 수 있어요. 내 Claude 사용량에서 나가고, 따로 드는 돈은 없어요. 처음 물을 때 한 번 허락을 물어봐요.</div>`
      : AI.state === 'checking' ? `<div class="note info">Claude에게 바로 물어볼 수 있는지 확인하고 있어요…</div>`
        : `<ol class="how"><li><b>부탁을 골라요</b><span>앱이 내 공부 기록을 넣어서 부탁 글을 만들어요.</span></li><li><b>Claude로 보내요</b><span>${coarse() ? '공유 창에서 Claude 앱을 고르면 돼요.' : '글을 복사해서 Claude에 붙여 넣어요.'}</span></li><li><b>답을 붙여 넣어요</b><span>단어장과 외우는 요령은 앱에 바로 들어가요.</span></li></ol>`;
    $('#view').innerHTML = `${notice()}<div class="page-head"><div><h1 class="h1">AI 코치</h1><p class="sub">${on ? 'Claude가 내 기록을 보고 도와줘요.' : '내 Claude 구독으로 공부를 도와요. 키나 추가 요금은 필요 없어요.'}</p></div></div>
      ${how}
      ${n ? '' : `<p class="small" style="margin-top:14px">아직 공부 기록이 없어요. 기록이 쌓일수록 더 잘 맞는 답을 받아요.</p>`}
      <h2 class="h2 section">내 기록으로</h2><div class="list">${row('plan')}${row('hints')}${row('pack')}</div>
      <h2 class="h2 section">여행 준비</h2><div class="list">${row('travel')}${row('sentences')}</div>
      <h2 class="h2 section">같이 연습하기</h2><div class="list">${row('handwriting')}${row('quiz')}${row('free')}</div>
      <h2 class="h2 section">Claude 앱에서 이어서 하기</h2><div class="list">${row('project')}
        <button data-act="coach-paste"><span class="li-ico">${icon('share')}</span><span class="li-body"><b>받은 답 붙여 넣기</b><span>Claude 앱에서 받은 단어장이나 외우는 요령을 앱에 넣어요.</span></span>${icon('chev')}</button></div>
      <p class="small section">Claude에게 보내는 것은 글자별 정답률과 날짜를 간추린 내용이에요. 입력한 답이나 기기 정보는 보내지 않아요.${sN ? '' : ' 글씨를 보여 주려면 먼저 쓰기 연습을 해서 글씨를 모아야 해요.'}<br>Claude의 답은 틀릴 수 있어요. 받은 단어장은 가나만 들어 있는지 앱이 한 번 걸러요.</p>`;
  };
  AI.onchange = () => { if (A.view === 'coach') A.pages.coach(); };

  // ── 부탁 판 ──
  let cur = null, ctl = null, turns = [];
  const promptFor = (extraQ) => {
    const extra = { ...cur.extra };
    if (cur.kind === 'travel') { const s = $$('#coachSits [aria-pressed="true"]').map(b => b.textContent); if (s.length) extra.situation = s.join(', '); }
    if (cur.kind === 'free') extra.question = extraQ || ($('#coachQ') ? $('#coachQ').value.trim() : '');
    return C.buildPrompt(cur.kind, cur.kind === 'explain' || cur.kind === 'project' ? null : summary(), extra);
  };
  A.coachSheet = (kind, extra = {}) => {
    const K = KINDS[kind]; if (!K) return;
    if (ctl) { ctl.abort(); ctl = null; }
    turns = [];
    const samples = (A.db.samples || []).slice(-12);
    const direct = K.type !== 'copy' && AI.state === 'on' && (K.type !== 'image' || AI.images > 0);
    cur = { kind, extra, K, direct, busy: false, result: null, samples };
    const title = kind === 'explain' ? `<span class="kana" lang="ja">${esc(extra.a)}</span>와 <span class="kana" lang="ja">${esc(extra.b)}</span>의 차이` : esc(K.title);
    const sits = kind === 'travel' ? `<div class="field"><span class="lab">어떤 곳에서 볼 말이 필요한가요?</span><div class="chips" id="coachSits">${SITS.map((s, i) => `<button class="chip" data-act="coach-sit" aria-pressed="${i < 4}">${s}</button>`).join('')}</div></div>` : '';
    const sheetImg = K.type === 'image' ? (samples.length ? `<div class="sheet-img" id="coachImg"></div><p class="small">최근에 쓴 글씨 ${samples.length}개예요. 칸마다 써야 했던 글자와 앱의 채점 결과가 같이 들어가요.</p>` : `<div class="note info">아직 모아 둔 글씨가 없어요. 쓰기 연습을 하면 여기에 모여요.<div class="row" style="margin-top:10px"><button class="btn sm" data-act="start" data-mode="write" data-study="normal">쓰기 연습 하러 가기</button></div></div>`) : '';
    const blocked = K.type === 'image' && !samples.length;
    let body;
    if (direct) {
      body = `${sits}${sheetImg}<div class="chat" id="chat" aria-live="polite"></div>
        <form class="chat-in" id="chatForm" ${kind === 'free' ? '' : 'hidden'}><textarea id="chatText" rows="1" placeholder="${kind === 'free' ? '궁금한 것을 적어 주세요' : '이어서 물어보기'}" aria-label="Claude에게 보낼 말"></textarea><button class="btn primary icon" type="submit" aria-label="보내기">${icon('share')}</button></form>
        <div class="row" id="coachBtns">${kind === 'free' || blocked ? '' : `<button class="btn primary" data-act="coach-run" id="coachRun">${icon('spark')}${K.go}</button>`}<button class="btn" data-act="coach-stop" id="coachStop" hidden>멈추기</button></div>
        <p class="small">내 Claude 사용량에서 나가요. 답은 틀릴 수 있어요.</p>`;
    } else if (K.type === 'copy') {
      body = `<textarea id="coachPrompt" readonly style="min-height:240px">${esc(C.buildPrompt('project'))}</textarea><div class="row" style="margin-top:12px"><button class="btn primary" data-act="coach-copy">${icon('copy')}복사</button></div>
        <p class="small">Claude 앱 → 프로젝트 → 새 프로젝트 → ‘지침’ 칸에 붙여 넣으면 돼요.</p>`;
    } else {
      const share = AI.canShare() && coarse();
      body = `${sits}${kind === 'free' ? `<div class="field"><label class="lab" for="coachQ">질문</label><textarea id="coachQ" style="min-height:90px" placeholder="예: ‘つ’와 ‘っ’는 뭐가 달라요?"></textarea></div>` : ''}${sheetImg}
        ${blocked ? '' : `<div class="row">${K.type === 'image'
          ? `${share ? `<button class="btn primary" data-act="coach-share">${icon('share')}그림과 함께 Claude로 보내기</button>` : ''}<button class="btn ${share ? '' : 'primary'}" data-act="coach-save-img">그림 저장</button><button class="btn" data-act="coach-copy">${icon('copy')}부탁 글 복사</button>`
          : `${share ? `<button class="btn primary" data-act="coach-share">${icon('share')}Claude로 보내기</button>` : ''}<a class="btn ${share ? '' : 'primary'}" data-act="coach-open" href="https://claude.ai/new" target="_blank" rel="noopener">복사하고 Claude 열기</a><button class="btn" data-act="coach-copy">${icon('copy')}복사만</button>`}</div>
        <p class="small">${K.type === 'image' ? '그림을 저장했다면 Claude 앱에서 그림을 올리고, 복사한 부탁 글을 붙여 넣어 보내세요.' : 'Claude의 입력칸이 비어 있으면 붙여 넣고 보내세요.'}</p>
        <details class="peek"><summary>보낼 글 미리 보기</summary><pre id="coachPeek"></pre></details>`}
        ${isJSON(K) ? `<div class="field" style="margin-top:22px"><label class="lab" for="coachPaste">Claude가 준 답 붙여 넣기</label><textarea id="coachPaste" placeholder="답을 통째로 붙여 넣으세요"></textarea><div class="row" style="margin-top:10px"><button class="btn" data-act="coach-import">앱에 넣기</button></div></div><div id="coachResult" role="status"></div>` : ''}`;
    }
    A.openSheet(`<div class="sheet-head"><div><h2 class="h2">${title}</h2>${K.sub ? `<p class="small">${K.sub}</p>` : ''}</div><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div><div class="coach">${body}</div>`,
      () => { if (ctl) { ctl.abort(); ctl = null; } cur = null; });
    if (K.type === 'image' && samples.length) { const c = AI.sheetCanvas(samples, A.kanaByText); c.setAttribute('role', 'img'); c.setAttribute('aria-label', '내가 쓴 글씨를 모은 그림'); $('#coachImg').appendChild(c); }
    const peek = $('#coachPeek'); if (peek) { const fill = () => { peek.textContent = promptFor(); }; fill(); const d = peek.closest('details'); d.addEventListener('toggle', fill); }
    const form = $('#chatForm');
    if (form) {
      const ta = $('#chatText');
      const send = () => { const v = ta.value.trim(); if (!v || !cur || cur.busy) return; ta.value = ''; ta.style.height = ''; run(v); };
      form.addEventListener('submit', e => { e.preventDefault(); send(); });
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !coarse()) { e.preventDefault(); send(); } });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
    }
    if (direct && kind === 'explain') run();
  };
  function bubble(who, html) { const d = document.createElement('div'); d.className = 'msg ' + who; d.innerHTML = html; $('#chat').appendChild(d); d.scrollIntoView({ block: 'nearest' }); return d; }
  function setBusy(b) {
    if (!cur) return; cur.busy = b;
    const r = $('#coachRun'), s = $('#coachStop'), f = $('#chatForm');
    if (r) r.hidden = b || turns.length > 0; if (s) s.hidden = !b;
    if (f) { f.querySelector('button').disabled = b; if (!b && (cur.K.type === 'chat' || cur.K.type === 'image') && turns.length) f.hidden = false; }
  }
  // 바로 묻기
  async function run(userText, fresh) {
    if (!cur || cur.busy || !cur.direct) return;
    const me = cur, K = cur.K, first = !turns.length;
    let content;
    if (first) { if (cur.kind === 'free' && !userText) return; content = promptFor(userText); } else { if (!userText) return; content = userText; }
    turns.push({ role: 'user', content });
    if (userText) bubble('me', esc(userText));
    const out = bubble('ai wait', isJSON(K) ? '만드는 중이에요…' : '생각하는 중이에요…');
    setBusy(true);
    ctl = new AbortController();
    let images;
    if (K.type === 'image' && first) { const b = await AI.sheetBlob(cur.samples, A.kanaByText); if (b) images = [b]; }
    const done = () => { if (cur === me) setBusy(false); ctl = null; };
    try {
      const r = await AI.ask(turns.map(t => ({ ...t })), {
        signal: ctl.signal, images, cache: K.type === 'chat' || fresh ? false : true,
        tier: cur.kind === 'explain' || cur.kind === 'quiz' ? 'quick' : 'default',
        onText: t => { if (cur !== me) return; out.classList.remove('wait'); if (isJSON(K)) { const n = (t.match(/"kana"\s*:|"[ぁ-ゖァ-ヺ]{1,3}"\s*:/g) || []).length; out.textContent = n ? `${n}개째 받는 중이에요…` : '만드는 중이에요…'; } else { out.innerHTML = md(t); out.scrollIntoView({ block: 'nearest' }); } }
      });
      if (cur !== me) return;
      turns.push({ role: 'assistant', content: r.text });
      out.classList.remove('wait');
      if (isJSON(K)) { out.remove(); showReply(r.text, $('#chat')); }
      else out.innerHTML = md(r.text) + (r.truncated ? '<p class="small">답이 길어서 중간에 끊겼어요. 나눠서 물어보세요.</p>' : '');
    } catch (e) {
      if (cur !== me) return;
      turns.pop();
      out.classList.remove('wait');
      if (e.code === 'cancelled') { if (e.text) out.innerHTML = md(e.text) + '<p class="small">여기서 멈췄어요.</p>'; else out.remove(); }
      else if (AI.state !== 'on' || (K.type === 'image' && !AI.images)) { done(); toast(e.message); A.coachSheet(me.kind, me.extra); return; }
      else { out.classList.add('err'); out.innerHTML = (e.text ? md(e.text) + '<br>' : '') + esc(e.message) + (first ? '' : ''); }
    }
    done();
    if (cur === me && !turns.length) { const rb = $('#coachRun'); if (rb) rb.hidden = false; }
  }
  // 받은 답(JSON)을 읽어 미리 보여 주고, 누르면 앱에 넣기
  function showReply(text, box) {
    if (!cur) return;
    const K = cur.K; let html;
    const pk = K.type !== 'hints' ? C.parsePack(text, A.allWords()) : null;
    const hn = !pk || !pk.ok ? C.parseHints(text, D.KANA) : null;
    if (pk && pk.ok) {
      cur.result = { pack: pk.pack };
      html = `<div class="got"><b>${esc(pk.pack.name)}</b> · ${pk.pack.words.length}개${pk.skipped ? ` <span class="small">(이미 있는 ${pk.skipped}개는 뺐어요)</span>` : ''}
        <div class="got-list">${pk.pack.words.slice(0, 40).map(w => `<div><span class="kana" lang="ja">${esc(w.text)}</span><span>${esc(w.answers[0])}</span><span class="small">${esc(w.meaning)}</span></div>`).join('')}</div>
        ${pk.errors.length ? `<p class="small">넣지 않은 것 ${pk.errors.length}개: ${esc(pk.errors.slice(0, 3).join(' / '))}</p>` : ''}
        <div class="row"><button class="btn primary" data-act="coach-apply">단어 읽기에 넣기</button>${cur.direct ? `<button class="btn" data-act="coach-again">다시 받기</button>` : ''}</div></div>`;
    } else if (hn && hn.ok) {
      cur.result = { hints: hn.hints };
      html = `<div class="got"><b>외우는 요령 ${Object.keys(hn.hints).length}개</b>
        <div class="got-list hints">${Object.entries(hn.hints).map(([k, v]) => `<div><span class="kana" lang="ja">${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>
        <div class="row"><button class="btn primary" data-act="coach-apply">앱에 넣기</button>${cur.direct ? `<button class="btn" data-act="coach-again">다시 받기</button>` : ''}</div></div>`;
    } else {
      cur.result = null;
      const why = pk && pk.skipped && !pk.errors.length ? `받은 단어 ${pk.skipped}개가 모두 이미 앱에 있어요.` : pk && pk.skipped ? `새로 넣을 단어가 없어요. ${pk.skipped}개는 이미 앱에 있고, 나머지는 가나가 아닌 글자가 섞여 있어요.` : (pk && pk.errors[0]) || (hn && hn.errors[0]) || '답에서 단어장이나 외우는 요령을 찾지 못했어요.';
      html = `<div class="note bad">${esc(why)}${cur.direct ? `<div class="row" style="margin-top:10px"><button class="btn sm" data-act="coach-again">다시 받기</button></div>` : (pk && pk.skipped ? '' : ' Claude가 준 답을 통째로 붙여 넣었는지 확인해 주세요.')}</div>`;
    }
    const d = document.createElement('div'); d.id = 'gotBox'; d.innerHTML = html;
    const old = $('#gotBox'); if (old) old.remove();
    box.appendChild(d); d.scrollIntoView({ block: 'nearest' });
  }
  function apply() {
    const r = cur && cur.result; if (!r) return;
    const box = $('#gotBox');
    if (r.pack) {
      A.db.packs = A.db.packs || []; A.db.packs.push(r.pack); A.db.settings.usePacks = true;
      if (!A.save()) { A.db.packs.pop(); toast('저장하지 못했어요.'); return; }
      box.innerHTML = `<div class="note info"><b>${esc(r.pack.name)}</b>의 ${r.pack.words.length}개를 단어 읽기에 넣었어요.<div class="row" style="margin-top:10px"><button class="btn sm primary" data-act="coach-drill" data-id="${esc(r.pack.id)}">지금 읽어 보기</button><button class="btn sm" data-act="close">닫기</button></div></div>`;
    } else {
      A.db.hints = { ...(A.db.hints || {}), ...r.hints }; A.save();
      box.innerHTML = `<div class="note info">외우는 요령 ${Object.keys(r.hints).length}개를 넣었어요. 그 글자를 틀리거나 글자표에서 누르면 나와요.<div class="row" style="margin-top:10px"><button class="btn sm" data-act="close">닫기</button></div></div>`;
    }
    cur.result = null;
  }

  Object.assign(A.acts, {
    coach: (b, v) => A.coachSheet(v),
    'coach-sit': b => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); const p = $('#coachPeek'); if (p) p.textContent = promptFor(); },
    'coach-run': () => run(),
    'coach-stop': () => { if (ctl) ctl.abort(); },
    'coach-again': () => { if (!cur || cur.busy) return; const g = $('#gotBox'); if (g) g.remove(); turns = []; run(undefined, true); },
    'coach-copy': () => { if (!cur) return; copyText(cur.K.type === 'copy' ? $('#coachPrompt').value : promptFor()).then(() => toast('복사했어요. Claude에 붙여 넣어 주세요.')); },
    'coach-open': () => { if (cur) copyText(promptFor()).then(() => toast('부탁 글을 복사했어요.')); }, // 링크는 그대로 새 창으로 열려요
    'coach-share': async () => {
      if (!cur) return; const text = promptFor(); let file = null;
      if (cur.K.type === 'image') { const b = await AI.sheetBlob(cur.samples, A.kanaByText); if (b) file = new File([b], 'my-kana.png', { type: 'image/png' }); }
      const r = await AI.share(text, file);
      if (r === 'shared') toast(isJSON(cur.K) ? 'Claude가 답을 주면 복사해서 여기에 붙여 넣어 주세요.' : 'Claude에서 보내기를 눌러 주세요.');
      else if (r !== 'cancelled') copyText(text).then(() => toast('보내기가 안 돼서 복사해 두었어요. Claude에 붙여 넣어 주세요.'));
    },
    'coach-save-img': async () => { if (!cur) return; const b = await AI.sheetBlob(cur.samples, A.kanaByText); if (b) { A.download('my-kana-' + new Date().toISOString().slice(0, 10) + '.png', b); toast('그림을 저장했어요.'); } },
    'coach-import': () => { const v = $('#coachPaste').value.trim(); if (!v) { toast('먼저 Claude가 준 답을 붙여 넣어 주세요.'); return; } showReply(v, $('#coachResult')); },
    'coach-apply': apply,
    'coach-drill': b => { const p = (A.db.packs || []).find(x => x.id === b.dataset.id); if (!p) return; const pool = A.allWords().filter(w => w.pack === p.name); if (pool.length) A.startFree({ mode: 'typing', typeKind: 'words', study: 'normal', pool, script: 'mix' }); },
    'coach-paste': () => {
      cur = { kind: 'paste', extra: {}, K: { type: 'any' }, direct: false, result: null, samples: [] };
      A.openSheet(`<div class="sheet-head"><div><h2 class="h2">받은 답 붙여 넣기</h2><p class="small">Claude 앱에서 받은 단어장이나 외우는 요령을 통째로 붙여 넣으세요.</p></div><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
        <div class="coach"><textarea id="coachPaste" style="min-height:180px" aria-label="Claude가 준 답"></textarea><div class="row" style="margin-top:10px"><button class="btn primary" data-act="coach-import">앱에 넣기</button></div><div id="coachResult" role="status"></div></div>`, () => { cur = null; });
    }
  });
})();
