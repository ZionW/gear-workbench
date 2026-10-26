/* Engineering stick lettering: open centerline polylines, never font outlines. */
globalThis.GearLettering=(()=>{
 const glyphs={
 '0':['0020240400'],'1':['011014','0424'],'2':['002022020424'],'3':['00202404','0222'],'4':['000222','2024'],'5':['200002222404'],'6':['200004242202'],'7':['002014'],'8':['02002024040222'],'9':['2202002024'],
 A:['041024','0222'],B:['0004','0010211202','0212231404'],C:['20000424'],D:['00102123140400'],E:['20000424','0212'],F:['040020','0212'],G:['200004242212'],H:['0004','2024','0222'],I:['0020','1014','0424'],J:['00202404'],K:['0004','200224'],L:['000424'],M:['0400122024'],N:['04002420'],O:['0020240400'],P:['0400202202'],Q:['0020240400','1324'],R:['0400202202','1224'],S:['200002222404'],T:['0020','1014'],U:['00042420'],V:['001420'],W:['0004122420'],X:['0024','2004'],Y:['001220','1214'],Z:['00200424'],
 '.':['0414'], '-':['0222'], '+':['0222','1113'], '/':['0420'],' ':[]
 };
 const number=n=>Number(Number(n).toFixed(3)).toString();
 const boundsCache=new Map();
 function engravingBounds(g){
  const E=globalThis.GearEngine,d=E.dims(g),key=JSON.stringify([g.type,g.m,g.teeth,g.alpha,g.beta,g.wall,g.base,g.backlash||0]);
  if(boundsCache.has(key))return boundsCache.get(key);
  const geometry=E.geometry({...g,bore:0,coupler:false,recessDepth:0}),curve=g.type==='internal'?geometry.inner:geometry.outer;
  let minimum=Infinity,maximum=0,backLow=-1.25*g.m-g.base,backHigh=-1.25*g.m;
  if(curve.kind==='circle'){minimum=maximum=curve.r;}else for(let i=0;i<curve.n;i++){
   const poles=curve.poles.slice(i*3,i*3+4),center=poles.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]),length=Math.hypot(...center),axis=center.map(v=>v/length);
   // A Bezier curve lies in its control hull. Projection gives a conservative inner disk.
   for(const p of poles){minimum=Math.min(minimum,p[0]*axis[0]+p[1]*axis[1]);maximum=Math.max(maximum,Math.hypot(...p));}
  }
  if(g.type==='rack')for(let i=0;i<curve.n;i++){const poles=curve.poles.slice(i*3,i*3+4),cx=poles.reduce((s,p)=>s+p[0]/4,0),cy=poles.reduce((s,p)=>s+p[1]/4,0),dx=poles[3][0]-poles[0][0],mid=-1.25*g.m-g.base/2;if(Math.abs(cx)>d.length/2-.5)continue;if(cy<mid&&dx>0)backLow=Math.max(backLow,...poles.map(p=>p[1]));if(cy>mid&&dx<0)backHigh=Math.min(backHigh,...poles.map(p=>p[1]));}
  const result={inside:Math.min(d.root,minimum)-.05,outside:Math.max(d.root,maximum)+.05,backLow,backHigh};
  if(boundsCache.size>=100)boundsCache.clear();boundsCache.set(key,result);return result;
 }
 function layout(g){
  if(g.label?.enabled!==true)return {paths:[],lines:[],height:0};
  const E=globalThis.GearEngine,d=E.dims(g),name=String(g.name||'').toUpperCase(),id=String(g.id||'GEAR').toUpperCase(),title=/^[A-Z0-9 .+\/-]{1,18}$/.test(name)?name:id.replace(/[^A-Z0-9]/g,'');
  const lines=[title||'GEAR',`M${number(g.m)} Z${g.teeth}`,`T${number(g.width)}${['spur','helical'].includes(g.type)?(g.coupler===true?' H':' D')+number(g.bore):''}`,`A${number(g.alpha)}${g.type==='helical'?' B'+number(g.beta):''}`];
  const requested=Number.isFinite(g.label.height)?Math.max(.5,Math.min(6,g.label.height)):3,text=lines.join('  '),paths=[],margin=Number.isFinite(g.label.margin)?Math.max(.5,Math.min(10,g.label.margin)):2;
  if(g.type==='rack'){
   const envelope=engravingBounds(g),low=envelope.backLow+margin+.05,high=envelope.backHigh-margin-.05,h=Math.min(requested,high-low,(d.length-2*margin-.2)/(text.length*.8)),x0=-(text.length*.8-.3)*h/2,y0=(low+high+h)/2;
   if(h<.5)return {paths,lines,height:0,margin,warning:'安全留白後空間不足，單線字未輸出'};
   [...text].forEach((c,col)=>{for(const stroke of glyphs[c]||[]){const points=[];for(let i=0;i<stroke.length;i+=2)points.push([x0+col*.8*h+Number(stroke[i])*h/4,y0-Number(stroke[i+1])*h/4]);if(points.length>=2)paths.push(points);}});return {paths,lines,height:h,arrangement:'linear',margin};
  }
  let envelope;try{envelope=engravingBounds(g);}catch{return {paths,lines,height:0,margin,warning:'齒輪尺寸無效，單線字未輸出'};}
  const low=(g.type==='internal'?envelope.outside:E.boreRadius(g))+margin,high=(g.type==='internal'?d.outer:envelope.inside)-margin;
  let h=Math.min(requested,high-low),radius,arc;
  for(let attempt=0;attempt<60&&h>=.5;attempt++){
   radius=Math.sqrt(Math.max(0,high*high-(h/4)**2))-h/2-.05;arc=(text.length*.8-.3)*h/radius;
   if(radius>0&&radius-h/2>=low&&arc<=Math.PI*1.7)break;h*=.94;
  }
  if(h<.5||high<=low||radius-h/2<low||arc>Math.PI*1.7)return {paths,lines,height:0,margin,warning:'安全留白後空間不足，單線字未輸出'};
  [...text].forEach((c,col)=>{
   const offset=(col-(text.length-1)/2)*.8*h,angle=Math.PI/2-offset/radius,tangent=[Math.sin(angle),-Math.cos(angle)],normal=[Math.cos(angle),Math.sin(angle)];
   for(const stroke of glyphs[c]||[]){const points=[];for(let i=0;i<stroke.length;i+=2){const x=(Number(stroke[i])/4-.25)*h,y=(.5-Number(stroke[i+1])/4)*h;points.push([normal[0]*(radius+y)+tangent[0]*x,normal[1]*(radius+y)+tangent[1]*x]);}if(points.length>=2)paths.push(points);}
  });

  return {paths,lines,height:h,radius,margin,limits:{low,high},arrangement:'circular'};
 }
 return {layout,engravingBounds};
})();
