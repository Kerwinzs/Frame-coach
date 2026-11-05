// Small, explainable pixel measurements. These are not aesthetic quality scores.
const toHex = rgb => '#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const colorDistance = (a,b) => a.reduce((sum,v,i)=>sum+(v-b[i])**2,0);

function extractPalette(pixels, count=5) {
  const buckets=new Map();
  for(const rgb of pixels) {
    const key=(rgb[0]>>4)*256+(rgb[1]>>4)*16+(rgb[2]>>4);
    const b=buckets.get(key)||{sum:[0,0,0],n:0};
    b.n++;for(let c=0;c<3;c++)b.sum[c]+=rgb[c];buckets.set(key,b);
  }
  const bins=[...buckets.entries()].map(([key,b])=>({key,rgb:b.sum.map(v=>v/b.n),n:b.n})).sort((a,b)=>b.n-a.n);
  const centers=[bins[0].rgb];
  while(centers.length<Math.min(count,bins.length)) {
    let candidate=null,best=0;
    for(const b of bins) {
      const distance=Math.min(...centers.map(c=>colorDistance(c,b.rgb)));
      const score=distance*Math.sqrt(b.n);
      if(distance>1&&score>best){best=score;candidate=b.rgb;}
    }
    if(!candidate)break;centers.push(candidate);
  }
  let clusters;
  for(let pass=0;pass<7;pass++) {
    clusters=centers.map(()=>({sum:[0,0,0],n:0}));
    for(const b of bins) {
      let nearest=0,best=Infinity;
      centers.forEach((c,i)=>{const d=colorDistance(c,b.rgb);if(d<best){best=d;nearest=i;}});
      b.cluster=nearest;const group=clusters[nearest];group.n+=b.n;
      for(let c=0;c<3;c++)group.sum[c]+=b.rgb[c]*b.n;
    }
    clusters.forEach((g,i)=>{if(g.n)centers[i]=g.sum.map(v=>v/g.n);});
  }
  const sorted=clusters.map((g,i)=>({cluster:i,hex:toHex(centers[i]),share:g.n/pixels.length})).filter(c=>c.share>0).sort((a,b)=>b.share-a.share);
  const order=new Map(sorted.map((c,i)=>[c.cluster,i]));
  const bucketLabels=new Map(bins.map(b=>[b.key,order.get(b.cluster)]));
  const labels=Uint8Array.from(pixels,rgb=>bucketLabels.get((rgb[0]>>4)*256+(rgb[1]>>4)*16+(rgb[2]>>4)));
  return {palette:sorted.map(({hex,share})=>({hex,share})),labels};
}

