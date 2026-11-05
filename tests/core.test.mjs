import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findCrop,normalizeSubject,localAnalyze,makeTips} from '../dist/core.mjs';

test('crop geometry preserves subject, stays in bounds, and honors aspect ratio',()=>{
 let seed=42;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<1500;i++){
  const s=normalizeSubject({x:rand()*.9,y:rand()*.9,w:.03+rand()*.55,h:.03+rand()*.55});
  const aspect=.5+rand()*2.5,ratio=[aspect,1,1.5,.8][i%4];
  const r=findCrop(s,['left','right','none'][i%3],aspect,ratio);
  assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=1.000001&&r.y+r.h<=1.000001);
  assert.ok(s.x>=r.x-.000001&&s.y>=r.y-.000001&&s.x+s.w<=r.x+r.w+.000001&&s.y+s.h<=r.y+r.h+.000001);
  if(r.feasible)assert.ok(Math.abs(r.w*aspect/r.h-ratio)<.000001);
 }
});
test('impossible portrait crop keeps a wide subject intact',()=>{
 const r=findCrop({x:0,y:.2,w:1,h:.6},'none',2,.8);
 assert.equal(r.feasible,false);assert.equal(r.w,1);
 assert.match(makeTips({x:0,y:.2,w:1,h:.6},'none',null,r)[0].body,/无法/);
});
test('gaze direction targets the opposite third',()=>{
 const s={x:.4,y:.4,w:.1,h:.1};
 assert.equal(findCrop(s,'right',1.5).targetX,1/3);
 assert.equal(findCrop(s,'left',1.5).targetX,2/3);
});
test('uniform photo produces no invented horizon',()=>{
 const data=new Uint8ClampedArray(96*64*4).fill(128);
 const a=localAnalyze(data,96,64);assert.equal(a.horizon,null);assert.equal(a.gaze,'unknown');
 assert.ok(Number.isFinite(a.subject.x));
});
test('high contrast level boundary is detected only as a low confidence candidate',()=>{
 const w=96,h=64,data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=y<32?210:50;data[i+3]=255;}
 const a=localAnalyze(data,w,h);assert.ok(a.horizon);assert.ok(Math.abs(a.horizon.y-.5)<.04);assert.equal(a.horizon.confidence,'low');
});
test('suggestions quantify the actual crop and directional whitespace',()=>{
 const s={x:.7,y:.4,w:.2,h:.3};const r=findCrop(s,'right',1.5);
 const tips=makeTips(s,'right',null,r);assert.equal(tips.length,3);assert.match(tips[1].body,/10%/);assert.match(tips[2].body,/暂未确认/);
});
