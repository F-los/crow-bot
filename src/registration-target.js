import {joinSession} from './rotation.js';
import {joinModeQueue, MODE_META} from './mode-queue.js';

/**
 * 기존 내전 및 v4 솔랭/자랭의 최초 등록 후 자동 참가를 한 곳에서 처리한다.
 * 모달을 여는 시점의 sessionId와 mode를 모두 검증해 다른 모집판으로 잘못 입장하지 않는다.
 */
export function enrollAfterRegistration(guild, context, userId, displayName, now=Date.now()) {
  const {sessionId,mode=null,source=null}=context;
  if(!sessionId)return {joined:false,notice:''};
  if(mode!==null && !MODE_META[mode])
    return {joined:false,notice:'\n⚠️ 알 수 없는 게임 방식입니다. 참가 버튼을 다시 눌러주세요.'};
  const session=mode ? guild.modeQueues?.[mode] : guild.active;
  if(!session || session.status!=='open' || session.id!==sessionId ||
    (mode!==null && session.mode!==mode)) {
    return {joined:false,notice:'\nℹ️ 기존 모집이 종료되거나 변경되어 프로필만 저장됐습니다. 현재 모집판에서 다시 신청해주세요.'};
  }
  // 이전 버전에서 이미 신청한 사람의 선착순/판수 대기 위치는 바꾸지 않는다.
  if(mode && session.waiting.some(player=>player.id===userId))
    return {joined:false,session,notice:'\n✅ 이미 신청된 대기열은 그대로 유지됩니다. 롤 프로필 등록이 완료됐습니다.'};
  try {
    if(mode)joinModeQueue(session,userId,displayName,source,now);
    else joinSession(session,userId,displayName,now);
    const label=mode==='solo'?'솔랭 듀오':mode==='flex'?'자랭 시참':'내전';
    return {joined:true,session,notice:`\n✅ ${label} 참가 신청도 자동 완료되었습니다.`};
  }catch(error) {
    return {joined:false,notice:`\n⚠️ 프로필은 저장됐지만 참가 신청은 완료되지 않았습니다: ${error.message}`};
  }
}
