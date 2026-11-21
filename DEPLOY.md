# 까마귀봇 v3.0 배포 안내

- 기존 `src/rotation.js`, `src/store.js`, `data/state.json` 구조 보존
- `data/profiles.sqlite` 자동 생성; `data/`는 Git에서 제외
- Node.js 24 권장 (최소 22.13), `npm ci`로 의존성 설치
- `npm run register`로 신규 /내전등록, /내전수정, /내전정보 명령어 등록
- `npm test` 로 로테이션·프로필·경기 시작 로직 확인
- 이후 `npm start` 실행
- 게임 시작 버튼은 스트리머가 오늘내전 등록을 완료했다고 확인하는 시점에 눌러야 함
- 자동배포 시에도 기존 data 폴더와 환경변수가 유지되는지 확인
- 운영 중 서비스에 재배포하기 전 / 후의 Discord 메시지·로그를 확인하고 문제 발생 시 직전 커밋으로 롤백

주의: GitHub 업로드만으로 Discord 라이브 동작이나 외부 Bot-Hosting 재시작 성공을 보장하지 않음.
