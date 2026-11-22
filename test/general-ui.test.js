import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralSession,joinGeneralSession,leaveGeneralSession,confirmGeneralSession,unconfirmGeneralSession,nextGeneralRotation,savedGeneralInfo} from '../src/general-queue.js';
import {renderGeneralBoard} from '../src/general-render.js';
import {getGuild,state,persist} from '../src/store.js';
import {handleGeneralCommand,handleGeneralButton,handleGeneralModal,handleGeneralSelect} from '../src/general-controller.js';

test('종합게임 Discord 이벤트 핸들러를 import할 수 있다',()=>{
  for(const handler of [handleGeneralCommand,handleGeneralButton,handleGeneralModal,handleGeneralSelect]){
    assert.equal(typeof handler,'function');
  }
});
test('모집판은 게임 이름과 확정·대기를 보여주고 추가 정보는 공개하지 않는다',()=>{
  const s=createGeneralSession('g','c','id','오버쿡드',1);
  joinGeneralSession(s,'1','첫째','게임닉1','비공개 친구코드');
  joinGeneralSession(s,'2','둘째','게임닉2');
  const board=renderGeneralBoard(s);
  assert.equal(board.embeds.length,1);
  const embed=board.embeds[0].toJSON();
  assert.match(embed.title,/오버쿡드/);
  assert.match(JSON.stringify(embed),/게임닉1/);
  assert.match(JSON.stringify(embed),/게임닉2/);
  assert.doesNotMatch(JSON.stringify(embed),/비공개 친구코드/);
  assert.equal(board.components.length,2);
  assert.equal(board.components[0].components.length,4);
  assert.equal(board.components[1].components.length,5);
  assert.equal(board.components[1].components[2].data.label,'명단 확정');
  leaveGeneralSession(s,'1');
  assert.match(JSON.stringify(renderGeneralBoard(s).embeds[0].toJSON()),/확정/);
});

test('명단 확정 버튼을 누른 뒤 확정 상태와 해제 버튼이 표시된다',()=>{
  const s=createGeneralSession('g','c','id','배틀그라운드',1);
  joinGeneralSession(s,'1','첫째','게임닉1');
  let board=renderGeneralBoard(s);
  assert.match(board.embeds[0].toJSON().description,/선착순 우선 배정/);
  confirmGeneralSession(s);
  board=renderGeneralBoard(s);
  const embed=board.embeds[0].toJSON();
  assert.match(embed.title,/명단 확정/);
  assert.match(embed.fields[1].name,/확정 참가자/);
  assert.equal(board.components[0].components[0].data.disabled,false);
  assert.equal(board.components[0].components[1].data.disabled,false);
  assert.equal(board.components[0].components[2].data.disabled,false);
  assert.equal(board.components[1].components[3].data.disabled,false); // 대기자가 없어도 다음 모집으로 넘어갈 수 있음
  assert.equal(board.components[1].components[2].data.label,'확정 취소');
  assert.equal(board.components[1].components[2].data.disabled,false);
  unconfirmGeneralSession(s);
  board=renderGeneralBoard(s);
  assert.equal(board.components[0].components[0].data.disabled,false);
  assert.equal(board.components[1].components[2].data.label,'명단 확정');
});

test('모집판은 안내용 판수와 로테이션 버튼을 표시하며 확정팀을 다음 팀으로 넘긴다',()=>{
  const s=createGeneralSession('g','c','id','배틀그라운드',2,3);
  joinGeneralSession(s,'1','첫째','닉1');
  joinGeneralSession(s,'2','둘째','닉2');
  joinGeneralSession(s,'3','셋째','닉3');
  let board=renderGeneralBoard(s);
  assert.match(board.embeds[0].toJSON().fields[0].value,/3판씩 로테이션/);
  assert.equal(board.components[1].components[3].data.label,'다음 로테이션');
  assert.equal(board.components[1].components[3].data.disabled,true);
  confirmGeneralSession(s);
  board=renderGeneralBoard(s);
  assert.equal(board.components[1].components[3].data.disabled,false);
  nextGeneralRotation(s);
  board=renderGeneralBoard(s);
  assert.match(board.embeds[0].toJSON().fields[0].value,/현재 \*\*2회차\*\*/);
  assert.match(board.embeds[0].toJSON().fields[1].value,/닉3/);
  assert.doesNotMatch(board.embeds[0].toJSON().fields[1].value,/닉2/);
});

