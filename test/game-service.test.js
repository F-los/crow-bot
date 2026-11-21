import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSession, joinSession } from '../src/rotation.js';
import { beginGame } from '../src/game-service.js';
function setup() {const s=makeSession('g','c','s');for(let i=0;i<9;i++)joinSession(s,`id${i}`,`유저${i}`);return s;}
const form={riotId:'별이#KR1',currentTier:'SILVER',currentDivision:'1',peakTier:'GOLD',peakDivision:'1',lanes:['MID'],onnjRegistered:false};
test('시작하면 9명 확정, 판수 +1, 기존/신규 상태 스냅샷, 등록 처리',()=>{
  const s=setup();let saved=0,registered=[];
  const result=beginGame(s,{getProfile:(_,id)=>({...form,onnjRegistered:id==='id0'}),persist:()=>saved++ ,markOnnjRegistered:(_,ids)=>registered=ids});
  assert.equal(s.round,1);assert.equal(result.roster.length,9);assert.equal(result.roster[0].count,1);
  assert.equal(result.roster.filter(x=>x.wasRegistered).length,1);
  assert.equal(registered.length,9);assert.equal(saved,1);
});
test('DB 오류 발생 시 판수와 경기 진행 상태 롤백',()=>{
  const s=setup();let saved=0;
  assert.throws(()=>beginGame(s,{getProfile:()=>form,persist:()=>saved++,markOnnjRegistered:()=>{throw new Error('DB 장애');}}),/DB 장애/);
  assert.equal(s.round,0);assert.equal(s.phase,'waiting');assert.equal(s.players.id0.matchesPlayed,0);
  assert.equal(saved,2);
});
test('일반 모드와 테스트 모드 모두 프로필 없으면 시작 차단하고 판수 유지',()=>{
  for(const testMode of [false,true]){
    const s=setup();s.testMode=testMode;
    let saves=0,marked=0;
    assert.throws(()=>beginGame(s,{getProfile:(_,id)=>id==='id2'?null:form,
      persist:()=>saves++,markOnnjRegistered:()=>marked++}),/내전등록/);
    assert.equal(s.round,0);assert.equal(s.phase,'waiting');
    assert.equal(s.players.id2.matchesPlayed,0);assert.equal(saves,0);assert.equal(marked,0);
  }
});
test('테스트 모드 9명 미만 + 모두 프로필 등록 시 정상 시작',()=>{
  const s=makeSession('g','c','s');s.testMode=true;
  joinSession(s,'registered','등록된 유저');
  const r=beginGame(s,{getProfile:()=>form,persist:()=>{},markOnnjRegistered:()=>{}});
  assert.equal(r.roster.length,1);assert.equal(s.round,1);
  assert.equal(s.players.registered.matchesPlayed,1);
  assert.equal(r.roster[0].missing,false);
});
test('기존 데이터에 프로필이 없는 참가자가 있으면 등록 후에만 시작 가능',()=>{
  const s=setup();let missing=true;
  const deps={getProfile:(_,id)=>missing&&id==='id0'?null:form,
    persist:()=>{},markOnnjRegistered:()=>{}};
  assert.throws(()=>beginGame(s,deps),/내전등록/);
  missing=false;
  const r=beginGame(s,deps);
  assert.equal(r.selected.length,9);assert.equal(s.round,1);
});
