// Geometry uses normalized coordinates in the EXIF-oriented image.
export const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
export function normalizeSubject(s){
  const x=clamp(Number(s.x)||0,0,.99),y=clamp(Number(s.y)||0,0,.99);
  return {...s,x,y,w:clamp(Number(s.w)||.1,.01,1-x),h:clamp(Number(s.h)||.1,.01,1-y)};
}
export const INTENTS = {
  focus: {label:'突出主体', description:'尝试靠近三分线，让主体更集中。'},
  environment: {label:'表现环境', description:'优先保留周围场景，让主体与环境一起表达。'},
  symmetry: {label:'强调居中', description:'让主体靠近中央；是否对称，仍由你判断。'},
  space: {label:'保留留白', description:'保留更多空间，让视线或画面的呼吸感延伸。'},
};

export function containsSubject(rect, subject) {
  const epsilon = .001;
  return subject.x >= rect.x - epsilon && subject.y >= rect.y - epsilon &&
    subject.x + subject.w <= rect.x + rect.w + epsilon &&
    subject.y + subject.h <= rect.y + rect.h + epsilon;
}

export function fitCrop(rect, imageAspect, ratio) {
  const k = imageAspect / ratio;
  const w = Math.min(rect.w, rect.h / k), h = w * k;
  return {x:clamp(rect.x + (rect.w-w)/2, 0, 1-w),
    y:clamp(rect.y + (rect.h-h)/2, 0, 1-h), w, h};
}

export function moveCrop(rect, dx, dy) {
  return {...rect, x:clamp(rect.x+dx, 0, 1-rect.w), y:clamp(rect.y+dy, 0, 1-rect.h)};
}

// Keep the opposite corner fixed. A locked ratio uses physical image dimensions.
export function resizeCrop(rect, handle, point, imageAspect, ratio=null) {
  const sx = handle.includes('w') ? -1 : 1;
  const sy = handle.includes('n') ? -1 : 1;
  const ax = sx < 0 ? rect.x+rect.w : rect.x;
  const ay = sy < 0 ? rect.y+rect.h : rect.y;
  const maxW = sx < 0 ? ax : 1-ax, maxH = sy < 0 ? ay : 1-ay;
  let w, h;
  if (ratio) {
    const k = imageAspect / ratio;
    const limit = Math.min(maxW, maxH/k);
    const projected = (sx*(point.x-ax)*imageAspect**2 + sy*(point.y-ay)*k) / (imageAspect**2+k*k);
    w = clamp(projected, Math.min(limit, Math.max(.025,.025/k)), limit);
    h = w*k;
  } else {
    w = clamp(sx*(point.x-ax), Math.min(.025,maxW), maxW);
    h = clamp(sy*(point.y-ay), Math.min(.025,maxH), maxH);
  }
  return {x:sx < 0 ? ax-w : ax, y:sy < 0 ? ay-h : ay, w, h};
}