test('대기자가 0명이어도 다음 로테이션 버튼으로 이전 팀을 제외하고 새 모집을 연다',()=>{
  const s=createGeneralSession('g','c','id','배틀그라운드',3,2);
  joinGeneralSession(s,'1','첫째','닉1');
  confirmGeneralSession(s);
  let board=renderGeneralBoard(s);
  assert.equal(board.components[1].components[3].data.disabled,false);
  assert.match(board.embeds[0].toJSON().footer.text,/명단에서 제외/);
  nextGeneralRotation(s);
  board=renderGeneralBoard(s);
  assert.equal(board.components[1].components[3].data.disabled,true);
  assert.equal(board.components[0].components[0].data.disabled,false);
  assert.equal(board.components[1].components[2].data.label,'명단 확정');
  assert.equal(s.applicants.length,0);
});


test('Discord 참가 버튼은 최초에만 모달을 열고 저장 정보로 즉시 재신청한다',async()=>{
  const guildId='test-general-quick-rejoin-'+process.pid;
  const session=createGeneralSession(guildId,'channel','panel123','배틀그라운드',1,2);
  session.messageId='board123';
  const guild=getGuild(guildId);
  guild.generalGame=session;
  const replies=[];
  const openedModals=[];
  const client={channels:{fetch:async()=>({
    isTextBased:()=>true,
    messages:{fetch:async()=>({edit:async()=>{}})},
  })}};
  function interaction(action) {
    return {
      guildId,customId:'crowgen:'+action+':'+session.id,
      user:{id:'player1',username:'player1'},member:{nickname:'플레이어'},
      message:{id:session.messageId},
      showModal:async modal=>{openedModals.push(modal);},
      deferReply:async()=>{},
      editReply:async content=>{replies.push(content);},
    };
  }
  function modal(action,nick,extra) {
    return {
      ...interaction(action),
      fields:{getTextInputValue:key=>key==='gameNickname'?nick:extra},
    };
  }
  try {
    // 처음에는 닉네임 등록창을 열어야 한다.
    await handleGeneralButton(interaction('join'),client,()=>{});
    assert.equal(openedModals.length,1);
    await handleGeneralModal(modal('join','처음 닉','친구 코드'),client);
    assert.deepEqual(savedGeneralInfo(session,'player1'),{gameNickname:'처음 닉',extraInfo:'친구 코드'});
    confirmGeneralSession(session);
    nextGeneralRotation(session);
    assert.equal(session.applicants.length,0);

    // 참가하지 않은 상태에서 정보 수정은 저장값만 바꾸고 자동 참가시키지 않는다.
    await handleGeneralButton(interaction('edit'),client,()=>{});
    assert.equal(openedModals.length,2);
    await handleGeneralModal(modal('edit','수정 닉','새 코드'),client);
    assert.equal(session.applicants.length,0);
    assert.deepEqual(savedGeneralInfo(session,'player1'),{gameNickname:'수정 닉',extraInfo:'새 코드'});

    // 두 번째 참가 신청 클릭은 모달 없이 곧바로 재신청한다.
    await handleGeneralButton(interaction('join'),client,()=>{});
    assert.equal(openedModals.length,2);
    assert.equal(session.applicants.length,1);
    assert.equal(session.applicants[0].gameNickname,'수정 닉');
    assert.equal(session.applicants[0].extraInfo,'새 코드');
    assert.match(String(replies.at(-1)),/저장된 게임 정보로 재신청 완료/);
  }finally {
    delete state.guilds[guildId];
    persist();
  }
});
