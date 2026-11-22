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

/** 확정 명단 화면만 신규 → 기존으로 묶는다. 저장된 선발 순서는 변경하지 않는다. */
export function sortConfirmedRoster(roster) {
  return roster
    .map((player, index) => ({player, index}))
    .sort((a, b) => Number(a.player.wasRegistered) - Number(b.player.wasRegistered) || a.index - b.index)
    .map(({player}, index) => ({...player, order:index+1}));
}

/** 게임 중에는 시작 당시의 신규/기존 상태를 유지하고 화면에서만 재정렬한다. */
export function rosterForBoard(session, players, playing, getProfile) {
  if (playing) {
    const snapshot=session.rounds?.findLast(r=>r.round===session.round)?.roster;
    if (Array.isArray(snapshot)) return sortConfirmedRoster(snapshot);
  }
  const roster=buildRoster(session,players,getProfile);
  return playing ? sortConfirmedRoster(roster) : roster;
}

/**
 * 운영 중 모집판만 최신 프로필을 표시한다.
 * 게임 시작 당시의 신규/기존, 판수, 참가 순서 스냅샷은 그대로 두고
 * 롤 ID·티어·선호 라인만 갱신한다. 저장된 경기 이력은 변경하지 않는다.
 */
export function liveRosterForBoard(session, players, playing, getProfile) {
  const roster=rosterForBoard(session,players,playing,getProfile);
  if(!playing)return roster;
  return roster.map(row=>{
    const profile=getProfile(session.guildId,row.id);
    if(!profile)return row;
    return {...row,riotId:profile.riotId,
      current:rankLabel(profile.currentTier,profile.currentDivision,profile.currentLp),
      peak:rankLabel(profile.peakTier,profile.peakDivision,profile.peakLp),
      lanes:preferredLanes(profile.lanes)};
  });
}