export function analyzeAesthetics(data,width,height) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||!data||data.length<width*height*4)throw new TypeError('Invalid image pixels');
  const n=width*height,light=new Float32Array(n),edges=new Float32Array(n),pixels=[];
  const toneLabels=new Uint8Array(n),edgeLabels=new Uint8Array(n);
  const histogram=Array(16).fill(0),directions={horizontal:0,vertical:0,diagonal:0};
  let mean=0,saturation=0,bright=0,dark=0,left=0,right=0,leftN=0,rightN=0;
  for(let i=0;i<n;i++) {
    const alpha=data[i*4+3]/255;
    const rgb=[0,1,2].map(c=>data[i*4+c]*alpha+255*(1-alpha));pixels.push(rgb);
    const y=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;
    light[i]=y;mean+=y;histogram[Math.min(15,Math.floor(y*16))]++;
    if(y>=.85){bright++;toneLabels[i]=1;}if(y<=.15){dark++;toneLabels[i]=2;}
    const max=Math.max(...rgb)/255,min=Math.min(...rgb)/255;
    saturation+=max===min?0:(max-min)/(1-Math.abs(max+min-1));
    if(i%width<width/2){left+=y;leftN++;}else{right+=y;rightN++;}
  }
  let energy=0,edgeCount=0,edgeSamples=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++) {
    const i=y*width+x;
    const gx=(-light[i-width-1]+light[i-width+1]-2*light[i-1]+2*light[i+1]-light[i+width-1]+light[i+width+1])/4;
    const gy=(-light[i-width-1]-2*light[i-width]-light[i-width+1]+light[i+width-1]+2*light[i+width]+light[i+width+1])/4;
    const mag=Math.hypot(gx,gy);edges[i]=mag;edgeSamples++;
    if(mag<.12)continue;
    edgeCount++;energy+=mag;
    const angle=((Math.atan2(gy,gx)+Math.PI/2)%Math.PI+Math.PI)%Math.PI;
    const degrees=angle*180/Math.PI;
    const direction=degrees<22.5||degrees>=157.5?'horizontal':degrees>=67.5&&degrees<112.5?'vertical':'diagonal';
    directions[direction]+=mag;edgeLabels[i]={horizontal:1,vertical:2,diagonal:3}[direction];
  }
  for(const key of Object.keys(directions))directions[key]=energy?directions[key]/energy:0;
  const grid=Array.from({length:64},()=>({sum:0,sq:0,edge:0,n:0}));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x,g=grid[Math.min(7,Math.floor(y/height*8))*8+Math.min(7,Math.floor(x/width*8))];
    g.sum+=light[i];g.sq+=light[i]**2;g.edge+=edges[i];g.n++;
  }
  let quietPixels=0;
  const textureGrid=grid.map(g=>{
    const quiet=g.n>0&&Math.sqrt(Math.max(0,g.sq/g.n-(g.sum/g.n)**2))<.065&&g.edge/g.n<.055;
    if(quiet)quietPixels+=g.n;return quiet;
  });
  const quantile=q=>{let total=0;for(let i=0;i<16;i++){total+=histogram[i];if(total>=n*q)return (i+.5)/16;}return 1;};
  const dominant=Object.entries(directions).sort((a,b)=>b[1]-a[1])[0];
  const colors=extractPalette(pixels);
  return {
    evidence:{width,height,paletteLabels:colors.labels,toneLabels,edgeLabels},
    palette:colors.palette,meanLight:mean/n,saturation:saturation/n,
    brightShare:bright/n,darkShare:dark/n,tonalSpread:quantile(.9)-quantile(.1),
    histogram:histogram.map(v=>v/n),directions,
    dominantDirection:energy&&dominant[1]>.46?dominant[0]:null,
    edgeShare:edgeSamples?edgeCount/edgeSamples:0,quietShare:quietPixels/n,textureGrid,
    leftLight:leftN?left/leftN:mean/n,rightLight:rightN?right/rightN:mean/n,
    balanceDifference:Math.abs((leftN?left/leftN:mean/n)-(rightN?right/rightN:mean/n)),
  };
}

export const AESTHETIC_REFERENCES = {
  color:{label:'色彩呼应',principle:'相近颜色可以形成联系，少量差异明显的颜色可以吸引注意。',
    observe:'看主色是否在不同位置重复出现，再观察小面积颜色是否靠近你想强调的主体。',
    exercise:'下次拍摄先选一个主色，再试着让一处小面积颜色与它形成呼应或对照。',
    boundary:'主色统计描述颜色分布，不判断配色是否和谐，也不测量真实光源色温。'},
  light:{label:'明暗层次',principle:'明暗之间的差别可以分开主体与背景，也可以塑造平缓或强烈的感受。',
    observe:'眯起眼看画面：最亮或最暗的位置是否帮助你找到主体？',
    exercise:'保持同一主体，试着改变机位，让背景更亮或更暗，再比较主体是否更清楚。',
    boundary:'明暗跨度与亮暗像素占比不等于曝光错误；高调和低调都可能是有意表达。'},
  lines:{label:'线条节奏',principle:'重复、汇聚或方向明确的线条，可以影响观看画面的路径。',
    observe:'沿画面中较长的边缘看一遍：视线是靠近主体，还是被带出了画面？',
    exercise:'尝试移动机位，让一条真实的道路、栏杆或建筑线条与主体形成联系。',
    boundary:'本地统计只估计边缘方向，不识别道路，也不证明这些边缘是引导线。'},
  balance:{label:'视觉均衡',principle:'位置、面积、明暗和内容都会影响画面的视觉重量，均衡不要求左右相同。',
    observe:'分别遮住左右半边，比较两边的主体、亮部和背景关系。',
    exercise:'若想强调居中，检查两侧形状是否呼应；若想表达张力，可以保留有意的不对称。',
    boundary:'左右平均亮度差只是一个线索，不能代表完整视觉重量或对称程度。'},
  space:{label:'简洁与留白',principle:'信息较少的区域可以让主体更突出，也可以表达安静、距离或延伸。',
    observe:'检查相对平缓的区域是否帮助主体表达，再看边缘有没有无关的干扰。',
    exercise:'保持主体完整，分别保留更多空间和收紧一些，比较哪一种更符合拍摄意图。',
    boundary:'低纹理区域不一定是留白；墙面、虚化和纯色物体都可能产生类似统计。'},
};

