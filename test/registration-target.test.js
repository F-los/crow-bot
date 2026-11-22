import test from 'node:test';
import assert from 'node:assert/strict';
import {enrollAfterRegistration} from '../src/registration-target.js';
import {makeSession,priorityPlayers} from '../src/rotation.js';
import {
  createModeSession,approveSolo,eligibleModePlayers,missingModeProfiles,
  startModeGame,finishModeGame,priorityFlexPlayers,flexRecords
} from '../src/mode-queue.js';

function guildState(){
  const active=makeSession('guild','channel','inhouse',100);
  const solo=createModeSession('guild','channel','solo-id','solo',100);
  const flex=createModeSession('guild','channel','flex-id','flex',100);
  return {active,modeQueues:{solo,flex}};
}
test('내전 기존 등록 후 참가 방식은 변경되지 않는다',()=>{
  const guild=guildState();
  const result=enrollAfterRegistration(guild,{sessionId:'inhouse'},'u1','테스터',111);
  assert.equal(result.joined,true);
  assert.match(result.notice,/내전 참가/);
  assert.deepEqual(priorityPlayers(guild.active).map(p=>p.id),['u1']);
});
test('솔랭 첫 등록은 원래 신청한 후원/룰렛 경로와 최초 클릭 시각을 유지한다',()=>{
  const guild=guildState();
  const result=enrollAfterRegistration(
    guild,{sessionId:'solo-id',mode:'solo',source:'roulette'},'u1','테스터',111);
  assert.equal(result.joined,true);
  assert.equal(guild.modeQueues.solo.waiting[0].source,'roulette');
  assert.equal(guild.modeQueues.solo.waiting[0].joinedAt,111);
  assert.equal(guild.modeQueues.solo.waiting[0].approval,'pending');
  assert.deepEqual(eligibleModePlayers(guild.modeQueues.solo),[]);
  approveSolo(guild.modeQueues.solo,'u1');
  assert.deepEqual(eligibleModePlayers(guild.modeQueues.solo).map(p=>p.id),['u1']);
});
test('자랭 첫 등록은 무료 참가하고 이후에도 별도 판수 로테이션 적용',()=>{
  const guild=guildState();
  const session=guild.modeQueues.flex;
  const result=enrollAfterRegistration(guild,{sessionId:'flex-id',mode:'flex'},'u1','테스터',111);
  assert.equal(result.joined,true);
  assert.deepEqual(priorityFlexPlayers(session).map(p=>p.id),['u1']);
  for(let i=2;i<=4;i++)
    enrollAfterRegistration(guild,{sessionId:'flex-id',mode:'flex'},'u'+i,'테스터'+i,111+i);
  startModeGame(session,500);finishModeGame(session,600);
  assert.equal(flexRecords(session).u1.matchesPlayed,1);
  enrollAfterRegistration(guild,{sessionId:'flex-id',mode:'flex'},'u1','테스터',700);
  assert.equal(flexRecords(session).u1.matchesPlayed,1);
  assert.equal(guild.active.players.u1,undefined);
});
test('등록 모달 중 모집이 바뀌면 다른 모집판에 참가시키지 않는다',()=>{
  const guild=guildState();
  guild.modeQueues.solo=createModeSession('guild','channel','replacement','solo');
  const result=enrollAfterRegistration(
    guild,{sessionId:'solo-id',mode:'solo',source:'donation'},'u1','테스터',111);
  assert.equal(result.joined,false);
  assert.match(result.notice,/모집이 종료되거나 변경/);
  assert.equal(guild.modeQueues.solo.waiting.length,0);
});
test('솔랭 신청 경로 누락 시 프로필은 보존하고 대기열에는 추가하지 않는다',()=>{
  const guild=guildState();
  const result=enrollAfterRegistration(
    guild,{sessionId:'solo-id',mode:'solo'},'u1','테스터',111);
  assert.equal(result.joined,false);
  assert.match(result.notice,/완료되지 않았습니다/);
  assert.equal(guild.modeQueues.solo.waiting.length,0);
});
test('기존 대기열의 미등록자에게는 순서를 바꾸지 않고 등록만 허용한다',()=>{
  const guild=guildState();
  const session=guild.modeQueues.flex;
  session.waiting.push({id:'u1',displayName:'기존',joinedAt:10,source:null,approval:'approved'});
  const result=enrollAfterRegistration(guild,{sessionId:'flex-id',mode:'flex'},'u1','새이름',111);
  assert.equal(result.joined,false);
  assert.match(result.notice,/그대로 유지/);
  assert.equal(session.waiting.length,1);
  assert.equal(session.waiting[0].joinedAt,10);
});
test('기존 미등록 대기자가 다음 선발 대상이면 게임 시작 전 검사로 걸러진다',()=>{
  const guild=guildState();
  const solo=guild.modeQueues.solo;
  enrollAfterRegistration(guild,{sessionId:'solo-id',mode:'solo',source:'donation'},'u1','u1');
  approveSolo(solo,'u1');
  assert.deepEqual(missingModeProfiles(solo,()=>null).map(p=>p.id),['u1']);
  assert.deepEqual(missingModeProfiles(solo,()=>({riotId:'테스터#KR1'})),[]);
  const flex=guild.modeQueues.flex;
  for(let i=1;i<=4;i++)
    enrollAfterRegistration(guild,{sessionId:'flex-id',mode:'flex'},'u'+i,'u'+i);
  assert.deepEqual(missingModeProfiles(flex,(_,id)=>id==='u3'?null:{riotId:'유저#KR1'}).map(p=>p.id),['u3']);
});
test('등록 대상 없이 수동 /내전등록 시 자동 입장하지 않는다',()=>{
  const guild=guildState();
  const result=enrollAfterRegistration(guild,{sessionId:null},'u1','테스터');
  assert.equal(result.joined,false);
  assert.equal(guild.active.players.u1,undefined);
  assert.equal(guild.modeQueues.flex.waiting.length,0);
});
