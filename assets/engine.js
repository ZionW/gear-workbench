/* Geometry is an approximate involute / basic rack construction, not a production tooth-root generator. */
globalThis.GearEngine=(()=>{
const TAU=2*Math.PI,rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI,rot=([x,y],a)=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)],inv=r=>{const t=Math.sqrt(Math.max(0,r*r-1));return t-Math.atan(t)},area=p=>p.reduce((s,A,i)=>{const B=p[(i+1)%p.length];return s+A[0]*B[1]-A[1]*B[0]},0)/2;
const types={spur:'直齒外齒輪',helical:'斜齒外齒輪',internal:'內齒輪',rack:'齒條'};
function dims(g){const beta=g.type==='helical'?rad(g.beta):0,mt=g.m/Math.cos(beta),alpha=Math.atan(Math.tan(rad(g.alpha))/Math.cos(beta)),r=mt*g.teeth/2;return {r,mt,alpha,rb:r*Math.cos(alpha),tip:g.type==='internal'?r-g.m:r+g.m,root:g.type==='internal'?r+1.25*g.m:r-1.25*g.m,outer:g.type==='internal'?r+1.25*g.m+g.wall:r+g.m,length:g.m*Math.PI*g.teeth,twist:g.type==='helical'?g.width*Math.tan(beta)/r:0};}
function hexPoints(flats){const r=flats/Math.sqrt(3);return Array.from({length:6},(_,i)=>[r*Math.cos(TAU*i/6),r*Math.sin(TAU*i/6)]);}
function hexRadius(flats,angle){const a=((angle%(Math.PI/3))+Math.PI/3)%(Math.PI/3)-Math.PI/6;return flats/2/Math.cos(a);}
function boreRadius(g){return g.coupler===true?g.bore/Math.sqrt(3):g.bore/2;}
function polygon(points){const poles=[points[0]];for(let i=0;i<points.length;i++){const A=points[i],B=points[(i+1)%points.length];poles.push(A.map((v,k)=>v+(B[k]-v)/3),A.map((v,k)=>v+2*(B[k]-v)/3),B);}return {kind:'spline',poles,n:points.length,polygon:true,vertices:points};}
function pocket(g){const depth=g.recessDepth??0;if(depth<=0)return null;const d=dims(g);return {depth,inner:boreRadius(g)+(g.hubWall??2),outer:d.root-(g.rimWall??2),floor:g.width-depth};}
function validate(g){if(g.type==='coupler')return [];const errs=[];if(g.coupler===true&&globalThis.GearCoupler)errs.push(...globalThis.GearCoupler.errors(g));if(!types[g.type])errs.push('未知類型');for(const key of ['m','alpha','width','bore','wall','base','beta','x','y','z','yaw','phase'])if(!Number.isFinite(g[key]))errs.push(key+' 需為數值');if(g.m<.3||g.m>10)errs.push('模數需為 0.3–10');if(!Number.isInteger(g.teeth)||g.teeth<(g.type==='rack'?4:8)||g.teeth>100)errs.push('齒數需為 '+(g.type==='rack'?4:8)+'–100 整數');if(g.alpha<14.5||g.alpha>25)errs.push('壓力角需為 14.5–25°');if(g.width<1||g.width>60)errs.push('齒寬需為 1–60 mm');if(g.type==='internal'&&(g.wall<g.m||g.wall>100))errs.push('環壁至少一個模數');if(g.type==='rack'&&(g.base<g.m||g.base>100))errs.push('齒條背厚至少一個模數');if(g.type==='helical'&&(Math.abs(g.beta)<1||Math.abs(g.beta)>40))errs.push('螺旋角需為 ±1–40°');const depth=g.recessDepth??0;if(!Number.isFinite(depth)||depth<0)errs.push('凹槽深度需為非負數');if(depth>0){const p=pocket(g);if(!['spur','helical'].includes(g.type))errs.push('正面環形凹槽目前支援外齒輪');if(!Number.isFinite(g.rimWall??2)||(g.rimWall??2)<1.2||!Number.isFinite(g.hubWall??2)||(g.hubWall??2)<1.2)errs.push('輪緣與軸心保留厚度至少 1.2 mm');if(p.floor<1.2)errs.push('凹槽底厚至少保留 1.2 mm');if(p.outer-p.inner<1)errs.push('齒輪太小或軸孔過大，凹槽寬度需至少 1 mm');}const b=g.backlash??0;if(!Number.isFinite(b)||b<0||b>g.m*.3)errs.push('單輪齒厚減量需為 0–0.3 倍模數');const d=dims(g);if(g.type==='internal'&&Math.PI/(2*g.teeth)-b/(2*d.r)-inv(d.r/d.rb)+inv(d.root/d.rb)>=Math.PI/g.teeth)errs.push('內齒齒根交錯，請增加齒數或降低壓力角');if(['spur','helical'].includes(g.type)&&Math.PI/(2*g.teeth)-b/(2*d.r)+inv(d.r/d.rb)-inv(d.tip/d.rb)<=0)errs.push('齒頂厚度不足，請增加齒數或調整壓力角');if(['spur','helical'].includes(g.type)&&(g.bore<0||2*boreRadius(g)>=2*d.root-.1*g.m))errs.push('軸孔過大，需保留齒根壁厚');if(Math.max(Math.abs(g.x),Math.abs(g.y),Math.abs(g.z))>10000)errs.push('位置超出 ±10000 mm');return errs;}
function clean(p){const out=p.filter((v,i)=>i===0||Math.hypot(v[0]-p[i-1][0],v[1]-p[i-1][1])>1e-8);if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<1e-8)out.pop();return area(out)<0?out.reverse():out;}
function rawProfile(g){const d=dims(g),p=[],push=(r,a)=>p.push([r*Math.cos(a),r*Math.sin(a)]);if(g.type==='rack'){const pitch=Math.PI*g.m,L=pitch*g.teeth,root=-1.25*g.m,low=root-g.base,t=Math.tan(rad(g.alpha)),ht=pitch/4-g.m*t-(g.backlash||0)/2,hr=pitch/4+1.25*g.m*t-(g.backlash||0)/2;p.push([-L/2,low],[L/2,low],[L/2,root]);for(let i=g.teeth-1;i>=0;i--){const x=(i-(g.teeth-1)/2)*pitch;p.push([x+hr,root],[x+ht,g.m],[x-ht,g.m],[x-hr,root]);}p.push([-L/2,root]);return clean(p);}
const half=Math.PI/(2*g.teeth)-(g.backlash||0)/(2*d.r),iv=inv(d.r/d.rb),step=TAU/g.teeth;
if(g.type==='internal'){const r0=Math.max(d.tip,d.rb);for(let i=0;i<g.teeth;i++){const a=i*step,fr=half-iv+inv(d.root/d.rb),ft=half-iv+inv(r0/d.rb);push(d.root,a-step/2);push(d.root,a-fr);for(let j=0;j<=10;j++){let r=d.root+(r0-d.root)*j/10;push(r,a-half+iv-inv(r/d.rb));}if(d.tip<d.rb)push(d.tip,a-ft);for(let j=1;j<=4;j++)push(d.tip,a-ft+2*ft*j/4);if(d.tip<d.rb)push(r0,a+ft);for(let j=0;j<=10;j++){const r=r0+(d.root-r0)*j/10;push(r,a+half-iv+inv(r/d.rb));}push(d.root,a+step/2);}return clean(p);}
const start=Math.max(d.rb,d.root);for(let i=0;i<g.teeth;i++){const a=i*step;push(d.root,a-step/2);push(d.root,a-half-iv+inv(start/d.rb)-.00001);for(let j=0;j<=10;j++){const r=start+(d.tip-start)*j/10;push(r,a-half-iv+inv(r/d.rb));}const tip=half+iv-inv(d.tip/d.rb);for(let j=1;j<=4;j++)push(d.tip,a-tip+2*tip*j/4);for(let j=10;j>=0;j--){const r=start+(d.tip-start)*j/10;push(r,a+half+iv-inv(r/d.rb));}push(d.root,a+half+iv-inv(start/d.rb)+.00001);push(d.root,a+step/2);}return clean(p);}
function resample(p,count){const cum=[0];for(let i=0;i<p.length;i++)cum.push(cum[i]+Math.hypot(p[(i+1)%p.length][0]-p[i][0],p[(i+1)%p.length][1]-p[i][1]));const out=[];let e=0;for(let j=0;j<count;j++){const t=cum[p.length]*j/count;while(e<p.length-1&&cum[e+1]<t)e++;const f=(t-cum[e])/(cum[e+1]-cum[e]);out.push(p[e].map((v,k)=>v+f*(p[(e+1)%p.length][k]-v)));}return out;}
function spline(pts){const poles=[pts[0]];for(let i=0;i<pts.length;i++){const A=pts[i],B=pts[(i+1)%pts.length],prev=pts[(i+pts.length-1)%pts.length],next=pts[(i+2)%pts.length];poles.push(A.map((v,k)=>v+(B[k]-prev[k])/6),B.map((v,k)=>v-(next[k]-A[k])/6),B);}return {kind:'spline',poles,n:pts.length};}
function sample(curve,steps=2){if(curve.kind==='d'||curve.kind==='double-d')return globalThis.GearCoupler.socketPoints({shaft:curve.r*2,shape:curve.kind,flat:curve.flat});if(curve.kind==='circle')return Array.from({length:curve.segments||192},(_,i)=>[curve.r*Math.cos(TAU*i/(curve.segments||192)),curve.r*Math.sin(TAU*i/(curve.segments||192))]);const out=[];for(let i=0;i<curve.n;i++){const [A,B,C,D]=curve.poles.slice(i*3,i*3+4);for(let j=0;j<steps;j++){const t=j/steps,u=1-t;out.push(A.map((v,k)=>u*u*u*v+3*u*u*t*B[k]+3*u*t*t*C[k]+t*t*t*D[k]));}}return out;}
function geometry(g){if(g.type==='coupler')return globalThis.GearCoupler.geometry(g);const errors=validate(g);if(errors.length)throw Error(g.name+'：'+errors.join('；'));const d=dims(g),shape=spline(resample(rawProfile(g),g.teeth*(g.type==='rack'?16:36))),outer=g.type==='internal'?{kind:'circle',r:d.outer}:shape,inner=g.type==='internal'?shape:(g.type==='rack'||g.bore===0?null:g.coupler===true?polygon(hexPoints(g.bore)):{kind:'circle',r:g.bore/2});return {g,d,outer,inner,pocket:pocket(g)};}
function match(a,b,kind='mesh'){if(kind==='shaft')return a.type==='rack'||b.type==='rack'?['齒條不能設定同軸連動']:[];const e=[];if(a.type==='rack'&&b.type==='rack')e.push('齒條不能互相嚙合');if(a.type==='internal'&&b.type==='internal')e.push('兩個內齒輪不能直接嚙合');if(Math.abs(a.m-b.m)>1e-6)e.push('模數不一致');if(Math.abs(a.alpha-b.alpha)>1e-6)e.push('壓力角不一致');if(a.type==='helical'||b.type==='helical'){if(a.type!=='helical'||b.type!=='helical')e.push('目前斜齒輪僅支援外齒斜齒配對');else if(Math.abs(a.beta+b.beta)>1e-6)e.push('平行軸斜齒輪需等螺旋角、相反旋向');}const ring=a.type==='internal'?a:b.type==='internal'?b:null,pin=ring?(ring===a?b:a):null;if(ring&&(pin.type==='rack'||ring.teeth<=pin.teeth))e.push('內齒輪齒數必須大於外齒輪');return e;}
function relation(a,b,kind='mesh',checkPosition=true){const errors=match(a,b,kind),da=dims(a),db=dims(b),tol=Math.max(.02,.03*a.m),dist=Math.hypot(a.x-b.x,a.y-b.y);let k=1,c=rad(b.phase-a.phase),expected=0;
if(kind==='shaft'){if(checkPosition&&dist>tol)errors.push('同軸輪的 X/Y 必須相同');return {k,c,errors,expected:0,dist};}
const rack=a.type==='rack'?a:b.type==='rack'?b:null;if(rack){const pin=rack===a?b:a,r=dims(pin).r,ang=rad(rack.yaw),u=[Math.cos(ang),Math.sin(ang)],normal=[-u[1],u[0]],dx=pin.x-rack.x,dy=pin.y-rack.y,along=dx*u[0]+dy*u[1],height=dx*normal[0]+dy*normal[1],pitch=Math.PI*rack.m,offset=-(rack.teeth-1)*pitch/2,rawC=along-offset-pitch/2-r*(ang-Math.PI/2),C=rawC-Math.round(rawC/pitch)*pitch;k=rack===b?r:1/r;c=rack===b?C:-C/r;expected=r;if(checkPosition&&Math.abs(height-r)>tol)errors.push('齒條節線到輪心距離應為 '+r.toFixed(2)+' mm，且在齒面側');if(checkPosition&&Math.abs(along)>dims(rack).length/2-pitch/2)errors.push('輪心超出齒條有效長度');}
else if(a.type==='internal'||b.type==='internal'){const ring=a.type==='internal'?a:b,pin=ring===a?b:a,rr=dims(ring).r,rp=dims(pin).r,gamma=Math.atan2(pin.y-ring.y,pin.x-ring.x),C=(pin.teeth-ring.teeth)*gamma+Math.PI;expected=rr-rp;k=ring===b?rp/rr:rr/rp;c=ring===b?-C/ring.teeth:C/pin.teeth;}
else{expected=da.r+db.r;const delta=Math.atan2(b.y-a.y,b.x-a.x);k=-da.r/db.r;c=((a.teeth+b.teeth)*delta+b.teeth*Math.PI-Math.PI)/b.teeth;}
if(!rack&&checkPosition&&Math.abs(dist-expected)>tol)errors.push('中心距應為 '+expected.toFixed(2)+' mm，目前 '+dist.toFixed(2)+' mm');if(checkPosition&&Math.min(a.z+a.width,b.z+b.width)-Math.max(a.z,b.z)<=0)errors.push('兩齒輪在 Z 方向沒有重疊');return {k,c,errors,expected,dist};}
function solve(gears,links,driver,speed,autoPhase=true){const errors=[],warnings=[],map=new Map(gears.map(g=>[g.id,g])),adj=new Map(gears.map(g=>[g.id,[]])),rates={},phases={},edgeResults=[];gears.forEach(g=>validate(g).forEach(e=>errors.push(g.name+'：'+e)));for(const l of links){const a=map.get(l.a),b=map.get(l.b);if(!a||!b||a.id===b.id){errors.push('連動關係有無效零件');continue;}const r=relation(a,b,l.kind);edgeResults.push({...l,...r});r.errors.forEach(e=>errors.push(a.name+' ↔ '+b.name+'：'+e));if(!r.errors.length){adj.get(a.id).push({id:b.id,k:r.k,c:r.c});adj.get(b.id).push({id:a.id,k:1/r.k,c:-r.c/r.k});}if(l.kind==='mesh'&&(a.type==='internal'||b.type==='internal')&&Math.abs(a.teeth-b.teeth)<=9)warnings.push('內外齒數差小：需另做漸開線、次擺線及切削干涉檢查');}
const source=map.get(driver)||gears[0],initial=g=>g.type==='rack'?g.phase:rad(g.phase);if(source){rates[source.id]=source.type==='rack'?speed:speed*TAU/60;phases[source.id]=initial(source);const queue=[source.id];while(queue.length){const id=queue.shift();for(const e of adj.get(id)){const candidate=rates[id]*e.k,phase=phases[id]*e.k+e.c;if(rates[e.id]===undefined){rates[e.id]=candidate;phases[e.id]=phase;queue.push(e.id);}else if(Math.abs(rates[e.id]-candidate)>1e-7*Math.max(1,Math.abs(candidate)))errors.push('閉合迴路速比矛盾，機構鎖死');else if(autoPhase&&map.get(e.id).type!=='rack'){const period=TAU/map.get(e.id).teeth,delta=(phase-phases[e.id])/period;if(Math.abs(delta-Math.round(delta))>1e-5)errors.push('閉合迴路的齒相不一致，需調整配置或初相');}}}}
const reached=new Set(Object.keys(phases));for(const g of gears){if(rates[g.id]===undefined){rates[g.id]=0;phases[g.id]=initial(g);}if(!autoPhase)phases[g.id]=initial(g);if(g.fixed&&Math.abs(rates[g.id])>1e-8)errors.push(g.name+' 已固定，與驅動條件衝突');if(['spur','helical'].includes(g.type)&&g.teeth<2*Math.cos(g.type==='helical'?rad(g.beta):0)**3/Math.sin(rad(g.alpha))**2)warnings.push(g.name+'：少齒數根切風險');}
return {rates,phases,errors:[...new Set(errors)],warnings:[...new Set(warnings)],edgeResults,connected:reached};}
function autoPlace(a,b,kind,bearing){const e=match(a,b,kind);if(e.length)throw Error(e.join('；'));if(kind==='shaft'){b.x=a.x;b.y=a.y;return;}const rack=a.type==='rack'?a:b.type==='rack'?b:null;if(rack){const pin=rack===a?b:a,ang=rad(rack.yaw),n=[-Math.sin(ang),Math.cos(ang)],r=dims(pin).r;if(rack===a){b.x=a.x+n[0]*r;b.y=a.y+n[1]*r;}else{b.x=a.x-n[0]*r;b.y=a.y-n[1]*r;}}else{const distance=a.type==='internal'||b.type==='internal'?Math.abs(dims(a).r-dims(b).r):dims(a).r+dims(b).r;b.x=a.x+distance*Math.cos(rad(bearing));b.y=a.y+distance*Math.sin(rad(bearing));}b.z=a.z;}
// Rebuild the connected layout atomically, retaining original bearings and shaft order.
function reconfigure(before,links,id,patch,driver,speed,autoPhase=true){
 const gears=before.map(g=>({...g})),map=new Map(gears.map(g=>[g.id,g])),old=new Map(before.map(g=>[g.id,g])),changed=map.get(id);
 if(!changed)throw Error('找不到選取齒輪');Object.assign(changed,patch);
 if(patch.type&&!['spur','helical'].includes(patch.type)){changed.recessDepth=0;changed.coupler=false;}
 const mesh=new Set([id]),queue=[id];while(queue.length){const a=queue.shift();for(const l of links.filter(l=>l.kind!=='shaft'&&(l.a===a||l.b===a))){const b=l.a===a?l.b:l.a;if(!map.has(b)||mesh.has(b))continue;mesh.add(b);queue.push(b);if('m' in patch)map.get(b).m=changed.m;if('alpha' in patch)map.get(b).alpha=changed.alpha;if('beta' in patch&&map.get(a).type==='helical'&&map.get(b).type==='helical')map.get(b).beta=-map.get(a).beta;}}
 const reached=new Set([id]),walk=[id];while(walk.length){const a=walk.shift();for(const l of links.filter(l=>l.a===a||l.b===a)){const b=l.a===a?l.b:l.a;if(map.has(b)&&!reached.has(b)){reached.add(b);walk.push(b);}}}
 const anchor=[...reached].find(k=>map.get(k).fixed)||id,placed=new Set([anchor]),pending=[anchor];
 while(pending.length){const a=map.get(pending.shift());for(const l of links.filter(l=>l.a===a.id||l.b===a.id)){const bid=l.a===a.id?l.b:l.a,b=map.get(bid);if(!b||placed.has(bid))continue;const A=old.get(a.id),B=old.get(bid),bearing=deg(Math.atan2(B.y-A.y,B.x-A.x));
  if(l.kind==='shaft'){b.x=a.x;b.y=a.y;b.z=B.z>=A.z?a.z+a.width+(B.z-A.z-A.width):a.z-b.width-(A.z-B.z-B.width);}
  else if(a.type==='rack'||b.type==='rack'){const rack=a.type==='rack'?a:b,pin=rack===a?b:a,ang=rad(rack.yaw),n=[-Math.sin(ang),Math.cos(ang)],delta=dims(pin).r-((pin.x-rack.x)*n[0]+(pin.y-rack.y)*n[1]);b.x+=n[0]*delta*(rack===a?1:-1);b.y+=n[1]*delta*(rack===a?1:-1);b.z=a.z;}
  else autoPlace(a,b,l.kind,bearing);
  if(b.fixed&&(Math.hypot(b.x-B.x,b.y-B.y)>1e-6||Math.abs(b.z-B.z)>1e-6))throw Error('固定零件限制了自動對位，請先解除固定');placed.add(bid);pending.push(bid);
 }}
 const solved=solve(gears,links,driver,speed,autoPhase);const errors=solved.errors;if(errors.length)throw Error(errors.join('；'));return gears;
}
// Return a validated proposal; callers commit it as one undoable edit.
function snapMesh(gears,links,movingId,driver,speed,tolerance=4,grid=null){
 const moving=gears.find(g=>g.id===movingId);
 if(!moving||moving.fixed||validate(moving).length||!Number.isFinite(tolerance)||tolerance<0||links.some(l=>l.kind==='shaft'&&(l.a===movingId||l.b===movingId)))return null;
 if(grid&&(!Number.isFinite(grid.pitch)||grid.pitch<=0))return null;
 const needsHole=g=>!!grid&&(!grid.ids||grid.ids.includes(g.id)),onHole=g=>Math.hypot(g.x-Math.round(g.x/grid.pitch)*grid.pitch,g.y-Math.round(g.y/grid.pitch)*grid.pitch)<1e-7;
 const candidates=[];
 for(const originalAnchor of gears){
  if(originalAnchor.id===movingId||validate(originalAnchor).length||match(originalAnchor,moving).length)continue;
  if(Math.min(originalAnchor.z+originalAnchor.width,moving.z+moving.width)-Math.max(originalAnchor.z,moving.z)<=0)continue;
  const anchor={...originalAnchor};let anchorCorrection=0;
  if(needsHole(anchor)&&!onHole(anchor)){
   if(anchor.fixed)continue;
   anchor.x=Math.round(anchor.x/grid.pitch)*grid.pitch;anchor.y=Math.round(anchor.y/grid.pitch)*grid.pitch;
   anchorCorrection=Math.hypot(anchor.x-originalAnchor.x,anchor.y-originalAnchor.y);if(anchorCorrection>tolerance)continue;
  }
  const next={...moving},rack=anchor.type==='rack'?anchor:moving.type==='rack'?moving:null;
  if(rack){
   const pin=rack===anchor?moving:anchor,ang=rad(rack.yaw),n=[-Math.sin(ang),Math.cos(ang)],height=(pin.x-rack.x)*n[0]+(pin.y-rack.y)*n[1],delta=dims(pin).r-height;
   next.x+=n[0]*delta*(rack===anchor?1:-1);next.y+=n[1]*delta*(rack===anchor?1:-1);
  }else{
   const dx=moving.x-anchor.x,dy=moving.y-anchor.y,d=Math.hypot(dx,dy);if(d<1e-9)continue;
   const expected=anchor.type==='internal'||moving.type==='internal'?Math.abs(dims(anchor).r-dims(moving).r):dims(anchor).r+dims(moving).r;
   next.x=anchor.x+dx/d*expected;next.y=anchor.y+dy/d*expected;
  }
  const positions=[];
  if(needsHole(moving)){
   const p=grid.pitch;
   for(let j=Math.ceil((moving.y-tolerance)/p);j<=Math.floor((moving.y+tolerance)/p);j++)for(let i=Math.ceil((moving.x-tolerance)/p);i<=Math.floor((moving.x+tolerance)/p);i++)positions.push({...next,x:i*p,y:j*p});
  }else positions.push(next);
  for(const position of positions){
   const correction=Math.hypot(position.x-moving.x,position.y-moving.y);
   if(correction>tolerance||relation(anchor,position).errors.length)continue;
   const proposed=gears.map(g=>g.id===movingId?position:g.id===anchor.id?anchor:{...g});
   const nextLinks=links.map(l=>({...l}));
   if(!nextLinks.some(l=>(l.a===anchor.id&&l.b===movingId)||(l.b===anchor.id&&l.a===movingId)))nextLinks.push({id:'snap-'+anchor.id+'-'+movingId,a:anchor.id,b:movingId,kind:'mesh'});
   const solved=solve(proposed,nextLinks,driver,speed,true);
   if(!solved.errors.length)candidates.push({gears:proposed,links:nextLinks,anchorId:anchor.id,correction,anchorCorrection,gridAligned:!!grid});
  }
 }
 return candidates.sort((a,b)=>(a.correction+a.anchorCorrection)-(b.correction+b.anchorCorrection)||a.anchorId.localeCompare(b.anchorId))[0]||null;
}
function pose(g,s,t=0){const v=(s?.phases[g.id]??(g.type==='rack'?g.phase:rad(g.phase)))+(s?.rates[g.id]||0)*t;if(g.type==='rack'){const a=rad(g.yaw);return {...g,x:g.x+Math.cos(a)*v,y:g.y+Math.sin(a)*v,rotation:a};}return {...g,rotation:v};}
function rackEngaged(gears,links,s,t){const map=new Map(gears.map(g=>[g.id,g]));for(const l of links){const A=map.get(l.a),B=map.get(l.b);if(!A||!B)continue;const rack=A.type==='rack'?A:B.type==='rack'?B:null;if(!rack||l.kind==='shaft')continue;const pin=rack===A?B:A,pos=pose(rack,s,t),ang=rad(rack.yaw),along=(pin.x-pos.x)*Math.cos(ang)+(pin.y-pos.y)*Math.sin(ang);if(Math.abs(along)>dims(rack).length/2-Math.PI*rack.m/2)return false;}return true;}
const numberText=x=>{if(!Number.isFinite(x))throw Error('無效幾何數值');const v=Math.abs(x)<1e-12?0:Number(x.toPrecision(14));let s=String(v).replace(/e/g,'E');return !s.includes('.')&&!s.includes('E')?s+'.':s;};
return {TAU,rad,deg,rot,types,dims,hexPoints,hexRadius,boreRadius,polygon,pocket,validate,clean,rawProfile,resample,spline,sample,geometry,match,relation,solve,autoPlace,reconfigure,snapMesh,pose,rackEngaged,numberText};
})();