export function findCrop(subject,gaze,imageAspect,ratio=imageAspect,intent='focus') {
  const s=normalizeSubject(subject), cx=s.x+s.w/2, cy=s.y+s.h/2;
  const strategy=Object.hasOwn(INTENTS,intent)?intent:'focus';
  const targetX=strategy==='symmetry' ? .5 : strategy==='environment' ? cx :
    gaze==='right' ? (strategy==='space'?.25:1/3) :
    gaze==='left' ? (strategy==='space'?.75:2/3) :
    cx<.5 ? (strategy==='space'?.25:1/3) : (strategy==='space'?.75:2/3);
  const targetsY=strategy==='symmetry'?[.5]:strategy==='environment'||strategy==='space'?[cy]:[1/3,2/3];
  const weights={focus:[2,.6,.34],environment:[.25,.15,3],symmetry:[2,1.2,.22],space:[1.2,.25,2]}[strategy];
  const maxW=Math.min(1,ratio/imageAspect);
  let best=null,bestScore=Infinity;
  for(let step=0;step<=40;step++) {
    const w=maxW*(1-step*.015), h=w*imageAspect/ratio;
    if(w<s.w+.02||h<s.h+.02)continue;
    const minX=Math.max(0,s.x+s.w+.01-w), maxX=Math.min(1-w,s.x-.01);
    const minY=Math.max(0,s.y+s.h+.01-h), maxY=Math.min(1-h,s.y-.01);
    if(minX>maxX||minY>maxY)continue;
    for(const ty of targetsY) {
      const x=clamp(cx-targetX*w,minX,maxX), y=clamp(cy-ty*h,minY,maxY);
      const score=weights[0]*Math.abs((cx-x)/w-targetX)+weights[1]*Math.abs((cy-y)/h-ty)+weights[2]*(1-w*h);
      if(score<bestScore) {bestScore=score; best={x,y,w,h,targetX,targetY:ty,feasible:true};}
    }
  }
  return best||{x:0,y:0,w:1,h:1,targetX,targetY:targetsY[0],feasible:false};
}
export function localAnalyze(data,width,height){
  const gray=new Float32Array(width*height),scores=new Float32Array(width*height);
  const mean=[0,0,0];
  for(let i=0;i<gray.length;i++){
    gray[i]=data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
    for(let c=0;c<3;c++)mean[c]+=data[i*4+c]/gray.length;
  }
  let weight=0,sx=0,sy=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    const contrast=Math.hypot(data[i*4]-mean[0],data[i*4+1]-mean[1],data[i*4+2]-mean[2]);
    const edge=Math.abs(gray[i+1]-gray[i-1])+Math.abs(gray[i+width]-gray[i-width]);
    const center=Math.sin(Math.PI*x/width)*Math.sin(Math.PI*y/height);
    const score=Math.pow(contrast*.65+edge*.35,2)*center;
    scores[i]=score;weight+=score;sx+=x*score;sy+=y*score;
  }
  const cx=weight?sx/weight/width:.5,cy=weight?sy/weight/height:.5;
  // A focus candidate, not a semantic object detector. User can replace its bounds.
  const subject=normalizeSubject({x:clamp(cx-.12,0,.76),y:clamp(cy-.15,0,.70),w:.24,h:.30,label:'视觉焦点候选',confidence:'low'});
  let horizon=null,best=0;
  for(let yf=.2;yf<=.8;yf+=.0125)for(let slope=-.12;slope<=.121;slope+=.02){
    let sum=0,support=0,n=0,signed=0;
    for(let x=Math.floor(width*.06);x<width*.94;x++){
      const y=Math.round(yf*height+slope*(x-width/2));
      if(y<2||y>=height-2)continue;
      const d=gray[(y+1)*width+x]-gray[(y-1)*width+x];
      sum+=Math.abs(d);signed+=d;if(Math.abs(d)>18)support++;n++;
    }
    const coherence=n?support/n:0,polarity=sum?Math.abs(signed)/sum:0;
    const score=n?sum/n*coherence*polarity:0;
    if(coherence>.62&&polarity>.7&&score>best&&score>18){
      best=score;horizon={y:yf,angle:Math.atan(slope)*180/Math.PI,confidence:'low'};
    }
  }
  return {subject,horizon,gaze:'unknown'};
}
export function makeTips(subject,gaze,horizon,crop,intent='focus',manual=false) {
  const strategy=Object.hasOwn(INTENTS,intent)?intent:'focus';
  const cx=(subject.x+subject.w/2-crop.x)/crop.w;
  const cuts={left:Math.round(crop.x*100),right:Math.round((1-crop.x-crop.w)*100),top:Math.round(crop.y*100),bottom:Math.round((1-crop.y-crop.h)*100)};
  const names={left:'左侧',right:'右侧',top:'顶部',bottom:'底部'};
  const parts=Object.entries(cuts).filter(([,v])=>v>1).map(([k,v])=>`${names[k]}约 ${v}%`);
  const reason={focus:'尝试让主体靠近三分线，使注意力更集中。',environment:'优先保留环境信息，交代主体与周围场景的关系。',symmetry:'尝试让主体靠近画面中央，供你比较居中的表达。',space:'优先保留空间，让主体的朝向或画面的呼吸感得到延伸。'}[strategy];
  let first;
  if(!containsSubject(crop,subject)) {
    first={title:'当前裁剪会切到主体',body:'橙框没有包含完整的绿色主体框。若不是有意截取，请扩大或移动裁剪框，或点击“恢复建议”。导出会采用当前橙框。',tag:'裁剪 · 请确认主体完整性'};
  } else if(crop.feasible===false) {
    first={title:'先保留主体完整',body:'当前比例无法在保留整个主体与边缘余量的同时裁剪。试试原始比例，或重新框选主体。',tag:'裁剪 · 暂保留原图'};
  } else {
    first={title:manual?'查看你的手动取景':parts.length?`尝试收紧${parts[0].split('约')[0]}的画面`:'保留当前取景范围',
      body:(parts.length?`当前裁去${parts.join('、')}。`:'当前保留完整画面。')+(manual?'前后对比和导出均使用这个裁剪框；请按你的表达决定是否保留。':reason),
      tag:manual?'裁剪 · 已手动调整':`裁剪 · ${INTENTS[strategy].label}`};
  }
  let second;
  if(strategy==='symmetry') {
    second={title:'用中央线检查主体的位置',body:`当前裁剪内，主体中心位于左起 ${Math.round(cx*100)}%。比较它与中央线的距离；若要表达对称，再检查两侧的线条、形状和视觉重量是否呼应。`,tag:'拍摄 · 强调居中'};
  } else if(strategy==='environment') {
    second={title:'保留能交代场景的环境',body:`当前保留原图约 ${Math.round(crop.w*crop.h*100)}% 的面积。检查环境是否说明了主体在哪里、正在做什么；无法帮助表达的边缘元素，可以手动裁去。`,tag:'拍摄 · 表现环境'};
  } else if(gaze==='left'||gaze==='right') {
    const left=Math.max(0,(subject.x-crop.x)/crop.w), right=Math.max(0,(crop.x+crop.w-subject.x-subject.w)/crop.w);
    const toLeft=gaze==='left', space=toLeft?left:right, back=toLeft?right:left;
    second={title:space<back?'给朝向的一侧多留一点空间':'保留朝向一侧的空间',
      body:`你设定主体朝${toLeft?'左':'右'}；当前裁剪内该侧约有画面宽度的 ${Math.round(space*100)}% 留白。${space<back?`尝试移动或扩大裁剪框，给${toLeft?'左':'右'}侧让出空间；若原片不足，下次取景再留足。`:'继续裁剪时优先保住这侧空间，避免视线或运动方向紧贴边缘。'}`,
      tag:'拍摄 · 以你设定的方向为准'};
  } else if(strategy==='space') {
    second={title:'让留白服务于画面的表达',body:`当前保留原图约 ${Math.round(crop.w*crop.h*100)}% 的面积。比较主体周围的空间是否带来安静、距离或延伸感；留白区域是否简洁，需要你结合照片确认。`,tag:'拍摄 · 保留留白'};
  } else {
    second={title:gaze==='unknown'?'确认主体，再比较三分线取景':'试着让主体落在三分线附近',body:`当前裁剪内，主体中心在左起 ${Math.round(cx*100)}% 的位置。${gaze==='unknown'?'先核对绿色框，再选择视线方向；本地模式无法判断人或动物朝哪边看。':'以三分线作为一种备选；如果你想表达居中、环境或留白，可以切换拍摄意图。'}`,tag:'拍摄 · 突出主体'};
  }
  const third=horizon?{title:Math.abs(horizon.angle)>1?`检查约 ${Math.abs(horizon.angle).toFixed(1)}° 的倾斜`:'保住这一条水平参考',body:`青线位于原图上起约 ${Math.round(horizon.y*100)}%。${horizon.confidence==='low'?'这是边缘检测候选，请确认它确实是水平线；山脊和斜屋顶不能当成水平线。':'下次拍摄可用相机网格对齐这条线；本版只作参考标注，不旋转图片。'}`,tag:horizon.confidence==='low'?'水平线 · 候选待确认':'水平线 · 对应青色线'}:{title:'沿真实水平线做一次确认',body:'暂未确认可靠的水平线。若画面里有海平面或水平建筑边缘，点击“标记水平线”，沿它拖一条线；没有就保留为空。',tag:'水平线 · 不强行推断'};
  return [first,second,third];
}
