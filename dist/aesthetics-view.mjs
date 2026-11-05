import {analyzeAesthetics,describeAesthetics,AESTHETIC_REFERENCES,makeEvidenceMask} from './aesthetics.mjs';
const aEl=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const aPct=v=>Math.round(v*100);
const aSvgNS='http://www.w3.org/2000/svg';
function aSvgNode(tag,attrs) {const el=document.createElementNS(aSvgNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
function aHistogram(m) {
  const svg=aSvgNode('svg',{viewBox:'0 0 240 60',role:'img','aria-label':'从暗到亮的像素分布'}),max=Math.max(...m.histogram,.001);
  m.histogram.forEach((v,i)=>svg.append(aSvgNode('rect',{x:i*15,y:58-v/max*53,width:12,height:Math.max(1,v/max*53),fill:`rgb(${50+i*11},${70+i*10},${57+i*10})`})));return svg;
}
function aEvidenceButton(label,selection,onSelect,className='text-button evidence-action') {
  const b=aEl('button',className,label);b.type='button';b.dataset.evidenceKey=JSON.stringify(selection);
  b.setAttribute('aria-pressed','false');b.onclick=()=>onSelect(selection);return b;
}
function aDirections(m,onSelect) {
  const root=aEl('div','direction-bars');
  for(const [key,label]of [['horizontal','水平'],['vertical','垂直'],['diagonal','斜向']]) {
    const row=aEvidenceButton('',{kind:'lines',direction:key},onSelect,'direction-row');
    row.setAttribute('aria-label','高亮'+label+'边缘候选');
    const track=aEl('span','direction-track'),bar=aEl('i');bar.style.width=aPct(m.directions[key])+'%';
    track.append(bar);row.append(aEl('span','',label),track,aEl('span','',aPct(m.directions[key])+'%'));root.append(row);
  }
  return root;
}
function aPalette(m,onSelect) {
  const root=aEl('div','palette');
  m.palette.forEach((c,index)=>{
    const item=aEvidenceButton('',{kind:'color',index},onSelect,'palette-item'),swatch=aEl('span','swatch');
    item.setAttribute('aria-label',`高亮主色 ${c.hex.toUpperCase()}，约 ${aPct(c.share)}%`);
    swatch.style.backgroundColor=c.hex;swatch.setAttribute('aria-hidden','true');
    item.append(swatch,aEl('span','',c.hex.toUpperCase()),aEl('span','',aPct(c.share)+'%'));root.append(item);
  });return root;
}
function aBalance(m) {
  const root=aEl('div','balance-graphic');
  for(const [label,value]of [['左半边',m.leftLight],['右半边',m.rightLight]]){
    const box=aEl('div','balance-half'),level=Math.round(35+value*180);box.style.backgroundColor=`rgb(${level},${level},${level})`;box.style.color=value>.5?'#26362d':'#fff';box.textContent=label+' '+aPct(value)+'%';root.append(box);
  }
  return root;
}
function aReferenceDiagram(kind) {
  const svg=aSvgNode('svg',{viewBox:'0 0 250 140',role:'img','aria-label':AESTHETIC_REFERENCES[kind].label+'原理示意'});
  svg.append(aSvgNode('rect',{width:250,height:140,rx:5,fill:'#e8ecdf'}));
  if(kind==='color') {
    for(const [x,y,w,h,fill]of [[15,15,135,110,'#6c8574'],[160,15,75,110,'#adbb9d'],[123,64,28,28,'#c87142']])svg.append(aSvgNode('rect',{x,y,width:w,height:h,fill}));
  } else if(kind==='light') {
    svg.append(aSvgNode('rect',{x:15,y:15,width:105,height:110,fill:'#34493d'}),aSvgNode('rect',{x:130,y:15,width:105,height:110,fill:'#b7c5ab'}),aSvgNode('circle',{cx:68,cy:70,r:24,fill:'#d7dfbc'}),aSvgNode('circle',{cx:182,cy:70,r:24,fill:'#34493d'}));
  } else if(kind==='lines') {
    for(const x of [10,50,100,150,200,240])svg.append(aSvgNode('line',{x1:x,y1:140,x2:168,y2:50,stroke:'#91a489','stroke-width':3}));
    svg.append(aSvgNode('circle',{cx:168,cy:48,r:12,fill:'#bd704d'}));
  } else if(kind==='balance') {
    svg.append(aSvgNode('line',{x1:125,y1:10,x2:125,y2:130,stroke:'#8da17e','stroke-dasharray':'5 5'}),aSvgNode('circle',{cx:70,cy:72,r:27,fill:'#7a927c'}),aSvgNode('circle',{cx:180,cy:72,r:27,fill:'#7a927c'}));
  } else {
    svg.append(aSvgNode('rect',{x:16,y:16,width:218,height:108,fill:'#d7dec7'}),aSvgNode('circle',{cx:186,cy:80,r:17,fill:'#6c8574'}));
  }
  return svg;
}
export function createAestheticsPanel({getImage,getCrop,getIntent,getAI,isAIAvailable,onAI}) {
  const id=s=>document.getElementById(s);
  let originalImage=null,originalMetrics=null,lastKey='',pending=false;
  let activeMetrics=null,activeRect=null,lastGeometry='',selection=null,evidenceNotice='';
  function measure(image,r) {
    const w=image.width*r.w,h=image.height*r.h,scale=Math.min(1,192/Math.max(w,h)),c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
    const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(image,r.x*image.width,r.y*image.height,w,h,0,0,c.width,c.height);
    return analyzeAesthetics(context.getImageData(0,0,c.width,c.height).data,c.width,c.height);
  }
  function reference() {
    const kind=id('referenceElement').value,r=AESTHETIC_REFERENCES[kind];
    id('referenceDiagram').replaceChildren(aReferenceDiagram(kind));
    id('referencePrinciple').textContent=r.principle;id('referenceObserve').textContent=r.observe;id('referenceExercise').textContent=r.exercise;id('referenceBoundary').textContent=r.boundary;
  }
  const selectionKey=value=>JSON.stringify(value);
  function syncEvidenceButtons() {
    id('aestheticCards').querySelectorAll('[data-evidence-key]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.evidenceKey===selectionKey(selection))));
    id('aestheticCards').querySelectorAll('[data-element]').forEach(card=>{
      const element=selection?.kind==='quiet'?'balance':selection?.kind;
      card.classList.toggle('is-evidence-active',element===card.dataset.element);
    });
  }
  function selectEvidence(next) {
    selection=selectionKey(selection)===selectionKey(next)?null:next;evidenceNotice='';
    id('evidenceToggle').checked=true;
    if(selection){id('referenceElement').value=selection.kind==='quiet'?'space':selection.kind;reference();}
    syncEvidenceButtons();renderEvidence();
    id('evidenceCanvas').closest('section').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function evidencePresentation() {
    const colors=['#e9bd66','#79cddd','#d799be'];
    if(!selection)return {title:'点击上方的色块或“查看照片依据”',description:evidenceNotice||'直接在这张照片上核对观察所依据的区域。',legend:[]};
    if(selection.kind==='color')return {title:'主色区域 '+activeMetrics.palette[selection.index].hex.toUpperCase(),description:'保留这一主色组的自然颜色，淡化其他区域，方便观察它在画面中的分布。',legend:[{label:'所选主色组',color:activeMetrics.palette[selection.index].hex}],colors};
    if(selection.kind==='light')return {title:selection.tone==='bright'?'亮区位置':selection.tone==='dark'?'暗区位置':'亮区与暗区位置',description:'亮区和暗区使用与统计相同的阈值。它们不等同于过曝或欠曝。',legend:[...(selection.tone!=='dark'?[{label:'亮区',color:colors[0]}]:[]),...(selection.tone!=='bright'?[{label:'暗区',color:colors[1]}]:[])],colors};
    if(selection.kind==='lines'){
      const groups=[['horizontal','水平',colors[0]],['vertical','垂直',colors[1]],['diagonal','斜向',colors[2]]];
      return {title:'边缘候选位置',description:'这里只标记明显边缘及其方向，不代表已识别出道路或引导线。方向条按边缘强度加权，高亮覆盖率按像素计算。',legend:groups.filter(([key])=>selection.direction==='all'||selection.direction===key).map(([,label,color])=>({label:label+'边缘',color})),colors};
    }
    if(selection.kind==='quiet')return {title:'低纹理区域候选',description:'淡绿色区域对应亮度变化和边缘都较少的采样网格。它们可能是留白、墙面或虚化区域，需要你结合内容确认。',legend:[{label:'低纹理网格',color:'#b5d59d'}],colors:['#b5d59d']};
    return {title:'左右亮度取样分区',description:'按当前分析画面的中央线分为左右两半，方便核对平均亮度差；这个分区不能说明完整视觉重量。',legend:[{label:'左半边',color:colors[0]},{label:'右半边',color:colors[1]}],colors};
  }
  function renderEvidence() {
    if(!activeMetrics||!originalImage)return;
    const canvas=id('evidenceCanvas'),context=canvas.getContext('2d'),r=activeRect;
    const w=originalImage.width*r.w,h=originalImage.height*r.h,scale=Math.min(1,960/w,430/h);
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(originalImage,r.x*originalImage.width,r.y*originalImage.height,w,h,0,0,canvas.width,canvas.height);
    const scope=id('aestheticRange').value==='original'?'原图':'当前裁剪';
    const presentation=evidencePresentation(),result=makeEvidenceMask(activeMetrics,selection);
    const enabled=!!selection&&id('evidenceToggle').checked;
    if(enabled&&result.count) {
      const layer=document.createElement('canvas');layer.width=result.width;layer.height=result.height;
      const lc=layer.getContext('2d'),rgba=lc.createImageData(layer.width,layer.height);
      const colors=(presentation.colors||[]).map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
      const selectedColor=selection.kind==='color'?activeMetrics.palette[selection.index].hex:null;
      const fadeToWhite=selectedColor&&[1,3,5].map(i=>parseInt(selectedColor.slice(i,i+2),16)).reduce((sum,v)=>sum+v,0)/3<128;
      for(let i=0;i<result.mask.length;i++) {
        const group=result.mask[i],offset=i*4;
        if(!group){rgba.data.set(fadeToWhite?[255,255,255,165]:[0,0,0,150],offset);continue;}
        if(selection.kind==='color')continue;
        const rgb=colors[group-1]||colors[0];
        const alpha=selection.kind==='lines'?235:selection.kind==='balance'?55:selection.kind==='quiet'?95:135;
        rgba.data.set([...rgb,alpha],offset);
      }
      lc.putImageData(rgba,0,0);context.imageSmoothingEnabled=false;context.drawImage(layer,0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=true;
      if(selection.kind==='balance') {context.strokeStyle='#fff';context.lineWidth=2;context.setLineDash([7,5]);context.beginPath();context.moveTo(canvas.width/2,0);context.lineTo(canvas.width/2,canvas.height);context.stroke();}
    }
    id('evidenceScope').textContent=scope;id('evidenceTitle').textContent=presentation.title;id('evidenceDescription').textContent=presentation.description;
    id('evidenceLegend').replaceChildren(...presentation.legend.map(item=>{const el=aEl('span'),swatch=aEl('i');swatch.style.backgroundColor=item.color;el.append(swatch,document.createTextNode(item.label));return el;}));
    id('evidenceCount').textContent=!selection?'尚未选择高亮。':!enabled?'高亮已隐藏，正在查看自然画面。':!result.count?'当前范围没有符合该条件的区域，保留原图供观察。':`高亮覆盖采样画面约 ${aPct(result.count/result.mask.length)}%。`;
    id('evidenceClear').disabled=!selection;id('evidenceToggle').disabled=!selection;
    canvas.setAttribute('aria-label',scope+'：'+presentation.title+'。'+id('evidenceCount').textContent);
    canvas.dataset.evidenceKind=selection?.kind||'none';canvas.dataset.highlightCount=String(result.count);
  }
  function renderAI() {
    const ai=getAI();id('aestheticAIButton').disabled=!isAIAvailable()||id('aiBtn').disabled;
    id('aestheticAIButton').textContent=!isAIAvailable()?'配置 AI 后启用':id('aiBtn').disabled?'正在观察…':'✦ AI 解读美学元素';
    id('aestheticAIEmpty').hidden=!!ai?.aesthetics;
    id('aestheticAIEmpty').textContent=isAIAvailable()?'点击后，AI 会结合原图内容和拍摄意图解释美学元素。照片将发送到 OpenAI。':'配置 AI 后可补充对原图的场景解读；上方本地观察和参考练习可直接使用。';
    const labels={low:'较低',medium:'中等',high:'较高'};
    id('aestheticAIResults').replaceChildren(...(ai?.aesthetics||[]).map(item=>{
      const el=aEl('article','ai-aesthetic-card');el.append(aEl('span','small-label',AESTHETIC_REFERENCES[item.element]?.label||'美学观察'),aEl('h4','',item.observation),aEl('p','',item.evidence),aEl('p','exercise','试一试：'+item.exercise),aEl('span','muted','模型自报把握：'+labels[item.confidence]+' · 基于原图，需自行核对'));return el;
    }));
  }
  function render() {
    const image=getImage();if(!image)return;
    if(image!==originalImage){originalImage=image;originalMetrics=measure(image,{x:0,y:0,w:1,h:1});lastKey='';lastGeometry='';selection=null;evidenceNotice='';}
    const range=id('aestheticRange').value,r=range==='original'?{x:0,y:0,w:1,h:1}:getCrop();
    const geometry=JSON.stringify([range,r.x,r.y,r.w,r.h]);
    if(geometry!==lastGeometry&&selection?.kind==='color'){selection=null;evidenceNotice='取景范围已变化，请重新选择主色色块。';}
    lastGeometry=geometry;
    const key=JSON.stringify([geometry,getIntent()]);
    if(key!==lastKey) {
      lastKey=key;
      const m=range==='original'||(r.x===0&&r.y===0&&r.w===1&&r.h===1)?originalMetrics:measure(image,r);
      activeMetrics=m;activeRect={x:r.x,y:r.y,w:r.w,h:r.h};
      id('aestheticScope').textContent=range==='original'?'观察原图':'跟随当前裁剪';
      id('aestheticCards').replaceChildren(...describeAesthetics(m,getIntent()).map(card=>{
        const el=aEl('article','aesthetic-card');el.dataset.element=card.element;
        el.append(aEl('span','small-label',AESTHETIC_REFERENCES[card.element].label),aEl('h3','',card.title));
        el.append(card.element==='color'?aPalette(m,selectEvidence):card.element==='light'?aHistogram(m):card.element==='lines'?aDirections(m,selectEvidence):aBalance(m));
        const defaults={color:{kind:'color',index:0},light:{kind:'light',tone:'both'},lines:{kind:'lines',direction:'all'},balance:{kind:'balance'}};
        const choice=defaults[card.element];
        const actions=aEl('div','evidence-actions');actions.append(aEvidenceButton('查看照片依据',choice,selectEvidence));
        if(card.element==='light'){actions.append(aEvidenceButton('仅亮区',{kind:'light',tone:'bright'},selectEvidence),aEvidenceButton('仅暗区',{kind:'light',tone:'dark'},selectEvidence));}
        if(card.element==='balance')actions.append(aEvidenceButton('低纹理区域',{kind:'quiet'},selectEvidence));
        el.append(actions);
        el.onclick=e=>{if(!e.target.closest('button,a,input,select')&&!window.getSelection()?.toString())selectEvidence(choice);};
        el.append(aEl('p','metric-evidence',card.evidence),aEl('p','metric-exercise',card.exercise));
        const learn=aEl('button','text-button','查看原理与练习 ↗');learn.onclick=()=>{id('referenceElement').value=card.element;reference();id('referenceElement').focus();};el.append(learn);return el;
      }));
      const delta=(m.tonalSpread-originalMetrics.tonalSpread)*100;
      id('aestheticComparison').textContent=range==='original'?'正在观察原图。切换为“当前裁剪”可以比较裁剪带来的特征变化。':`与原图相比，当前保留面积约 ${aPct(r.w*r.h)}%；明暗跨度变化 ${delta>0?'+':''}${Math.round(delta)} 个百分点。数值变化只描述差异，优劣由表达决定。`;
    }
    syncEvidenceButtons();renderEvidence();renderAI();
  }
  function schedule() {if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;render();});}}
  id('evidenceClear').onclick=()=>{selection=null;evidenceNotice='高亮已清除。';syncEvidenceButtons();renderEvidence();};
  id('evidenceToggle').onchange=renderEvidence;
  id('aestheticRange').onchange=()=>{selection=null;evidenceNotice='分析范围已切换，请重新选择高亮。';schedule();};id('referenceElement').onchange=reference;
  id('aestheticAIButton').onclick=onAI;reference();
  return {schedule};
}
