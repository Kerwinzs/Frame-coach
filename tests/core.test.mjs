import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findCrop,normalizeSubject,localAnalyze,makeTips,fitCrop,moveCrop,resizeCrop,containsSubject,INTENTS} from '../dist/core.mjs';

test('crop geometry preserves subject, stays in bounds, and honors aspect ratio',()=>{
 let seed=42;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<1500;i++){
  const s=normalizeSubject({x:rand()*.9,y:rand()*.9,w:.03+rand()*.55,h:.03+rand()*.55});
  const aspect=.5+rand()*2.5,ratio=[aspect,1,1.5,.8][i%4];
  const r=findCrop(s,['left','right','none'][i%3],aspect,ratio,Object.keys(INTENTS)[i%4]);
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
 const s={x:.7,y:.4,w:.2,h:.3};const r={x:.5,y:.2,w:.5,h:.8};
 const tips=makeTips(s,'right',null,r);assert.equal(tips.length,3);assert.match(tips[1].body,/20%/);assert.match(tips[2].body,/暂未确认/);
});

test('intent changes framing while preserving complete subjects',()=>{
 const s={x:.555,y:.695,w:.34,h:.23};
 const focus=findCrop(s,'unknown',1.5,1.5,'focus');
 const environment=findCrop(s,'unknown',1.5,1.5,'environment');
 const symmetry=findCrop(s,'unknown',1.5,1.5,'symmetry');
 const space=findCrop(s,'left',1.5,1.5,'space');
 assert.ok(environment.w*environment.h>focus.w*focus.h);
 assert.equal(symmetry.targetX,.5);assert.equal(symmetry.targetY,.5);
 const offset=r=>Math.abs((s.x+s.w/2-r.x)/r.w-.5)+Math.abs((s.y+s.h/2-r.y)/r.h-.5);
 assert.ok(offset(symmetry)<offset(focus));
 assert.equal(space.targetX,.75);assert.ok(space.w*space.h>=focus.w*focus.h);
 for(const intent of Object.keys(INTENTS))assert.ok(containsSubject(findCrop(s,'left',1.5,1.5,intent),s));
});
test('environment and centered intent advice does not prescribe thirds',()=>{
 const s={x:.4,y:.4,w:.2,h:.2};
 for(const intent of ['environment','symmetry']){
  const tips=makeTips(s,'right',null,findCrop(s,'right',1.5,1.5,intent),intent);
  assert.ok(!tips.slice(0,2).some(t=>/三分线/.test(t.title+t.body)));
 }
});
test('manual clipping is flagged and manual framing is described accurately',()=>{
 const s={x:.4,y:.4,w:.2,h:.2};
 assert.match(makeTips(s,'none',null,{x:.5,y:.5,w:.4,h:.4},'focus',true)[0].title,/切到主体/);
 const tips=makeTips(s,'none',null,{x:.2,y:.2,w:.6,h:.6},'focus',true);
 assert.match(tips[0].title,/手动/);assert.match(tips[0].body,/左侧约 20%/);
});
test('locked fit stays inside requested crop and uses physical aspect ratio',()=>{
 const input={x:.1,y:.2,w:.8,h:.7};
 const r=fitCrop(input,1.5,1);
 assert.ok(Math.abs(r.w*1.5/r.h-1)<1e-10);
 assert.ok(r.x>=input.x&&r.y>=input.y&&r.x+r.w<=input.x+input.w+1e-10&&r.y+r.h<=input.y+input.h+1e-10);
});
test('moving beyond edges clamps position without changing crop size',()=>{
 const r={x:.2,y:.3,w:.4,h:.5};
 assert.deepEqual(moveCrop(r,100,-100),{x:.6,y:0,w:.4,h:.5});
});
test('corner resizing respects bounds, opposite anchor, and locked ratios',()=>{
 let seed=73;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<1200;i++){
  const imageAspect=.5+rand()*2.5,ratio=.5+rand()*2;
  const base={x:rand()*.3,y:rand()*.3,w:.3+rand()*.3,h:.3+rand()*.3};
  const r=fitCrop(base,imageAspect,ratio),handle=['nw','ne','se','sw'][i%4];
  const locked=i%2===0;
  const next=resizeCrop(r,handle,{x:rand()*1.5-.25,y:rand()*1.5-.25},imageAspect,locked?ratio:null);
  assert.ok(next.x>=-1e-10&&next.y>=-1e-10&&next.x+next.w<=1+1e-10&&next.y+next.h<=1+1e-10);
  assert.ok(next.w>0&&next.h>0);
  if(locked)assert.ok(Math.abs(next.w*imageAspect/next.h-ratio)<1e-9);
  const anchor=(a)=>[handle.includes('w')?a.x+a.w:a.x,handle.includes('n')?a.y+a.h:a.y];
  const before=anchor(r),after=anchor(next);
  assert.ok(before.every((v,j)=>Math.abs(v-after[j])<1e-10));
 }
});
