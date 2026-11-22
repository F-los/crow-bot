import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeneralSession,joinGeneralSession,editGeneralApplicant,
  leaveGeneralSession,orderedGeneralApplicants,generalGroups,generalPosition,
  closeGeneralSession,confirmGeneralSession,unconfirmGeneralSession,nextGeneralRotation,rotationMatches,
  savedGeneralInfo,joinSavedGeneralSession,editSavedGeneralInfo,
} from '../src/general-queue.js';

const fresh=(cap=2)=>createGeneralSession('guild','channel','general-session','배틀그라운드',cap,2,100);

test('종합게임은 판수 없이 신청 순서대로 정원까지 확정하고 나머지는 대기한다',()=>{
  const s=fresh();
  joinGeneralSession(s,'u1','첫째','첫째 게임닉','',110);
  joinGeneralSession(s,'u2','둘째','둘째 게임닉','친구코드: 123',120);
  joinGeneralSession(s,'u3','셋째','셋째 게임닉','',130);
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u1','u2']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['u3']);
  assert.deepEqual(generalPosition(s,'u3'),{position:3,confirmed:false});
  assert.equal(s.applicants[1].extraInfo,'친구코드: 123');
  assert.equal(s.applicants[0].matchesPlayed,undefined);
});
test('신청 취소 및 관리자 제외 시 다음 대기자가 자동 승격한다',()=>{
  const s=fresh();
  for(let n=1;n<=4;n++)joinGeneralSession(s,'u'+n,'이름'+n,'닉'+n);
  leaveGeneralSession(s,'u1');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u2','u3']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['u4']);
  leaveGeneralSession(s,'u3');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u2','u4']);
});
test('정보 수정은 신청 순서와 가입 시간을 유지한다',()=>{
  const s=fresh(1);
  joinGeneralSession(s,'a','A','기존 닉','',10);
  joinGeneralSession(s,'b','B','다음 닉','',20);
  const player=editGeneralApplicant(s,'a','A2','새 게임닉','참가 메모');
  assert.equal(player.sequence,1);
  assert.equal(player.joinedAt,10);
  assert.equal(player.extraInfo,'참가 메모');
  assert.deepEqual(orderedGeneralApplicants(s).map(p=>p.id),['a','b']);
});
test('취소 후 재신청은 맨 뒤에 배정한다',()=>{
  const s=fresh(1);
  joinGeneralSession(s,'a','A','닉1');
  joinGeneralSession(s,'b','B','닉2');
  leaveGeneralSession(s,'a');
  joinGeneralSession(s,'a','A','닉1');
  assert.deepEqual(orderedGeneralApplicants(s).map(p=>p.id),['b','a']);
  assert.equal(generalPosition(s,'a').confirmed,false);
});
test('중복 신청, 미신청 수정, 필수 닉네임 누락과 긴 메모를 검증한다',()=>{
  const s=fresh();
  assert.throws(()=>joinGeneralSession(s,'a','A',' '),/게임 닉네임/);
  joinGeneralSession(s,'a','A','정상 닉');
  assert.throws(()=>joinGeneralSession(s,'a','A','또 신청'),/이미 신청/);
  assert.throws(()=>editGeneralApplicant(s,'b','B','미신청'),/신청 기록/);
  assert.throws(()=>editGeneralApplicant(s,'a','A','닉','x'.repeat(201)),/200자/);
  assert.throws(()=>leaveGeneralSession(s,'b'),/신청 명단/);
});
test('게임 이름, 인원수를 검증하며 종료 시 신청·수정·취소를 막는다',()=>{
  assert.throws(()=>createGeneralSession('g','c','id','게임',0),/모집 인원/);
  assert.throws(()=>createGeneralSession('g','c','id','게임',101),/모집 인원/);
  assert.throws(()=>createGeneralSession('g','c','id',' \n',2),/게임 이름/);
  const s=fresh();
  joinGeneralSession(s,'a','A','닉');
  closeGeneralSession(s,1000);
  assert.equal(s.closedAt,1000);
  assert.throws(()=>joinGeneralSession(s,'b','B','닉'),/이미 종료/);
  assert.throws(()=>editGeneralApplicant(s,'a','A','새 닉'),/이미 종료/);
  assert.throws(()=>leaveGeneralSession(s,'a'),/이미 종료/);
});
test('다른 게임 모집의 인원과 순서에 영향받지 않는다',()=>{
  const a=fresh();
  const b=createGeneralSession('guild','channel','other','스팀게임',3);
  joinGeneralSession(a,'a','A','닉A');
  joinGeneralSession(b,'b','B','닉B');
  assert.deepEqual(orderedGeneralApplicants(a).map(p=>p.id),['a']);
  assert.deepEqual(orderedGeneralApplicants(b).map(p=>p.id),['b']);
});

