import {ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder} from 'discord.js';
import {MODE_META, TICKET_SOURCES, eligibleModePlayers, pendingSolo} from './mode-queue.js';
import {getProfile} from './profiles.js';
import {safeDiscordText} from './profile-utils.js';

function linesFor(session, players, limit=20) {
  if (!players.length) return '없음';
  const lines=players.slice(0,limit).map((p,i)=>{
    const profile=getProfile(session.guildId,p.id);
    const riot=profile?.riotId?` · ${safeDiscordText(profile.riotId)}`:'';
    const source=session.mode==='solo'?` · ${TICKET_SOURCES[p.source]||'듀오권'}`:'';
    const state=session.mode==='solo'?` · ${p.approval==='approved'?'✅ 승인':'🕓 확인 대기'}`:'';
    return `${i+1}. <@${p.id}>${riot}${source}${state}`;
  });
  if(players.length>limit)lines.push(`… 외 ${players.length-limit}명`);
  return lines.join('\n').slice(0,1020);
}
function button(id,label,style,disabled=false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}
export function renderModeBoard(session) {
  const solo=session.mode==='solo', playing=session.phase==='playing', closed=session.status==='closed';
  const meta=MODE_META[session.mode];
  const ready=eligibleModePlayers(session);
  const intro=solo?[
    '**듀오 1판 = 5,000원 후원 또는 룰렛 듀오권 1장**',
    '① 획득한 듀오권 종류로 신청 → ② 관리자가 후원/룰렛 내역 확인 후 승인',
    '③ 승인된 신청자부터 순서대로 듀오 진행 · 완료 시 자동 대기열 제외',
    '⚠️ 신청만으로 결제·사용권이 자동 확인되거나 차감되지는 않습니다.',
  ]:[
    '**자랭 시참은 무료입니다.**',
    '신청한 순서대로 스트리머와 함께할 시청자 4명을 선발합니다.',
    '참여한 시청자는 게임 종료 시 대기열에서 자동 제외되며, 재신청할 수 있습니다.',
  ];
  const embed=new EmbedBuilder()
    .setColor(closed?0x757575:playing?0x22684b:0x384b68)
    .setTitle(`🐦‍⬛ 까마귀봇 v4 | ${meta.label}${closed?' · 모집 종료':''}`)
    .setDescription([closed?'현재 모집은 종료되었습니다.':'아래 버튼으로 참가 신청/취소할 수 있습니다.',...intro].join('\n'))
    .addFields(
      {name:'📊 진행 현황',value:`${playing?`${session.round}번째 게임 진행 중`:session.round?`${session.round}게임 완료 · 다음 대기 중`:'시작 전'}\n🎮 게임 중 ${session.current.length}/${meta.slots}명 · ⏳ 대기 ${session.waiting.length}명${solo?` · ✅ 승인 ${ready.length}명 / 🕓 확인 대기 ${pendingSolo(session).length}명`:''}`,inline:false},
      {name:playing?'🎮 현재 참가자':'🎮 다음 선발 예상',value:linesFor(session,playing?session.current:ready.slice(0,meta.slots)),inline:false},
      {name:`⏳ 전체 대기열 (${session.waiting.length}명)`,value:linesFor(session,session.waiting),inline:false},
    )
    .setFooter({text:solo?'승인과 사용권 실제 확인/처리는 관리자 책임입니다.':'관리자: 팀 확정 → 게임 종료 · 자랭 4명 필요'})
    .setTimestamp(new Date());
  const key=`crowv4:${session.mode}`;
  const sid=session.id;
  const userRow=new ActionRowBuilder().addComponents(solo?[
    button(`${key}:donation:${sid}`,'5,000원 듀오 신청',ButtonStyle.Success,closed),
    button(`${key}:roulette:${sid}`,'룰렛 듀오권 신청',ButtonStyle.Success,closed),
    button(`${key}:leave:${sid}`,'신청 취소',ButtonStyle.Secondary,closed),
    button(`${key}:status:${sid}`,'내 대기 현황',ButtonStyle.Primary),
  ]:[
    button(`${key}:join:${sid}`,'무료 시참 신청',ButtonStyle.Success,closed),
    button(`${key}:leave:${sid}`,'신청 취소',ButtonStyle.Secondary,closed),
    button(`${key}:status:${sid}`,'내 대기 현황',ButtonStyle.Primary),
  ]);
  const adminButtons=[
    ...(solo?[button(`${key}:approve:${sid}`,'승인 관리',ButtonStyle.Secondary,closed)]:[]),
    button(`${key}:start:${sid}`,solo?'듀오 시작':'팀 확정',ButtonStyle.Primary,closed||playing),
    button(`${key}:finish:${sid}`,'게임 종료',ButtonStyle.Danger,closed||!playing),
    button(`${key}:remove:${sid}`,'인원 제외',ButtonStyle.Secondary,closed),
  ];
  return {embeds:[embed],components:[userRow,new ActionRowBuilder().addComponents(adminButtons)],allowedMentions:{parse:[]}};
}
