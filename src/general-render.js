import {ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder} from 'discord.js';
import {generalGroups,rotationMatches} from './general-queue.js';
import {safeDiscordText} from './profile-utils.js';

function button(id,label,style,disabled=false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}
function rosterLines(players,offset=0) {
  if (!players.length) return '없음';
  const lines=[];
  for (let i=0;i<players.length;i++) {
    const p=players[i];
    const line=(offset+i+1)+'. <@'+p.id+'> · '+safeDiscordText(p.gameNickname);
    if (lines.join('\n').length+line.length+1>1000) {
      lines.push('… 외 '+(players.length-i)+'명');
      break;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
export function renderGeneralBoard(session) {
  const closed=session.status==='closed';
  const locked=session.status==='confirmed';
  const {confirmed,waiting}=generalGroups(session);
  const prefix='crowgen:';
  const sid=session.id;
  const embed=new EmbedBuilder()
    .setColor(closed?0x757575:locked?0x22684b:0x384b68)
    .setTitle('🐦‍⬛ 종합게임 모집 | '+safeDiscordText(session.gameName)+(closed?' · 종료':locked?' · 명단 확정':''))
    .setDescription(closed
      ? '이 모집은 종료되었습니다. 아래는 마지막 신청 명단입니다.'
      : locked
        ? '✅ **이번 로테이션 팀 확정!** 현재 참가자는 잠겨 있으며, 새로운 신청은 대기열에 추가됩니다. 관리자는 안내된 판수만큼 게임 후 [다음 로테이션]을 한 번 눌러주세요.'
        : '게임 닉네임을 입력하여 참가 신청하세요. 추가 정보는 선택 사항입니다.\n**선착순 우선 배정**, 관리자 명단 확정 후 최종 참가자가 됩니다. 정원 초과 시 자동 대기합니다. 판수는 반영하지 않습니다.')
    .addFields(
      {name:'🎮 모집 현황',value:'정원 **'+session.capacity+'명** · '+(locked||closed&&session.confirmedAt?'확정':'우선')+' **'+confirmed.length+'명** · 대기 **'+waiting.length+'명**\n🔄 **'+rotationMatches(session)+'판씩 로테이션** (안내용 · 게임별 판수 체크 없음)'+(session.rotationIndex?'\n현재 **'+session.rotationIndex+'회차**':'')+'\n※ 정원은 시청자 신청 수이며 스트리머는 별도입니다.'},
      {name:(locked||closed&&session.confirmedAt?'✅ 확정 참가자':'📋 선착순 우선')+' ('+confirmed.length+'/'+session.capacity+')',value:rosterLines(confirmed)},
      {name:'⏳ 대기 순서 ('+waiting.length+'명)',value:rosterLines(waiting,confirmed.length)},
    )
    .setFooter({text:locked?'신규 신청은 대기열로 추가됩니다. 다음 로테이션 시 현재 팀은 명단에서 제외되며 재신청할 수 있습니다.':'선착순 우선 배정이며 관리자 명단 확정 후 로테이션을 진행합니다.'})
    .setTimestamp(new Date());
  const userRow=new ActionRowBuilder().addComponents(
    button(prefix+'join:'+sid,'참가 신청',ButtonStyle.Success,closed),
    button(prefix+'edit:'+sid,'내 정보 수정',ButtonStyle.Secondary,closed),
    button(prefix+'leave:'+sid,'신청 취소',ButtonStyle.Secondary,closed),
    button(prefix+'status:'+sid,'내 순서 확인',ButtonStyle.Primary,closed),
  );
  const adminRow=new ActionRowBuilder().addComponents(
    button(prefix+'details:'+sid,'신청 정보 보기',ButtonStyle.Secondary,closed),
    button(prefix+'remove:'+sid,'참가자 제외',ButtonStyle.Secondary,closed||locked||session.applicants.length===0),
    button(prefix+(locked?'unconfirm':'confirm')+':'+sid,locked?'확정 취소':'명단 확정',locked?ButtonStyle.Secondary:ButtonStyle.Success,closed||(!locked&&session.applicants.length===0)),
    button(prefix+'next:'+sid,'다음 로테이션',ButtonStyle.Primary,closed||!locked),
    button(prefix+'close:'+sid,'모집 종료',ButtonStyle.Danger,closed),
  );
  return {embeds:[embed],components:[userRow,adminRow],allowedMentions:{parse:[]}};
}
