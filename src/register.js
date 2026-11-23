import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
const {DISCORD_TOKEN,DISCORD_CLIENT_ID,DISCORD_GUILD_ID}=process.env;
if(!DISCORD_TOKEN||!DISCORD_CLIENT_ID||!DISCORD_GUILD_ID)throw new Error('DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID 환경변수가 필요합니다.');
const command=new SlashCommandBuilder().setName('내전').setDescription('까마귀봇 v3: 스트리머 + 시청자 9명 내전 관리')
  .addSubcommand(s=>s.setName('모집').setDescription('새 내전 모집판을 만듭니다 (관리자)'))
  .addSubcommand(s=>s.setName('시작').setDescription('시청자 9명을 선발하고 1판을 시작합니다 (관리자)'))
  .addSubcommand(s=>s.setName('다음판').setDescription('다음 판 시청자 9명을 선발합니다 (관리자)'))
  .addSubcommand(s=>s.setName('게임종료').setDescription('현재 게임을 종료하고 게임 참가자를 대기열에서 해제합니다 (관리자)'))
  .addSubcommand(s=>s.setName('현황').setDescription('내전 게임 및 대기열 현황'))
  .addSubcommand(s=>s.setName('제외').setDescription('대기열 참가자 제외 (관리자)').addUserOption(o=>o.setName('유저').setDescription('제외할 유저').setRequired(true)))
  .addSubcommand(s=>s.setName('판수변경').setDescription('참가 판수 증감 (관리자)')
    .addUserOption(o=>o.setName('유저').setDescription('유저').setRequired(true))
    .addIntegerOption(o=>o.setName('증감').setDescription('예: +1 또는 -1').setRequired(true).setMinValue(-99).setMaxValue(99)))
  .addSubcommand(s=>s.setName('테스트모드').setDescription('9명 미만 게임 시작 허용 (관리자)')
    .addBooleanOption(o=>o.setName('활성화').setDescription('ON/OFF').setRequired(true)))
  .addSubcommand(s=>s.setName('종료').setDescription('모집 마감 및 기록 보관 (관리자)'));
const commands=[command,
  new SlashCommandBuilder().setName('내전등록').setDescription('까마귀봇 롤 프로필 최초 등록'),
  new SlashCommandBuilder().setName('내전수정').setDescription('내 롤 프로필 수정'),
  new SlashCommandBuilder().setName('내전정보').setDescription('내 롤 프로필 확인'),
];
// v4: 내전과 독립적인 솔랭 듀오/자랭 시참 대기열
function modeCommands(name,description) {
  return new SlashCommandBuilder().setName(name).setDescription(description)
    .addSubcommand(s=>s.setName('모집').setDescription('새 모집판 생성 (관리자)'))
    .addSubcommand(s=>s.setName('현황').setDescription('현재 대기열 및 게임 현황'))
    .addSubcommand(s=>s.setName('시작').setDescription('대기열에서 참가자를 확정하고 게임 시작 (관리자)'))
    .addSubcommand(s=>s.setName('게임종료').setDescription('이번 게임을 종료하고 참가자를 자동 제외 (관리자)'))
    .addSubcommand(s=>s.setName('제외').setDescription('대기열에서 사용자 제외 (관리자)')
      .addUserOption(o=>o.setName('유저').setDescription('제외할 사용자').setRequired(true)))
    .addSubcommand(s=>s.setName('종료').setDescription('모집판 종료 및 기록 보관 (관리자)'));
}
const solo=modeCommands('솔랭','5,000원/룰렛 듀오권 확인 후 솔랭 듀오 대기열 관리')
  .addSubcommand(s=>s.setName('승인').setDescription('듀오권 확인 후 신청 승인 (관리자)')
    .addUserOption(o=>o.setName('유저').setDescription('승인할 사용자').setRequired(true)));
const flex=modeCommands('자랭','무료 자랭 시참: 스트리머+시청자 4명, 별도 판수 로테이션')
  .addSubcommand(s=>s.setName('확정취소').setDescription('방금 확정한 자랭 팀을 취소하고 판수·명단 복구 (관리자)'))
  .addSubcommand(s=>s.setName('판수변경').setDescription('자랭 전용 참여 판수 조정 (관리자)')
    .addUserOption(o=>o.setName('유저').setDescription('대기 중인 유저').setRequired(true))
    .addIntegerOption(o=>o.setName('증감').setDescription('예: +1 또는 -1').setRequired(true).setMinValue(-99).setMaxValue(99)));
const general = new SlashCommandBuilder().setName('종합게임').setDescription('종합게임 선착순 시참 모집 관리')
  .addSubcommand(s=>s.setName('모집').setDescription('게임 이름·모집 인원으로 모집판 생성 (관리자)')
    .addStringOption(o=>o.setName('게임').setDescription('게임 이름 (예: 배틀그라운드)').setRequired(true).setMinLength(1).setMaxLength(60))
    .addIntegerOption(o=>o.setName('인원').setDescription('모집할 시청자 수 (1~100명, 스트리머 제외)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addIntegerOption(o=>o.setName('로테이션판수').setDescription('한 팀이 진행할 판수, 안내용 (1~30판)').setRequired(true).setMinValue(1).setMaxValue(30)))
  .addSubcommand(s=>s.setName('현황').setDescription('현재 게임 모집 인원과 대기열 확인'))
  .addSubcommand(s=>s.setName('확정').setDescription('현재 선착순 참가자 명단 확정 (관리자)'))
  .addSubcommand(s=>s.setName('확정취소').setDescription('확정 해제 후 기존 순서로 모집 재개 (관리자)'))
  .addSubcommand(s=>s.setName('다음로테이션').setDescription('현재 팀을 뒤로 보내고 다음 선착순 팀 확정 (관리자)'))
  .addSubcommand(s=>s.setName('명단').setDescription('닉네임 및 추가 정보를 파일로 조회 (관리자)'))
  .addSubcommand(s=>s.setName('제외').setDescription('참가자를 명단에서 제외 (관리자)')
    .addUserOption(o=>o.setName('유저').setDescription('제외할 사용자').setRequired(true)))
  .addSubcommand(s=>s.setName('종료').setDescription('종합게임 모집 종료·기록 보관 (관리자)'));
commands.push(solo,flex,general);
const rest=new REST({version:'10'}).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID,DISCORD_GUILD_ID),{body:commands.map(c=>c.toJSON())});
console.log('✅ 까마귀봇 v4 /내전, /내전등록, /내전수정, /내전정보, /솔랭, /자랭, /종합게임 명령어 등록 완료');
