// Geometry uses normalized coordinates in the EXIF-oriented image.
export const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
export function normalizeSubject(s){
  const x=clamp(Number(s.x)||0,0,.99),y=clamp(Number(s.y)||0,0,.99);
  return {...s,x,y,w:clamp(Number(s.w)||.1,.01,1-x),h:clamp(Number(s.h)||.1,.01,1-y)};
}
export function findCrop(subject,gaze,imageAspect,ratio=imageAspect){
  const s=normalizeSubject(subject),cx=s.x+s.w/2,cy=s.y+s.h/2;
  const targetX=gaze==='right'?1/3:gaze==='left'?2/3:cx<.5?1/3:2/3;
  const maxW=Math.min(1,ratio/imageAspect);
  let best=null,bestScore=Infinity;
  for(let step=0;step<=24;step++){
    const w=maxW*(1-step*.015),h=w*imageAspect/ratio;
    if(w<s.w+.02||h<s.h+.02)continue;
    const minX=Math.max(0,s.x+s.w+.01-w),maxX=Math.min(1-w,s.x-.01);
    const minY=Math.max(0,s.y+s.h+.01-h),maxY=Math.min(1-h,s.y-.01);
    if(minX>maxX||minY>maxY)continue;
    for(const ty of [1/3,2/3]){
      const x=clamp(cx-targetX*w,minX,maxX),y=clamp(cy-ty*h,minY,maxY);
      const score=2*Math.abs((cx-x)/w-targetX)+.6*Math.abs((cy-y)/h-ty)+.34*(1-w*h);
      if(score<bestScore){bestScore=score;best={x,y,w,h,targetX,targetY:ty,feasible:true};}
    }
  }
  return best||{x:0,y:0,w:1,h:1,targetX,targetY:2/3,feasible:false};
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
export function makeTips(subject,gaze,horizon,crop){
  const cx=subject.x+subject.w/2;
  const cuts={left:Math.round(crop.x*100),right:Math.round((1-crop.x-crop.w)*100),top:Math.round(crop.y*100),bottom:Math.round((1-crop.y-crop.h)*100)};
  const names={left:'左侧',right:'右侧',top:'顶部',bottom:'底部'};
  const parts=Object.entries(cuts).filter(([,v])=>v>1).map(([k,v])=>`${names[k]}约 ${v}%`);
  const first=!crop.feasible?{title:'先保留主体完整',body:'当前比例无法在保留整个主体与边缘余量的同时裁剪。试试原始比例，或重新框选主体。',tag:'裁剪 · 暂保留原图'}:parts.length?{title:`尝试收紧${parts[0].split('约')[0]}的画面`,body:`裁去${parts.join('、')}。橙框保留完整主体，并尝试靠近三分线；切换“前后对比”判断是否更集中。`,tag:'裁剪 · 对应橙色框'}:{title:'保留当前取景范围',body:'继续裁剪会让主体靠近边缘，或破坏现有空间。先保持原图，再尝试改变拍摄位置。',tag:'裁剪 · 无需强行收紧'};
  let second;
  if(gaze==='left'||gaze==='right'){
    const left=subject.x,right=1-subject.x-subject.w,toLeft=gaze==='left',space=toLeft?left:right,back=toLeft?right:left;
    second={title:space<back?'给朝向的一侧多留一点空间':'保留朝向一侧的空间',body:`你设定主体朝${toLeft?'左':'右'}；该侧当前约有画面宽度的 ${Math.round(space*100)}% 留白。${space<back?`下次取景让主体向画面${toLeft?'右':'左'}侧移动，给${toLeft?'左':'右'}侧让出空间。`:'裁剪时优先保住这侧空间，避免视线或运动方向紧贴边缘。'}`,tag:'拍摄 · 以你设定的方向为准'};
  }else{
    second={title:gaze==='unknown'?'确认主体，试一次偏心取景':'试着让主体落在三分线附近',body:`主体中心当前在画面左起 ${Math.round(cx*100)}% 的位置。${gaze==='unknown'?'先核对绿色框，再选择视线方向；本地模式无法判断人或动物朝哪边看。':'以三分线作为一种备选；如果你在表达对称或安静，居中也可以保留。'}`,tag:'拍摄 · 先明确你想表达的主体'};
  }
  const third=horizon?{title:Math.abs(horizon.angle)>1?`检查约 ${Math.abs(horizon.angle).toFixed(1)}° 的倾斜`:'保住这一条水平参考',body:`青线位于画面上起约 ${Math.round(horizon.y*100)}%。${horizon.confidence==='low'?'这是边缘检测候选，请确认它确实是水平线；山脊和斜屋顶不能当成水平线。':'下次拍摄可用相机网格对齐这条线；本版只作参考标注，不旋转图片。'}`,tag:horizon.confidence==='low'?'水平线 · 候选待确认':'水平线 · 对应青色线'}:{title:'沿真实水平线做一次确认',body:'暂未确认可靠的水平线。若画面里有海平面或水平建筑边缘，点击“标记水平线”，沿它拖一条线；没有就保留为空。',tag:'水平线 · 不强行推断'};
  return [first,second,third];
}
