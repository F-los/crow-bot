# 🐦‍⬛ 까마귀봇

Discord 기반 **리그 오브 레전드(LoL) 내전 참가자 모집 및 로테이션 관리 봇**입니다.

스트리머 1명을 제외한 시청자 9명을 모집하며, 참여 판수를 기준으로 공정한 대기열을 운영합니다.

## ✨ 주요 기능

- ✅ 버튼을 통한 참가 신청 및 취소
- 🎮 시청자 9명 자동 선발 및 게임 시작
- 🔄 참여 판수 기반 자동 로테이션
- 📋 실시간 대기열 및 참가 현황 갱신
- 🏁 게임 종료 시 참가자 대기열 자동 제외
- 👮 관리자 전용 인원 제외 및 판수 변경
- 🧪 테스트 모드 지원 (9명 미만 시작 가능)
- 💾 JSON 기반 참가 기록 저장

## 🔄 로테이션 우선순위

1. 참여 판수가 적은 사람
2. 직전 판에 참여하지 않은 사람
3. 오래 기다린 사람

신규 참가자 등록이나 관리자의 판수 변경 시 대기열이 자동으로 재정렬됩니다.

## 🛠 기술 스택

- Node.js
- JavaScript (ES Modules)
- Discord.js
- JSON

## 🚀 설치 및 실행

### 1. 저장소 클론

```bash
git clone https://github.com/USERNAME/crow-bot.git
cd crow-bot
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env` 파일을 생성하고 아래 정보를 입력합니다.

```env
DISCORD_TOKEN=YOUR_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_APPLICATION_ID
DISCORD_GUILD_ID=YOUR_SERVER_ID
```

### 4. 명령어 등록 및 실행

```bash
npm run register
npm start
```

## 📌 참고 사항

- 게임 시작·종료 및 참가자 관리는 관리자 권한이 필요합니다.
- 게임 종료 후 재참가하려면 다시 참가 신청해야 합니다.
- 이전 참여 판수는 해당 모집이 종료될 때까지 유지됩니다.
- `.env` 및 `data/state.json` 파일은 공개 저장소에 업로드하지 마세요.

---

**crow-bot** — Discord LoL Custom Game Queue Manager