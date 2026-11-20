/** 까마귀봇: 스트리머는 항상 고정, 매 판 시청자 9명을 별도로 선발한다. */
export const GAME_SIZE = 9;

export function makeSession(guildId, channelId, id, now = Date.now()) {
  return {
    id, guildId, channelId, messageId: null, status: 'open', createdAt: now,
    round: 0, phase: 'waiting', testMode: false,
currentIds: [], joinSequence: 0, players: {}, rounds: [],
  };
}

// v1 저장 파일에 phase가 없는 경우에도 현재 게임 상태를 올바르게 인식한다.
export function isGameRunning(session) {
  return session.phase === 'playing' || (!session.phase && session.currentIds.length > 0);
}

export function activePlayers(session) {
  return Object.values(session.players).filter((p) => p.active);
}

export function queuedPlayers(session) {
  const inGame = new Set(isGameRunning(session) ? session.currentIds : []);
  return activePlayers(session).filter((p) => !inGame.has(p.id));
}

/** 우선순위: 참여 판수가 적음 → 직전 판 미참여 → 오래 기다림 → 신청 순서 */
export function priorityPlayers(session) {
  return queuedPlayers(session).sort((a, b) => {
    const lastA = session.round > 0 && a.lastPlayedRound === session.round ? 1 : 0;
    const lastB = session.round > 0 && b.lastPlayedRound === session.round ? 1 : 0;
    return a.matchesPlayed - b.matchesPlayed
      || lastA - lastB
      || a.waitingSince - b.waitingSince
      || a.joinOrder - b.joinOrder
      || a.id.localeCompare(b.id);
  });
}

export function joinSession(session, userId, displayName, now = Date.now()) {
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
  if (isGameRunning(session) && session.currentIds.includes(userId)) {
    throw new Error('현재 게임 중인 참가자입니다. 게임 종료 후 다시 참가 신청해주세요.');
  }
  const existing = session.players[userId];
  if (existing?.active) throw new Error('이미 참가 신청 중입니다.');
  const order = ++session.joinSequence;
  if (existing) {
    // 취소, 제외, 경기 종료 뒤 재신청하더라도 기록된 참가 판수는 유지된다.
    existing.active = true;
    existing.displayName = displayName;
    existing.waitingSince = now;
    existing.joinOrder = order;
    delete existing.autoRemovedRound;
  } else {
    session.players[userId] = {
      id: userId, displayName, active: true, waitingSince: now, joinOrder: order,
      matchesPlayed: 0, lastPlayedRound: 0,
    };
  }
  return session.players[userId];
}

export function leaveSession(session, userId) {
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
  const player = session.players[userId];
  if (!player?.active) throw new Error('현재 참가 신청 중이 아닙니다.');
  if (isGameRunning(session) && session.currentIds.includes(userId)) {
    throw new Error('현재 게임 중인 참가자입니다. 게임 종료 후 자동으로 대기열에서 빠집니다.');
  }
  player.active = false;
  return player;
}

export function kickPlayer(session, userId) {
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
  const player = session.players[userId];
  if (!player?.active) throw new Error('해당 유저는 대기열에 없습니다.');
  if (isGameRunning(session) && session.currentIds.includes(userId)) {
    throw new Error('현재 게임 중인 참가자는 대기열에서 제외할 수 없습니다. 게임 종료 후 처리해주세요.');
  }
  player.active = false;
  return player;
}

/** 양수면 판수 추가, 음수면 판수 차감. 현재 대기열 참가자만 수정 가능. */
export function adjustMatchesPlayed(session, userId, delta) {
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 99) {
    throw new Error('변경값은 -99~99 사이의 0이 아닌 정수로 입력해주세요.');
  }
  const player = session.players[userId];
  if (!player?.active || (isGameRunning(session) && session.currentIds.includes(userId))) {
    throw new Error('판수 변경은 현재 대기열에 있는 참가자만 가능합니다.');
  }
  const changed = player.matchesPlayed + delta;
  if (changed < 0) throw new Error('참여 판수는 0판보다 작아질 수 없습니다.');
  player.matchesPlayed = changed;
  return player;
}

/** 첫 판 및 다음 판 시작: 대기열에서 9명을 뽑아 게임 중 상태로 이동시킨다. */
export function nextRound(session, now = Date.now()) {
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
  if (isGameRunning(session)) throw new Error('현재 게임 중입니다. 먼저 「게임 종료」를 눌러주세요.');
  const candidates = priorityPlayers(session);
  
if (candidates.length === 0) {
  throw new Error('최소 1명 이상 참가 신청해야 게임을 시작할 수 있습니다.');
}

if (!session.testMode && candidates.length < GAME_SIZE) {
  throw new Error(
    `스트리머 제외 시청자 ${GAME_SIZE}명이 필요합니다. 현재 대기 ${candidates.length}명입니다.`
  );
}

  const selected = candidates.slice(0, GAME_SIZE);
  ++session.round;
  session.phase = 'playing';
  session.currentIds = selected.map((p) => p.id);
  for (const player of selected) {
    player.matchesPlayed++;
    player.lastPlayedRound = session.round;
    player.waitingSince = now;
  }
  session.rounds.push({ round: session.round, playerIds: [...session.currentIds], startedAt: now });
  return selected;
}

/** 경기 종료: 게임 중인 9명만 신청 해제. 다른 대기자는 그대로 유지. */
export function finishRound(session, now = Date.now()) {
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
  if (!isGameRunning(session)) throw new Error('현재 진행 중인 게임이 없습니다.');
  const finished = session.currentIds.map((id) => session.players[id]).filter(Boolean);
  for (const player of finished) {
    player.active = false;
    player.autoRemovedRound = session.round;
  }
  const record = session.rounds.findLast((r) => r.round === session.round);
  if (record) record.endedAt = now;
  session.currentIds = [];
  session.phase = 'waiting';
  return finished;
}

export function closeSession(session, now = Date.now()) {
  if (session.status !== 'open') throw new Error('이미 종료된 모집입니다.');
  session.status = 'closed';
  session.closedAt = now;
}

export function myStatus(session, userId) {
  const p = session.players[userId];
  if (!p) return '아직 신청 기록이 없습니다. 「참가 신청」 버튼을 눌러주세요.';
  const playing = isGameRunning(session) && session.currentIds.includes(userId);
  if (playing) return `🎮 **${session.round}판 게임 중** | 참여 ${p.matchesPlayed}판\n게임 종료 후 참가 신청을 다시 눌러주세요.`;
  if (!p.active) {
    const state = p.autoRemovedRound === session.round ? '게임 종료 후 대기열에서 제외됨' : '신청 취소/제외 상태';
    return `**${state}** | 참여 ${p.matchesPlayed}판\n참여하려면 「참가 신청」 버튼을 눌러주세요.`;
  }
  const order = priorityPlayers(session).findIndex((v) => v.id === userId) + 1;
  return `⏳ **대기 중** | 참여 ${p.matchesPlayed}판\n대기열 우선순위: ${order}위 / ${queuedPlayers(session).length}명`;
}
