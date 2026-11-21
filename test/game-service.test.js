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
test('실제 모드에서 프로필 없는 사람은 선발 차단, 테스트모드 허용',()=>{
  const s=setup();
  assert.throws(()=>beginGame(s,{getProfile:()=>null,persist:()=>{},markOnnjRegistered:()=>{}}),/프로필 미등록/);
  assert.equal(s.round,0);s.testMode=true;
  const r=beginGame(s,{getProfile:()=>null,persist:()=>{},markOnnjRegistered:()=>{}});
  assert.equal(r.roster.filter(x=>x.missing).length,9);
});