test('관리자 확정 후 현재 팀은 고정되고 추가 신청은 대기로 들어간다',()=>{
  const s=fresh(2);
  joinGeneralSession(s,'a','A','닉1','',10);
  joinGeneralSession(s,'b','B','닉2','',20);
  joinGeneralSession(s,'c','C','닉3','',30);
  const selected=confirmGeneralSession(s,40);
  assert.deepEqual(selected.map(p=>p.id),['a','b']);
  assert.equal(s.status,'confirmed');
  assert.equal(s.confirmedAt,40);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['c']);
  assert.throws(()=>confirmGeneralSession(s),/이미 명단이 확정/);
  joinGeneralSession(s,'d','D','닉4');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['a','b']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['c','d']);
  editGeneralApplicant(s,'d','D','닉네임수정');
  leaveGeneralSession(s,'d');
  assert.throws(()=>editGeneralApplicant(s,'a','A','수정'),/현재 확정된 참가자/);
  assert.throws(()=>leaveGeneralSession(s,'a'),/현재 확정된 참가자/);
  closeGeneralSession(s,50);
  assert.equal(s.status,'closed');
  assert.equal(s.confirmedAt,40);
});
test('관리자는 확정 취소 뒤 기존 선착순 순서 그대로 모집을 재개한다',()=>{
  const s=fresh(1);
  joinGeneralSession(s,'a','A','닉1');
  joinGeneralSession(s,'b','B','닉2');
  confirmGeneralSession(s,10);
  unconfirmGeneralSession(s);
  assert.equal(s.status,'open');
  assert.equal(s.confirmedAt,null);
  assert.deepEqual(orderedGeneralApplicants(s).map(p=>p.id),['a','b']);
  leaveGeneralSession(s,'a');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['b']);
  assert.throws(()=>unconfirmGeneralSession(s),/확정된/);
});
test('확정 버튼은 신청자가 한 명도 없을 때 막는다',()=>{
  const s=fresh();
  assert.throws(()=>confirmGeneralSession(s),/신청자가 없어/);
  assert.equal(s.status,'open');
});

test('로테이션 판수는 안내용이며 다음 로테이션은 명단 확정 없이 예상 참가자만 올린다',()=>{
  const s=createGeneralSession('guild','channel','rotation','배틀그라운드',2,3,100);
  assert.equal(rotationMatches(s),3);
  for(let i=1;i<=5;i++)joinGeneralSession(s,'u'+i,'유저'+i,'닉'+i,'',100+i);
  assert.deepEqual(confirmGeneralSession(s).map(p=>p.id),['u1','u2']);
  assert.equal(s.rotationIndex,1);
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['u3','u4']);
  assert.equal(s.rotationIndex,2);
  assert.equal(s.status,'open');
  assert.equal(s.confirmedAt,null);
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u3','u4']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['u5']);
  assert.throws(()=>nextGeneralRotation(s),/명단 확정/);
  assert.deepEqual(confirmGeneralSession(s).map(p=>p.id),['u3','u4']);
  assert.deepEqual(orderedGeneralApplicants(s).map(p=>p.id),['u3','u4','u5']); // u1/u2 완전 제외
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['u5']);
  assert.equal(s.rotationIndex,3);
  assert.equal(s.status,'open');
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),[]);
  assert.deepEqual(orderedGeneralApplicants(s).map(p=>p.id),['u5']); // u3/u4 완전 제외
  joinGeneralSession(s,'u1','첫째','재신청 닉');
  joinGeneralSession(s,'u2','둘째','재신청 닉');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u5','u1']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['u2']);
  assert.deepEqual(confirmGeneralSession(s).map(p=>p.id),['u5','u1']);
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['u2']);
  assert.equal(s.rotationIndex,4);
  assert.equal(s.status,'open');
  assert.equal(generalPosition(s,'u5'),null);
  assert.equal(rotationMatches(s),3); // 게임 판수는 추적하지 않음
});
test('현재 팀 확정 중에도 새로 들어온 신청자는 대기하며 다음 로테이션에 들어간다',()=>{
  const s=createGeneralSession('g','c','id','오버쿡드',2,2);
  joinGeneralSession(s,'a','A','닉A');
  confirmGeneralSession(s);
  joinGeneralSession(s,'b','B','닉B');
  joinGeneralSession(s,'c','C','닉C');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['a']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['b','c']);
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['b','c']);
  assert.equal(s.status,'open');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['b','c']);
});
test('대기자가 없어도 이전 확정팀을 제외하고 모집 재개하여 재신청할 수 있다',()=>{
  const s=fresh(2);
  joinGeneralSession(s,'a','A','닉A', '',100);
  assert.throws(()=>nextGeneralRotation(s),/명단 확정/);
  confirmGeneralSession(s);
  assert.deepEqual(nextGeneralRotation(s,500),[]);
  assert.equal(s.status,'open');
  assert.equal(s.confirmedAt,null);
  assert.deepEqual(s.currentIds,[]);
  assert.equal(s.rotationIndex,2);
  assert.deepEqual(s.applicants,[]);
  assert.equal(generalPosition(s,'a'),null);
  joinGeneralSession(s,'a','A','재신청A','',600);
  assert.deepEqual(confirmGeneralSession(s).map(p=>p.id),['a']);
  assert.equal(s.status,'confirmed');
  assert.equal(s.rotationIndex,2);
  assert.equal(s.applicants[0].joinedAt,600);
});
test('기존 저장 데이터에서 로테이션 판수를 읽지 못하면 1판 안내로 표시한다',()=>{
  const s=fresh();
  delete s.rotationMatches;
  assert.equal(rotationMatches(s),1);
  joinGeneralSession(s,'a','A','닉A');
  joinGeneralSession(s,'b','B','닉B');
  joinGeneralSession(s,'c','C','닉C');
  confirmGeneralSession(s);
  delete s.currentIds;
  delete s.rotationIndex;
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['c']);
  assert.equal(generalPosition(s,'a'),null);
  assert.equal(generalPosition(s,'b'),null);
  assert.equal(s.rotationIndex,2);
});
test('로테이션 판수 범위 검증',()=>{
  assert.throws(()=>createGeneralSession('g','c','id','게임',2,0),/로테이션 판수/);
  assert.throws(()=>createGeneralSession('g','c','id','게임',2,31),/로테이션 판수/);
});

