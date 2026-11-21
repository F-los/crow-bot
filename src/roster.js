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
  const name=safeDiscordText(p.riotId??`<@${p.id}> (프로필 미등록)`);
  return `${p.order}. ${name} / ${p.current} / ${p.peak} / ${p.lanes} · ${p.count}판`;
}
export function rosterMessages(session, roster) {
  const old=roster.filter(r=>r.wasRegistered);
  const fresh=roster.filter(r=>!r.wasRegistered && !r.missing);
  const missing=roster.filter(r=>r.missing);
  const head=`🐦‍⬛ **까마귀봇 ${session.round}판 게임 중**\n👑 스트리머 고정 참가 · 👥 시청자 ${roster.length}/9\n**롤 닉네임 / 현재티어 / 최고티어 / 선호라인 · 이번 모집 참여판수**`;
  const chunks=[head];
  for(const [title,group] of [[`✅ 기존 등록 (${old.length}명)`,old],[`🆕 이번 판 신규 등록 처리 (${fresh.length}명)`,fresh],[`⚠️ 프로필 미등록 (${missing.length}명)`,missing]]){
    let chunk=title;
    for(const p of group){const line=rosterLine(p);
      if(chunk.length+line.length+1>1700){chunks.push(chunk);chunk=title+' (계속)';}
      chunk+='\n'+line;
    }
    chunks.push(chunk);
  }
  return chunks;
}
export function previewRosterLines(roster) {
  return roster.map(p=>`${rosterLine(p)} ${p.wasRegistered?'✅기존':p.missing?'⚠️프로필없음':'🆕미등록'}`);
}
