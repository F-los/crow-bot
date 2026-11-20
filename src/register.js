import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  throw new Error('DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID 환경변수가 필요합니다.');
}

const command = new SlashCommandBuilder()
  .setName('내전')
  .setDescription('까마귀봇: 스트리머 + 시청자 9명 내전 대기열 관리')
  .addSubcommand((s) => s.setName('모집').setDescription('새 내전 모집판을 만듭니다 (관리자)'))
  .addSubcommand((s) => s.setName('시작').setDescription('1판 시청자 9명을 선발하고 게임을 시작합니다 (관리자)'))
  .addSubcommand((s) => s.setName('다음판').setDescription('다음 판 시청자 9명을 선발합니다 (관리자)'))
  .addSubcommand((s) => s.setName('게임종료').setDescription('현재 게임을 종료하고 9명을 대기열에서 해제합니다 (관리자)'))
  .addSubcommand((s) => s.setName('현황').setDescription('현재 내전 게임 및 대기열 현황을 확인합니다'))
  .addSubcommand((s) => s.setName('제외').setDescription('대기열에서 참가자 1명을 제외합니다 (관리자)')
    .addUserOption((o) => o.setName('유저').setDescription('대기열에서 제외할 디스코드 유저').setRequired(true)))
  .addSubcommand((s) => s.setName('판수변경').setDescription('대기열 참가자의 판수를 증감합니다 (관리자)')
    .addUserOption((o) => o.setName('유저').setDescription('대기열에 있는 디스코드 유저').setRequired(true))
    .addIntegerOption((o) => o.setName('증감').setDescription('예: 1은 +1판, -1은 -1판').setRequired(true).setMinValue(-99).setMaxValue(99)))
  
.addSubcommand((s) =>
  s.setName('테스트모드')
    .setDescription('9명 미만 게임 시작 허용 여부를 설정합니다 (관리자)')
    .addBooleanOption((o) =>
      o.setName('활성화')
        .setDescription('True = 테스트 모드 ON / False = OFF')
        .setRequired(true)
    )
)
.addSubcommand((s) =>
  s.setName('종료')
    .setDescription('모집 전체를 마감하고 기록을 보관합니다 (관리자)')
);


const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: [command.toJSON()] });
console.log('✅ 까마귀봇 v2 /내전 명령어 등록 완료');
