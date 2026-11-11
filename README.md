# 일본어 한걸음

히라가나·가타카나와 여행 기본 단어를 소리 없이 읽고·쓰고·입력하며 익히는 웹앱이에요. 로그인 없이 바로 쓰고, 학습 기록은 각 기기의 브라우저에만 저장돼요(이 저장소에는 기록이 없어요).

- 앱 주소: https://dragon940111-bot.github.io/hangeoreum/
- 아이패드: Safari로 열고 공유 → 홈 화면에 추가
- 빌드 없음: 이 폴더 그대로가 정적 웹사이트예요.
- 한 번 열면 인터넷 없이도 열려요(`sw.js`). 판을 올릴 때마다 `sw.js`의 VERSION을 바꿔요.
- AI 코치는 쓰는 사람의 Claude 구독으로만 돌아가요(API·키·추가 요금 없음). 이 주소에서는 부탁 글을 Claude 앱으로 보내거나 복사하고, 받은 답을 붙여 넣어요.
- 판: 0.2.2 (2026-11-12). 개발 기록·시험은 원본 프로젝트 폴더의 `docs/`에 있어요(이 저장소에는 앱 파일만).

## 출처·라이선스
- `js/strokes-data.js`: KanjiVG (c) Ulrich Apel, CC BY-SA 3.0 — http://kanjivg.tagaini.net (이 파일은 같은 조건으로 배포)
- 글꼴: Klee One (Fontworks, SIL OFL 1.1, 가나 subset) · Pretendard (SIL OFL 1.1, 공식 subset) — `fonts/*OFL.txt`
- 한글 발음은 근사 표기(원어민 검수 전). 손글씨 채점은 인식 AI가 아닌 모양 비교예요.
