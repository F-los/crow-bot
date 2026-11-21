import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProfile,rankLabel,preferredLanes} from '../src/profile-utils.js';
import {buildRoster,rosterMessages} from '../src/roster.js';

const base={riotId:'까마귀#KR1',currentTier:'EMERALD',currentDivision:'2',peakTier:'MASTER',peakLp:230,lanes:['MID','TOP']};
test('Riot ID 단일 입력, 티어 및 선호 라인 검증',()=>{
  const p=validateProfile(base);
  assert.equal(p.riotId,'까마귀#KR1');
  assert.equal(rankLabel(p.peakTier,p.peakDivision,p.peakLp),'마스터 230LP');
  assert.equal(preferredLanes(p.lanes),'미드, 탑');
  assert.throws(()=>validateProfile({...base,riotId:'까마귀'}),/#태그/);
  assert.throws(()=>validateProfile({...base,peakLp:-1}),/LP/);
  assert.throws(()=>validateProfile({...base,lanes:[]}),/선호 라인/);
  assert.throws(()=>validateProfile({...base,currentDivision:'5'}),/1~4/);
  assert.throws(()=>validateProfile({...base,peakTier:'BRONZE',peakDivision:'1'}),/최고 티어/);
});
test('9명 명단에서 현재/최고/라인과 참여 판수 및 시작 전 신규 구분',()=>{
  const session={guildId:'g',round:3};
  const players=Array.from({length:9},(_,i)=>({id:`u${i}`,matchesPlayed:i%3+1}));
  const roster=buildRoster(session,players,(_,id)=>({...base,onnjRegistered:id==='u0'}));
  const msg=rosterMessages(session,roster).join('\n');
  assert.equal(roster.length,9);
  assert.match(msg,/기존 등록 \(1명\)/);
  assert.match(msg,/이번 판 신규 등록 처리 \(8명\)/);
  assert.match(msg,/까마귀#KR1 \/ 에메랄드 2 \/ 마스터 230LP \/ 미드, 탑 · 1판/);
});
