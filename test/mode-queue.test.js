import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createModeSession,joinModeQueue,leaveModeQueue,approveSolo,pendingSolo,
  eligibleModePlayers,startModeGame,finishModeGame,closeModeSession,modeUserStatus,
  priorityFlexPlayers,flexRecords,adjustFlexMatches,cancelFlexConfirmation
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
test('자랭 첫 판은 0판 동률이므로 신청 순서대로 4명 확정한다',()=>{
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

test('자랭 판수 로테이션: 적게 참가한 시청자를 먼저 선발한다',()=>{
  const session=s('flex');
  for(let i=1;i<=6;i++)joinModeQueue(session,'u'+i,'시청자'+i,null,i*10);
  assert.deepEqual(startModeGame(session,100).map(p=>p.id),['u1','u2','u3','u4']);
  assert.deepEqual(session.rounds[0].players.map(p=>p.matchesPlayed),[1,1,1,1]);
  finishModeGame(session,101);
  for(let i=1;i<=4;i++)joinModeQueue(session,'u'+i,'시청자'+i,null,100+i);
  assert.deepEqual(priorityFlexPlayers(session).map(p=>p.id),['u5','u6','u1','u2','u3','u4']);
  assert.deepEqual(startModeGame(session,200).map(p=>p.id),['u5','u6','u1','u2']);
  assert.equal(flexRecords(session).u1.matchesPlayed,2);
  assert.equal(flexRecords(session).u5.matchesPlayed,1);
  assert.equal(flexRecords(session).u3.matchesPlayed,1);
  assert.equal(session.rounds[1].players[2].matchesPlayed,2);
  assert.equal(session.rounds[1].players[0].matchesPlayed,1);
});
test('자랭은 판수 동률일 때 직전 판 미참여 → 대기시간 순으로 선발한다',()=>{
  const session=s('flex');
  for(let i=1;i<=4;i++)joinModeQueue(session,'u'+i,'첫판'+i,null,i);
  startModeGame(session,100);finishModeGame(session,101);
  for(let i=4;i>=1;i--)joinModeQueue(session,'u'+i,'재신청'+i,null,200-i);
  joinModeQueue(session,'u5','새 참가',null,202);
  joinModeQueue(session,'u6','새 참가',null,203);
  adjustFlexMatches(session,'u5',1);
  adjustFlexMatches(session,'u6',1);
  assert.deepEqual(priorityFlexPlayers(session).map(p=>p.id),['u5','u6','u4','u3','u2','u1']);
  assert.deepEqual(startModeGame(session).map(p=>p.id),['u5','u6','u4','u3']);
});
test('자랭 판수는 신청 취소·제외 후 재신청해도 유지되며 새 모집에서는 초기화',()=>{
  const session=s('flex');
  for(let i=1;i<=4;i++)joinModeQueue(session,'u'+i,'회원'+i,null,i);
  startModeGame(session,20);finishModeGame(session,21);
  joinModeQueue(session,'u1','회원1',null,50);
  assert.match(modeUserStatus(session,'u1'),/참여 \*\*1판\*\*/);
  leaveModeQueue(session,'u1');
  assert.equal(flexRecords(session).u1.matchesPlayed,1);
  joinModeQueue(session,'u1','회원1',null,60);
  assert.equal(priorityFlexPlayers(session).find(p=>p.id==='u1').id,'u1');
  assert.equal(flexRecords(session).u1.matchesPlayed,1);
  const another=s('flex');
  assert.equal(flexRecords(another).u1,undefined);
});
test('자랭 관리자 판수 수정은 대기열 전용이며 음수와 과도한 입력을 막는다',()=>{
  const session=s('flex');
  joinModeQueue(session,'u','시청자');
  assert.equal(adjustFlexMatches(session,'u',2).matchesPlayed,2);
  assert.equal(adjustFlexMatches(session,'u',-1).matchesPlayed,1);
  assert.throws(()=>adjustFlexMatches(session,'u',-2),/0판보다/);
  assert.throws(()=>adjustFlexMatches(session,'u',100),/변경값/);
  assert.throws(()=>adjustFlexMatches(session,'missing',1),/대기열/);
  leaveModeQueue(session,'u');
  assert.throws(()=>adjustFlexMatches(session,'u',1),/대기열/);
});
test('기존 v4 자랭 기록은 첫 접근 때 자동 복구하여 다음 선발부터 판수에 반영한다',()=>{
  const session=s('flex');
  delete session.flexRecords;
  session.round=2;
  session.rounds=[
    {round:1,players:[{id:'u1'},{id:'u2'},{id:'u3'},{id:'u4'}],startedAt:10,endedAt:20},
    {round:2,players:[{id:'u1'},{id:'u2'},{id:'u5'},{id:'u6'}],startedAt:30,endedAt:40},
  ];
  for(let i=1;i<=6;i++)joinModeQueue(session,'u'+i,'복귀'+i,null,100+i);
  assert.equal(flexRecords(session).u1.matchesPlayed,2);
  assert.equal(flexRecords(session).u4.matchesPlayed,1);
  assert.deepEqual(priorityFlexPlayers(session).map(p=>p.id),['u3','u4','u5','u6','u1','u2']);
  assert.deepEqual(startModeGame(session,200).map(p=>p.id),['u3','u4','u5','u6']);
  assert.equal(flexRecords(session).u5.matchesPlayed,2);
  assert.equal(flexRecords(session).u1.matchesPlayed,2);
});
test('솔랭은 판수 로테이션에 영향받지 않고 기존 선착순 유지',()=>{
  const session=s('solo');
  joinModeQueue(session,'a','처음','donation',10);
  joinModeQueue(session,'b','다음','roulette',20);
  approveSolo(session,'b');approveSolo(session,'a');
  assert.deepEqual(eligibleModePlayers(session).map(p=>p.id),['a','b']);
  assert.deepEqual(startModeGame(session).map(p=>p.id),['a']);
  finishModeGame(session);
  assert.deepEqual(startModeGame(session).map(p=>p.id),['b']);
  assert.equal(session.flexRecords,undefined);
});

test('자랭 확정 취소는 판수·라운드·대기 순서를 되돌리고 신규 신청자는 유지한다',()=>{
  const session=s('flex');
  for(let i=1;i<=6;i++)joinModeQueue(session,'u'+i,'시청자'+i,null,i);
  const old=JSON.stringify(session.waiting);
  assert.deepEqual(startModeGame(session,100).map(p=>p.id),['u1','u2','u3','u4']);
  joinModeQueue(session,'u7','새 시청자',null,101);
  leaveModeQueue(session,'u6');
  assert.deepEqual(cancelFlexConfirmation(session).map(p=>p.id),['u1','u2','u3','u4']);
  assert.equal(session.phase,'waiting');
  assert.equal(session.round,0);
  assert.equal(session.rounds.length,0);
  assert.equal(session.current.length,0);
  assert.deepEqual(session.waiting.map(p=>p.id),['u1','u2','u3','u4','u5','u7']);
  assert.deepEqual(session.waiting.slice(0,4),JSON.parse(old).slice(0,4));
  for(let i=1;i<=4;i++)assert.equal(flexRecords(session)['u'+i],undefined);
  assert.deepEqual(startModeGame(session,102).map(p=>p.id),['u1','u2','u3','u4']);
});
test('자랭 확정 취소는 과거 판수와 마지막 참가 판수를 복원한다',()=>{
  const session=s('flex');
  for(let i=1;i<=4;i++)joinModeQueue(session,'u'+i,'시청자',null,i);
  startModeGame(session,100);
  finishModeGame(session,101);
  for(let i=1;i<=4;i++)joinModeQueue(session,'u'+i,'시청자',null,200+i);
  adjustFlexMatches(session,'u1',2);
  const previous={...flexRecords(session).u1};
  startModeGame(session,300);
  assert.equal(flexRecords(session).u1.matchesPlayed,4);
  cancelFlexConfirmation(session);
  assert.deepEqual(flexRecords(session).u1,previous);
  assert.equal(session.round,1);
  assert.equal(session.rounds.length,1);
  assert.equal(session.rounds[0].endedAt,101);
});
test('자랭 확정 취소는 진행 중인 확정만 허용하며 솔랭에는 영향이 없다',()=>{
  const flex=s('flex');
  assert.throws(()=>cancelFlexConfirmation(flex),/확정 명단/);
  for(let i=1;i<=4;i++)joinModeQueue(flex,'u'+i,'참가자');
  startModeGame(flex);
  finishModeGame(flex);
  assert.throws(()=>cancelFlexConfirmation(flex),/확정 명단/);
  const solo=s('solo');
  joinModeQueue(solo,'a','신청자','donation');
  approveSolo(solo,'a');
  startModeGame(solo);
  assert.throws(()=>cancelFlexConfirmation(solo),/자랭에서만/);
});
test('업데이트 전 자랭 진행 중 확정도 1판만 되돌린다',()=>{
  const flex=s('flex');
  for(let i=1;i<=4;i++)joinModeQueue(flex,'u'+i,'시청자',null,i);
  startModeGame(flex,100);
  delete flex.rounds[0].rollback; // 구버전 진행 상태
  cancelFlexConfirmation(flex);
  assert.equal(flex.round,0);
  assert.deepEqual(flex.waiting.map(p=>p.id),['u1','u2','u3','u4']);
  for(let i=1;i<=4;i++)assert.equal(flexRecords(flex)['u'+i].matchesPlayed,0);
});
