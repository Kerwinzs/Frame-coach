// Compare a confirmed rectangle with a nearby sampling ring, not semantic masks.
const subjectClamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const validSubjectRect=r=>r&&['x','y','w','h'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=1.000001&&r.y+r.h<=1.000001;
const subjectHex=rgb=>'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
function subjectColorBin(rgb) {
  const [r,g,b]=rgb.map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,s=max?d/max:0;
  if(max<.08||s<.15)return 0;
  let hue=max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4;
  hue=((hue/6)%1+1)%1;
  return 1+Math.min(7,Math.floor(hue*8))*3+Math.min(2,Math.floor((s-.15)/.85*3));
}
export function analyzeSubjectContext(data,width,height,subject,frame={x:0,y:0,w:1,h:1}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!data||data.length<width*height*4)throw new TypeError('Invalid image pixels');
  const n=width*height,mask=new Uint8Array(n);
  const result={status:'no-subject',message:'请先设置主体框。',mask,count:0,width,height,subject:null,background:null};
  if(!validSubjectRect(subject))return result;
  if(!validSubjectRect(frame))return {...result,status:'invalid-frame',message:'当前分析范围无效，请恢复取景后重试。'};
  const s=subject;
  const clipped=s.x<frame.x-1e-6||s.y<frame.y-1e-6||s.x+s.w>frame.x+frame.w+1e-6||s.y+s.h>frame.y+frame.h+1e-6;
  const padX=Math.max(frame.w*.03,s.w*.5),padY=Math.max(frame.h*.03,s.h*.5);
  const outer={x:Math.max(frame.x,s.x-padX),y:Math.max(frame.y,s.y-padY),right:Math.min(frame.x+frame.w,s.x+s.w+padX),bottom:Math.min(frame.y+frame.h,s.y+s.h+padY)};
  const makeRegion=()=>({n:0,light:0,rgb:[0,0,0],hist:Array(25).fill(0),edgeCount:0,edgeSamples:0});
  const regions=[null,makeRegion(),makeRegion()],light=new Float32Array(n);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x,gx=frame.x+(x+.5)/width*frame.w,gy=frame.y+(y+.5)/height*frame.h;
    const inside=gx>=s.x&&gx<s.x+s.w&&gy>=s.y&&gy<s.y+s.h;
    const around=gx>=outer.x&&gx<outer.right&&gy>=outer.y&&gy<outer.bottom;
    const group=inside?1:around?2:0;mask[i]=group;
    const alpha=data[i*4+3]/255,rgb=[0,1,2].map(c=>data[i*4+c]*alpha+255*(1-alpha));
    const brightness=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;light[i]=brightness;
    if(!group)continue;
    const r=regions[group];r.n++;r.light+=brightness;r.hist[subjectColorBin(rgb)]++;
    for(let c=0;c<3;c++)r.rgb[c]+=rgb[c];
  }
  // Only use gradients whose entire 3x3 neighborhood belongs to the same region.
  // Rectangle boundaries and subject/background separation must not create texture.
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++) {
    const i=y*width+x,group=mask[i];if(!group)continue;
    let eligible=true;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(mask[i+dy*width+dx]!==group)eligible=false;
    if(!eligible)continue;
    const gx=(-light[i-width-1]+light[i-width+1]-2*light[i-1]+2*light[i+1]-light[i+width-1]+light[i+width+1])/4;
    const gy=(-light[i-width-1]-2*light[i-width]-light[i-width+1]+light[i+width-1]+2*light[i+width]+light[i+width+1])/4;
    regions[group].edgeSamples++;if(Math.hypot(gx,gy)>=.12)regions[group].edgeCount++;
  }
  const finish=r=>r.n?{pixels:r.n,meanLight:r.light/r.n,meanColor:subjectHex(r.rgb.map(v=>v/r.n)),colorHistogram:r.hist.map(v=>v/r.n),edgeShare:r.edgeSamples>=12?r.edgeCount/r.edgeSamples:null,edgeSamples:r.edgeSamples}:null;
  result.count=regions[1].n+regions[2].n;result.subject=finish(regions[1]);result.background=finish(regions[2]);
  if(!regions[1].n)return {...result,status:'outside',message:'主体框不在当前分析范围内。请切换原图，或重新取景。'};
  if(clipped)return {...result,status:'clipped',message:'当前裁剪截断了主体框。请放宽裁剪或切换原图，再比较主体与周边。'};
  if(regions[1].n<24)return {...result,status:'small-subject',message:'主体框在采样画面中太小，暂不做分区判断。请确认范围，或让主体在取景中更大一些。'};
  if(regions[2].n<24)return {...result,status:'small-background',message:'当前范围留给周边取样的空间不足。请放宽裁剪或切换原图。'};
  const colorDifference=.5*result.subject.colorHistogram.reduce((sum,v,i)=>sum+Math.abs(v-result.background.colorHistogram[i]),0);
  return {...result,status:'ready',message:'比较主体框内与邻近的周边采样带。',lightDifference:result.subject.meanLight-result.background.meanLight,colorDifference:subjectClamp(colorDifference,0,1)};
}

