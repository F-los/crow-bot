import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralSession,joinGeneralSession,leaveGeneralSession,confirmGeneralSession,unconfirmGeneralSession,nextGeneralRotation,savedGeneralInfo,generalGroups} from '../src/general-queue.js';
import {renderGeneralBoard,formatGeneralNickname} from '../src/general-render.js';
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
  assert.match(board.embeds[0].toJSON().description,/예상 참가자 모집 중/);
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
  assert.match(board.embeds[0].toJSON().fields[1].name,/예상 참가자/);
  assert.match(board.embeds[0].toJSON().fields[1].value,/닉3/);
  assert.doesNotMatch(board.embeds[0].toJSON().fields[1].value,/닉2/);
  assert.equal(board.components[1].components[2].data.label,'명단 확정');
  assert.equal(board.components[1].components[3].data.disabled,true);
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

test('다음 로테이션 후 1~2명 예상 참가자는 새 신청으로 채워지고 이후 명단 확정한다',()=>{
  const s=createGeneralSession('g','c','id','배틀그라운드',3,2);
  for(let i=1;i<=5;i++)joinGeneralSession(s,''+i,'사용자'+i,'닉'+i);
  confirmGeneralSession(s);
  assert.deepEqual(nextGeneralRotation(s).map(p=>p.id),['4','5']);
  let board=renderGeneralBoard(s);
  assert.equal(board.embeds[0].toJSON().fields[1].name,'📋 예상 참가자 (2/3)');
  assert.equal(board.components[1].components[2].data.disabled,false);
  joinGeneralSession(s,'6','사용자6','닉6');
  board=renderGeneralBoard(s);
  assert.equal(board.embeds[0].toJSON().fields[1].name,'📋 예상 참가자 (3/3)');
  assert.match(board.embeds[0].toJSON().fields[1].value,/닉6/);
  confirmGeneralSession(s);
  board=renderGeneralBoard(s);
  assert.equal(board.embeds[0].toJSON().fields[1].name,'✅ 확정 참가자 (3/3)');
});


test('디스코드 다음 로테이션 버튼은 자동 확정 대신 예상 참가자를 편성한다',async()=>{
  const guildId='test-general-provisional-'+process.pid;
  const session=createGeneralSession(guildId,'channel','s456','배틀그라운드',3,2);
  session.messageId='board456';
  const guild=getGuild(guildId);
  guild.generalGame=session;
  const replies=[];
  const boards=[];
  const client={channels:{fetch:async()=>({
    isTextBased:()=>true,
    messages:{fetch:async()=>({edit:async board=>{boards.push(board);}})},
  })}};
  function interaction(action) {
    return {
      guildId,customId:'crowgen:'+action+':'+session.id,
      user:{id:'admin',username:'admin'},member:{nickname:'매니저'},
      message:{id:session.messageId},
      deferReply:async()=>{},
      editReply:async value=>{replies.push(value);},
    };
  }
  try{
    for(let i=1;i<=5;i++)joinGeneralSession(session,'u'+i,'유저'+i,'닉'+i);
    confirmGeneralSession(session);
    await handleGeneralButton(interaction('next'),client,()=>{});
    assert.equal(session.status,'open');
    assert.deepEqual(generalGroups(session).confirmed.map(p=>p.id),['u4','u5']);
    assert.match(String(replies.at(-1)),/예상 참가자 2명/);
    assert.match(boards.at(-1).embeds[0].toJSON().fields[1].name,/예상 참가자/);
    joinGeneralSession(session,'u6','유저6','닉6');
    assert.deepEqual(generalGroups(session).confirmed.map(p=>p.id),['u4','u5','u6']);
    await handleGeneralButton(interaction('confirm'),client,()=>{});
    assert.equal(session.status,'confirmed');
    assert.deepEqual(generalGroups(session).confirmed.map(p=>p.id),['u4','u5','u6']);
  }finally{
    delete state.guilds[guildId];
    persist();
  }
});


test('게임 닉네임 밑줄은 대기/예상/확정 명단에서 그대로 보이며 복사할 수 있다',()=>{
  const s=createGeneralSession('g','c','id','배틀그라운드',1,2);
  joinGeneralSession(s,'1','첫째','kim_hyeon_2');
  joinGeneralSession(s,'2','둘째','park_test_1');
  assert.equal(formatGeneralNickname('kim_hyeon_2'),'\x60kim_hyeon_2\x60');
  for (const step of ['예상','확정']) {
    if (step==='확정') confirmGeneralSession(s);
    const board=renderGeneralBoard(s).embeds[0].toJSON();
    assert.match(board.fields[1].value,/\x60kim_hyeon_2\x60/);
    assert.match(board.fields[2].value,/\x60park_test_1\x60/);
    assert.doesNotMatch(JSON.stringify(board),/kim＿hyeon＿2|park＿test＿1/);
  }
});

test('내 순서 확인과 재신청 확인에도 원본 게임 닉네임을 그대로 표시한다',async()=>{
  const guildId='test-general-name-raw-'+process.pid;
  const session=createGeneralSession(guildId,'channel','id','스팀게임',1,2);
  session.messageId='test-panel';
  const guild=getGuild(guildId);
  guild.generalGame=session;
  const outputs=[];
  const client={channels:{fetch:async()=>({
    isTextBased:()=>true,
    messages:{fetch:async()=>({edit:async()=>{}})},
  })}};
  const interaction=action=>({
    guildId,customId:'crowgen:'+action+':'+session.id,
    user:{id:'rawuser',username:'rawuser'},member:{nickname:'원본 유지'},
    message:{id:session.messageId},
    deferReply:async()=>{},
    editReply:async content=>{outputs.push(content);},
  });
  try {
    joinGeneralSession(session,'rawuser','원본 유지','kim_hyeon_2');
    await handleGeneralButton(interaction('status'),client,()=>{});
    assert.match(String(outputs.at(-1)),/\x60kim_hyeon_2\x60/);
    confirmGeneralSession(session);
    nextGeneralRotation(session);
    await handleGeneralButton(interaction('join'),client,()=>{});
    assert.match(String(outputs.at(-1)),/\x60kim_hyeon_2\x60/);
    assert.doesNotMatch(String(outputs.at(-1)),/kim＿hyeon＿2/);
  }finally{
    delete state.guilds[guildId];
    persist();
  }
});
