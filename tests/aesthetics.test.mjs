import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAesthetics,describeAesthetics,AESTHETIC_REFERENCES} from '../dist/aesthetics.mjs';
function pixels(width,height,fn) {
  const p=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)p.set(fn(x,y),(y*width+x)*4);
  return analyzeAesthetics(p,width,height);
}
test('solid gray has one palette color, no edges and no invented direction',()=>{
  const a=pixels(32,32,()=>[128,128,128,255]);
  assert.equal(a.palette.length,1);assert.equal(a.palette[0].hex,'#808080');assert.equal(a.palette[0].share,1);
  assert.equal(a.dominantDirection,null);assert.equal(a.edgeShare,0);assert.equal(a.quietShare,1);
  assert.equal(a.tonalSpread,0);assert.equal(a.balanceDifference,0);assert.equal(a.saturation,0);
});
test('pure white and black describe tone without grading quality',()=>{
  const white=pixels(32,32,()=>[255,255,255,255]),black=pixels(32,32,()=>[0,0,0,255]);
  assert.equal(white.brightShare,1);assert.equal(black.darkShare,1);
  assert.ok(Math.abs(white.meanLight-1)<1e-10);assert.equal(black.meanLight,0);
  assert.ok(!('score' in white));assert.ok(describeAesthetics(white).every(c=>c.evidence&&c.exercise));
});
test('half black and half white has both tones and a vertical boundary',()=>{
  const a=pixels(64,64,x=>x<32?[0,0,0,255]:[255,255,255,255]);
  assert.equal(a.brightShare,.5);assert.equal(a.darkShare,.5);
  assert.ok(a.tonalSpread>.9);assert.ok(Math.abs(a.balanceDifference-1)<1e-10);
  assert.equal(a.dominantDirection,'vertical');assert.equal(a.directions.vertical,1);
  assert.ok(Math.abs(a.palette.reduce((sum,c)=>sum+c.share,0)-1)<1e-10);
});
test('horizontal striped image has horizontal edges',()=>{
  const a=pixels(64,64,(_x,y)=>Math.floor(y/8)%2?[240,240,240,255]:[20,20,20,255]);
  assert.equal(a.dominantDirection,'horizontal');assert.ok(a.directions.horizontal>.99);
});
test('balanced mirror stripes remain distinct from a claim of aesthetic symmetry',()=>{
  const a=pixels(64,64,x=>Math.abs(x-31.5)<16?[255,255,255,255]:[0,0,0,255]);
  assert.equal(a.balanceDifference,0);
  const explanation=describeAesthetics(a,'symmetry').find(c=>c.element==='balance');
  assert.match(explanation.exercise,/不能证明对称/);
});
test('alpha is composited against white and tiny images have finite values',()=>{
  const a=pixels(1,1,()=>[0,0,0,0]);assert.equal(a.palette[0].hex,'#ffffff');assert.ok(Math.abs(a.meanLight-1)<1e-10);
  assert.equal(a.balanceDifference,0);assert.equal(a.dominantDirection,null);
});
test('saturated colors have high saturation and palette covers all sampled pixels',()=>{
  const a=pixels(40,40,(x,y)=>x<20?[255,0,0,255]:y<20?[0,255,0,255]:[0,0,255,255]);
  assert.equal(a.saturation,1);assert.equal(a.palette.length,3);
  assert.deepEqual(a.palette.map(c=>c.share).sort(),[.25,.25,.5]);
});
test('random image metrics remain finite and bounded',()=>{
  let seed=84;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed>>>24;};
  const a=pixels(96,64,()=>[rand(),rand(),rand(),255]);
  for(const key of ['meanLight','saturation','brightShare','darkShare','tonalSpread','edgeShare','quietShare','balanceDifference'])assert.ok(Number.isFinite(a[key])&&a[key]>=0&&a[key]<=1,key);
  assert.ok(Math.abs(a.histogram.reduce((sum,v)=>sum+v,0)-1)<1e-10);
  assert.ok(a.quietShare<.2);assert.equal(a.textureGrid.length,64);
});
test('all reference lessons contain a principle, exercise and measurement boundary',()=>{
  assert.equal(Object.keys(AESTHETIC_REFERENCES).length,5);
  for(const reference of Object.values(AESTHETIC_REFERENCES))assert.ok(reference.principle&&reference.exercise&&reference.observe&&reference.boundary);
});
test('invalid pixel dimensions are rejected',()=>{
  for(const args of [[[],0,0],[[],1,1],[[],1.5,1],[null,1,1]])assert.throws(()=>analyzeAesthetics(...args),TypeError);
});
