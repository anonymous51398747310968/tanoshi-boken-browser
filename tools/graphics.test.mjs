import test from 'node:test';
import assert from 'node:assert/strict';
import { startCheckedPlayer, probeContext } from '../docs/graphics.mjs';

test('WebGL unavailable stops before downloading the engine or game', async () => {
  let downloads=0;
  const report={main:{webgl:{ok:false},webgl2:{ok:false}},worker:{webgl:{ok:false},webgl2:{ok:false}}};
  await assert.rejects(startCheckedPlayer(report,()=>{downloads++;}), /WebGL/);
  assert.equal(downloads,0);
});
test('working main-thread GL cannot mask missing worker GL', async () => {
  let downloads=0;
  const report={main:{webgl2:{ok:true}},worker:{error:'Worker context unavailable'}};
  await assert.rejects(startCheckedPlayer(report,()=>{downloads++;}), /Worker/);
  assert.equal(downloads,0);
});
test('software-rendered WebGL is accepted without GPU-name filtering', async () => {
  const software={webgl2:{ok:true,renderer:'ANGLE (SwiftShader Device (Subzero))'}};
  let downloads=0;
  await startCheckedPlayer({main:software,worker:software},()=>{downloads++;});
  assert.equal(downloads,1);
});
test('context creation errors become readable diagnostic results', () => {
  const result=probeContext({getContext(){throw Error('GPU process unavailable');}},'webgl2');
  assert.equal(result.ok,false);
  assert.match(result.error,/GPU process unavailable/);
});
test('a null context records failure instead of claiming CPU fallback', () => {
  const result=probeContext({getContext(){return null;}},'webgl2');
  assert.equal(result.ok,false);
});
