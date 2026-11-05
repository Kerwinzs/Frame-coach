import {clamp,normalizeSubject,findCrop,localAnalyze,makeTips} from './core.mjs';
const $=id=>document.getElementById(id);
const state={image:null,subject:null,horizon:null,gaze:'unknown',ratio:'original',view:'guide',mode:'local',source:'',ai:null,interaction:null,drag:null,revision:0,loadId:0,busy:false,controller:null,subjectManual:false,subjectOrigin:'demo'};
const canvas=$('mainCanvas'),ctx=canvas.getContext('2d');
const say=text=>{ $('notice').textContent=text; $('notice').hidden=!text; };
function cancelAI(){if(state.controller)state.controller.abort();state.controller=null;state.busy=false;state.revision++;$('aiBtn').disabled=false;$('aiBtn').textContent='✦ 用 AI 再看一眼';}
function adjusted(){cancelAI();state.ai=null;state.source=state.subjectManual?'主体已手动确认':state.subjectOrigin==='ai'?'AI 识别 · 本地重算':state.subjectOrigin==='estimated'?'视觉焦点估计':'示例已标注';state.mode='local';render();}
function crop(){return findCrop(state.subject,state.gaze,state.image.width/state.image.height,state.ratio==='original'?state.image.width/state.image.height:Number(state.ratio));}
function scaledCanvas(img,max){const c=document.createElement('canvas');const scale=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}
function drawImageTo(c,img,rect=null,max=1400){const r=rect||{x:0,y:0,w:1,h:1};const scale=Math.min(1,max/Math.max(img.width*r.w,img.height*r.h));c.width=Math.max(1,Math.round(img.width*r.w*scale));c.height=Math.max(1,Math.round(img.height*r.h*scale));c.getContext('2d').drawImage(img,r.x*img.width,r.y*img.height,r.w*img.width,r.h*img.height,0,0,c.width,c.height);}
function strokeRect(c,r,color,dash=[]){const w=canvas.width,h=canvas.height;c.strokeStyle=color;c.lineWidth=Math.max(2,w/700);c.setLineDash(dash);c.strokeRect(r.x*w,r.y*h,r.w*w,r.h*h);c.setLineDash([]);}
function draw(){if(!state.image)return;const r=crop();drawImageTo(canvas,state.image);const w=canvas.width,h=canvas.height;ctx.save();
 if(state.view!=='original'){
  ctx.fillStyle='#101b1770';ctx.beginPath();ctx.rect(0,0,w,h);ctx.rect(r.x*w,r.y*h,r.w*w,r.h*h);ctx.fill('evenodd');
  if($('gridToggle').checked){ctx.strokeStyle='#ffffff70';ctx.lineWidth=Math.max(1,w/1200);ctx.setLineDash([7,6]);for(let i=1;i<=2;i++){ctx.beginPath();ctx.moveTo((r.x+r.w*i/3)*w,r.y*h);ctx.lineTo((r.x+r.w*i/3)*w,(r.y+r.h)*h);ctx.stroke();ctx.beginPath();ctx.moveTo(r.x*w,(r.y+r.h*i/3)*h);ctx.lineTo((r.x+r.w)*w,(r.y+r.h*i/3)*h);ctx.stroke();}ctx.setLineDash([]);}
  strokeRect(ctx,r,'#efb174');strokeRect(ctx,state.subject,'#d9edb2',[8,5]);
  const cx=(state.subject.x+state.subject.w/2)*w,cy=(state.subject.y+state.subject.h/2)*h;
  ctx.fillStyle='#d9edb2';ctx.beginPath();ctx.arc(cx,cy,Math.max(4,w/230),0,Math.PI*2);ctx.fill();
  if(state.gaze==='left'||state.gaze==='right'){const dir=state.gaze==='right'?1:-1,len=w*.08;ctx.strokeStyle='#d9edb2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dir*len,cy);ctx.lineTo(cx+dir*(len-12),cy-9);ctx.moveTo(cx+dir*len,cy);ctx.lineTo(cx+dir*(len-12),cy+9);ctx.stroke();}
  if(state.horizon){const dy=Math.tan(state.horizon.angle*Math.PI/180)*w/2;ctx.strokeStyle='#8ed3db';ctx.lineWidth=2.5;ctx.setLineDash([11,6]);ctx.beginPath();ctx.moveTo(0,state.horizon.y*h-dy);ctx.lineTo(w,state.horizon.y*h+dy);ctx.stroke();ctx.setLineDash([]);}
 }
 if(state.drag){const a=state.drag.a,b=state.drag.b;if(state.interaction==='subject')strokeRect(ctx,{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)},'#fff');else{ctx.strokeStyle='#8ed3db';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a.x*w,a.y*h);ctx.lineTo(b.x*w,b.y*h);ctx.stroke();}}
 ctx.restore();drawImageTo($('beforeCanvas'),state.image);drawImageTo($('afterCanvas'),state.image,r);
}
function render(){if(!state.image)return;const r=crop();draw();$('singleView').hidden=state.view==='compare';$('compareView').hidden=state.view!=='compare';$('viewBadge').textContent=state.interaction==='subject'?'拖拽框选整个主体':state.interaction==='horizon'?'沿真实水平线拖动':state.view==='original'?'原图 · 无标注':'构图标注';
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
 $('subjectBtn').classList.toggle('selected',state.interaction==='subject');$('horizonBtn').classList.toggle('selected',state.interaction==='horizon');$('subjectBtn').setAttribute('aria-pressed',String(state.interaction==='subject'));$('horizonBtn').setAttribute('aria-pressed',String(state.interaction==='horizon'));
 $('modeBadge').textContent=state.mode==='ai'?'AI 看图分析':'本地构图辅助';$('sourceLabel').textContent=state.source;
 $('summary').textContent=state.ai?.summary||`${state.subject.label}位于画面${state.subject.x+state.subject.w/2<.45?'左侧':state.subject.x+state.subject.w/2>.55?'右侧':'中部'}。${state.source==='视觉焦点估计'?'这是基于颜色与对比度的候选区域，请先确认绿色框。':'以绿色框内区域为主体，尝试安排周围的空间。'}`;
 $('confidence').textContent=state.mode==='ai'?'AI 对位置和方向的判断可能不准确，可手动纠正。':state.source==='视觉焦点估计'?'待确认 · 本地模式不识别物体含义或视线':'主体范围已设定 · 裁剪是可选的构图练习';
 let tips=makeTips(state.subject,state.gaze,state.horizon,r);if(state.ai)tips=[tips[0],...state.ai.tips.map(t=>({...t,tag:'拍摄 · AI 场景建议'}))];
 $('tips').replaceChildren(...tips.slice(0,3).map(t=>{const li=document.createElement('li');const h=document.createElement('h3'),p=document.createElement('p'),tag=document.createElement('span');h.textContent=t.title;p.textContent=t.body;tag.className='tag';tag.textContent=t.tag;li.append(h,p,tag);return li;}));
 for(const [id,key]of [['subjectX','x'],['subjectY','y'],['subjectW','w'],['subjectH','h']])$(id).value=Math.round(state.subject[key]*100);
 $('gaze').value=state.gaze;$('ratio').value=state.ratio;
}
async function loadImage(src,name,demo=false){
 const id=++state.loadId;cancelAI();say('');setInteraction(null);const img=new Image();img.decoding='async';
 try{img.src=src;await img.decode();if(id!==state.loadId)return;
 if(img.naturalWidth*img.naturalHeight>40000000)throw new Error('照片超过 4000 万像素，请先缩小后再试。');
 const image=scaledCanvas(img,2600);state.image=image;state.gaze='unknown';state.ratio='original';state.ai=null;state.subjectManual=false;state.subjectOrigin=demo?'demo':'estimated';state.mode='local';state.source=demo?'示例已标注':'视觉焦点估计';
 if(demo){state.subject={x:.555,y:.695,w:.34,h:.23,label:'湖边木屋',confidence:'high'};state.horizon={y:.715,angle:0,confidence:'high'};}
 else{const thumb=scaledCanvas(img,144);const a=localAnalyze(thumb.getContext('2d').getImageData(0,0,thumb.width,thumb.height).data,thumb.width,thumb.height);Object.assign(state,a);}
 $('fileName').textContent=name;$('dimensions').textContent=`${img.naturalWidth} × ${img.naturalHeight}`;state.view='guide';render();
 }catch(e){if(id===state.loadId)say(e.message.includes('4000')?e.message:'无法读取这张图片。请使用 JPEG、PNG 或 WebP，HEIC 需要先转换。');}
}
async function fileSelected(file){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){say('请使用 JPEG、PNG 或 WebP 图片；HEIC 请先转换为 JPEG。');return;}if(file.size>20*1024*1024){say('照片超过 20 MB，请先缩小后重试。');return;}const url=URL.createObjectURL(file);try{await loadImage(url,file.name);}finally{URL.revokeObjectURL(url);}}
function setInteraction(mode){state.interaction=mode;state.drag=null;if(mode)state.view='guide';$('interactionHelp').textContent=mode==='subject'?'在照片上拖拽框选；Esc 取消':mode==='horizon'?'沿水平线拖动；Esc 取消':'拖拽文件也可以上传';if(state.image)render();}
function point(e){const r=canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};}
canvas.addEventListener('pointerdown',e=>{if(!state.interaction||!state.image)return;e.preventDefault();const p=point(e);state.drag={a:p,b:p};canvas.setPointerCapture(e.pointerId);draw();});
canvas.addEventListener('pointermove',e=>{if(!state.drag)return;state.drag.b=point(e);draw();});
canvas.addEventListener('pointerup',e=>{if(!state.drag)return;const {a}=state.drag,b=point(e),mode=state.interaction;state.drag=null;
 if(mode==='subject'){const w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);if(w<.015||h<.015){say('请拖出一个包含完整主体的矩形，或使用下方数值标注。');render();return;}state.subjectManual=true;state.subject=normalizeSubject({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w,h,label:'你选择的主体',confidence:'high'});}
 else{if(Math.abs(a.x-b.x)<.08){say('请沿水平线横向拖长一些。');render();return;}const slope=(b.y-a.y)*state.image.height/((b.x-a.x)*state.image.width),angle=Math.atan(slope)*180/Math.PI;if(Math.abs(angle)>20){say('这条线倾斜较大，请沿接近水平的真实参照线标记。');render();return;}state.horizon={y:clamp(a.y+(.5-a.x)*(b.y-a.y)/(b.x-a.x)),angle,confidence:'high'};}
 say('');setInteraction(null);adjusted();});
