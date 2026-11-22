import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createModeSession,joinModeQueue,leaveModeQueue,approveSolo,pendingSolo,
  eligibleModePlayers,startModeGame,finishModeGame,closeModeSession,modeUserStatus
} from '../src/mode-queue.js';

function s(mode){return createModeSession('guild','channel','test-'+mode,mode,1);}
test('솔랭은 후원/룰렛 신청을 승인 전에는 선발하지 않는다',()=>{
  const session=s('solo');
  joinModeQueue(session,'u1','첫째','donation',2);
  joinModeQueue(session,'u2','둘째','roulette',3);
  assert.equal(pendingSolo(session).length,2);
  assert.throws(()=>startModeGame(session),/승인된/);
  approveSolo(session,'u2');
  assert.deepEqual(startModeGame(session,4).map(p=>p.id),['u2']);
  assert.equal(session.round,1);
  assert.deepEqual(session.waiting.map(p=>p.id),['u1']);
  assert.match(modeUserStatus(session,'u1'),/확인 대기/);
  finishModeGame(session,5);
  assert.equal(session.rounds[0].endedAt,5);
  assert.equal(session.current.length,0);
  assert.equal(session.waiting.length,1);
});
test('솔랭 승인된 사람끼리는 신청 순서를 유지한다',()=>{
  const session=s('solo');
  joinModeQueue(session,'a','a','donation',10);
  joinModeQueue(session,'b','b','roulette',20);
  approveSolo(session,'b');approveSolo(session,'a');
  assert.deepEqual(eligibleModePlayers(session).map(p=>p.id),['a','b']);
  assert.deepEqual(startModeGame(session).map(p=>p.id),['a']);
  finishModeGame(session);
  assert.deepEqual(startModeGame(session).map(p=>p.id),['b']);
});
test('솔랭 중복 신청/잘못된 권종/중복 승인을 막는다',()=>{
  const session=s('solo');
  assert.throws(()=>joinModeQueue(session,'u','유저'),/획득 경로/);
  joinModeQueue(session,'u','유저','roulette');
  assert.throws(()=>joinModeQueue(session,'u','유저','donation'),/이미/);
  approveSolo(session,'u');
  assert.throws(()=>approveSolo(session,'u'),/이미 승인/);
  assert.equal(session.waiting[0].source,'roulette');
});
test('자랭은 무료 선착순 4명 확정, 나머지 대기자는 유지한다',()=>{
  const session=s('flex');
  for(let i=1;i<=6;i++)joinModeQueue(session,'u'+i,'참가자'+i,null,i);
  assert.deepEqual(startModeGame(session,10).map(p=>p.id),['u1','u2','u3','u4']);
  assert.deepEqual(session.waiting.map(p=>p.id),['u5','u6']);
  assert.throws(()=>leaveModeQueue(session,'u2'),/현재 대기열/);
  finishModeGame(session,11);
  assert.equal(session.phase,'waiting');
  assert.equal(session.waiting.length,2);
  assert.equal(session.rounds[0].players.length,4);
});
test('자랭은 시청자 4명이 채워져야 시작할 수 있다',()=>{
  const session=s('flex');
  for(let i=1;i<=3;i++)joinModeQueue(session,'u'+i,'참가자'+i);
  assert.throws(()=>startModeGame(session),/4명/);
  assert.equal(session.phase,'waiting');
});
test('신청 취소, 모집 종료 후 방어 로직',()=>{
  const session=s('flex');
  joinModeQueue(session,'u','유저');
  assert.equal(leaveModeQueue(session,'u').id,'u');
  assert.throws(()=>leaveModeQueue(session,'u'),/대기열/);
  closeModeSession(session,100);
  assert.equal(session.status,'closed');
  assert.throws(()=>joinModeQueue(session,'u','유저'),/이미 종료/);
  assert.throws(()=>startModeGame(session),/이미 종료/);
});
test('게임 중 모집 종료를 방지한다',()=>{
  const session=s('solo');
  joinModeQueue(session,'u','유저','donation');
  approveSolo(session,'u');startModeGame(session);
  assert.throws(()=>closeModeSession(session),/게임을 먼저 종료/);
  finishModeGame(session);
  closeModeSession(session);
});
