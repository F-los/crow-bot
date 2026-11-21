import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'crow-test-'));
process.env.CROW_DATA_DIR=folder;
const {saveProfile,getProfile,markOnnjRegistered}=await import('../src/profiles.js');
test('SQLite 저장 후 상태 유지, 게임 시작 시 기존 등록 전환',()=>{
  const form={riotId:'별이#KR1',currentTier:'SILVER',currentDivision:'1',peakTier:'GOLD',peakDivision:'4',lanes:['MID','TOP']};
  assert.equal(saveProfile('g','u1',form).onnjRegistered,false);
  markOnnjRegistered('g',['u1']);
  assert.equal(getProfile('g','u1').onnjRegistered,true);
  assert.equal(saveProfile('g','u1',{...form,currentDivision:'2'}).onnjRegistered,true);
  assert.throws(()=>saveProfile('g','u2',form),/다른 디스코드/);
});
