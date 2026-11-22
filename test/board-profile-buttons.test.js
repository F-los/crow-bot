import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSession} from '../src/rotation.js';
import {createModeSession} from '../src/mode-queue.js';
import {renderBoard} from '../src/render.js';
import {renderModeBoard} from '../src/mode-render.js';

function buttons(rendered) {
  return rendered.components.map(row=>row.components.map(button=>button.toJSON()));
}
test('내전 모집판에서 정보수정 버튼을 제공하고 행당 5개를 넘지 않는다',()=>{
  const session=makeSession('g','c','inhouse');
  const rows=buttons(renderBoard(session));
  assert.equal(rows[0].length,5);
  assert.ok(rows.flat().some(b=>b.custom_id==='crow:profile:inhouse' && b.label==='내 정보 수정' && !b.disabled));
  assert.ok(rows.flat().every(b=>b.custom_id!=='crow:profile:inhouse' || b.style===2));
});
test('솔랭·자랭 모집판 각각 정보수정 버튼을 제공한다',()=>{
  for(const mode of ['solo','flex']){
    const session=createModeSession('g','c',mode+'-id',mode);
    const rows=buttons(renderModeBoard(session));
    assert.ok(rows.every(row=>row.length<=5));
    const button=rows.flat().find(b=>b.custom_id===`crowv4:${mode}:profile:${mode}-id`);
    assert.ok(button);
    assert.equal(button.label,'내 정보 수정');
    assert.equal(button.disabled,false);
  }
});
test('종료된 모집판은 정보수정 버튼을 비활성화한다',()=>{
  const inhouse=makeSession('g','c','inhouse');
  inhouse.status='closed';
  assert.equal(buttons(renderBoard(inhouse)).flat().find(b=>b.custom_id==='crow:profile:inhouse').disabled,true);
  for(const mode of ['solo','flex']){
    const session=createModeSession('g','c','id',mode);
    session.status='closed';
    assert.equal(buttons(renderModeBoard(session)).flat().find(b=>b.custom_id===`crowv4:${mode}:profile:id`).disabled,true);
  }
});
