import {ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder} from 'discord.js';
import {generalGroups} from './general-queue.js';
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
  const {confirmed,waiting}=generalGroups(session);
  const prefix='crowgen:';
  const sid=session.id;
  const embed=new EmbedBuilder()
    .setColor(closed?0x757575:0x384b68)
    .setTitle('🐦‍⬛ 종합게임 모집 | '+safeDiscordText(session.gameName)+(closed?' · 종료':''))
    .setDescription(closed
      ? '이 모집은 종료되었습니다. 아래는 마지막 신청 명단입니다.'
      : '게임 닉네임을 입력하여 참가 신청하세요. 추가 정보는 선택 사항입니다.\n**선착순 확정**, 정원 초과 시 자동 대기합니다. 판수와 롤 프로필은 사용하지 않습니다.')
    .addFields(
      {name:'🎮 모집 현황',value:'정원 **'+session.capacity+'명** · 확정 **'+confirmed.length+'명** · 대기 **'+waiting.length+'명**\n※ 정원은 신청자 수이며 스트리머는 별도입니다.'},
      {name:'✅ 확정 참가자 ('+confirmed.length+'/'+session.capacity+')',value:rosterLines(confirmed)},
      {name:'⏳ 대기 순서 ('+waiting.length+'명)',value:rosterLines(waiting,confirmed.length)},
    )
    .setFooter({text:'취소·관리자 제외 시 대기 1순위가 자동 확정됩니다. 추가 정보는 관리자만 조회합니다.'})
    .setTimestamp(new Date());
  const userRow=new ActionRowBuilder().addComponents(
    button(prefix+'join:'+sid,'참가 신청',ButtonStyle.Success,closed),
    button(prefix+'edit:'+sid,'내 정보 수정',ButtonStyle.Secondary,closed),
    button(prefix+'leave:'+sid,'신청 취소',ButtonStyle.Secondary,closed),
    button(prefix+'status:'+sid,'내 순서 확인',ButtonStyle.Primary,closed),
  );
  const adminRow=new ActionRowBuilder().addComponents(
    button(prefix+'details:'+sid,'신청 정보 보기',ButtonStyle.Secondary,closed),
    button(prefix+'remove:'+sid,'참가자 제외',ButtonStyle.Secondary,closed||session.applicants.length===0),
    button(prefix+'close:'+sid,'모집 종료',ButtonStyle.Danger,closed),
  );
  return {embeds:[embed],components:[userRow,adminRow],allowedMentions:{parse:[]}};
}
