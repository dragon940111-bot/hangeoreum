// Claude 구독으로 쓰는 AI — API 키·추가 요금 없음.
// ① Claude 안에서 연 화면(아티팩트)에서는 플랫폼이 주는 claude.use("sample")로 바로 물어봐요. 쓰는 사람의 Claude 사용량에서 나가고, 첫 물음 때 허락을 받아요.
// ② 그 밖(GitHub Pages·내 컴퓨터)에서는 바로 물어볼 길이 없어서, 부탁 글을 Claude 앱으로 '보내기'(공유)하거나 복사해요.
(function (g) {
  'use strict';
  const KL = g.KL = g.KL || {};
  const AI = KL.ai = { state: 'checking', sample: null, images: 0, onchange: null };

  AI.ready = (async () => {
    try {
      if (!g.claude || typeof g.claude.use !== 'function') return false;
      const s = await g.claude.use('sample'); // 못 쓰는 곳에서는 null (최대 10초쯤 뒤)
      if (!s) return false;
      AI.sample = s;
      try { const l = await s.limits(); AI.images = l && l.images ? l.images.maxCount || 1 : 0; } catch (e) { AI.images = 0; }
      return true;
    } catch (e) { return false; }
  })().then(ok => { AI.state = ok ? 'on' : 'off'; if (AI.onchange) try { AI.onchange(); } catch (e) { } return ok; });

  const GONE = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  AI.errorKo = code => {
    if (code === 'cancelled') return '';
    if (GONE.includes(code)) return '이 화면에서는 Claude에게 바로 물어볼 수 없어요. 아래의 보내기나 복사를 써 주세요.';
    if (code === 'rate_limited') return 'Claude 사용량이 다 찼거나 너무 자주 물었어요. 조금 뒤에 다시 해 주세요.';
    if (code === 'session_expired') return 'Claude에 다시 로그인한 뒤에 해 주세요.';
    if (code === 'refused') return 'Claude가 이 부탁에는 답하지 않았어요. 내용을 바꿔서 다시 해 주세요.';
    if (code === 'images_unavailable' || code === 'image_rejected') return '이 화면에서는 그림을 보낼 수 없어요. 그림을 저장해서 Claude 앱에 직접 올려 주세요.';
    if (code === 'prompt_too_large') return '보낼 내용이 너무 길어요.';
    if (code === 'empty_completion') return 'Claude가 답을 쓰지 않았어요. 질문을 조금 바꿔 보세요.';
    return '답을 받다가 끊겼어요. 다시 해 보세요.';
  };
  // 물어보기. 성공 {text, truncated} / 실패 {code, message(한국어), text?(남겨도 되는 부분)}. 스스로 다시 시도하지 않아요.
  AI.ask = async (input, opt = {}) => {
    if (!AI.sample) throw { code: 'not_granted', message: AI.errorKo('not_granted') };
    const o = { cache: opt.cache === undefined ? true : opt.cache };
    if (opt.onText) o.onText = u => opt.onText(u.text);
    if (opt.signal) o.signal = opt.signal;
    if (opt.tier) o.modelTier = opt.tier;
    if (opt.images && opt.images.length) o.images = opt.images.slice(0, AI.images || 1);
    try { const r = await AI.sample(input, o); return { text: r.text, truncated: !!r.truncated }; }
    catch (e) {
      const code = (e && e.code) || 'upstream_error';
      if (GONE.includes(code)) { AI.state = 'off'; AI.sample = null; if (AI.onchange) try { AI.onchange(); } catch (x) { } }
      if (code === 'images_unavailable') AI.images = 0;
      throw { code, message: AI.errorKo(code), text: e && e.text };
    }
  };

  // 다른 앱으로 보내기 (아이패드·휴대폰의 공유 창 → Claude 앱). 안 되면 복사.
  AI.canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  AI.canShareFile = file => { try { return AI.canShare() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); } catch (e) { return false; } };
  AI.share = async (text, file) => {
    if (!AI.canShare()) return 'unsupported';
    try {
      if (file && AI.canShareFile(file)) await navigator.share({ text, files: [file] });
      else await navigator.share({ text });
      return 'shared';
    } catch (e) { return e && e.name === 'AbortError' ? 'cancelled' : 'failed'; }
  };

  // 내가 쓴 글씨를 한 장의 그림으로 (칸마다 위에 써야 했던 글자와 소리, 아래에 내 글씨, 채점 결과)
  AI.sheetCanvas = (samples, lookup) => {
    const list = samples.slice(-12), cols = list.length <= 4 ? Math.max(1, list.length) : 4, rows = Math.ceil(list.length / cols) || 1;
    const cell = 300, head = 74, pad = 26, W = cols * cell + pad * 2, H = rows * (cell + head) + pad * 2 + 46;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#4B5260'; x.font = '600 22px Pretendard, sans-serif'; x.textBaseline = 'middle';
    x.fillText('일본어 한걸음 · 내가 쓴 가나 (위: 써야 했던 글자와 소리 / 아래: 내 글씨)', pad, pad + 14);
    list.forEach((s, i) => {
      const cx = pad + (i % cols) * cell, cy = pad + 46 + Math.floor(i / cols) * (cell + head), k = lookup(s.text);
      x.fillStyle = '#F5F6F8'; x.fillRect(cx + 6, cy + 4, cell - 12, head - 8);
      x.fillStyle = '#191C22'; x.font = '44px Klee, "Hiragino Mincho ProN", serif'; x.textAlign = 'left'; x.fillText(s.text, cx + 20, cy + head / 2 + 2);
      x.font = '600 24px Pretendard, sans-serif'; x.fillStyle = '#4B5260'; x.fillText(k ? k.answers[0] : '', cx + 30 + 44 * [...s.text].length, cy + head / 2 + 2);
      x.textAlign = 'right'; x.fillStyle = s.ok ? '#11845A' : '#D23A2E'; x.fillText(s.ok ? '앱 채점: 맞음' : '앱 채점: 틀림', cx + cell - 20, cy + head / 2 + 2); x.textAlign = 'left';
      const bx = cx + 6, by = cy + head, bs = cell - 12;
      x.strokeStyle = '#D3D8E1'; x.lineWidth = 2; x.setLineDash([]); x.strokeRect(bx, by, bs, bs);
      x.strokeStyle = 'rgba(224,90,67,.45)'; x.lineWidth = 1.5; x.setLineDash([6, 5]);
      x.beginPath(); x.moveTo(bx + bs / 2, by); x.lineTo(bx + bs / 2, by + bs); x.moveTo(bx, by + bs / 2); x.lineTo(bx + bs, by + bs / 2); x.stroke(); x.setLineDash([]);
      const m = 34, sc = bs - m * 2;
      x.strokeStyle = '#191C22'; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
      for (const st of s.strokes || []) {
        if (!st.length) continue;
        x.beginPath(); x.moveTo(bx + m + st[0][0] * sc, by + m + st[0][1] * sc);
        if (st.length === 1) x.lineTo(bx + m + st[0][0] * sc + .1, by + m + st[0][1] * sc);
        for (let j = 1; j < st.length; j++) x.lineTo(bx + m + st[j][0] * sc, by + m + st[j][1] * sc);
        x.stroke();
      }
    });
    return c;
  };
  AI.sheetBlob = (samples, lookup) => new Promise(res => { try { AI.sheetCanvas(samples, lookup).toBlob(b => res(b), 'image/png'); } catch (e) { res(null); } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
