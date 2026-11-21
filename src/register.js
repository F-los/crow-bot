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
const rest=new REST({version:'10'}).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID,DISCORD_GUILD_ID),{body:commands.map(c=>c.toJSON())});
console.log('✅ 까마귀봇 v3 /내전, /내전등록, /내전수정, /내전정보 명령어 등록 완료');
