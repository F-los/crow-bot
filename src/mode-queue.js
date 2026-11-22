/**
 * v4 솔랭 듀오 / 자랭 시참 대기열.
 * 기존 v3 내전 데이터(guild.active)와 별도 관리한다.
 */
export const MODE_META = Object.freeze({
  solo: {label:'솔랭 듀오',slots:1},
  flex: {label:'자랭 시참',slots:4},
});
export const TICKET_SOURCES = Object.freeze({donation:'5,000원 후원',roulette:'룰렛 듀오권'});

function assertOpen(session) {
  if (!session) throw new Error('진행 중인 모집이 없습니다.');
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
}
function assertMode(mode) {
  if (!MODE_META[mode]) throw new Error('알 수 없는 모집 방식입니다.');
}
export function createModeSession(guildId,channelId,id,mode,now=Date.now()) {
  assertMode(mode);
  return {id,guildId,channelId,messageId:null,mode,status:'open',
    createdAt:now,phase:'waiting',round:0,waiting:[],current:[],rounds:[],
    ...(mode==='flex'?{flexRecords:{}}:{})};
}
/**
 * 자랭 전용 판수 기록. 내전(guild.active.players)과 완전히 분리한다.
 * v4 초기에 생성된 모집에는 flexRecords가 없으므로 저장된 경기 기록으로
 * 최초 한 번 재구성하여 기존 참가 횟수를 잃지 않는다.
 */
export function flexRecords(s) {
  if(s.mode!=='flex')return {};
  if(s.flexRecords && typeof s.flexRecords==='object')return s.flexRecords;
  const records=Object.create(null);
  for(const round of s.rounds??[]) {
    for(const player of round.players??[]) {
      if(!player?.id)continue;
      const r=records[player.id]??={matchesPlayed:0,lastPlayedRound:0};
      r.matchesPlayed++;
      r.lastPlayedRound=Math.max(r.lastPlayedRound,round.round);
    }
  }
  s.flexRecords=records;
  return records;
}

/** 내전과 동일: 판수 적음 → 직전 판 미참여 → 오래 기다림 → 원래 신청 순서. */
export function priorityFlexPlayers(s) {
  if(s.mode!=='flex')return [...s.waiting];
  const records=flexRecords(s);
  return [...s.waiting].sort((a,b)=>{
    const ra=records[a.id]??{matchesPlayed:0,lastPlayedRound:0};
    const rb=records[b.id]??{matchesPlayed:0,lastPlayedRound:0};
    const lastA=s.round>0&&ra.lastPlayedRound===s.round?1:0;
    const lastB=s.round>0&&rb.lastPlayedRound===s.round?1:0;
    return ra.matchesPlayed-rb.matchesPlayed
      ||lastA-lastB
      ||(a.joinedAt??0)-(b.joinedAt??0);
    // 동일 시각에 신청했을 때는 원래 waiting 배열 순서(stable sort)를 유지.
  });
}

/** 내전과 마찬가지로 관리자만 대기 중인 참가자 판수를 조절한다. */
export function adjustFlexMatches(s,userId,delta) {
  assertOpen(s);
  if(s.mode!=='flex')throw new Error('자랭 판수만 변경할 수 있습니다.');
  if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>99)
    throw new Error('변경값은 -99~99 사이의 0이 아닌 정수로 입력해주세요.');
  if(!s.waiting.some(p=>p.id===userId))
    throw new Error('판수 변경은 현재 자랭 대기열의 참가자만 가능합니다.');
  const records=flexRecords(s);
  const record=records[userId]??={matchesPlayed:0,lastPlayedRound:0};
  if(record.matchesPlayed+delta<0)throw new Error('참여 판수는 0판보다 작아질 수 없습니다.');
  record.matchesPlayed+=delta;
  return record;
}

