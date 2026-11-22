// 종합게임 모집은 판수 및 롤 프로필과 독립적인 FIFO 대기열이다.
export const MAX_GENERAL_CAPACITY = 100;

function requireOpen(session) {
  if (!session || session.status !== 'open') throw new Error('이미 종료된 종합게임 모집입니다.');
}
function nonEmpty(value, limit, label) {
  const text = String(value ?? '').trim();
  if (!text || text.length > limit || /[\r\n]/u.test(text)) {
    throw new Error(label + '은(는) 1~' + limit + '자 한 줄로 입력해주세요.');
  }
  return text;
}
function normalizeApplicant(gameNickname, extraInfo) {
  const nickname = nonEmpty(gameNickname, 60, '게임 닉네임');
  const extra = String(extraInfo ?? '').trim();
  if (extra.length > 200) throw new Error('추가 정보는 200자 이하로 입력해주세요.');
  return {gameNickname:nickname, extraInfo:extra};
}
export function createGeneralSession(guildId, channelId, id, gameName, capacity, now=Date.now()) {
  const name = nonEmpty(gameName, 60, '게임 이름');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_GENERAL_CAPACITY) {
    throw new Error('모집 인원은 1~' + MAX_GENERAL_CAPACITY + '명 사이여야 합니다.');
  }
  return {
    id, guildId, channelId, messageId:null, gameName:name, capacity,
    status:'open', createdAt:now, closedAt:null, nextSequence:0, applicants:[],
  };
}
export function orderedGeneralApplicants(session) {
  return [...session.applicants].sort((a,b)=>a.sequence-b.sequence);
}
export function generalGroups(session) {
  const all=orderedGeneralApplicants(session);
  return {confirmed:all.slice(0,session.capacity), waiting:all.slice(session.capacity)};
}
export function generalPosition(session,userId) {
  const index=orderedGeneralApplicants(session).findIndex(p=>p.id===userId);
  if (index<0) return null;
  return {position:index+1, confirmed:index<session.capacity};
}
export function joinGeneralSession(session,userId,displayName,gameNickname,extraInfo='',now=Date.now()) {
  requireOpen(session);
  if (session.applicants.some(p=>p.id===userId)) throw new Error('이미 신청한 사용자입니다. 정보 수정 버튼을 이용해주세요.');
  const details=normalizeApplicant(gameNickname,extraInfo);
  session.nextSequence+=1;
  const player={
    id:userId, displayName:String(displayName ?? userId).slice(0,100),
    ...details, sequence:session.nextSequence, joinedAt:now,
  };
  session.applicants.push(player);
  return player;
}
export function editGeneralApplicant(session,userId,displayName,gameNickname,extraInfo='') {
  requireOpen(session);
  const player=session.applicants.find(p=>p.id===userId);
  if (!player) throw new Error('참가 신청 기록이 없습니다. 먼저 신청해주세요.');
  const details=normalizeApplicant(gameNickname,extraInfo);
  player.displayName=String(displayName ?? player.displayName).slice(0,100);
  player.gameNickname=details.gameNickname;
  player.extraInfo=details.extraInfo;
  return player;
}
export function leaveGeneralSession(session,userId) {
  requireOpen(session);
  const index=session.applicants.findIndex(p=>p.id===userId);
  if (index<0) throw new Error('현재 신청 명단에 없습니다.');
  return session.applicants.splice(index,1)[0];
}
export function closeGeneralSession(session,now=Date.now()) {
  requireOpen(session);
  session.status='closed';
  session.closedAt=now;
  return session;
}
