// 종합게임 신청은 판수와 무관한 선착순(FIFO)이다.
// rotationMatches는 화면 안내용으로만 저장하고 경기마다 관리자의 클릭을 요구하지 않는다.
export const MAX_GENERAL_CAPACITY = 100;
export const MAX_ROTATION_MATCHES = 30;

function requireActive(session) {
  if (!session || session.status==='closed') throw new Error('이미 종료된 종합게임 모집입니다.');
  if (!['open','confirmed'].includes(session.status)) throw new Error('모집 상태가 올바르지 않습니다.');
}
function requireOpen(session) {
  requireActive(session);
  if (session.status==='confirmed') throw new Error('이미 명단이 확정됐습니다. 관리자가 확정 취소 후 변경할 수 있습니다.');
}
function nonEmpty(value, limit, label) {
  const text=String(value??'').trim();
  if (!text || text.length>limit || /[\r\n]/u.test(text)) {
    throw new Error(label+'은(는) 1~'+limit+'자 한 줄로 입력해주세요.');
  }
  return text;
}
function normalizeApplicant(gameNickname,extraInfo) {
  const nickname=nonEmpty(gameNickname,60,'게임 닉네임');
  const extra=String(extraInfo??'').trim();
  if (extra.length>200) throw new Error('추가 정보는 200자 이하로 입력해주세요.');
  return {gameNickname:nickname,extraInfo:extra};
}
export function rotationMatches(session) {
  // v4.4.x에 이미 생성된 모집판은 안내용 1판으로 표시한다.
  return Number.isInteger(session.rotationMatches)&&session.rotationMatches>=1
    ? session.rotationMatches : 1;
}
export function createGeneralSession(guildId,channelId,id,gameName,capacity,matches=1,now=Date.now()) {
  const name=nonEmpty(gameName,60,'게임 이름');
  if (!Number.isInteger(capacity)||capacity<1||capacity>MAX_GENERAL_CAPACITY) {
    throw new Error('모집 인원은 1~'+MAX_GENERAL_CAPACITY+'명 사이여야 합니다.');
  }
  if (!Number.isInteger(matches)||matches<1||matches>MAX_ROTATION_MATCHES) {
    throw new Error('로테이션 판수는 1~'+MAX_ROTATION_MATCHES+'판 사이여야 합니다.');
  }
  return {
    id,guildId,channelId,messageId:null,gameName:name,capacity,rotationMatches:matches,
    status:'open',createdAt:now,confirmedAt:null,closedAt:null,
    rotationIndex:0,currentIds:[],nextSequence:0,applicants:[],savedApplicants:{},
  };
}
// 모집 중 제외되어도 참가 신청 정보는 유지한다. 이전 버전의 신청자도 자동으로 읽는다.
export function savedGeneralInfo(session,userId) {
  const saved=session.savedApplicants?.[userId]
    ?? session.applicants.find(p=>p.id===userId);
  return saved?{gameNickname:saved.gameNickname,extraInfo:saved.extraInfo??''}:null;
}
function saveGeneralInfo(session,userId,details) {
  session.savedApplicants??={};
  session.savedApplicants[userId]={gameNickname:details.gameNickname,extraInfo:details.extraInfo};
}
export function joinSavedGeneralSession(session,userId,displayName,now=Date.now()) {
  requireActive(session);
  if (session.applicants.some(p=>p.id===userId)) {
    throw new Error('이미 신청한 사용자입니다. 내 정보 수정 버튼을 이용해주세요.');
  }
  const details=savedGeneralInfo(session,userId);
  if (!details) throw new Error('저장된 참가 정보가 없습니다. 최초 참가 신청부터 진행해주세요.');
  return joinGeneralSession(session,userId,displayName,details.gameNickname,details.extraInfo,now);
}
export function editSavedGeneralInfo(session,userId,displayName,gameNickname,extraInfo='') {
  requireActive(session);
  const existing=session.applicants.find(p=>p.id===userId);
  if (existing) return editGeneralApplicant(session,userId,displayName,gameNickname,extraInfo);
  if (!savedGeneralInfo(session,userId)) throw new Error('저장된 참가 정보가 없습니다. 먼저 참가 신청해주세요.');
  const details=normalizeApplicant(gameNickname,extraInfo);
  saveGeneralInfo(session,userId,details);
  return details;
}
export function orderedGeneralApplicants(session) {
  return [...session.applicants].sort((a,b)=>a.sequence-b.sequence);
}
export function generalGroups(session) {
  const all=orderedGeneralApplicants(session);
  // 현재 팀을 확정한 뒤 새 신청자가 들어오더라도 확정 팀은 움직이지 않는다.
  // v4.4.1 확정 상태 데이터에는 currentIds가 없으므로 순서대로 간주한다.
  const frozen=session.currentIds?.length && (session.status==='confirmed'||session.status==='closed');
  if (!frozen) return {confirmed:all.slice(0,session.capacity),waiting:all.slice(session.capacity)};
  const byId=new Map(all.map(p=>[p.id,p]));
  const confirmed=session.currentIds.map(id=>byId.get(id)).filter(Boolean);
  const selected=new Set(confirmed.map(p=>p.id));
  return {confirmed,waiting:all.filter(p=>!selected.has(p.id))};
}
export function generalPosition(session,userId) {
  const {confirmed,waiting}=generalGroups(session);
  const selectedIndex=confirmed.findIndex(p=>p.id===userId);
  if (selectedIndex>=0) return {position:selectedIndex+1,confirmed:true};
  const waitingIndex=waiting.findIndex(p=>p.id===userId);
  if (waitingIndex>=0) return {position:confirmed.length+waitingIndex+1,confirmed:false};
  return null;
}
export function joinGeneralSession(session,userId,displayName,gameNickname,extraInfo='',now=Date.now()) {
  requireActive(session);
  // v4.4.1에서 이미 확정한 팀도 신규 신청 전에 명단을 고정한다.
  if (session.status==='confirmed' && !session.currentIds?.length) {
    session.currentIds=generalGroups(session).confirmed.map(p=>p.id);
  }
  if (session.applicants.some(p=>p.id===userId)) throw new Error('이미 신청한 사용자입니다. 정보 수정 버튼을 이용해주세요.');
  const details=normalizeApplicant(gameNickname,extraInfo);
  session.nextSequence=Math.max(session.nextSequence??0,...session.applicants.map(p=>p.sequence??0))+1;
  const player={
    id:userId,displayName:String(displayName??userId).slice(0,100),
    ...details,sequence:session.nextSequence,joinedAt:now,
  };
  session.applicants.push(player);
  saveGeneralInfo(session,userId,details);
  return player;
}
function requireWaitingOrOpen(session,userId) {
  requireActive(session);
  if (session.status==='confirmed' && generalGroups(session).confirmed.some(p=>p.id===userId)) {
    throw new Error('현재 확정된 참가자는 정보를 바꾸거나 취소할 수 없습니다. 관리자에게 확정 취소를 요청해주세요.');
  }
}
export function editGeneralApplicant(session,userId,displayName,gameNickname,extraInfo='') {
  requireWaitingOrOpen(session,userId);
  const player=session.applicants.find(p=>p.id===userId);
  if (!player) throw new Error('참가 신청 기록이 없습니다. 먼저 신청해주세요.');
  const details=normalizeApplicant(gameNickname,extraInfo);
  player.displayName=String(displayName??player.displayName).slice(0,100);
  player.gameNickname=details.gameNickname;
  player.extraInfo=details.extraInfo;
  saveGeneralInfo(session,userId,details);
  return player;
}
export function leaveGeneralSession(session,userId) {
  requireWaitingOrOpen(session,userId);
  const index=session.applicants.findIndex(p=>p.id===userId);
  if (index<0) throw new Error('현재 신청 명단에 없습니다.');
  const player=session.applicants[index];
  if (!session.savedApplicants?.[userId]) saveGeneralInfo(session,userId,player);
  return session.applicants.splice(index,1)[0];
}
export function confirmGeneralSession(session,now=Date.now()) {
  requireOpen(session);
  if (!session.applicants.length) throw new Error('신청자가 없어 확정할 수 없습니다.');
  const selected=generalGroups(session).confirmed;
  session.currentIds=selected.map(p=>p.id);
  session.status='confirmed';
  session.confirmedAt=now;
  session.rotationIndex=Math.max(1,session.rotationIndex??0);
  return selected;
}
export function unconfirmGeneralSession(session) {
  if (!session || session.status!=='confirmed') throw new Error('확정된 종합게임 명단이 없습니다.');
  session.status='open';
  session.confirmedAt=null;
  session.currentIds=[];
  return session;
}
export function nextGeneralRotation(session,now=Date.now()) {
  if (!session || session.status!=='confirmed') throw new Error('명단 확정 후 다음 로테이션을 진행할 수 있습니다.');
  const groups=generalGroups(session);
  if (!groups.confirmed.length) throw new Error('현재 확정된 참가자가 없습니다.');
  // 기존 버전에서 등록된 사용자도 로테이션 전에 정보 보관. 현재 신청 명단과 저장 정보는 분리한다.
  for (const p of session.applicants) {
    if (!session.savedApplicants?.[p.id]) saveGeneralInfo(session,p.id,p);
  }
  // 진행을 마친 확정 인원은 완전히 제외한다. 재참여하려면 새로 신청해야 한다.
  const completedIds=new Set(groups.confirmed.map(p=>p.id));
  session.applicants=session.applicants.filter(p=>!completedIds.has(p.id));
  // 남아 있던 대기자만 현재 회차의 '예상 참가자'로 보여준다.
  // 자동 확정하지 않으므로 빈자리는 이후 신청자가 선착순으로 채운다.
  const next=orderedGeneralApplicants(session).slice(0,session.capacity);
  session.currentIds=[];
  session.rotationIndex=(session.rotationIndex||1)+1;
  session.status='open';
  session.confirmedAt=null;
  return next;
}
export function closeGeneralSession(session,now=Date.now()) {
  requireActive(session);
  session.status='closed';
  session.closedAt=now;
  return session;
}
