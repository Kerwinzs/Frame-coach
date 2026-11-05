import {analyzeAesthetics,describeAesthetics,AESTHETIC_REFERENCES} from './aesthetics.mjs';
const aEl=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const aPct=v=>Math.round(v*100);
const aSvgNS='http://www.w3.org/2000/svg';
function aSvgNode(tag,attrs) {const el=document.createElementNS(aSvgNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
function aHistogram(m) {
  const svg=aSvgNode('svg',{viewBox:'0 0 240 60',role:'img','aria-label':'从暗到亮的像素分布'}),max=Math.max(...m.histogram,.001);
  m.histogram.forEach((v,i)=>svg.append(aSvgNode('rect',{x:i*15,y:58-v/max*53,width:12,height:Math.max(1,v/max*53),fill:`rgb(${50+i*11},${70+i*10},${57+i*10})`})));return svg;
}
function aDirections(m) {
  const root=aEl('div','direction-bars');
  for(const [key,label]of [['horizontal','水平'],['vertical','垂直'],['diagonal','斜向']]) {
    const row=aEl('div','direction-row'),track=aEl('span','direction-track'),bar=aEl('i');
    bar.style.width=aPct(m.directions[key])+'%';track.append(bar);row.append(aEl('span','',label),track,aEl('span','',aPct(m.directions[key])+'%'));root.append(row);
  }
  return root;
}
function aPalette(m) {
  const root=aEl('div','palette');
  m.palette.forEach(c=>{const item=aEl('div','palette-item'),swatch=aEl('span','swatch');swatch.style.backgroundColor=c.hex;swatch.setAttribute('role','img');swatch.setAttribute('aria-label',c.hex);item.append(swatch,aEl('span','',c.hex.toUpperCase()),aEl('span','',aPct(c.share)+'%'));root.append(item);});return root;
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
    if(image!==originalImage){originalImage=image;originalMetrics=measure(image,{x:0,y:0,w:1,h:1});lastKey='';}
    const range=id('aestheticRange').value,r=range==='original'?{x:0,y:0,w:1,h:1}:getCrop();
    const key=JSON.stringify([range,r.x,r.y,r.w,r.h,getIntent()]);
    if(key!==lastKey) {
      lastKey=key;
      const m=range==='original'||(r.x===0&&r.y===0&&r.w===1&&r.h===1)?originalMetrics:measure(image,r);
      id('aestheticScope').textContent=range==='original'?'观察原图':'跟随当前裁剪';
      id('aestheticCards').replaceChildren(...describeAesthetics(m,getIntent()).map(card=>{
        const el=aEl('article','aesthetic-card');el.dataset.element=card.element;
        el.append(aEl('span','small-label',AESTHETIC_REFERENCES[card.element].label),aEl('h3','',card.title));
        el.append(card.element==='color'?aPalette(m):card.element==='light'?aHistogram(m):card.element==='lines'?aDirections(m):aBalance(m));
        el.append(aEl('p','metric-evidence',card.evidence),aEl('p','metric-exercise',card.exercise));
        const learn=aEl('button','text-button','查看原理与练习 ↗');learn.onclick=()=>{id('referenceElement').value=card.element;reference();id('referenceElement').focus();};el.append(learn);return el;
      }));
      const delta=(m.tonalSpread-originalMetrics.tonalSpread)*100;
      id('aestheticComparison').textContent=range==='original'?'正在观察原图。切换为“当前裁剪”可以比较裁剪带来的特征变化。':`与原图相比，当前保留面积约 ${aPct(r.w*r.h)}%；明暗跨度变化 ${delta>0?'+':''}${Math.round(delta)} 个百分点。数值变化只描述差异，优劣由表达决定。`;
    }
    renderAI();
  }
  function schedule() {if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;render();});}}
  id('aestheticRange').onchange=schedule;id('referenceElement').onchange=reference;
  id('aestheticAIButton').onclick=onAI;reference();
  return {schedule};
}
