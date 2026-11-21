import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProfile,rankLabel,preferredLanes} from '../src/profile-utils.js';
import {buildRoster,previewRosterLines,rosterForBoard,rosterLine,sortConfirmedRoster} from '../src/roster.js';

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
  const lines=previewRosterLines(roster).join('\n');
  assert.equal(roster.length,9);
  assert.match(lines,/✅기존/);
  assert.match(lines,/🆕신규/);
  assert.doesNotMatch(lines,/프로필 미등록|프로필없음/);
  assert.match(lines,/<@u0> \/ 까마귀#KR1 \/ 에메랄드 2 \/ 마스터 230LP \/ 미드, 탑 · 1판/);
});

test('확정 명단에 멘션 / Riot ID / 현재 / 최고 / 라인 / 참여 판수',()=>{
  const p={id:'123456789012345678',order:2,riotId:'김오루#KR1',current:'골드 2',peak:'플래티넘 1',lanes:'미드, 정글',count:3};
  assert.equal(rosterLine(p),'2. <@123456789012345678> / 김오루#KR1 / 골드 2 / 플래티넘 1 / 미드, 정글 · 3판');
  assert.match(rosterLine({...p,riotId:null}),/정보 확인 필요/);
});
test('게임 중 등록 상태 변경이 있어도 확정 명단 스냅샷을 보존',()=>{
  const player={id:'u1',matchesPlayed:1};
  const snapshot={id:'u1',order:1,riotId:'김오루#KR1',current:'골드 2',peak:'플래티넘 1',lanes:'미드',count:1,wasRegistered:false,missing:false};
  const session={guildId:'g',round:1,rounds:[{round:1,roster:[snapshot]}]};
  const getProfile=()=>({...base,onnjRegistered:true});
  assert.deepEqual(rosterForBoard(session,[player],true,getProfile),[snapshot]);
  assert.equal(rosterForBoard(session,[player],false,getProfile)[0].wasRegistered,true);
});

test('확정 명단은 신규 먼저 기존 다음, 같은 그룹 안에서는 선발 순서 유지',()=>{
  const players=[
    {id:'old1',order:1,wasRegistered:true,count:1},
    {id:'new1',order:2,wasRegistered:false,count:2},
    {id:'old2',order:3,wasRegistered:true,count:3},
    {id:'new2',order:4,wasRegistered:false,count:4},
    {id:'new3',order:5,wasRegistered:false,count:5},
  ];
  const session={guildId:'g',round:2,rounds:[{round:2,roster:players}]};
  const sorted=rosterForBoard(session,[],true,()=>{throw new Error('스냅샷을 우선 사용해야 함');});
  assert.deepEqual(sorted.map(p=>p.id),['new1','new2','new3','old1','old2']);
  assert.deepEqual(sorted.map(p=>p.order),[1,2,3,4,5]);
  assert.deepEqual(sorted.map(p=>p.count),[2,4,5,1,3]);
  assert.deepEqual(players.map(p=>p.id),['old1','new1','old2','new2','new3']);
  assert.deepEqual(players.map(p=>p.order),[1,2,3,4,5]);
  assert.match(previewRosterLines(sorted).join('\n'),/1\. <@new1>.*🆕신규/);
});

test('시작 전 예상 명단은 기존 대기열 정렬, 확정 화면에만 신규 우선 정렬',()=>{
  const players=[{id:'old',matchesPlayed:3},{id:'new',matchesPlayed:0}];
  const session={guildId:'g',round:0,rounds:[]};
  const getProfile=(_,id)=>({...base,onnjRegistered:id==='old'});
  assert.deepEqual(rosterForBoard(session,players,false,getProfile).map(p=>p.id),['old','new']);
  assert.deepEqual(rosterForBoard(session,players,true,getProfile).map(p=>p.id),['new','old']);
  assert.deepEqual(sortConfirmedRoster([]),[]);
});
