import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activePlayers, closeSession, joinSession, leaveSession, makeSession,
  nextRound, priorityPlayers,
} from '../src/rotation.js';

function setup(n = 15) {
  const s = makeSession('guild', 'channel', 'test', 100);
  for (let i = 1; i <= n; i++) joinSession(s, `U${i}`, `유저${i}`, 1000 + i);
  return s;
}

const ids = (players) => players.map((p) => p.id);

test('15명 중 1판 A-J / 2판 K-O + A-E / 3판 F-J + K-O 선발', () => {
  const s = setup(15);
  assert.deepEqual(ids(nextRound(s, 2000)), Array.from({ length: 10 }, (_, i) => `U${i + 1}`));
  assert.deepEqual(ids(nextRound(s, 3000)), ['U11', 'U12', 'U13', 'U14', 'U15', 'U1', 'U2', 'U3', 'U4', 'U5']);
  assert.deepEqual(ids(nextRound(s, 4000)), ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15']);
});

test('새로 온 사람은 현재 판을 변경하지 않고 다음 판에 우선 참여', () => {
  const s = setup(10);
  nextRound(s, 2000);
  joinSession(s, 'NEW', '신규', 2500);
  assert.equal(s.currentIds.includes('NEW'), false);
  assert.equal(priorityPlayers(s)[0].id, 'NEW');
  assert.equal(nextRound(s, 3000)[0].id, 'NEW');
});

test('취소 및 재신청해도 참가 판수 초기화 불가', () => {
  const s = setup(11);
  nextRound(s, 2000);
  leaveSession(s, 'U1');
  joinSession(s, 'U1', '유저1', 3000);
  assert.equal(s.players.U1.matchesPlayed, 1);
  assert.equal(s.players.U1.waitingSince, 3000);
});

test('10명 미만이면 시작 거절, 참가 취소 시 다음 판에서 제외', () => {
  const s = setup(9);
  assert.throws(() => nextRound(s, 2000), /최소 10명/);
  joinSession(s, 'U10', '유저10', 1010);
  nextRound(s, 2000);
  leaveSession(s, 'U1');
  assert.equal(activePlayers(s).length, 9);
  assert.throws(() => nextRound(s, 3000), /현재 9명/);
  assert.equal(s.round, 1);
});

test('중복 참가 차단, 종료된 모집에 참가 불가', () => {
  const s = setup(1);
  assert.throws(() => joinSession(s, 'U1', '이중참가'), /이미 참가/);
  closeSession(s);
  assert.throws(() => joinSession(s, 'NEW', '새로운사람'), /종료/);
});