export function describeSubjectContext(result,intent='focus') {
  if(result.status!=='ready')return [];
  const s=result.subject,b=result.background,pct=v=>Math.round(v*100),gap=Math.abs(result.lightDifference);
  const close=gap<.07,similar=result.colorDifference<.25;
  const lightActions={
    focus:close?'想突出主体时，试着轻移机位，观察能否让主体落在更暗或更亮的周边前，再比较取景。':'框内与周边已有平均明暗差。先比较它是否帮助你突出主体，再检查局部亮部是否分散注意。',
    environment:'先保留能够交代场景的环境信息，再比较增加或减弱明暗差是否更符合这张照片的表达。',
    symmetry:'结合中央线检查主体位置与两侧形状的呼应。框内和周边的平均明暗差本身不能证明对称。',
    space:'看看周边的明暗是否帮助表达安静或延伸感，再决定保留多少空间。',
  };
  const colorActions={focus:similar?(close?'想让主体更集中时，可以换一个颜色关系更有区别的角度，或通过明暗关系来分开主体与周边。':'两区颜色分组相近，但已有明暗差。可以先保留这组关系，再检查是否符合你想突出的主体。'):'已能测到色相与饱和度分组的差别。看看它是否发生在你真正想强调的主体上，再决定保留。',environment:'观察主体框与环境中的颜色是否形成呼应，优先保留能说明场景关系的色彩。',symmetry:'看看主体两侧颜色的位置与面积是否呼应；颜色分布重合不等于视觉均衡。',space:'检查周边颜色是否适合你想保留的空间感，再比较留白更多和更少的版本。'};
  const edgesAvailable=s.edgeShare!==null&&b.edgeShare!==null;
  const busier=edgesAvailable&&b.edgeShare-s.edgeShare>.08;
  const edgeActions={focus:busier?'周边带的明显边缘更密。试着换一个周边纹理更少的角度，再观察主体是否更集中。':'周边带的明显边缘没有明显高于框内。先保留现有关系，再核对是否有个别线条分散注意。',environment:'较密的边缘也可能是有用的场景细节，检查它们是否帮助说明主体所在的环境。',symmetry:'结合实际形状检查两侧的线条呼应；这项分区密度比较不能判断整张照片是否对称。',space:'检查周边纹理是否帮助或打断空间感，再决定是否收紧取景。'};
  return [
    {kind:'light',title:close?'主体框与周边明暗接近':`主体框整体比周边更${result.lightDifference>0?'亮':'暗'}`,evidence:`主体框平均亮度约 ${pct(s.meanLight)}%，周边带约 ${pct(b.meanLight)}%，相差 ${pct(gap)} 个百分点。`,action:lightActions[intent]||lightActions.focus},
    {kind:'color',title:similar?'色相与饱和度分组重合较多':'颜色分布存在区别',evidence:`两区的色相 / 饱和度分组统计重合约 ${pct(1-result.colorDifference)}%。这不表示配色和谐度或美感。`,action:colorActions[intent]||colorActions.focus},
    {kind:'edges',title:!edgesAvailable?'边缘比较暂不可用':busier?'周边带的明显边缘更密':'两区边缘关系可继续保留观察',evidence:edgesAvailable?`有效取样位置中，主体框明显边缘约 ${pct(s.edgeShare)}%，周边带约 ${pct(b.edgeShare)}%。`:'至少一个区域缺少足够的同区邻域样本，暂不比较密度。',action:edgesAvailable?(edgeActions[intent]||edgeActions.focus):'试着放宽取景，再确认主体框。保留这种不确定性，避免把缺少样本解释为背景简洁。'},
  ];
}