export function describeAesthetics(m,intent='focus') {
  const pct=v=>Math.round(v*100),directionNames={horizontal:'水平',vertical:'垂直',diagonal:'斜向'};
  return [
    {element:'color',title:m.saturation<.2?'颜色整体较克制':m.saturation>.5?'饱和色较多':'颜色浓淡有变化',
      evidence:`平均饱和度 ${pct(m.saturation)}%；最大主色组约占 ${pct(m.palette[0].share)}%。`,
      exercise:'先看色块里有哪些重复颜色，再检查小面积亮色是否靠近你想强调的主体。'},
    {element:'light',title:m.meanLight<.33?'画面偏暗':m.meanLight>.67?'画面偏亮':'亮暗处于中间范围',
      evidence:`亮区 ${pct(m.brightShare)}%，暗区 ${pct(m.darkShare)}%；中间 80% 像素的明暗跨度 ${pct(m.tonalSpread)}%。`,
      exercise:m.tonalSpread<.25?'若想强调主体，可以尝试让主体与背景出现明暗差；柔和平缓的画面也可以保留。':'检查最亮的位置是否服务于主体；若它只在边缘分散注意，试着改变取景。'},
    {element:'lines',title:m.edgeShare<.01?'明显边缘较少':m.dominantDirection?`${directionNames[m.dominantDirection]}边缘较多`:'边缘方向较分散',
      evidence:`明显边缘约占采样位置 ${pct(m.edgeShare)}%；方向分布见下图。`,
      exercise:'沿照片里真实的线条观察一次，判断它们是否把视线带向主体；没有明确引导线也无需增加。'},
    {element:'balance',title:m.balanceDifference<.06?'左右平均亮度接近':`${m.leftLight>m.rightLight?'左':'右'}半边平均更亮`,
      evidence:`左右平均亮度相差 ${pct(m.balanceDifference)} 个百分点；低纹理网格覆盖约 ${pct(m.quietShare)}%。`,
      exercise:intent==='symmetry'?'结合中央线检查两侧形状和内容的呼应；亮度接近并不能证明对称。':intent==='space'?'看看低纹理区域是否帮助表达安静或延伸，再决定是否保留这片空间。':'先比较两侧内容，再决定保留均衡还是有意的不均衡。'},
  ];
}

// Labels are generated from the exact sampled pixels used by the measurement.
// 0 means unselected; positive values identify the legend groups for rendering.
export function makeEvidenceMask(metrics,selection) {
  const e=metrics.evidence,n=e.width*e.height,mask=new Uint8Array(n);
  if(!selection)return {mask,count:0,width:e.width,height:e.height};
  const edgeId={horizontal:1,vertical:2,diagonal:3};
  for(let i=0;i<n;i++) {
    const x=i%e.width,y=Math.floor(i/e.width);
    if(selection.kind==='color'&&Number.isInteger(selection.index)&&selection.index>=0&&selection.index<metrics.palette.length)mask[i]=e.paletteLabels[i]===selection.index?1:0;
    else if(selection.kind==='light') {
      const v=e.toneLabels[i];
      mask[i]=selection.tone==='both'||selection.tone==='bright'&&v===1||selection.tone==='dark'&&v===2?v:0;
    } else if(selection.kind==='lines') {
      const v=e.edgeLabels[i];mask[i]=selection.direction==='all'||v===edgeId[selection.direction]?v:0;
    } else if(selection.kind==='balance')mask[i]=x<e.width/2?1:2;
    else if(selection.kind==='quiet')mask[i]=metrics.textureGrid[Math.min(7,Math.floor(y/e.height*8))*8+Math.min(7,Math.floor(x/e.width*8))]?1:0;
  }
  let count=0;for(const v of mask)if(v)count++;
  return {mask,count,width:e.width,height:e.height};
}