export function joinModeQueue(s,userId,displayName,source=null,now=Date.now()) {
  assertOpen(s);
  if (s.waiting.some(p=>p.id===userId) || s.current.some(p=>p.id===userId))
    throw new Error('이미 대기 중이거나 현재 게임에 참가하고 있습니다.');
  if (s.mode==='solo' && !Object.hasOwn(TICKET_SOURCES,source))
    throw new Error('듀오권 획득 경로를 선택해주세요.');
  const entry={id:userId,displayName:String(displayName||'참가자').slice(0,80),
    joinedAt:now,source:s.mode==='solo'?source:null,
    approval:s.mode==='solo'?'pending':'approved'};
  if(s.mode==='flex')flexRecords(s); // 재신청 시 과거 판수 기록을 그대로 유지
  s.waiting.push(entry);return entry;
}
export function leaveModeQueue(s,userId) {
  assertOpen(s);
  const idx=s.waiting.findIndex(p=>p.id===userId);
  if (idx<0) throw new Error('현재 대기열에 없습니다. 게임 중이라면 종료 후 신청할 수 있습니다.');
  return s.waiting.splice(idx,1)[0];
}
export function removeModePlayer(s,userId) {return leaveModeQueue(s,userId);}
export function approveSolo(s,userId) {
  assertOpen(s);
  if(s.mode!=='solo') throw new Error('솔랭 듀오 모집에서만 승인할 수 있습니다.');
  const p=s.waiting.find(p=>p.id===userId);
  if(!p) throw new Error('해당 사용자가 대기열에 없습니다.');
  if(p.approval==='approved') throw new Error('이미 승인된 참가자입니다.');
  p.approval='approved';return p;
}
export function pendingSolo(s) {
  return s.mode==='solo'?s.waiting.filter(p=>p.approval!=='approved'):[];
}
export function eligibleModePlayers(s) {
  return s.mode==='flex'?priorityFlexPlayers(s):s.waiting.filter(p=>p.approval==='approved');
}
/** 구버전 대기열 등에서 프로필 미등록자가 자동 선발되지 않도록 확인. */
export function missingModeProfiles(s,getProfile) {
  const expected=eligibleModePlayers(s).slice(0,MODE_META[s.mode].slots);
  return expected.filter(p=>!getProfile(s.guildId,p.id));
}

export function startModeGame(s,now=Date.now()) {
  assertOpen(s);
  if(s.phase==='playing') throw new Error('현재 게임 중입니다. 게임 종료를 먼저 처리해주세요.');
  const capacity=MODE_META[s.mode].slots;
  const eligible=eligibleModePlayers(s);
  if(eligible.length<capacity) {
    const msg=s.mode==='solo'
      ? '승인된 듀오 참가자가 없습니다. 후원/룰렛 여부를 확인하고 승인해주세요.'
      : `자랭 5인큐를 위해 스트리머 제외 4명이 필요합니다. 현재 ${eligible.length}명입니다.`;
    throw new Error(msg);
  }
  const selected=eligible.slice(0,capacity);
  const selectedIds=new Set(selected.map(p=>p.id));
  s.waiting=s.waiting.filter(p=>!selectedIds.has(p.id));
  s.current=selected;
  s.phase='playing';s.round++;
  if(s.mode==='flex') {
    const records=flexRecords(s);
    for(const p of selected) {
      const record=records[p.id]??={matchesPlayed:0,lastPlayedRound:0};
      record.matchesPlayed++;
      record.lastPlayedRound=s.round;
    }
  }
  s.rounds.push({round:s.round,players:selected.map(p=>({
    ...p,...(s.mode==='flex'?{matchesPlayed:flexRecords(s)[p.id].matchesPlayed}:{})
  })),startedAt:now});
  return selected;
}
export function finishModeGame(s,now=Date.now()) {
  assertOpen(s);
  if(s.phase!=='playing') throw new Error('현재 진행 중인 게임이 없습니다.');
  const finished=s.current;
  const round=s.rounds.at(-1);
  if(round && round.round===s.round) round.endedAt=now;
  s.current=[];s.phase='waiting';return finished;
}
export function closeModeSession(s,now=Date.now()) {
  assertOpen(s);
  if(s.phase==='playing') throw new Error('진행 중인 게임을 먼저 종료해주세요.');
  s.status='closed';s.closedAt=now;return s;
}
export function modeUserStatus(s,userId) {
  const record=s.mode==='flex'?flexRecords(s)[userId]:null;
  const count=record?.matchesPlayed??0;
  const current=s.current.find(p=>p.id===userId);
  if(current)return s.mode==='flex'
    ? `🎮 ${s.round}판 참가 중 | 자랭 참여 ${count}판\n게임 종료 후 다시 신청할 수 있습니다.`
    : `🎮 ${s.round}판 참가 중입니다. 게임 종료 후 다시 신청할 수 있습니다.`;
  const p=s.waiting.find(p=>p.id===userId);
  if(!p)return s.mode==='flex'
    ? `현재 자랭 대기열에 없습니다. 이번 모집 참여 ${count}판 · 다시 참가하려면 신청 버튼을 눌러주세요.`
    : '대기열에 등록되지 않았습니다. 참가 신청 버튼을 눌러주세요.';
  const order=s.waiting.findIndex(x=>x.id===userId)+1;
  if(s.mode==='solo')return `⏳ 전체 대기 ${order}번째 · ${TICKET_SOURCES[p.source]||'듀오권'} · ${p.approval==='approved'?'✅ 관리자 승인 완료':'🕓 확인 대기 중'}\n※ 관리자가 듀오권을 확인한 뒤 선발합니다.`;
  const rank=priorityFlexPlayers(s).findIndex(x=>x.id===userId)+1;
  return `⏳ 자랭 시참 대기 **우선순위 ${rank}위 / ${s.waiting.length}명** · 참여 **${count}판** (무료 신청)`;
}