canvas.addEventListener('pointercancel',()=>{state.drag=null;draw();});
$('uploadTop').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{fileSelected(e.target.files[0]);e.target.value='';};$('demoBtn').onclick=()=>loadImage('./demo.jpg','湖边的木屋 · 示例照片',true);
$('subjectBtn').onclick=()=>setInteraction(state.interaction==='subject'?null:'subject');$('horizonBtn').onclick=()=>setInteraction(state.interaction==='horizon'?null:'horizon');$('clearHorizon').onclick=()=>{state.horizon=null;adjusted();};
$('gaze').onchange=e=>{state.gaze=e.target.value;adjusted();};$('ratio').onchange=e=>{state.ratio=e.target.value;adjusted();};$('gridToggle').onchange=draw;
$('applySubject').onclick=()=>{const values=['subjectX','subjectY','subjectW','subjectH'].map(id=>Number($(id).value)/100);if(values.some(v=>!Number.isFinite(v))||values[0]<0||values[1]<0||values[2]<=0||values[3]<=0||values[0]+values[2]>1.001||values[1]+values[3]>1.001){say('主体范围需在照片内：左侧 + 宽度、顶部 + 高度均不能超过 100%。');return;}const [x,y,w,h]=values;state.subjectManual=true;state.subject=normalizeSubject({x,y,w,h,label:'你选择的主体',confidence:'high'});say('');adjusted();};
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{setInteraction(null);state.view=b.dataset.view;render();});
let dragDepth=0;const drop=$('dropZone');drop.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('dropHint').hidden=false;});drop.addEventListener('dragover',e=>e.preventDefault());drop.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('dropHint').hidden=true;}});drop.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('dropHint').hidden=true;fileSelected(e.dataTransfer.files[0]);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());window.addEventListener('keydown',e=>{if(e.key==='Escape')setInteraction(null);});
$('exportBtn').onclick=()=>{if(!state.image)return;const r=crop(),out=document.createElement('canvas');drawImageTo(out,state.image,r,2600);out.toBlob(blob=>{if(!blob){say('导出失败，请重试。');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='留白-建议裁剪.jpg';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);say('已导出建议裁剪图。原照片保持原样；未自动旋转。');},'image/jpeg',.94);};
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
let aiAvailable=false;
async function checkAI(){try{const r=await fetch('/api/config');if(!r.ok)throw Error();const c=await r.json();aiAvailable=c.aiAvailable;$('aiStatus').textContent=aiAvailable?`已连接 ${c.model}。点击后发送压缩照片进行分析。`:'尚未配置 AI 密钥，当前可完整使用本地构图辅助。';$('privacy').textContent=aiAvailable?'仅点击 AI 按钮时发送照片到 OpenAI；本地服务器不保存照片。':'本地模式下，照片仅在浏览器内处理。';}catch{$('aiStatus').textContent='当前为静态预览。启动本地服务后可配置 AI 分析。';}}
$('aiBtn').onclick=async()=>{
 if(!aiAvailable){say('AI 尚未配置。可先使用框选主体、视线设置和裁剪对比；AI 启用方法见项目里的 README。');return;}
 if(!state.image||state.busy)return;cancelAI();state.busy=true;state.controller=new AbortController();const controller=state.controller,revision=state.revision;
 $('aiBtn').disabled=true;$('aiBtn').textContent='✦ 正在观察这张照片…';say('');
 const timer=setTimeout(()=>controller.abort(),85000);
 try{const image=scaledCanvas(state.image,1400).toDataURL('image/jpeg',.85);const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,gaze:state.gaze,subject:state.subjectManual?state.subject:null}),signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'AI 分析失败');if(revision!==state.revision)return;
 state.subjectOrigin='ai';state.subject=data.subject;state.horizon=data.horizon;state.gaze=data.gaze;state.ai=data;state.mode='ai';state.source='基于照片内容';render();
 }catch(e){if(revision===state.revision)say(e.name==='AbortError'?'AI 请求超时，请稍后再试。你仍可使用本地构图辅助。':e.message);}
 finally{clearTimeout(timer);if(revision===state.revision){state.busy=false;state.controller=null;$('aiBtn').disabled=false;$('aiBtn').textContent='✦ 用 AI 再看一眼';}}
};
await Promise.all([loadImage('./demo.jpg','湖边的木屋 · 示例照片',true),checkAI()]);
