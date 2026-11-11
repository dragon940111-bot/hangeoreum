// 화면 — 처음, 오늘, 글자표, 기록, 설정, 결과
(function () {
  'use strict';
  const A = KL.app, { data: D, store: S, sched: SC, stats: ST } = KL;
  const { $, $$, esc, icon, toast, fmt, fmtFull, whenDue, seg, notice } = A;
  const set = A.set, M = A.MODE_KO;
  const dayKey = SC.dayKey;
  const num = v => (Number.isFinite(+v) ? +v : 0);

  // ── 처음 ──
  let welcomeStep = 1;
  A.pages.welcome = () => {
    const mark = `<div class="brand-mark big" aria-hidden="true">歩</div>`;
    $('#view').innerHTML = welcomeStep === 1 ? `<div class="onboard">${mark}
      <h1 class="h1">어떤 글자부터 배울까요?</h1><p class="sub">가입 없이 바로 시작해요. 공부 기록은 이 기기에만 저장돼요.</p>
      <div class="opts">
        <button data-act="pick-script" data-v="h"><span class="g" lang="ja">あ</span><span class="li-body"><b>히라가나</b><span>일본어의 기본 글자예요. 처음이라면 여기서 시작하세요.</span></span></button>
        <button data-act="pick-script" data-v="k"><span class="g" lang="ja">ア</span><span class="li-body"><b>가타카나</b><span>메뉴판·간판의 외래어에 쓰는 글자예요.</span></span></button>
        <button data-act="pick-script" data-v="mix"><span class="g" lang="ja">あア</span><span class="li-body"><b>둘 다</b><span>두 글자를 한꺼번에 공부해요.</span></span></button>
      </div></div>` : `<div class="onboard">${mark}
      <h1 class="h1">예전에 배운 적이 있나요?</h1><p class="sub">배운 적이 있다면 아는 글자는 건너뛰고, 잊어버린 글자만 다시 배워요.</p>
      <div class="opts">
        <button data-act="welcome-done" data-v="new"><span class="g" lang="ja">一</span><span class="li-body"><b>처음 배워요</b><span>첫 글자부터 하루에 몇 개씩 차근차근 배워요.</span></span></button>
        <button data-act="welcome-done" data-v="check"><span class="g" lang="ja">再</span><span class="li-body"><b>배운 적 있어요</b><span>아는 글자를 먼저 확인해요. 3분쯤 걸려요.</span></span></button>
      </div><button class="btn ghost" data-act="welcome-back" style="margin-top:18px">이전</button></div>`;
  };
  Object.assign(A.acts, {
    'pick-script': (b, v) => { A.setSetting('script', v); welcomeStep = 2; A.pages.welcome(); },
    'welcome-back': () => { welcomeStep = 1; A.pages.welcome(); },
    'welcome-done': (b, v) => { A.setSetting('onboarded', true); welcomeStep = 1; if (v === 'check') A.startPlacement(); else { A.setSetting('placed', true); history.replaceState(null, '', '#today'); A.render(); } }
  });

  // ── 오늘 ──
  function miniChart(script) {
    const pool = A.kanaPool(script === 'mix' ? 'h' : script, ['basic']);
    const cells = pool.map(k => { const st = A.idx.state(k.id, 'read'); return `<i data-s="${st.reps ? Math.max(1, st.stage) : 0}" title="${esc(k.text)}"></i>`; }).join('');
    const known = pool.filter(k => A.idx.get(k.id, 'read').some(a => a.correct && !a.assisted)).length;
    return { html: `<div class="mini" aria-hidden="true">${cells}</div>`, known, total: pool.length };
  }
  function weekNew() { const t = Date.now() - 7 * 864e5; let n = 0; for (const k of D.KANA) { const h = A.idx.get(k.id, 'read'); const first = h.find(a => a.correct && !a.assisted); if (first && Date.parse(first.time) >= t) n++; } return n; }
  function stampOnce() { const k = 'hangeoreum-stamp', d = dayKey(Date.now()); try { if (sessionStorage.getItem(k) === d) return false; sessionStorage.setItem(k, d); } catch (e) { } return true; }
  A.pages.today = () => {
    const s = set(), p = A.coursePlan(), streak = ST.dayStreak(A.db.attempts), today = ST.today(A.db.attempts), mc = miniChart(s.script);
    const seenAny = A.db.attempts.length > 0, wrongAny = A.db.attempts.some(a => !a.correct);
    const nextDue = p.pool.map(i => A.idx.state(i.id, 'read')).filter(st => st.reps && st.due > Date.now()).map(st => st.due).sort((a, b) => a - b)[0];
    const steps = [['복습', p.due.length], ['새 글자', p.fresh.length], ['써 보기', p.write.length], ['단어 읽기', p.words.length]].filter(x => x[1]);
    const hero = p.total ? `<section class="hero">
        <div><h2 class="h2">${today.n ? '남은 공부' : '오늘 할 공부'}</h2>
          <ol class="steps">${steps.map(([l, n]) => `<li><b>${n}</b><span>${l}</span></li>`).join('')}</ol>
          <p class="small">${p.minutes}분쯤 걸려요${p.dueMore > 0 ? ` · 복습이 많아서 ${p.due.length}개만 먼저 해요` : ''}</p></div>
        <button class="btn primary big" data-act="course">${today.n ? '이어서 하기' : '시작하기'}</button></section>`
      : `<section class="hero done">
        <div class="row" style="gap:18px;flex-wrap:nowrap">${seenAny ? `<span class="hanko ${stampOnce() ? 'stamp' : ''}" role="img" aria-label="완료" lang="ja">済</span>` : ''}
          <div><h2 class="h2">${seenAny ? '오늘 공부를 다 했어요' : '범위에 배울 글자가 없어요'}</h2><p class="small">${nextDue ? `다음 복습은 ${whenDue(nextDue)}예요. 그 전에는 자유롭게 연습해도 좋아요.` : '아래에서 골라 자유롭게 연습해 보세요.'}</p></div></div>
        <button class="btn big" data-act="start" data-mode="read" data-study="normal">더 연습하기</button></section>`;
    const place = !s.placed && mc.known < 5 && A.db.attempts.length < 40 ? `<div class="note info rowed"><span><b>예전에 배운 적이 있나요?</b> 아는 글자를 먼저 확인하면 건너뛸 수 있어요. 3분쯤 걸려요.</span><button class="btn sm" data-act="placement">아는 글자 확인</button></div>` : '';
    const basic = A.kanaPool(s.script === 'mix' ? 'h' : s.script, ['basic']);
    const solid = basic.filter(i => A.idx.state(i.id, 'read').stage >= 2).length;
    const widen = !s.range.includes('voiced') && solid >= basic.length * .8 ? `<div class="note info rowed"><span>기본 글자를 거의 다 익혔어요. 이제 탁음·반탁음(が, ぱ)도 배워 볼까요?</span><button class="btn sm" data-act="add-range" data-v="voiced">범위에 넣기</button></div>` : '';
    $('#view').innerHTML = `${notice()}
      <div class="page-head"><div><h1 class="h1">오늘 공부</h1><p class="sub">${today.n ? `오늘 ${today.n}문제를 풀었어요. 정답률 ${Math.round(today.c / today.n * 100)}%` : streak.streak ? `${streak.streak}일째 이어 가는 중이에요.` : '하루 10분, 조금씩 꾸준히.'}</p></div>
        ${seg('script', [['h', '히라가나'], ['k', '가타카나'], ['mix', '둘 다']], s.script, 'aria-label="공부할 글자"')}</div>
      ${place}${hero}${widen}
      <a class="progress-card" href="#chart"><div><b>${A.SCRIPT_KO[s.script === 'mix' ? 'h' : s.script]} ${mc.total}자 중 ${mc.known}자를 읽을 수 있어요</b><span class="small">글자표에서 한 글자씩 볼 수 있어요</span></div>${mc.html}</a>
      <h2 class="h2 section">자유 연습</h2>
      <div class="list">
        <button data-act="setup" data-mode="read"><span class="li-ico">${icon('read')}</span><span class="li-body"><b>읽기</b><span>글자를 보고 소리를 한글로 입력해요</span></span>${icon('chev')}</button>
        <button data-act="setup" data-mode="write"><span class="li-ico">${icon('pen')}</span><span class="li-body"><b>쓰기</b><span>소리를 보고 글자를 손으로 써요</span></span>${icon('chev')}</button>
        <button data-act="setup" data-mode="typing"><span class="li-ico">${icon('keys')}</span><span class="li-body"><b>단어 읽기</b><span>단어나 글자 여러 개를 빠르게 읽어요</span></span>${icon('chev')}</button>
        <button data-act="setup" data-mode="pair"><span class="li-ico">${icon('pair')}</span><span class="li-body"><b>헷갈리는 글자</b><span>シ와 ツ, ぬ와 め처럼 비슷한 글자를 구별해요</span></span>${icon('chev')}</button>
        ${wrongAny ? `<button data-act="start" data-mode="read" data-study="review"><span class="li-ico">${icon('undo')}</span><span class="li-body"><b>틀린 것 다시 풀기</b><span>자주 틀린 글자부터 나와요</span></span>${icon('chev')}</button>` : ''}
      </div>
      <p class="week">${streak.streak ? `<span>연속 <b>${streak.streak}</b>일${streak.studiedToday ? '' : ' · 오늘 하면 이어져요'}</span>` : ''}<span>이번 주에 새로 익힌 글자 <b>${weekNew()}</b>개</span><span>공부한 날 <b>${streak.days}</b>일</span></p>`;
  };
  function setupSheet(mode) {
    const s = set();
    const ranges = [['basic', '기본 글자 46'], ['voiced', '탁음·반탁음 25'], ['yoon', '요음 33'], ['ext', '외래어 표기 13']];
    const desc = { read: '글자를 보고 소리를 한글로 입력해요.', write: '소리를 보고 글자를 손으로 써요. 쓰는 순서는 채점하지 않아요.', typing: '단어나 글자 여러 개를 보고 소리를 이어서 입력해요.', pair: '소리를 보고 비슷하게 생긴 글자 가운데 맞는 것을 골라요.' }[mode];
    const how = { adaptive: `복습할 글자가 먼저 나오고, 새 글자는 하루 ${s.newLimit}개까지 배워요.`, normal: '고른 범위의 글자가 골고루 섞여 나와요.', review: '많이 틀린 것일수록 자주 나와요.' }[s.study];
    A.openSheet(`<div class="sheet-head"><div><h2 class="h2">${esc(M[mode])}</h2><p class="small">${desc}</p></div><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <div class="form">
        <div class="field"><span class="lab">글자</span>${seg('script', [['h', '히라가나'], ['k', '가타카나'], ['mix', '둘 다']], s.script)}</div>
        ${mode === 'typing' ? `<div class="field"><span class="lab">문제</span>${seg('typeKind', [['words', '단어'], ['chars', '글자 여러 개']], s.typeKind)}<p class="small">${s.typeKind === 'words' ? '한자 없이 가나로만 된 단어가 나와요.' : '글자 3~5개가 한 줄로 나와요.'}</p></div>` : ''}
        ${mode !== 'typing' || s.typeKind === 'chars' ? `<div class="field"><span class="lab">범위</span><div class="chips">${ranges.map(([v, l]) => `<button class="chip" data-act="range" data-v="${v}" aria-pressed="${s.range.includes(v)}">${l}</button>`).join('')}</div><p class="small">요음은 きゃ처럼 작은 글자가 붙은 것이고, 외래어 표기(ファ, ティ)는 가타카나에만 있어요.</p></div>` : ''}
        <div class="field"><span class="lab">나오는 순서</span>${seg('study', [['adaptive', '추천'], ['normal', '골고루'], ['review', '틀린 것 먼저']], s.study)}<p class="small">${how}</p></div>
        <button class="btn primary big wide" data-act="start" data-mode="${mode}">시작하기</button>
        <p class="small center">끝내기를 누를 때까지 계속 나와요.</p>
      </div>`);
    $('#sheet').dataset.mode = mode;
  }
  Object.assign(A.acts, {
    course: () => A.startCourse(),
    placement: () => A.startPlacement(),
    setup: b => setupSheet(b.dataset.mode),
    start: b => A.startFree({ mode: b.dataset.mode || $('#sheet').dataset.mode, study: b.dataset.study }),
    range: (b, v) => { const s = set(); const r = s.range.includes(v) ? s.range.filter(x => x !== v) : [...s.range, v]; if (!r.length) { toast('범위는 하나 이상 골라야 해요.'); return; } A.setSetting('range', r); b.setAttribute('aria-pressed', String(r.includes(v))); },
    'add-range': (b, v) => { A.setSetting('range', [...new Set([...set().range, v])]); A.pages.today(); toast('탁음·반탁음을 범위에 넣었어요.'); }
  });
  Object.assign(A.segs, {
    script: v => { A.setSetting('script', v); if (A.view === 'today' && $('#sheet').hidden) A.pages.today(); },
    typeKind: v => { A.setSetting('typeKind', v); setupSheet('typing'); },
    study: v => { A.setSetting('study', v); setupSheet($('#sheet').dataset.mode); }
  });

  // ── 결과 ──
  A.pages.result = () => {
    const r = A.lastResult; if (!r) { history.replaceState(null, '', '#today'); return A.render(); }
    const list = A.db.attempts.filter(a => a.sessionId === r.id), o = ST.overview(list);
    const wrongs = [...new Map(r.wrongs.map(w => [w.id, w])).values()];
    const metrics = r.n ? `<div class="metrics"><div><b>${Math.round(o.c / o.n * 100)}%</b><span>정답률</span></div><div><b>${o.n}</b><span>푼 문제</span></div><div><b>${o.wrong}</b><span>틀린 문제</span></div><div><b>${o.max}</b><span>가장 긴 연속 정답</span></div><div><b>${o.avgSec.toFixed(1)}초</b><span>한 문제에 걸린 시간</span></div>${o.typingPerMin ? `<div><b>${Math.round(o.typingPerMin)}자</b><span>1분에 읽은 글자</span></div>` : ''}</div>` : '';
    let head;
    if (r.kind === 'placement') { const known = list.filter(a => a.correct).length; head = `<h1 class="h1">${list.length}자 중 ${known}자를 알고 있어요</h1><p class="sub">아는 글자는 복습으로 넘기고, 모르는 ${list.length - known}자는 하루에 ${set().newLimit}개씩 새로 배워요.</p>`; }
    else if (r.kind === 'course' && r.completed) head = `<div class="row" style="gap:18px;flex-wrap:nowrap;margin-bottom:8px"><span class="hanko stamp" role="img" aria-label="완료" lang="ja">済</span><div><h1 class="h1">오늘 공부 끝!</h1><p class="sub" style="margin:0">수고했어요. 내일 다시 만나요.</p></div></div>`;
    else head = `<h1 class="h1">${r.n ? `${r.n}문제를 풀었어요` : '문제를 풀지 않고 끝냈어요'}</h1><p class="sub">${esc(M[r.mode] || '')} · ${esc(A.SCRIPT_KO[r.script] || '')}</p>`;
    $('#view').innerHTML = `${head}${r.kind === 'placement' ? '' : metrics}
      ${wrongs.length && r.kind !== 'placement' ? `<h2 class="h2 section">다시 볼 글자</h2><div class="glyphs">${wrongs.slice(0, 30).map(w => `<span lang="ja">${esc(w.text)}</span>`).join('')}</div>` : ''}
      <div class="row section">${r.kind === 'placement' ? `<button class="btn primary big" data-act="course">오늘 공부 시작하기</button>` : wrongs.length && wrongs[0].kind === 'kana' ? `<button class="btn primary big" data-act="retry-wrongs">틀린 것만 다시</button>` : ''}
        ${wrongs.length && r.kind !== 'placement' && wrongs.some(w => w.kind === 'kana') ? `<button class="btn big" data-act="coach" data-v="hints">${icon('spark')}외우는 법 묻기</button>` : ''}<button class="btn big" data-act="go" data-v="today">오늘 화면으로</button>${r.n && r.kind !== 'placement' ? `<button class="btn big ghost" data-act="go-stats" data-v="${esc(r.id)}">자세한 기록</button>` : ''}</div>`;
  };
  Object.assign(A.acts, {
    'retry-wrongs': () => { const r = A.lastResult; const pool = [...new Map(r.wrongs.filter(w => w.kind === 'kana').map(w => [w.id, w])).values()]; A.startFree({ mode: 'read', study: 'normal', pool, script: r.script }); },
    'go-stats': (b, v) => { statSession = v; statMode = 'all'; A.go('stats'); }
  });

  // ── 글자표 ──
  let chartTab = null, chartMode = 'read', wordFilter = 'all';
  const GOJUON = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や_ゆ_よ', 'らりるれろ', 'わ___を', 'ん____'];
  function tile(k) {
    if (!k) return '<div class="tile empty" aria-hidden="true"></div>';
    const st = A.idx.state(k.id, chartMode), s = st.reps ? Math.max(1, st.stage) : 0, due = st.reps && st.due <= Date.now();
    return `<button class="tile ${due ? 'due' : ''}" data-s="${s}" data-act="detail" data-id="${esc(k.id)}" aria-label="${esc(k.text)}, ${esc(k.answers[0])}, ${A.STAGE_KO[s]}${due ? ', 복습할 차례' : ''}"><span class="g" lang="ja">${esc(k.text)}</span><span class="r">${esc(k.answers[0])}</span></button>`;
  }
  A.pages.chart = () => {
    const tab = chartTab || (set().script === 'k' ? 'k' : 'h');
    const head = `${notice()}<div class="page-head"><div><h1 class="h1">글자표</h1><p class="sub" id="chartSub"></p></div>
      <div class="row">${seg('chartTab', [['h', '히라가나'], ['k', '가타카나'], ['w', '단어']], tab)}${tab !== 'w' ? seg('chartMode', [['read', '읽기'], ['write', '쓰기']], chartMode, 'aria-label="기준"') : ''}</div></div>`;
    if (tab === 'w') {
      const words = A.allWords(), seen = words.filter(w => A.idx.seen(w.id, 'typing'));
      const list = words.filter(w => wordFilter === 'all' ? true : wordFilter === 'seen' ? A.idx.seen(w.id, 'typing') : A.idx.get(w.id, 'typing').some(a => !a.correct));
      $('#view').innerHTML = `${head}<div class="row" style="margin-bottom:14px">${seg('wordFilter', [['all', `전체 ${words.length}`], ['seen', `읽어 본 단어 ${seen.length}`], ['wrong', '틀린 적 있는 단어']], wordFilter)}</div>
        ${list.length ? `<div class="list words">${list.slice(0, 400).map(w => { const st = A.idx.state(w.id, 'typing'); return `<div class="li"><span class="w-kana" lang="ja">${esc(w.text)}</span><span class="li-body"><b>${esc(w.answers[0])}</b><span>${esc(w.meaning)}${w.pack ? ' · ' + esc(w.pack) : ''}</span></span><span class="dot" data-s="${st.reps ? Math.max(1, st.stage) : 0}" title="${A.STAGE_KO[st.reps ? Math.max(1, st.stage) : 0]}"></span></div>`; }).join('')}</div>` : '<p class="small">여기에 해당하는 단어가 아직 없어요.</p>'}`;
      $('#chartSub').textContent = '단어 읽기에 나오는 단어예요. 한자 없이 가나로만 되어 있어요.';
      return;
    }
    const conv = t => tab === 'h' ? t : D.kata(t), get = t => D.KANA.find(k => k.script === tab && k.text === t);
    const basic = GOJUON.map(r => [...r].map(c => c === '_' ? tile(null) : tile(get(conv(c)))).join('')).join('');
    const voiced = ['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'].map(r => [...r].map(c => tile(get(conv(c)))).join('')).join('');
    const yoon = D.KANA.filter(k => k.group === 'yoon' && k.script === tab).map(tile).join('');
    const ext = tab === 'k' ? D.KANA.filter(k => k.group === 'ext').map(tile).join('') : '';
    const all = D.KANA.filter(k => k.script === tab), seen = all.filter(k => A.idx.seen(k.id, chartMode)).length;
    $('#view').innerHTML = `${head}
      <div class="legend" aria-hidden="true">${[0, 1, 2, 3, 4, 6].map(s => `<span><i data-s="${s}"></i>${A.STAGE_KO[s]}</span>`).join('')}<span><i class="duedot"></i>복습할 차례</span></div>
      <div class="map-block"><h2 class="h2">기본 글자</h2><div class="grid5">${basic}</div></div>
      <div class="map-block"><h2 class="h2">탁음·반탁음</h2><div class="grid5">${voiced}</div></div>
      <div class="map-block"><h2 class="h2">요음</h2><div class="grid3">${yoon}</div></div>
      ${ext ? `<div class="map-block"><h2 class="h2">외래어 표기</h2><div class="grid5">${ext}</div></div>` : ''}`;
    $('#chartSub').textContent = `${all.length}자 중 ${seen}자를 ${chartMode === 'read' ? '읽어' : '써'} 봤어요. 글자를 누르면 쓰는 순서와 기록이 나와요.`;
  };
  Object.assign(A.segs, { chartTab: v => { chartTab = v; A.pages.chart(); }, chartMode: v => { chartMode = v; A.pages.chart(); }, wordFilter: v => { wordFilter = v; A.pages.chart(); } });
  function detailSheet(id) {
    const k = D.KANA.find(x => x.id === id); if (!k) return;
    const rows = ['read', 'write', 'pair'].map(m => { const h = A.idx.get(k.id, m); if (!h.length) return ''; const s = ST.summary(h), st = A.idx.state(k.id, m), lw = h.filter(a => !a.correct).at(-1);
      return `<dt>${M[m]}</dt><dd>${h.length}번 풀어 ${s.wrong}번 틀렸어요 · ${A.STAGE_KO[st.reps ? Math.max(1, st.stage) : 0]}${st.reps ? ` · 다음 복습 ${whenDue(st.due)}` : ''}${lw ? `<br><span class="small">마지막으로 틀린 때 ${esc(fmt(lw.time))}</span>` : ''}</dd>`; }).join('');
    const partner = A.partnersOf(k, 3).slice(0, A.partnersOf(k, 3).real), hint = A.hintOf(k);
    A.openSheet(`<div class="sheet-head"><span class="small">${esc(A.GROUP_KO[k.group])} · ${k.script === 'h' ? '히라가나' : '가타카나'}</span><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <div class="detail-top"><div id="strokeBox">${A.strokeSVG(k.text)}</div><div><div class="detail-read">${esc(k.answers.join(', '))}</div>${hint ? `<p class="learn-hint">${esc(hint)}</p>` : ''}<button class="btn sm" data-act="replay" data-t="${esc(k.text)}">${icon('play')}쓰는 순서 다시 보기</button></div></div>
      <dl class="facts">${k.origin ? `<dt>유래</dt><dd>한자 <span class="kana" lang="ja">${esc(k.origin)}</span>에서 왔어요</dd>` : ''}${partner.length ? `<dt>헷갈리는 글자</dt><dd>${partner.map(p => `<span class="kana" lang="ja">${esc(p.text)}</span> ${esc(p.answers[0])}`).join(' · ')}</dd>` : ''}${rows || '<dt>기록</dt><dd>아직 풀어 본 적이 없어요</dd>'}</dl>
      <div class="row"><button class="btn primary" data-act="drill" data-id="${esc(k.id)}" data-mode="write">써 보기</button><button class="btn" data-act="drill" data-id="${esc(k.id)}" data-mode="read">읽어 보기</button>${partner.length ? `<button class="btn" data-act="drill" data-id="${esc(k.id)}" data-mode="pair">구별해 보기</button>` : ''}</div>
      <p class="small" style="margin-top:18px">쓰는 순서 그림은 KanjiVG(CC BY-SA 3.0) 자료예요. 쓰기 채점은 순서를 보지 않아요.</p>`);
  }
  Object.assign(A.acts, {
    detail: b => detailSheet(b.dataset.id),
    drill: b => { const k = D.KANA.find(x => x.id === b.dataset.id), m = b.dataset.mode; A.startFree({ mode: m, study: 'normal', pool: m === 'pair' ? [k] : [k, ...A.partnersOf(k, 2)], script: k.script }); }
  });

  // ── 기록 ──
  let statMode = 'all', statSession = '', statLimit = 30, dueLimit = 30;
  A.pages.stats = () => {
    let sel = A.db.attempts;
    if (statSession) sel = sel.filter(a => a.sessionId === statSession);
    if (statMode !== 'all') sel = sel.filter(a => a.mode === statMode);
    const o = ST.overview(sel), rows = ST.byItem(sel), bad = sel.filter(a => !a.correct), conf = ST.confusions(sel).slice(0, 8);
    const dm = statMode === 'all' ? 'read' : statMode;
    const dueList = [...D.KANA, ...A.allWords()].filter(i => A.idx.seen(i.id, dm)).map(i => ({ i, s: A.idx.state(i.id, dm) })).sort((a, b) => a.s.due - b.s.due);
    const sessions = [...A.db.sessions].sort((a, b) => Date.parse(b.start) - Date.parse(a.start)).slice(0, 300);
    const days = ST.daily(A.db.attempts, 14), top = Math.max(10, ...days.map(d => d.n));
    const bars = `<div class="bars" role="img" aria-label="최근 14일 동안 푼 문제 수">${days.map(d => `<div class="bar" title="${d.label} ${d.n}문제"><span class="n">${d.n || ''}</span><i style="height:${d.n ? Math.max(4, d.n / top * 100) : 0}%"><b style="height:${d.n ? d.c / d.n * 100 : 0}%"></b></i><span class="d">${d.label}</span></div>`).join('')}</div><p class="small">막대의 진한 부분이 맞힌 문제예요.</p>`;
    const pct = o.n ? Math.round(o.c / o.n * 100) + '%' : '–';
    $('#view').innerHTML = `${notice()}<div class="page-head"><div><h1 class="h1">기록</h1><p class="sub">실제로 푼 문제만 세어서 보여 줘요.</p></div><button class="btn sm" data-act="csv">표 파일(CSV)로 저장</button></div>
      <h2 class="h2">최근 2주</h2>${bars}
      <div class="row filters">${seg('statMode', [['all', '전체'], ['read', '읽기'], ['write', '쓰기'], ['typing', '단어 읽기'], ['pair', '헷갈리는 글자']], statMode)}
        <select id="sessionFilter" aria-label="공부한 회차 고르기"><option value="">모든 회차</option>${sessions.map(x => `<option value="${esc(x.id)}" ${x.id === statSession ? 'selected' : ''}>${esc(fmt(x.start))} · ${esc(M[x.mode] || '')} · ${num(x.n)}문제${x.interrupted ? ' · 중간에 끊김' : ''}</option>`).join('')}</select></div>
      <div class="metrics"><div><b>${o.n}</b><span>푼 문제</span></div><div><b>${pct}</b><span>정답률</span></div><div><b>${o.pure}</b><span>스스로 맞힘</span></div><div><b>${o.assisted}</b><span>정답을 보고 맞힘</span></div><div><b class="${o.wrong ? 'wrong' : ''}">${o.wrong}</b><span>틀림</span></div><div><b>${o.max}</b><span>가장 긴 연속 정답</span></div><div><b>${o.streak}</b><span>지금 연속 정답</span></div><div><b>${o.avgSec ? o.avgSec.toFixed(1) + '초' : '–'}</b><span>한 문제에 걸린 시간</span></div><div><b>${o.typingPerMin ? Math.round(o.typingPerMin) + '자' : '–'}</b><span>단어 읽기 · 1분에 읽은 글자</span></div><div><b>${rows.filter(r => r.s.wrong).length}</b><span>틀린 적 있는 문제</span></div></div>
      <p class="small">걸린 시간에는 다른 앱을 보느라 화면을 떠나 있던 시간이 들어가지 않아요.</p>
      ${conf.length ? `<h2 class="h2 section">자주 헷갈린 글자</h2><div class="conf">${conf.map(c => `<span><b class="kana" lang="ja">${esc(c.a)}</b><i aria-hidden="true">↔</i><b class="kana" lang="ja">${esc(c.b)}</b><em>${c.n}번</em></span>`).join('')}</div><p class="small">틀렸을 때 다른 글자의 소리를 입력했거나, 다른 글자를 골랐거나, 다른 글자처럼 쓴 경우예요.</p>` : ''}
      ${!sel.length ? `<div class="note info section">아직 기록이 없어요. 오늘 화면에서 공부를 시작해 보세요.</div>` : `
      <h2 class="h2 section">글자·단어별 기록</h2>
      <div class="table-wrap"><table class="items"><thead><tr><th>문제</th><th>틀림 / 푼 횟수</th><th>정답률</th><th>연속 정답<br>지금 / 최고</th><th>연속 정답이 끊긴 때</th><th>마지막으로 틀린 때</th><th>최근 결과</th></tr></thead><tbody>
      ${rows.slice(0, statLimit).map(({ list, s }) => { const last = list.filter(a => !a.correct).at(-1);
        return `<tr><td data-l="문제"><div><span class="kana" lang="ja">${esc(list[0].text)}</span> <span class="small">${esc(M[list[0].mode] || '')}</span></td></div></td><td data-l="틀림 / 푼 횟수"><div><span class="${s.wrong ? 'wrong' : ''}">${s.wrong}</span> / ${s.n}</td></div></td><td data-l="정답률"><div>${Math.round(s.c / s.n * 100)}%</td></div></td><td data-l="연속 정답 지금 / 최고"><div>${s.streak} / ${s.max}</td>
          </div></td><td data-l="연속 정답이 끊긴 때"><div>${s.afterCorrect.length ? s.afterCorrect.slice(-3).map(b => `${b.n}번째에 틀림 <span class="small">(${b.streak}번 연속으로 맞힌 뒤 · ${esc(fmt(b.time))})</span>`).join('<br>') : '없음'}<br><span class="small">${s.stableStart ? `${s.stableStart}번째부터 ${s.streak}번 연속 정답 (${esc(fmt(s.stableSince))}부터)` : '마지막 문제를 틀렸어요'}</span></td>
          </div></td><td data-l="마지막으로 틀린 때"><div>${last ? esc(fmt(last.time)) : '–'}</td>
          </div></td><td data-l="최근 결과"><div><div class="flow" aria-label="최근 ${Math.min(30, list.length)}번 결과">${list.slice(-30).map(b => b.correct ? '<span class="o">●</span>' : '<span class="x">×</span>').join('')}</div><details><summary>하나씩 보기</summary>${list.map((b, i) => `<div class="tl"><b>${i + 1}번째 · ${b.correct ? '맞음' : '틀림'}</b>${b.assisted ? ' · 정답을 보고 풂' : ''}${b.corrected ? ' · 채점을 고침' : ''}${b.lenient ? ' · 긴 소리 빠짐' : ''}${b.slow ? ' · 오래 걸림' : ''}${b.source === 'placement' ? ' · 아는 글자 확인' : ''} <span class="small">(그 회차의 ${num(b.n)}번째 문제)</span><br>${esc(fmtFull(b.time))} · ${(b.elapsedMs / 1000).toFixed(1)}초 · 입력 ‘${esc(b.input)}’</div>`).join('')}<p class="small">연속으로 가장 많이 틀린 횟수 ${s.maxWrong}번</p></details></div></td></tr>`; }).join('')}
      </tbody></table></div>${rows.length > statLimit ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="more-stats">${rows.length - statLimit}개 더 보기</button></div>` : ''}
      <h2 class="h2 section">최근에 틀린 문제</h2>${bad.slice(-20).reverse().map(a => `<div class="tl"><b class="kana" lang="ja">${esc(a.text)}</b> ${esc(a.answers.join(', '))} <span class="small">${esc(M[a.mode] || '')} · ${esc(fmtFull(a.time))} · 그 회차의 ${num(a.n)}번째 문제 · 입력 ‘${esc(a.input)}’</span></div>`).join('') || '<p class="small">틀린 문제가 없어요.</p>'}`}
      <h2 class="h2 section">복습 일정 · ${esc(M[dm])}</h2><p class="small" style="margin:-6px 0 12px">맞힐 때마다 다음 복습이 10분, 1일, 3일, 7일, 14일, 30일 뒤로 늘어나요. 틀리면 3분 뒤에 다시 봐요. 이 간격은 이 앱이 정한 값이에요.</p>
      ${dueList.length ? `<div class="table-wrap"><table><thead><tr><th>문제</th><th>지금 단계</th><th>다음 복습</th><th>틀린 횟수</th></tr></thead><tbody>${dueList.slice(0, dueLimit).map(x => `<tr><td><span class="kana" lang="ja">${esc(x.i.text)}</span></td><td>${A.STAGE_KO[Math.max(1, x.s.stage)]}</td><td>${whenDue(x.s.due)}</td><td>${x.s.lapses}</td></tr>`).join('')}</tbody></table></div>${dueList.length > dueLimit ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-act="more-due">${dueList.length - dueLimit}개 더 보기</button></div>` : ''}` : '<p class="small">아직 배운 글자가 없어요.</p>'}`;
    $('#sessionFilter').onchange = e => { statSession = e.target.value; statLimit = 30; A.pages.stats(); };
  };
  Object.assign(A.segs, { statMode: v => { statMode = v; statLimit = 30; dueLimit = 30; A.pages.stats(); } });
  function exportCSV() {
    const rows = [['시간', '회차', '회차 안 번호', '종류', '단계', '문제', '정답 소리', '입력', '맞음/틀림', '걸린 시간(초)', '채점 방식', '정답을 보고 풂', '헷갈렸다고 표시', '오래 걸림', '긴 소리 빠짐', '헷갈린 글자', '채점 고침', '처음 채점']];
    for (const a of A.db.attempts) rows.push([a.time, a.sessionId, a.n, M[a.mode] || a.mode, a.phase || '', a.text, (a.answers || []).join('|'), a.input, a.correct ? '맞음' : '틀림', (a.elapsedMs / 1000).toFixed(2), a.source, a.assisted ? '예' : '', a.hesitant ? '예' : '', a.slow ? '예' : '', a.lenient ? '예' : '', a.mistook || '', a.corrected ? '예' : '', a.originalCorrect === undefined ? '' : a.originalCorrect ? '맞음' : '틀림']);
    A.download('hangeoreum-records-' + new Date().toISOString().slice(0, 10) + '.csv', '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    toast('표 파일을 저장했어요.');
  }
  Object.assign(A.acts, { 'more-stats': () => { statLimit += 60; A.pages.stats(); }, 'more-due': () => { dueLimit += 60; A.pages.stats(); }, csv: exportCSV });

  // ── 설정 ──
  const li = (title, sub, control) => `<div class="li"><span class="li-body"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</span>${control}</div>`;
  const onoff = (name, on, label) => `<button class="switch" role="switch" aria-checked="${!!on}" data-act="toggle" data-v="${name}" aria-label="${esc(label)}"><i></i></button>`;
  A.pages.prefs = () => {
    const s = set(), db = A.db, mineN = Object.values(db.mine || {}).reduce((n, l) => n + l.length, 0), packN = (db.packs || []).reduce((n, p) => n + p.words.length, 0);
    let used = 0; try { used = Math.round(JSON.stringify(db).length / 5e6 * 100); } catch (e) { }
    const off = { on: '인터넷이 없어도 열려요.', failed: '오프라인 준비에 실패했어요. 인터넷이 있을 때만 열려요.', none: '이 주소에서는 인터넷이 있어야 열려요.' }[A.offline.state];
    $('#view').innerHTML = `${notice()}<div class="page-head"><div><h1 class="h1">설정</h1><p class="sub">가입 없이 쓰고, 기록은 이 기기의 브라우저에만 저장돼요.</p></div></div>
      <h2 class="h2">공부</h2><div class="list">
        ${li('하루에 배울 새 글자', '읽기와 쓰기에 따로 적용돼요.', seg('newLimit', [[5, '5개'], [10, '10개'], [15, '15개'], [20, '20개']], s.newLimit))}
        ${li('오늘 공부에 쓰기 넣기', '끄면 오늘 공부가 읽기와 단어 읽기로만 이어져요.', onoff('courseWrite', s.courseWrite, '오늘 공부에 쓰기 넣기'))}
        ${li('맞히면 바로 다음 문제로', '켜면 정답일 때 1초 뒤에 저절로 넘어가요.', onoff('auto', s.auto, '맞히면 바로 다음 문제로'))}
        ${li('아는 글자로 된 단어 먼저', '단어 읽기에서 읽을 수 있는 글자가 많은 단어부터 나와요.', onoff('wordsFirst', s.wordsFirst, '아는 글자로 된 단어 먼저'))}
        ${li('받아 온 단어장 쓰기', `AI 코치에서 받아 온 단어 ${packN}개를 단어 읽기에 섞어요.`, onoff('usePacks', s.usePacks, '받아 온 단어장 쓰기'))}
      </div>
      <h2 class="h2 section">손글씨</h2><div class="list">
        ${li('채점 기준', '글씨가 서툴러도 맞게 봐주려면 ‘너그럽게’로 두세요. 비슷하게 생긴 글자는 어느 기준에서나 꼼꼼히 봐요.', seg('tolerance', [['strict', '엄격하게'], ['normal', '보통'], ['relaxed', '너그럽게']], s.tolerance))}
        ${li('손바닥 터치 막기', '자동: 펜을 한 번 쓰면 그 뒤로 손가락과 손바닥은 무시해요.', seg('palm', [['auto', '자동'], ['pen', '펜만'], ['all', '손가락도']], s.palm))}
        ${li('내 글씨체 기억하기', `채점을 ‘맞게 쓴 거예요’로 고치면 그 글씨를 기억해요. 지금 ${mineN}개를 기억하고 있어요.`, onoff('learnMine', s.learnMine, '내 글씨체 기억하기'))}
        ${li('내가 쓴 글씨 모아 두기', `AI 코치에게 글씨를 보여 주거나 채점을 다듬는 데 써요. 최근 200개까지, 지금 ${(db.samples || []).length}개예요.`, onoff('collect', s.collect, '내가 쓴 글씨 모아 두기'))}
        ${li('모아 둔 글씨', '획의 좌표만 저장돼요.', `<div class="row"><button class="btn sm" data-act="export-samples">파일로 저장</button><button class="btn sm danger" data-act="clear-mine">기억한 글씨체 지우기</button></div>`)}
      </div>
      <p class="small">손글씨 채점은 글자를 알아보는 AI가 아니라, 교과서 글씨의 획과 모양을 비교하는 방식이에요. 아이패드에서 쓴 획이 저절로 사라진다면 아이패드 설정 → Apple Pencil → 손글씨 입력을 꺼 보세요.</p>
      ${(db.packs || []).length ? `<h2 class="h2 section">받아 온 단어장</h2><div class="list">${db.packs.map(p => li(esc(p.name), `${p.words.length}개 · <span lang="ja">${esc(p.words.slice(0, 6).map(w => w.text).join(' '))}</span>`, `<button class="btn sm danger" data-act="del-pack" data-id="${esc(p.id)}">빼기</button>`)).join('')}</div>` : ''}
      <h2 class="h2 section">기록 보관</h2><div class="list">
        ${li('기록 백업하기', '기기를 바꾸거나 주소가 바뀔 때를 위해 가끔 저장해 두세요.', `<button class="btn sm primary" data-act="export-json">백업 파일 저장</button>`)}
        ${li('기록 가져오기', '<span id="backupStatus">백업 파일을 고르면 지금 기록에 합쳐요. 같은 기록은 한 번만 들어가고, 지금 기록은 지워지지 않아요. 예전 가나연습실 백업도 돼요.</span>', `<div class="row"><label class="btn sm"><input type="file" id="importFile" accept=".json,application/json" class="vh">파일 고르기</label><button class="btn sm" data-act="paste-import">붙여 넣기</button></div>`)}
        ${li('저장 공간', `이 브라우저 저장 공간의 약 ${used}%를 쓰고 있어요.${used > 70 ? ' 많이 찼어요. 백업을 저장해 두세요.' : ''}`, '')}
      </div>
      <h2 class="h2 section">기록 지우기</h2><div class="list">${li('모든 공부 기록 지우기', '백업이 없으면 되돌릴 수 없어요.', `<button class="btn sm danger" data-act="reset">지우기</button>`)}</div>
      <p class="small section">일본어 한걸음 ${A.VERSION} · 글자 ${D.KANA.length}개 · 기본 단어 ${D.WORDS.length}개 · ${off}<br>쓰는 순서 자료 KanjiVG (Ulrich Apel, CC BY-SA 3.0) · 글꼴 Klee One, Pretendard (SIL OFL 1.1)<br>한글로 적은 소리는 실제 일본어 발음과 조금 달라요.</p>`;
    $('#importFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 30e6) { $('#backupStatus').textContent = '파일이 너무 커요(30MB까지). 지금 기록은 그대로예요.'; return; } importText(await f.text()); };
  };
  function importText(text) {
    const msg = t => { for (const id of ['#backupStatus', '#pasteMsg']) if ($(id)) $(id).textContent = t; };
    try {
      const copy = JSON.parse(JSON.stringify(A.db)); // 실패하면 원래 기록을 그대로 두려고 사본에서 먼저 합쳐요
      const r = S.mergeBackup(copy, text), db = A.db;
      db.attempts = copy.attempts; db.sessions = copy.sessions; db.packs = copy.packs; db.quarantine = copy.quarantine;
      A.reindex(); A.save();
      msg(`기록 ${r.added}개를 가져왔어요.${r.duplicates ? ` 이미 있던 ${r.duplicates}개는 건너뛰었어요.` : ''}${r.rejected > 0 ? ` 형식이 맞지 않는 ${r.rejected}개는 넣지 않았어요.` : ''}`);
      toast('기록을 가져왔어요.');
    } catch (err) { msg('가져오지 못했어요. ' + err.message + ' 지금 기록은 그대로예요.'); }
  }
  Object.assign(A.segs, { newLimit: v => A.setSetting('newLimit', +v), tolerance: v => A.setSetting('tolerance', v), palm: v => A.setSetting('palm', v) });
  Object.assign(A.acts, {
    toggle: (b, v) => { const on = !set()[v]; A.setSetting(v, on); b.setAttribute('aria-checked', String(on)); },
    'export-json': () => A.exportSheet('기록 백업', 'hangeoreum-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(A.db), 'application/json'),
    'export-samples': () => A.exportSheet('모아 둔 글씨', 'hangeoreum-handwriting-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ kind: 'handwriting-samples', version: 1, samples: A.db.samples || [], mine: A.db.mine || {} }), 'application/json'),
    'paste-import': () => A.openSheet(`<div class="sheet-head"><h2 class="h2">붙여 넣어 가져오기</h2><button class="btn icon ghost" data-act="close" aria-label="닫기">${icon('close')}</button></div>
      <p class="small">복사해 둔 백업 내용을 통째로 붙여 넣으세요.</p><textarea id="pasteText" style="min-height:200px" aria-label="백업 내용"></textarea>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="paste-import-go">가져오기</button></div><p class="small" id="pasteMsg" role="status"></p>`),
    'paste-import-go': () => importText($('#pasteText').value),
    'clear-mine': () => A.ask('기억해 둔 내 글씨체를 모두 지울까요? 공부 기록은 그대로 남아요.', '지우기', true).then(y => { if (y) { A.db.mine = {}; A.save(); A.pages.prefs(); } }),
    'del-pack': b => { const id = b.dataset.id; A.ask('이 단어장을 뺄까요? 이미 푼 기록은 남아요.', '빼기', true).then(y => { if (y) { A.db.packs = A.db.packs.filter(p => p.id !== id); A.save(); A.pages.prefs(); } }); },
    reset: () => A.ask('모든 공부 기록을 지울까요? 백업이 없으면 되돌릴 수 없어요.', '모두 지우기', true).then(y => { if (!y) return; const keep = A.db.settings; A.db = A.store.db = S.emptyDB(); A.db.settings = keep; A.reindex(); A.save(); toast('기록을 지웠어요.'); A.pages.prefs(); })
  });
})();