test('과거 v4.4.1 확정팀은 정원 미달이어도 새 신청자가 기존 팀에 섞이지 않는다',()=>{
  const s=fresh(3);
  joinGeneralSession(s,'a','A','닉A');
  confirmGeneralSession(s);
  delete s.currentIds; // 실제 구버전 저장 데이터
  joinGeneralSession(s,'b','B','닉B');
  assert.deepEqual(s.currentIds,['a']);
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['a']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),['b']);
});

test('대기자가 모자라면 새 신청자가 예상 참가자 빈자리를 채운다',()=>{
  const s=fresh(3);
  for(let i=1;i<=4;i++)joinGeneralSession(s,'u'+i,'이름'+i,'닉'+i);
  confirmGeneralSession(s);
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['u4']);
  assert.deepEqual(s.applicants.map(p=>p.id),['u4']);
  joinGeneralSession(s,'u1','이름1','재신청1');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u4','u1']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),[]);
  assert.equal(s.status,'open');
  assert.deepEqual(confirmGeneralSession(s).map(p=>p.id),['u4','u1']);
  assert.equal(s.status,'confirmed');
  assert.equal(generalPosition(s,'u2'),null);
});


test('첫 신청 정보는 로테이션 제외 뒤에도 남고 버튼 재신청은 같은 정보를 사용한다',()=>{
  const s=fresh(2);
  const first=joinGeneralSession(s,'a','첫째','배그닉#1','스팀 친구코드',111);
  joinGeneralSession(s,'b','둘째','배그닉#2','',112);
  joinGeneralSession(s,'c','셋째','배그닉#3','',113);
  assert.deepEqual(savedGeneralInfo(s,'a'),{gameNickname:'배그닉#1',extraInfo:'스팀 친구코드'});
  assert.deepEqual(confirmGeneralSession(s).map(p=>p.id),['a','b']);
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['c']);
  assert.equal(generalPosition(s,'a'),null);
  assert.deepEqual(orderedGeneralApplicants(s).map(p=>p.id),['c']);
  const again=joinSavedGeneralSession(s,'a','첫째(재참여)',1000);
  assert.equal(again.gameNickname,'배그닉#1');
  assert.equal(again.extraInfo,'스팀 친구코드');
  assert.equal(again.joinedAt,1000);
  assert.ok(again.sequence>first.sequence);
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['c','a']);
  assert.deepEqual(generalGroups(s).waiting.map(p=>p.id),[]);
  assert.throws(()=>joinSavedGeneralSession(s,'a','첫째'),/이미 신청/);
});
test('내 정보 수정은 저장 정보를 갱신하고 다음 재신청에서도 새 정보를 불러온다',()=>{
  const s=fresh(1);
  joinGeneralSession(s,'a','사용자','원래 닉','원래 메모');
  editGeneralApplicant(s,'a','사용자','수정된 닉','수정된 메모');
  assert.deepEqual(savedGeneralInfo(s,'a'),{gameNickname:'수정된 닉',extraInfo:'수정된 메모'});
  confirmGeneralSession(s);
  nextGeneralRotation(s);
  const next=joinSavedGeneralSession(s,'a','사용자');
  assert.equal(next.gameNickname,'수정된 닉');
  assert.equal(next.extraInfo,'수정된 메모');
});
test('대기열에서 제외된 상태로 정보 수정해도 자동 재신청되지 않는다',()=>{
  const s=fresh(1);
  joinGeneralSession(s,'a','사용자','기존 닉','메모');
  confirmGeneralSession(s);
  nextGeneralRotation(s);
  editSavedGeneralInfo(s,'a','사용자','변경 닉','새 메모');
  assert.deepEqual(s.applicants,[]);
  assert.equal(generalPosition(s,'a'),null);
  assert.deepEqual(savedGeneralInfo(s,'a'),{gameNickname:'변경 닉',extraInfo:'새 메모'});
  assert.throws(()=>editSavedGeneralInfo(s,'unknown','새 사용자','닉'),/저장된 참가 정보가 없습니다/);
  assert.throws(()=>joinSavedGeneralSession(s,'unknown','새 사용자'),/저장된 참가 정보가 없습니다/);
  const next=joinSavedGeneralSession(s,'a','사용자');
  assert.equal(next.gameNickname,'변경 닉');
  assert.equal(next.extraInfo,'새 메모');
});
test('과거 모집 데이터도 다음 로테이션에서 정보를 자동 보관한다',()=>{
  const s=fresh(1);
  joinGeneralSession(s,'a','A','기존 닉','예전 메모');
  joinGeneralSession(s,'b','B','대기 닉','대기 메모');
  delete s.savedApplicants; // v4.5.1 이전에 저장된 JSON
  confirmGeneralSession(s);
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['b']);
  assert.deepEqual(savedGeneralInfo(s,'a'),{gameNickname:'기존 닉',extraInfo:'예전 메모'});
  const again=joinSavedGeneralSession(s,'a','A');
  assert.equal(again.gameNickname,'기존 닉');
  assert.equal(again.extraInfo,'예전 메모');
});
test('신청 취소 후에도 저장 정보로 재신청되며 새 모집에는 전파되지 않는다',()=>{
  const s=fresh(2);
  joinGeneralSession(s,'a','A','닌텐도닉','SW-123');
  leaveGeneralSession(s,'a');
  assert.deepEqual(savedGeneralInfo(s,'a'),{gameNickname:'닌텐도닉',extraInfo:'SW-123'});
  joinSavedGeneralSession(s,'a','A');
  assert.equal(s.applicants.length,1);
  const another=fresh(2);
  assert.equal(savedGeneralInfo(another,'a'),null);
});
test('저장 정보가 있는 참가자도 중복 신청을 하면 순서가 변하지 않는다',()=>{
  const s=fresh(2);
  const first=joinGeneralSession(s,'a','A','닉A');
  assert.throws(()=>joinSavedGeneralSession(s,'a','A'),/이미 신청/);
  assert.equal(s.applicants.length,1);
  assert.equal(s.applicants[0].sequence,first.sequence);
});

test('예상 참가자 단계에서는 확정 전 신청 취소·제외도 순번대로 반영된다',()=>{
  const s=fresh(3);
  for(let i=1;i<=6;i++)joinGeneralSession(s,'u'+i,'이름'+i,'닉'+i);
  confirmGeneralSession(s);
  nextGeneralRotation(s);
  assert.equal(s.status,'open');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u4','u5','u6']);
  leaveGeneralSession(s,'u4');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u5','u6']);
  const x=joinSavedGeneralSession(s,'u1','첫째 재신청');
  assert.equal(x.gameNickname,'닉1');
  assert.deepEqual(generalGroups(s).confirmed.map(p=>p.id),['u5','u6','u1']);
  assert.deepEqual(confirmGeneralSession(s).map(p=>p.id),['u5','u6','u1']);
  assert.throws(()=>leaveGeneralSession(s,'u1'),/현재 확정된 참가자/);
  assert.equal(s.rotationIndex,2);
});
