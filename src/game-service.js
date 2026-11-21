import { nextRound, priorityPlayers, GAME_SIZE } from './rotation.js';
import { buildRoster } from './roster.js';

/** 개별 저장소(JSON+SQLite) 일관성 유지: 시작 실패 시 판수/상태를 이전 값으로 되돌린다. */
export function beginGame(session, {getProfile, persist, markOnnjRegistered}) {
  const waiting=priorityPlayers(session).slice(0,GAME_SIZE);
  // 테스트 모드는 인원 조건만 완화한다. 프로필은 모든 모드에서 필수다.
  const unregistered=waiting.filter(p=>!getProfile(session.guildId,p.id));
  if(unregistered.length){
    throw new Error(`등록된 롤 프로필이 없는 참가자 ${unregistered.length}명이 있습니다. 해당 참가자는 /내전등록을 완료해야 게임을 시작할 수 있습니다.`);
  }
  const before=structuredClone(session);
  let persisted=false;
  try {
    const selected=nextRound(session);
    const roster=buildRoster(session,selected,getProfile);
    session.rounds.at(-1).roster=roster;
    persist();persisted=true;
    // 이번 판 게임 시작은 오늘내전의 수동 등록이 끝났다는 운영상의 확인으로 간주한다.
    markOnnjRegistered(session.guildId,selected.map(p=>p.id));
    return {selected,roster};
  }catch(error){
    Object.assign(session,before);
    if(persisted){try{persist();}catch(e){console.error('판수 롤백 저장 실패:',e);}}
    throw error;
  }
}
