import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { GAME_SIZE, isGameRunning, priorityPlayers } from './rotation.js';

function showPlayers(players, count = 16) {
  if (players.length === 0) return '없음';
  const lines = players.slice(0, count).map((p, idx) => `${idx + 1}. <@${p.id}> · ${p.matchesPlayed}판`);
  if (players.length > count) lines.push(`…외 ${players.length - count}명`);
  return lines.join('\n').slice(0, 1020);
}

export function renderBoard(session) {
  const playing = isGameRunning(session);
  const queue = priorityPlayers(session);
  const current = playing ? session.currentIds.map((id) => session.players[id]).filter(Boolean) : [];
  const forecast = queue.slice(0, GAME_SIZE);
  const closed = session.status === 'closed';
  const summary = playing ? `${session.round}판 게임 중` : session.round ? `${session.round}판 종료 · 다음 판 대기 중` : '1판 시작 전';

  const embed = new EmbedBuilder()
    .setColor(closed ? 0x757575 : playing ? 0x22684b : 0x263b50)
    .setTitle(`🐦‍⬛ 까마귀봇 | 롤 5:5 내전 (스트리머 + 시청자 ${GAME_SIZE}명)${closed ? ' · 모집 종료' : ''}`)
    .setDescription([
      closed ? '이 모집은 종료되었습니다.' : '아래 버튼으로 참가하거나 취소할 수 있어요.',
'',
session.testMode ? '🧪 **테스트 모드 활성화: 1명 이상 시작 가능**' : '',
      '🔄 **내전은 매 판 로테이션으로 진행됩니다.**',
      '경기가 끝나면 게임 중이던 참가자들은 대기열에서 자동으로 빠집니다. 다음 판도 참가하려면 **「참가 신청」을 다시 눌러주세요.**',
      '',
      '📝 **참가자 필수 안내**',
      '참여하시는 분은 **#💬-내전대화** 채널에 아래 정보를 남겨주세요.',
      '',
      '**롤 닉네임 / 최고 티어 / 현재 티어 / 선호 라인 (중복 가능)**',
      '※ 티어는 솔로 랭크 기준입니다.',
      '※ 언랭크이신 경우 실력 판단이 어려운 점 양해 부탁드립니다.',
      '',
      '📜 **내전 규칙 안내**',
      '**#💌-필독** 채널의 내전 규칙을 한 번씩 읽어주세요.',
      '',
      '매 판 시작 전과 종료 후에는 대기방으로 모여주시면 감사하겠습니다!',
    ].join('\n'))
    .addFields(
      { name: '📊 진행 현황', value: `${summary}\n🎮 게임 중 ${current.length}명 · ⏳ 대기 ${queue.length}명`, inline: false },
      {
        name: playing ? `🎮 ${session.round}판 게임 중 (${current.length}/${GAME_SIZE})` : `🎮 다음 판 예상 참가자 (${forecast.length}/${GAME_SIZE})`,
        value: showPlayers(playing ? current : forecast, GAME_SIZE), inline: true,
      },
      { name: `⏳ 대기열 (${queue.length}명)`, value: showPlayers(queue, 20), inline: true },
    )
    .setFooter({ text: closed ? '까마귀봇 · 종료됨' : '관리자: 게임 시작 → 게임 종료 → 다음 판 시작 순서로 운영해주세요.' })
    .setTimestamp(new Date());

  const suffix = session.id;
  const userRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crow:join:${suffix}`).setLabel('참가 신청').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(closed),
    new ButtonBuilder().setCustomId(`crow:leave:${suffix}`).setLabel('참가 취소').setEmoji('❌').setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`crow:next:${suffix}`).setLabel(session.round === 0 ? '1판 시작' : '다음 판 시작').setEmoji('🎮').setStyle(ButtonStyle.Primary).setDisabled(closed || playing),
    new ButtonBuilder().setCustomId(`crow:finish:${suffix}`).setLabel('게임 종료').setEmoji('🏁').setStyle(ButtonStyle.Danger).setDisabled(closed || !playing),
  );
  const adminRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crow:remove:${suffix}`).setLabel('인원 제외 (관리자)').setEmoji('🚫').setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`crow:count:${suffix}`).setLabel('판수 변경 (관리자)').setEmoji('➕').setStyle(ButtonStyle.Secondary).setDisabled(closed),
  );
  return { embeds: [embed], components: [userRow, adminRow], allowedMentions: { parse: [] } };
}
