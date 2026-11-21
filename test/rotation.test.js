import test from 'node:test';
import assert from 'node:assert/strict';
import {activePlayers, closeSession, finishRound, joinSession, leaveSession, makeSession, nextRound, priorityPlayers} from '../src/rotation.js';
function setup(n=15){const s=makeSession('guild','channel','test',100);for(let i=1;i<=n;i++)joinSession(s,`U${i}`,`유저${i}`,1000+i);return s;}
const ids=players=>players.map(p=>p.id);
test('시청자 9명 모집, 나머지는 다음 판 우선',()=>{
  const s=setup(15);
  assert.deepEqual(ids(nextRound(s,2000)),Array.from({length:9},(_,i)=>`U${i+1}`));
  finishRound(s,2500);
  for(let i=1;i<=9;i++)joinSession(s,`U${i}`,`유저${i}`,2600+i);
  assert.deepEqual(ids(nextRound(s,3000)),['U10','U11','U12','U13','U14','U15','U1','U2','U3']);
  finishRound(s,3500);
  for(const id of ['U10','U11','U12','U13','U14','U15','U1','U2','U3'])joinSession(s,id,id,3600);
  assert.deepEqual(ids(nextRound(s,4000)),['U4','U5','U6','U7','U8','U9','U10','U11','U12']);
});
test('새 유저는 진행 중 게임에 포함되지 않으며 다음 판 선발 우선',()=>{
  const s=setup(10);nextRound(s,2000);joinSession(s,'NEW','신규',2500);
  assert.equal(s.currentIds.includes('NEW'),false);
  finishRound(s,2600);
  assert.ok(priorityPlayers(s).slice(0,2).some(p=>p.id==='NEW'));
  s.testMode=true;
  assert.ok(nextRound(s,3000).some(p=>p.id==='NEW'));
});
test('재신청해도 판수 유지, 중복 게임 시작은 판수 증가하지 않음',()=>{
  const s=setup(9);nextRound(s,2000);
  assert.throws(()=>nextRound(s,2200),/게임 중/);
  assert.equal(s.players.U1.matchesPlayed,1);
  finishRound(s,2500);joinSession(s,'U1','유저1',3000);
  assert.equal(s.players.U1.matchesPlayed,1);
});
test('9명 미만 시작 거절, 테스트 모드에서는 허용',()=>{
  const s=setup(8);assert.throws(()=>nextRound(s),/9명/);
  s.testMode=true;assert.equal(nextRound(s).length,8);
  finishRound(s);assert.equal(activePlayers(s).length,0);
});
test('취소 및 재신청과 종료 처리',()=>{
  const s=setup(9);leaveSession(s,'U1');joinSession(s,'U1','유저1');
  assert.throws(()=>joinSession(s,'U1','이중참가'),/이미 참가/);
  closeSession(s);assert.throws(()=>joinSession(s,'NEW','신규'),/종료/);
});
