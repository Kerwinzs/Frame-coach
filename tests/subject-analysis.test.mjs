import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSubjectContext,describeSubjectContext} from '../dist/subject-analysis.mjs';
const subject={x:.4,y:.4,w:.2,h:.2};
function image(width,height,fn) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(fn(x,y),(y*width+x)*4);
  return data;
}
const inSubject=(x,y)=>x>=40&&x<60&&y>=40&&y<60;
test('flat bright subject and dark ring are compared without false rectangle edges',()=>{
  const data=image(100,100,(x,y)=>inSubject(x,y)?[200,200,200,255]:[50,50,50,255]);
  const r=analyzeSubjectContext(data,100,100,subject);
  assert.equal(r.status,'ready');assert.equal(r.subject.pixels,400);assert.equal(r.background.pixels,1200);
  assert.ok(Math.abs(r.subject.meanLight-200/255)<1e-10);assert.ok(Math.abs(r.background.meanLight-50/255)<1e-10);
  assert.equal(r.subject.edgeShare,0);assert.equal(r.background.edgeShare,0);
  assert.equal(r.colorDifference,0);assert.match(describeSubjectContext(r,'focus')[1].action,/先保留/);assert.equal(r.mask[50*100+50],1);assert.equal(r.mask[35*100+35],2);assert.equal(r.mask[0],0);
});
test('distant image content does not affect nearby background sampling',()=>{
  const a=image(100,100,()=>[70,70,70,255]);
  const b=image(100,100,(x,y)=>x<15||y<15?[255,0,0,255]:[70,70,70,255]);
  const ra=analyzeSubjectContext(a,100,100,subject),rb=analyzeSubjectContext(b,100,100,subject);
  assert.deepEqual(ra.subject,rb.subject);assert.deepEqual(ra.background,rb.background);
});
test('hue distribution distinguishes colors while treating brightness separately',()=>{
  const colorful=image(100,100,(x,y)=>inSubject(x,y)?[255,0,0,255]:[0,255,0,255]);
  assert.equal(analyzeSubjectContext(colorful,100,100,subject).colorDifference,1);
  const sameHue=image(100,100,(x,y)=>inSubject(x,y)?[160,0,0,255]:[80,0,0,255]);
  assert.equal(analyzeSubjectContext(sameHue,100,100,subject).colorDifference,0);
});
test('background texture is measured inside the ring rather than across region borders',()=>{
  const data=image(100,100,(x,y)=>inSubject(x,y)?[100,100,100,255]:Math.floor(x/3)%2?[240,240,240,255]:[15,15,15,255]);
  const r=analyzeSubjectContext(data,100,100,subject);
  assert.equal(r.subject.edgeShare,0);assert.ok(r.background.edgeShare>.3);
  assert.match(describeSubjectContext(r,'focus')[2].title,/周边带/);
});
test('global subject coordinates map into a cropped analysis frame correctly',()=>{
  const data=image(50,50,()=>[100,100,100,255]);
  const r=analyzeSubjectContext(data,50,50,subject,{x:.25,y:.25,w:.5,h:.5});
  assert.equal(r.status,'ready');assert.equal(r.subject.pixels,400);
  assert.equal(r.mask[15*50+15],1);assert.equal(r.mask[34*50+34],1);assert.equal(r.mask[35*50+35],2);
});
test('clipped or outside subjects never produce targeted suggestions',()=>{
  const data=image(100,100,()=>[128,128,128,255]);
  const clipped=analyzeSubjectContext(data,100,100,subject,{x:.5,y:0,w:.5,h:1});
  assert.equal(clipped.status,'clipped');assert.deepEqual(describeSubjectContext(clipped),[]);
  const outside=analyzeSubjectContext(data,100,100,subject,{x:.8,y:.8,w:.2,h:.2});
  assert.equal(outside.status,'outside');assert.deepEqual(describeSubjectContext(outside),[]);
});
test('a frame-filling subject and tiny subject report insufficient samples',()=>{
  const data=image(100,100,()=>[128,128,128,255]);
  assert.equal(analyzeSubjectContext(data,100,100,{x:0,y:0,w:1,h:1}).status,'small-background');
  assert.equal(analyzeSubjectContext(data,100,100,{x:.5,y:.5,w:.01,h:.01}).status,'small-subject');
});
test('insufficient gradient neighborhoods are not treated as zero texture',()=>{
  const data=image(20,20,()=>[128,128,128,255]);
  const r=analyzeSubjectContext(data,20,20,{x:.4,y:0,w:.2,h:1});
  assert.equal(r.status,'ready');assert.equal(r.background.edgeShare,null);
  assert.match(describeSubjectContext(r)[2].title,/暂不可用/);
});
test('shooting intent changes the exercise instead of forcing higher contrast',()=>{
  const data=image(100,100,()=>[100,100,100,255]),r=analyzeSubjectContext(data,100,100,subject);
  assert.match(describeSubjectContext(r,'focus')[0].title,/明暗接近/);
  assert.match(describeSubjectContext(r,'focus')[0].action,/轻移机位/);
  assert.match(describeSubjectContext(r,'environment')[0].action,/环境/);
  assert.match(describeSubjectContext(r,'symmetry')[0].action,/不能证明对称/);
  assert.match(describeSubjectContext(r,'space')[0].action,/空间/);
});
test('invalid rectangles are gated and transparency uses a white measurement base',()=>{
  const data=image(100,100,()=>[0,0,0,0]);
  assert.equal(analyzeSubjectContext(data,100,100,null).status,'no-subject');
  assert.equal(analyzeSubjectContext(data,100,100,{...subject,w:NaN}).status,'no-subject');
  assert.equal(analyzeSubjectContext(data,100,100,subject,{x:0,y:0,w:0,h:1}).status,'invalid-frame');
  const r=analyzeSubjectContext(data,100,100,subject);
  assert.equal(r.subject.meanColor,'#ffffff');assert.equal(r.colorDifference,0);assert.ok(Math.abs(r.lightDifference)<1e-10);
  assert.throws(()=>analyzeSubjectContext([],1,1,subject),TypeError);
});
