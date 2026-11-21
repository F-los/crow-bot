import { preferredLanes, rankLabel, safeDiscordText } from './profile-utils.js';

export function buildRoster(session, selected, getProfile) {
  return selected.map((player,index)=>{
    const p=getProfile(session.guildId,player.id);
    return {id:player.id,order:index+1,riotId:p?.riotId??null,
      current:p?rankLabel(p.currentTier,p.currentDivision,p.currentLp):'정보 없음',
      peak:p?rankLabel(p.peakTier,p.peakDivision,p.peakLp):'정보 없음',
      lanes:p?preferredLanes(p.lanes):'정보 없음',
      count:player.matchesPlayed, wasRegistered:Boolean(p?.onnjRegistered), missing:!p};
  });
}
export function rosterLine(p) {
  // 디스코드 멘션과 Riot ID는 분리하여 안전하게 출력한다.
  const name=p.riotId?safeDiscordText(p.riotId):'(정보 확인 필요)';
  return `${p.order}. <@${p.id}> / ${name} / ${p.current} / ${p.peak} / ${p.lanes} · ${p.count}판`;
}
export function previewRosterLines(roster) {
  return roster.map(p=>`${rosterLine(p)} ${p.missing?'⚠️등록 확인 필요':p.wasRegistered?'✅기존':'🆕신규'}`);
}

/** 게임 진행 중에는 시작 당시의 신규/기존·판수 스냅샷을 유지한다. */
export function rosterForBoard(session, players, playing, getProfile) {
  if (playing) {
    const snapshot=session.rounds?.findLast(r=>r.round===session.round)?.roster;
    if (Array.isArray(snapshot)) return snapshot;
  }
  return buildRoster(session,players,getProfile);
}
