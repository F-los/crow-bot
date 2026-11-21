import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { GAME_SIZE, isGameRunning, priorityPlayers } from './rotation.js';
import { getProfile } from './profiles.js';
import { rosterForBoard, previewRosterLines } from './roster.js';

function showPlayers(players,count=16){
  if(!players.length)return '없음';
  const lines=players.slice(0,count).map((p,i)=>`${i+1}. <@${p.id}> · ${p.matchesPlayed}판`);
  if(players.length>count) lines.push(`…외 ${players.length-count}명`);
  return lines.join('\n').slice(0,1020);
}
function rosterFields(session,players,playing){
  const roster=rosterForBoard(session,players,playing,getProfile);
  const lines=previewRosterLines(roster);
  // Discord Embed 단일 field 1024자 제한: 최대 5명/4명으로 분리하여 모두 출력한다.
  const title=playing?'🎮 확정 참가자 정보 (현재 경기 포함 판수)':'📋 다음 판 예상 명단 (현재까지 참여 판수)';
  if(!lines.length)return [{name:title,value:'대기 인원이 없습니다.',inline:false}];
  const fields=[];
  let chunk='';let part=1;
  for(const line of lines){
    const entry=line.length>400?line.slice(0,400):line;
    if(chunk.length+entry.length+1>950&&chunk){fields.push({name:`${title} ${part++}`,value:chunk,inline:false});chunk='';}
    chunk+=(chunk?'\n':'')+entry;
  }
  if(chunk)fields.push({name:`${title} ${part}`,value:chunk,inline:false});
  return fields;
}
export function renderBoard(session){
  const playing=isGameRunning(session);
  const queue=priorityPlayers(session);
  const current=playing?session.currentIds.map(id=>session.players[id]).filter(Boolean):[];
  const forecast=queue.slice(0,GAME_SIZE);
  const closed=session.status==='closed';
  const summary=playing?`${session.round}판 게임 중`:session.round?`${session.round}판 종료 · 다음 판 대기 중`:'1판 시작 전';
  const embed=new EmbedBuilder()
    .setColor(closed?0x757575:playing?0x22684b:0x263b50)
    .setTitle(`🐦‍⬛ 까마귀봇 v3 | 롤 5:5 내전 (스트리머 + 시청자 ${GAME_SIZE}명)${closed?' · 모집 종료':''}`)
    .setDescription([
      closed?'이 모집은 종료되었습니다.':'아래 버튼으로 참가하거나 취소할 수 있어요.',
      session.testMode?'🧪 **테스트 모드: 1명 이상 시작 가능**':'',
      '🔄 **매 판 로테이션** · 참여 판수 적음 → 직전 판 미참여 → 대기시간 오래됨',
      '경기가 끝나면 게임 중인 참가자는 대기열에서 자동으로 빠집니다. 다음 판도 하려면 다시 참가 신청을 눌러주세요.',
      '',
      '📝 **롤 계정 등록**',
      '최초 참가 시 등록 창에서 **롤아이디#태그 / 현재 티어 / 최고 티어 / 선호 라인**을 입력합니다.',
      '이후 참가 시에는 정보 재입력 없이 버튼 한 번으로 신청합니다.',
      '※ 티어는 솔로 랭크 기준이며, 언랭크는 실력 판단이 어려울 수 있습니다.',
      '',
      '📜 **#💌-필독** 채널의 규칙을 먼저 읽어주세요.',
      '매 판 시작 전과 종료 후에는 디스코드 대기방으로 모여주세요.',
    ].filter(Boolean).join('\n'))
    .addFields(
      {name:'📊 진행 현황',value:`${summary}\n👑 스트리머 고정 · 🎮 게임 중 시청자 ${current.length}/${GAME_SIZE}명 · ⏳ 대기 ${queue.length}명`,inline:false},
      {name:playing?`🎮 ${session.round}판 게임 중 (${current.length}/${GAME_SIZE})`:`🎮 다음 판 예상 참가자 (${forecast.length}/${GAME_SIZE})`,
        value:showPlayers(playing?current:forecast,GAME_SIZE),inline:true},
      {name:`⏳ 대기열 (${queue.length}명)`,value:showPlayers(queue,20),inline:true},
      ...rosterFields(session,playing?current:forecast,playing),
    )
    .setFooter({text:closed?'까마귀봇 v3 · 모집 종료':'관리자: 게임 시작 → 게임 종료 → 다음 판 시작'})
    .setTimestamp(new Date());
  const suffix=session.id;
  const userRow=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crow:join:${suffix}`).setLabel('참가 신청').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(closed),
    new ButtonBuilder().setCustomId(`crow:leave:${suffix}`).setLabel('참가 취소').setEmoji('❌').setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`crow:next:${suffix}`).setLabel(session.round===0?'1판 시작':'다음 판 시작').setEmoji('🎮').setStyle(ButtonStyle.Primary).setDisabled(closed||playing),
    new ButtonBuilder().setCustomId(`crow:finish:${suffix}`).setLabel('게임 종료').setEmoji('🏁').setStyle(ButtonStyle.Danger).setDisabled(closed||!playing)
  );
  const adminRow=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crow:remove:${suffix}`).setLabel('인원 제외 (관리자)').setEmoji('🚫').setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`crow:count:${suffix}`).setLabel('판수 변경 (관리자)').setEmoji('➕').setStyle(ButtonStyle.Secondary).setDisabled(closed),
  );
  return {embeds:[embed],components:[userRow,adminRow],allowedMentions:{parse:[]}};
}
