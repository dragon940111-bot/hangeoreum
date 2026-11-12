// 인터넷 없이도 열리게 하는 일꾼. 판이 바뀌면 아래 VERSION을 올려요(옛 저장분은 지워져요).
// 화면 파일(index.html)은 인터넷이 되면 새것을 먼저 받고, 나머지는 저장해 둔 것을 먼저 써요. 공부 기록(localStorage)은 건드리지 않아요.
const VERSION = 'hangeoreum-0.3.1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.png', 'icon-512.png', 'apple-touch-icon.png', 'css/app.css',
  'fonts/KleeOne-kana.woff2', 'fonts/Pretendard-Regular.subset.woff2', 'fonts/Pretendard-SemiBold.subset.woff2', 'fonts/Pretendard-Bold.subset.woff2',
  'js/strokes-data.js', 'js/data.js', 'js/text.js', 'js/store.js', 'js/scheduler.js', 'js/stats.js', 'js/recognize.js', 'js/ink.js', 'js/claude.js', 'js/ai.js', 'js/app.js', 'js/app-play.js', 'js/app-pages.js', 'js/app-coach.js'];
// 저장분을 만들 때는 브라우저가 잠깐 보관한 사본(GitHub Pages는 10분)이 아니라 서버에서 새로 받아요 — 아니면 새 판 이름에 옛 파일이 들어가요(문제 15)
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('hangeoreum-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const page = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (page) { // 새 판을 먼저, 안 되면 저장분
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); } return r; }).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })));
});
