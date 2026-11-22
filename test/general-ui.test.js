import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralSession,joinGeneralSession,leaveGeneralSession,confirmGeneralSession,unconfirmGeneralSession} from '../src/general-queue.js';
import {renderGeneralBoard} from '../src/general-render.js';
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
  assert.equal(board.components[1].components.length,4);
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
  assert.equal(board.components[0].components[0].data.disabled,true);
  assert.equal(board.components[0].components[1].data.disabled,true);
  assert.equal(board.components[0].components[2].data.disabled,true);
  assert.equal(board.components[1].components[2].data.label,'확정 취소');
  assert.equal(board.components[1].components[2].data.disabled,false);
  unconfirmGeneralSession(s);
  board=renderGeneralBoard(s);
  assert.equal(board.components[0].components[0].data.disabled,false);
  assert.equal(board.components[1].components[2].data.label,'명단 확정');
});
