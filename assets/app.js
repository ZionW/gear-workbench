(()=>{
const root=document.getElementById('gear-lab'),q=id=>root.querySelector('#v-'+id),E=GearEngine,X=GearExports,M=GearMount,clone=v=>JSON.parse(JSON.stringify(v)),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let serial=4,elapsed=0,playing=false,frame=0,last=0,solution=null,fit=null,canvasSize={w:0,h:0},camera={yaw:-.45,tilt:1.0},history=[],notice='',geometryCache=new Map(),colors={},snapPreview=null,mountInfo=null,floatingOpen=false,floatingId=null;
const make=(id,name,over={})=>({id,name,type:'spur',m:2,teeth:20,alpha:20,width:10,bore:8,beta:20,wall:6,base:6,x:0,y:0,z:0,yaw:0,phase:0,fixed:false,recessDepth:0,rimWall:2,hubWall:2,...over});
function preset(name){if(name==='helical')return {gears:[make('g1','右旋主動輪',{type:'helical',x:-30,beta:20}),make('g2','左旋從動輪',{type:'helical',teeth:40,x:-30+60/Math.cos(E.rad(20)),beta:-20})],links:[{id:'l1',a:'g1',b:'g2',kind:'mesh'}],selected:'g1',driver:'g1',speed:20,autoPhase:true,scope:'selected',view:'3d',pitch:true};if(name==='internal')return {gears:[make('g1','小齒輪',{x:40}),make('g2','內齒輪',{type:'internal',teeth:60,wall:7,bore:0})],links:[{id:'l1',a:'g1',b:'g2',kind:'mesh'}],selected:'g2',driver:'g1',speed:20,autoPhase:true,scope:'selected',view:'2d',pitch:true};if(name==='rack')return {gears:[make('g1','主動小齒輪'),make('g2','直齒條',{type:'rack',teeth:20,y:-20,bore:0,base:6})],links:[{id:'l1',a:'g1',b:'g2',kind:'mesh'}],selected:'g2',driver:'g1',speed:10,autoPhase:true,scope:'selected',view:'2d',pitch:true};return {gears:[make('g1','主動輪 A',{x:-60}),make('g2','從動輪 B',{x:0,teeth:40}),make('g3','從動輪 C',{x:60})],links:[{id:'l1',a:'g1',b:'g2',kind:'mesh'},{id:'l2',a:'g2',b:'g3',kind:'mesh'}],selected:'g1',driver:'g1',speed:30,autoPhase:true,scope:'selected',view:'2d',pitch:true};}
let state=preset('chain');
let level='basic';
try{level=localStorage.getItem('gear-workbench-level')==='expert'?'expert':'basic';}catch{}
let autoSnap=true;
try{autoSnap=localStorage.getItem('gear-workbench-snap')!=='false';}catch{}
let includeMountPins=true;
try{includeMountPins=localStorage.getItem('gear-workbench-mount-copy-pins')!=='false';}catch{}
const STORAGE_KEY='gear-workbench-state-v2';
function readSaved(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}}
const savedSnapshot=readSaved();
function safeState(snapshot){const s=snapshot?.modelContent;if(!s||s.version!==2||!Array.isArray(s.gears)||s.gears.length<1||s.gears.length>12)return null;const gears=s.gears.map((v,i)=>{const g=make('g'+(i+1),String(v.name||'齒輪').slice(0,24));for(const k of Object.keys(g))if(k!=='id'&&k!=='name'&&v[k]!==undefined)g[k]=k==='type'?(E.types[v[k]]?v[k]:'spur'):k==='fixed'?!!v[k]:Number(v[k]);return g;});if(gears.some(g=>E.validate(g).length))return null;const ids=s.gears.map(g=>g.id),remap=id=>'g'+(ids.indexOf(id)+1),links=Array.isArray(s.links)?s.links.slice(0,66).filter(l=>ids.includes(l.a)&&ids.includes(l.b)&&l.a!==l.b).map((l,i)=>({id:'l'+(i+1),a:remap(l.a),b:remap(l.b),kind:l.kind==='shaft'?'shaft':'mesh'})):[];return {...state,gears,links,selected:ids.includes(s.selected)?remap(s.selected):gears[0].id,driver:ids.includes(s.driver)?remap(s.driver):gears[0].id,speed:Number.isFinite(s.speed)?Math.max(-300,Math.min(300,s.speed)):30,autoPhase:s.autoPhase!==false,scope:s.scope==='all'?'all':'selected',view:s.view==='3d'?'3d':'2d',pitch:s.pitch!==false,mount:M.normalize(s.mount)};}
const saved=safeState(savedSnapshot);if(saved)state=saved;else {const legacy=savedSnapshot?.modelContent;if(legacy?.module!==undefined){const a=make('g1','主動輪 A',{m:Number(legacy.module),teeth:Number(legacy.teeth),alpha:Number(legacy.angle),width:Number(legacy.width),bore:Number(legacy.bore)});if(!E.validate(a).length){const b=make('g2','從動輪 B',{...a,id:'g2',name:'從動輪 B',teeth:Math.min(100,a.teeth*2)}),c=make('g3','從動輪 C',{...a,id:'g3',name:'從動輪 C'}),distance=E.dims(a).r+E.dims(b).r;a.x=-distance;c.x=distance;state={...state,gears:[a,b,c],view:legacy.mode==='3d'?'3d':'2d',pitch:legacy.circles!==false};}}}
state.mount=M.normalize(state.mount);
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({modelContent:{version:2,...state},privateContent:{elapsed}}));}catch{/* Storage can be disabled; geometry still works. */}}
function selected(){return state.gears.find(g=>g.id===state.selected)||state.gears[0];}
function stop(){playing=false;if(frame)cancelAnimationFrame(frame);frame=0;q('play').textContent='開始運轉';if(floatingOpen)positionFloating();}
function beginEdit(){stop();snapPreview=null;history.push(clone(state));if(history.length>25)history.shift();elapsed=0;notice='';q('source').hidden=true;q('output-status').textContent='';}
function finishEdit(refit=true){refresh(refit);persist();}
function geom(g){g={...g,backlash:state.mount.backlash/2};const key=JSON.stringify([g.type,g.m,g.teeth,g.alpha,g.width,g.bore,g.beta,g.wall,g.base,g.backlash,g.recessDepth,g.rimWall,g.hubWall]);if(!geometryCache.has(key)){if(geometryCache.size>100)geometryCache.clear();const data=E.geometry(g);data.previewOuter=previewPoints(data.outer);data.previewInner=data.inner?previewPoints(data.inner):null;geometryCache.set(key,data);}return geometryCache.get(key);}
function poses(scope='all'){return (scope==='all'?state.gears:[selected()]).map(g=>({...E.pose(g,solution,elapsed),backlash:state.mount.backlash/2}));}
function setOptions(id,gears,value){q(id).innerHTML=gears.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');q(id).value=gears.some(g=>g.id===value)?value:gears[0].id;}
function refresh(refit=false){state.mount=M.normalize(state.mount);mountInfo=M.build(state.gears,state.mount);syncMountPanel();solution=E.solve(state.gears.map(g=>({...g,backlash:state.mount.backlash/2})),state.links,state.driver,state.speed,state.autoPhase);const g=selected(),a=q('link-a').value,b=q('link-b').value;setOptions('selected',state.gears,g.id);setOptions('driver',state.gears,state.driver);setOptions('link-a',state.gears,a||state.gears[0].id);setOptions('link-b',state.gears,b||state.gears[1]?.id||state.gears[0].id);for(const k of ['name','type','m','teeth','alpha','width','bore','beta','wall','base','x','y','z','yaw','phase','recessDepth','rimWall','hubWall'])q(k).value=g[k];q('fixed').checked=g.fixed;
q('module-label').textContent=g.type==='helical'?'法向模數 mₙ · mm':'模數 m · mm';q('alpha-label').textContent=g.type==='helical'?'法向壓力角 · °':'壓力角 · °';q('module-help').textContent=g.type==='helical'?'輸入法向模數 mₙ；端面模數 mₜ = mₙ / cos β。只修改選取零件。':'可輸入自訂小數；只修改選取零件，嚙合輪需使用相同模數。';q('teeth-label').textContent=g.type==='rack'?'齒條齒數':'齒數 z';q('teeth').min=g.type==='rack'?4:8;q('beta-wrap').hidden=g.type!=='helical';q('bore-wrap').hidden=!['spur','helical'].includes(g.type);q('wall-wrap').hidden=g.type!=='internal';q('base-wrap').hidden=g.type!=='rack';q('yaw-wrap').hidden=g.type!=='rack';
const follower=state.autoPhase&&g.id!==state.driver&&solution.connected.has(g.id);q('phase').disabled=follower;q('phase-label').textContent=g.type==='rack'?'起始位移 · mm'+(follower?'（自動）':''):'初始齒相 · °'+(follower?'（自動）':'');if(follower)q('phase').value=(g.type==='rack'?solution.phases[g.id]:E.deg(solution.phases[g.id])).toFixed(3);
q('recess-panel').hidden=!['spur','helical'].includes(g.type);q('recess-enabled').checked=g.recessDepth>0;for(const k of ['recessDepth','rimWall','hubWall'])q(k).disabled=!(g.recessDepth>0);const pocket=E.pocket(g);q('recess-info').textContent=pocket?'槽內徑 Ø'+(pocket.inner*2).toFixed(2)+' · 外徑 Ø'+(pocket.outer*2).toFixed(2)+' mm · 底厚 '+pocket.floor.toFixed(2)+' mm':'正面（+Z）環形凹槽；保留輪緣、軸心與至少 1.2 mm 底厚。';
const d=E.dims(g);q('geometry-note').textContent=g.type==='rack'?`節距 ${(Math.PI*g.m).toFixed(2)} mm · 長度 ${d.length.toFixed(2)} mm · 齒條有行程限制`:g.type==='internal'?`內齒頂 Ø${(2*d.tip).toFixed(2)} · 外環 Ø${(2*d.outer).toFixed(2)} mm · 干涉需另驗證`:`節徑 Ø${(2*d.r).toFixed(2)} mm · 外徑 Ø${(2*d.tip).toFixed(2)} mm`+(g.type==='helical'?` · 總扭轉 ${E.deg(d.twist).toFixed(2)}°`:'');
q('part-count').textContent=state.gears.length+' 個零件';q('selected-kind').textContent=E.types[g.type];q('size-summary').textContent='m '+g.m+' · '+g.teeth+' 齒';q('position-summary').textContent=[g.x,g.y,g.z].join(', ');q('drive-summary').textContent=(state.gears.find(p=>p.id===state.driver)?.name||'主動輪')+' · '+state.speed+(state.gears.find(p=>p.id===state.driver)?.type==='rack'?' mm/s':' rpm');q('link-count').textContent=state.links.length+' 組連動';q('rhino-count').textContent=state.gears.length+' 個齒輪'+(state.mount.enabled&&q('copy-board').checked?'＋底盤'+(includeMountPins?'與桿件':''):'')+' · 組裝位置';
q('delete').disabled=state.gears.length===1;q('add').disabled=state.gears.length>=12;q('duplicate').disabled=state.gears.length>=12;q('undo').disabled=!history.length;q('speed').value=state.speed;q('speed-label').textContent=state.gears.find(g=>g.id===state.driver)?.type==='rack'?'線速 · mm/s':'轉速 · rpm';q('autophase').checked=state.autoPhase;q('pitch').checked=state.pitch;q('scope').value=state.scope;q('view2').setAttribute('aria-pressed',state.view==='2d');q('view3').setAttribute('aria-pressed',state.view==='3d');q('view-note').textContent=state.view==='2d'?(autoSnap?'2D 拖近齒輪後放開，自動吸附連動':'2D 自由拖曳零件 · 吸附已關閉'):'3D 拖曳空白處旋轉視角 · 平行軸';q('play').disabled=solution.errors.length>0||state.speed===0;q('step').disabled=solution.errors.length>0;
q('links').innerHTML=solution.edgeResults.length?solution.edgeResults.map(l=>{const A=state.gears.find(g=>g.id===l.a),B=state.gears.find(g=>g.id===l.b);return `<div class="link-item"><div>${esc(A.name)} ↔ ${esc(B.name)} · ${l.kind==='shaft'?'同軸':'嚙合'}<div class="sub">${esc(l.errors.length?l.errors.join('；'):l.kind==='shaft'?'同速、同方向':`節圓／節線位置通過；齒面干涉未完整驗證`)}</div></div><div class="actions"><button data-align="${l.id}">重新對位</button><button data-remove="${l.id}">移除</button></div></div>`;}).join(''):'<div class="sub">尚未連動：2D 拖近相容齒輪後放開，或選零件 A、B 手動對位。</div>';
q('rates').innerHTML=state.gears.map(g=>{const r=solution.rates[g.id],speed=g.type==='rack'?r:r*60/E.TAU,status=g.fixed?'固定':g.id===state.driver?'主動':solution.connected.has(g.id)?'從動':'未連動';return `<tr><td><button data-select="${g.id}" ${g.id===state.selected?'aria-pressed="true"':''}>${esc(g.name)}</button></td><td>${esc(E.types[g.type])}</td><td>${g.teeth}</td><td class="numeric">${speed.toFixed(2)} ${g.type==='rack'?'mm/s':'rpm'}</td><td>${status}</td></tr>`;}).join('');
const invalid=poses().some(g=>E.validate(g).length);q('copy-rhino').title=state.mount.enabled&&q('copy-board').checked&&mountInfo.unmounted.length?'輪心未對孔位：先對齊，或取消包含支撐桿':'';for(const id of ['copy-svg','copy-rhino'])q(id).disabled=invalid;
q('copy-rhino').disabled=invalid||(state.mount.enabled&&q('copy-board').checked&&(!!mountInfo.errors.length||(includeMountPins&&!!mountInfo.unmounted.length)));
q('output-note').textContent='mm · Rhino 整組為組裝位置，需分件排版列印；SVG 依指定範圍；下載使用下方內容選單。SVG／DXF 為 XY 投影。'+(state.gears.some(g=>g.type==='helical')?'斜齒輪為螺旋曲面近似；Rhino 命令需另檢查形狀。':'');syncDownloads();syncFloating();updateStatus();if(refit||!fit)fitScene();draw();}
function updateStatus(){const items=[notice,...(solution?.errors||[]),...(solution?.warnings||[])].filter(Boolean);q('status').textContent=items.length?items.join(' ｜ '):'節圓位置與速比條件通過 · 理想等速連動 · 尚未做完整齒面接觸與碰撞分析';q('status').dataset.error=!!solution?.errors.length;}
function theme(){const probe=document.createElement('span');probe.hidden=true;root.appendChild(probe);for(const [key,token]of Object.entries({ink:'ink',muted:'muted',rule:'rule',accent:'accent',gear:'gear',side:'side',paper:'paper',warning:'warning',panel:'panel',snap:'snap',mount:'mount',mountSide:'mount-side'})){probe.style.color=`var(--color-${token})`;colors[key]=getComputedStyle(probe).color;}probe.remove();}
function projected([x,y,z]){if(state.view==='2d')return [x,-y];const a=E.rot([x,y],camera.yaw);return [a[0],-a[1]*Math.cos(camera.tilt)-z*Math.sin(camera.tilt)];}
function world(g,v,z=0){const a=E.rot(v,g.rotation||0);return [a[0]+g.x,a[1]+g.y,z+g.z];}
function screen(W){const p=projected(W);return [canvasSize.w/2+(p[0]-fit.x)*fit.s,canvasSize.h/2+(p[1]-fit.y)*fit.s];}
function fitScene(){if(!canvasSize.w||!canvasSize.h)return;const pts=[];for(const p of poses()){if(E.validate(p).length)continue;const d=E.dims(p),extent=p.type==='rack'?[[-d.length/2,-1.25*p.m-p.base],[d.length/2,p.m]]:[[-d.outer,-d.outer],[d.outer,d.outer]];for(const x of [extent[0][0],extent[1][0]])for(const y of [extent[0][1],extent[1][1]])for(const z of [0,p.width])pts.push(projected(world(p,[x,y],z)));}if(state.mount?.enabled&&mountInfo&&!mountInfo.errors.length){for(const x of [mountInfo.x0,mountInfo.x1])for(const y of [mountInfo.y0,mountInfo.y1])for(const z of [mountInfo.bottom,mountInfo.top])pts.push(projected([x,y,z]));}
if(!pts.length){fit={x:0,y:0,s:1};return;}let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const [x,y]of pts){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}fit={x:(x0+x1)/2,y:(y0+y1)/2,s:Math.min((canvasSize.w-65)/Math.max(1,x1-x0),(canvasSize.h-80)/Math.max(1,y1-y0))};}
const canvas=q('canvas'),ctx=canvas.getContext('2d');
function previewPoints(c){const p=E.sample(c,1),skip=Math.max(1,Math.ceil(p.length/700));return p.filter((_,i)=>i%skip===0);}
function drawPath(p,g,z,twist=0){p.forEach((v,i)=>{const s=screen(world(g,E.rot(v,twist),z));i?ctx.lineTo(...s):ctx.moveTo(...s)});ctx.closePath();}
// Side outlines follow the model's front-facing walls; avoid a dense tessellation grid.
function drawSideEdges(ring,g,z0,z1,twist=0,isHole=false,chosen=false){
 const n=ring.length,visible=[],points=ring.map(v=>world(g,v,z0));
 for(let i=0;i<n;i++){const j=(i+1)%n,dx=points[j][0]-points[i][0],dy=points[j][1]-points[i][1];visible.push((dx*Math.cos(camera.yaw)-dy*Math.sin(camera.yaw))*(isHole?-1:1)>0);}
 ctx.save();if(isHole){ctx.beginPath();drawPath(ring,g,z1,twist);ctx.clip();}ctx.strokeStyle=chosen?colors.accent:colors.ink;ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=chosen?1.15:.95;ctx.globalAlpha=.9;
 ctx.beginPath();for(let i=0;i<n;i++)if(visible[i]){const a=screen(world(g,ring[i],z0)),b=screen(world(g,ring[(i+1)%n],z0));ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();
 ctx.globalAlpha=.62;ctx.lineWidth=.7;let lastPoint=null;
 for(let i=0;i<n;i++){
  const prev=(i+n-1)%n,next=(i+1)%n,A=ring[prev],B=ring[i],C=ring[next],u=[B[0]-A[0],B[1]-A[1]],v=[C[0]-B[0],C[1]-B[1]],turn=Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])),silhouette=visible[i]!==visible[prev];
  if(!silhouette&&(!(visible[i]||visible[prev])||turn<.18))continue;
  const start=screen(world(g,B,z0));if(!silhouette&&lastPoint&&Math.hypot(start[0]-lastPoint[0],start[1]-lastPoint[1])<5)continue;
  ctx.beginPath();ctx.moveTo(...start);const steps=Math.max(1,Math.ceil(Math.abs(twist)/E.rad(3)));for(let j=1;j<=steps;j++)ctx.lineTo(...screen(world(g,E.rot(B,twist*j/steps),z0+(z1-z0)*j/steps)));ctx.stroke();lastPoint=start;
 }
 ctx.restore();
}
function draw(){if(!fit||!canvasSize.w)return;const dpr=Math.min(window.devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,canvasSize.w,canvasSize.h);drawMount();const all=poses(),poseMap=new Map(all.map(g=>[g.id,g]));ctx.setLineDash([4,5]);ctx.lineWidth=1;for(const l of solution.edgeResults){const a=poseMap.get(l.a),b=poseMap.get(l.b);if(!a||!b)continue;ctx.strokeStyle=l.errors.length?colors.warning:colors.rule;ctx.beginPath();ctx.moveTo(...screen([a.x,a.y,a.z]));ctx.lineTo(...screen([b.x,b.y,b.z]));ctx.stroke();}ctx.setLineDash([]);
const ordered=state.view==='3d'?all.slice().sort((a,b)=>projected([a.x,a.y,a.z])[1]-projected([b.x,b.y,b.z])[1]):all.slice().sort((a,b)=>(a.type==='internal'?-1:0)-(b.type==='internal'?-1:0));for(const g of ordered){if(E.validate(g).length)continue;let shape;try{shape=geom(g);}catch(e){continue;}const outer=shape.previewOuter,inner=shape.previewInner,chosen=g.id===state.selected;ctx.lineWidth=chosen&&snapPreview?2.8:chosen?1.7:1;ctx.strokeStyle=chosen&&snapPreview?colors.snap:chosen?colors.accent:colors.muted;
if(state.view==='3d'){const rings=[outer,...(inner?[inner]:[])];ctx.fillStyle=colors.side;for(const [index,ring] of rings.entries()){const twist=g.type==='helical'?shape.d.twist:0;ctx.save();if(index>0){ctx.beginPath();drawPath(ring,g,g.width,twist);ctx.clip();}for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length,P=[screen(world(g,ring[i])),screen(world(g,ring[j])),screen(world(g,E.rot(ring[j],twist),g.width)),screen(world(g,E.rot(ring[i],twist),g.width))];ctx.beginPath();P.forEach((s,k)=>k?ctx.lineTo(...s):ctx.moveTo(...s));ctx.closePath();ctx.fill();}ctx.restore();}rings.forEach((ring,i)=>drawSideEdges(ring,g,0,g.width,g.type==='helical'?shape.d.twist:0,i>0,chosen));ctx.fillStyle=chosen?colors.gear:colors.panel;ctx.beginPath();drawPath(outer,g,g.width,shape.d.twist);if(inner)drawPath(inner,g,g.width,g.type==='helical'?shape.d.twist:0);ctx.fill('evenodd');ctx.stroke();}
else{ctx.fillStyle=chosen?colors.gear:colors.panel;ctx.beginPath();drawPath(outer,g,0);if(inner)drawPath(inner,g,0);ctx.fill('evenodd');ctx.stroke();}
if(shape.pocket){const p=shape.pocket,z=state.view==='3d'?g.width:0,floor=state.view==='3d'?p.floor:0,outerRing=E.sample({kind:'circle',r:p.outer,segments:96}),innerRing=E.sample({kind:'circle',r:p.inner,segments:96});ctx.save();if(state.view==='3d'){ctx.beginPath();drawPath(outerRing,g,z);drawPath(innerRing,g,z);ctx.clip('evenodd');}ctx.lineWidth=.8;ctx.strokeStyle=colors.muted;ctx.fillStyle=colors.mountSide;ctx.beginPath();drawPath(outerRing,g,floor);drawPath(innerRing,g,floor);ctx.fill('evenodd');ctx.stroke();if(state.view==='3d'){for(const ring of [outerRing,innerRing])for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length;ctx.beginPath();const points=[screen(world(g,ring[i],floor)),screen(world(g,ring[j],floor)),screen(world(g,ring[j],z)),screen(world(g,ring[i],z))];points.forEach((p,k)=>k?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=colors.side;ctx.fill();}drawSideEdges(outerRing,g,floor,z,0,true,chosen);drawSideEdges(innerRing,g,floor,z,0,false,chosen);ctx.beginPath();drawPath(outerRing,g,z);drawPath(innerRing,g,z);ctx.stroke();}ctx.restore();}
if(state.pitch){ctx.save();ctx.strokeStyle=colors.muted;ctx.lineWidth=.7;ctx.setLineDash([6,4]);ctx.beginPath();if(g.type==='rack'){ctx.moveTo(...screen(world(g,[-shape.d.length/2,0])));ctx.lineTo(...screen(world(g,[shape.d.length/2,0])));}else{const c=E.sample({kind:'circle',r:shape.d.r,segments:96},1);drawPath(c,g,state.view==='3d'?g.width:0);}ctx.stroke();ctx.restore();}
ctx.strokeStyle=chosen?colors.accent:colors.ink;ctx.lineWidth=2;ctx.beginPath();const radius=g.type==='internal'?shape.d.outer:shape.d.r*.7,mark=g.type==='rack'?[[0,-g.base],[0,0]]:[[radius*.6,0],[radius,0]];ctx.moveTo(...screen(world(g,mark[0],state.view==='3d'?g.width:0)));ctx.lineTo(...screen(world(g,mark[1],state.view==='3d'?g.width:0)));ctx.stroke();const label=screen([g.x,g.y,g.z+(state.view==='3d'?g.width:0)]);ctx.fillStyle=colors.ink;ctx.font='12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';if(g.type==='internal')label[1]-=(shape.d.outer*fit.s+12);else if(g.type==='rack')label[1]+=20;else if(state.mount?.enabled)label[1]-=16;ctx.fillText(g.name,label[0],label[1]);}
drawPinTips();
if(snapPreview&&state.view==='2d'){
 const g=snapPreview.gears.find(g=>g.id===state.selected),r=E.solve(snapPreview.gears,snapPreview.links,state.driver,state.speed,true),p=E.pose(g,r,0);
 ctx.save();ctx.lineWidth=2.5;ctx.strokeStyle=colors.snap;ctx.setLineDash([7,4]);ctx.beginPath();drawPath(geom(g).previewOuter,p,0);ctx.stroke();ctx.restore();
 q('view-note').textContent='黃色外框：放開即可吸附至 '+state.gears.find(g=>g.id===snapPreview.anchorId).name;
}
q('time').textContent=elapsed.toFixed(2)+' s';positionFloating();}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);canvasSize={w:r.width,h:r.height};canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);fitScene();draw();}
function tick(now){if(!playing)return;if(!last)last=now;const dt=Math.min(.1,(now-last)/1000);last=now;const t=elapsed+dt;if(!E.rackEngaged(state.gears,state.links,solution,t)){stop();notice='齒條到達可嚙合行程邊界，模擬已停止。';updateStatus();persist();draw();return;}elapsed=t;draw();frame=requestAnimationFrame(tick);}
function updateParameter(key,value,refit=true){
 try{
 const affected=['m','teeth','alpha','width','beta','type','yaw'].includes(key),before=state.gears;
 let next=affected?E.reconfigure(before,state.links,state.selected,{[key]:value},state.driver,state.speed,state.autoPhase):before.map(g=>g.id===state.selected?{...g,[key]:value}:{...g});
 const errors=next.flatMap(g=>E.validate({...g,backlash:state.mount.backlash/2}).map(e=>g.name+'：'+e));if(errors.length)throw Error(errors.join('；'));
 beginEdit();state.gears=next;if(['x','y'].includes(key))applySnap();if(affected&&state.links.length)notice='已依新尺寸自動調整連動位置'+(['m','alpha','beta'].includes(key)?'與相容嚙合參數':'')+'；底盤桿件需另確認孔位。';finishEdit(refit);return true;
 }catch(e){notice='未套用：'+e.message;refresh(false);return false;}
}
for(const k of ['name','type','m','teeth','alpha','width','bore','beta','wall','base','x','y','z','yaw','phase','recessDepth','rimWall','hubWall'])q(k).addEventListener('change',()=>{const value=k==='name'?(q(k).value.trim()||'齒輪'):k==='type'?q(k).value:Number(q(k).value);if(Object.is(selected()[k],value))return;updateParameter(k,value);});
q('recess-enabled').onchange=()=>updateParameter('recessDepth',q('recess-enabled').checked?Math.max(.5,Math.min(selected().width*.6,selected().width-1.2)):0);
q('fixed').onchange=()=>{beginEdit();selected().fixed=q('fixed').checked;finishEdit();};
q('selected').onchange=()=>{stop();floatingOpen=true;state.selected=q('selected').value;q('source').hidden=true;q('output-status').textContent='';refresh();persist();};q('rates').onclick=e=>{const b=e.target.closest('[data-select]');if(b){stop();floatingOpen=true;state.selected=b.dataset.select;refresh();persist();}};
q('load').onclick=()=>{beginEdit();const mount=state.mount;state=preset(q('preset').value);state.mount=mount;serial=4;finishEdit(true);};q('undo').onclick=()=>{if(history.length){stop();state=history.pop();elapsed=0;notice='已復原上一個配置';refresh(true);persist();}};
function nextID(){let id;do{id='g'+serial++;}while(state.gears.some(g=>g.id===id));return id;}
function addGear(duplicate=false){beginEdit();const g=clone(selected()),id=nextID();g.id=id;g.name=duplicate?g.name+' 副本':'齒輪 '+(state.gears.length+1);g.phase=0;g.fixed=false;const ext=E.dims(g);g.x+=g.type==='rack'?ext.length+15:2*ext.outer+15;state.gears.push(g);state.selected=id;floatingOpen=true;finishEdit(true);}
q('add').onclick=()=>addGear();q('duplicate').onclick=()=>addGear(true);q('delete').onclick=()=>{if(state.gears.length<2)return;beginEdit();const id=state.selected;state.gears=state.gears.filter(g=>g.id!==id);state.links=state.links.filter(l=>l.a!==id&&l.b!==id);state.selected=state.gears[0].id;if(state.driver===id)state.driver=state.selected;finishEdit(true);};
q('driver').onchange=()=>{beginEdit();state.driver=q('driver').value;finishEdit();};q('speed').onchange=()=>{const v=Number(q('speed').value);if(!Number.isFinite(v)||Math.abs(v)>300){notice='轉速／線速需在 ±300 以內';q('speed').value=state.speed;updateStatus();return;}beginEdit();state.speed=v;finishEdit();};q('autophase').onchange=()=>{beginEdit();state.autoPhase=q('autophase').checked;finishEdit(true);};q('pitch').onchange=()=>{state.pitch=q('pitch').checked;draw();persist();};
q('play').onclick=()=>{if(playing){stop();persist();return;}if(solution.errors.length||state.speed===0)return;notice='';playing=true;last=0;q('play').textContent='暫停運轉';updateStatus();frame=requestAnimationFrame(tick);};q('reset').onclick=()=>{stop();elapsed=0;notice='';fitScene();draw();updateStatus();persist();};q('step').onclick=()=>{stop();if(E.rackEngaged(state.gears,state.links,solution,elapsed+.1)){elapsed+=.1;draw();}else notice='齒條已到達嚙合行程邊界';updateStatus();persist();};
for(const [id,view]of [['view2','2d'],['view3','3d']])q(id).onclick=()=>{state.view=view;refresh(true);persist();};q('fit').onclick=()=>{fitScene();draw();};
function link(align){const A=state.gears.find(g=>g.id===q('link-a').value),B=state.gears.find(g=>g.id===q('link-b').value),kind=q('link-kind').value,bearing=Number(q('bearing').value);if(!A||!B||A.id===B.id){notice='請選兩個不同零件';updateStatus();return;}if(!Number.isFinite(bearing)){notice='相對方位需為數值';updateStatus();return;}const errs=E.match(A,B,kind);if(align&&errs.length){notice=errs.join('；');updateStatus();return;}beginEdit();if(align){E.autoPlace(A,B,kind,bearing);if(kind==='shaft')B.z=A.z+A.width+2;}const existing=state.links.find(l=>(l.a===A.id&&l.b===B.id)||(l.a===B.id&&l.b===A.id));if(existing){existing.a=A.id;existing.b=B.id;existing.kind=kind;}else state.links.push({id:'l'+Date.now().toString(36)+state.links.length,a:A.id,b:B.id,kind});finishEdit(true);}
q('link-align').onclick=()=>link(true);q('link-add').onclick=()=>link(false);q('links').onclick=e=>{const remove=e.target.closest('[data-remove]'),align=e.target.closest('[data-align]');if(remove){beginEdit();state.links=state.links.filter(l=>l.id!==remove.dataset.remove);finishEdit();}else if(align){const l=state.links.find(l=>l.id===align.dataset.align);if(!l)return;const a=state.gears.find(g=>g.id===l.a),b=state.gears.find(g=>g.id===l.b);try{const bearing=E.deg(Math.atan2(b.y-a.y,b.x-a.x));beginEdit();E.autoPlace(a,b,l.kind,bearing);finishEdit(true);}catch(e){notice=e.message;refresh();}}};
q('scope').onchange=()=>{state.scope=q('scope').value;q('source').hidden=true;q('output-status').textContent='';persist();};
async function copy(kind){stop();q('source').hidden=true;q('source').value='';const target=q('output-status');try{const text=kind==='svg'?X.makeSVG(poses(state.scope)):X.rhinoAssemblyMacro(poses('all'),state.mount.enabled&&q('copy-board').checked?mountInfo:null,includeMountPins);if(kind==='rhino')q('source').value=text;if(kind==='svg'&&globalThis.ClipboardItem&&navigator.clipboard?.write&&(ClipboardItem.supports?.('image/svg+xml')||ClipboardItem.supports?.('web image/svg+xml'))){const mime=ClipboardItem.supports('image/svg+xml')?'image/svg+xml':'web image/svg+xml';await navigator.clipboard.write([new ClipboardItem({[mime]:new Blob([text],{type:'image/svg+xml'}),'text/plain':new Blob([text],{type:'text/plain'})})]);}else{if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText(text);}target.textContent=kind==='svg'?'已複製 SVG 內容；接收軟體需支援 SVG 格式，部分瀏覽器僅能複製文字。':`已複製 ${state.gears.length} 個齒輪${state.mount.enabled&&q('copy-board').checked?'＋1 個底盤'+(includeMountPins?'＋'+mountInfo.pins.length+' 支桿':''):''}（含列印間隙）。貼至 Rhino 8 命令列，會先驗證封閉性再整組建立；尺寸 mm，不保留輔助曲線。`;}catch(e){if(kind==='rhino'&&q('source').value){q('source').hidden=false;q('source').focus();q('source').select();target.textContent='自動複製未完成；文字已選取，請按 Ctrl/Cmd+C。';}else target.textContent=(kind==='svg'?'SVG 複製未完成：':'無法建立內容：')+e.message;}}
q('copy-svg').onclick=()=>copy('svg');q('copy-rhino').onclick=()=>copy('rhino');
let downloadTarget='kit',downloadFormat='stl';
try{const saved=JSON.parse(localStorage.getItem('gear-workbench-download')||'null');if(['kit','selected','all','board','pins'].includes(saved?.target))downloadTarget=saved.target;if(['stl','step','dxf'].includes(saved?.format))downloadFormat=saved.format;}catch{}
function syncDownloads(){
 const mountOnly=['board','pins','kit'].includes(downloadTarget);if(mountOnly)downloadFormat='stl';
 q('download-target').value=downloadTarget;q('download-format').value=downloadFormat;
 for(const option of q('download-format').options)option.disabled=mountOnly&&option.value!=='stl';
 q('download-format').disabled=mountOnly;
 let error='';if(['board','pins'].includes(downloadTarget)&&!state.mount.enabled)error='請先在「底盤與支撐桿」啟用生成列印底盤。';
 const includeMount=['board','pins'].includes(downloadTarget)||(downloadTarget==='kit'&&state.mount.enabled);
 if(includeMount&&mountInfo.errors.length)error=mountInfo.errors.join('；');
 if((downloadTarget==='pins'||downloadTarget==='kit'&&state.mount.enabled&&mountInfo.pins.length)&&mountInfo.unmounted.length)error='輪心未對孔位，請先對齊孔位再下載含桿件的內容。';
 if(downloadTarget==='pins'&&!mountInfo.pins.length&&!error)error='目前沒有可生成的支撐桿。';
 if(['kit','selected','all'].includes(downloadTarget)&&poses(downloadTarget==='selected'?'selected':'all').some(g=>E.validate(g).length))error='請先修正齒輪尺寸或列印間隙。';
 q('download').disabled=!!error;q('download').textContent=downloadTarget==='kit'?'下載列印包':'下載 '+downloadFormat.toUpperCase();
 const notes={kit:'一次下載 ZIP：每個齒輪獨立 STL'+(state.mount.enabled?'＋底盤＋可用支撐桿':'（底盤未啟用）')+'。各檔底面 Z=0，請分件排版列印。',board:'底盤 STL，底面 Z=0。底盤目前支援 STL。',pins:'支撐桿 STL，分件排列、底面 Z=0。桿件目前支援 STL。',selected:'僅下載目前選取齒輪；保留位置與列印間隙。',all:'全部齒輪合為一個檔案，保留組裝位置。列印分件請選整套列印包。'};
 q('download-note').textContent=error||notes[downloadTarget];q('download-note').dataset.error=!!error;
}
for(const key of ['target','format'])q('download-'+key).onchange=()=>{downloadTarget=q('download-target').value;downloadFormat=q('download-format').value;syncDownloads();try{localStorage.setItem('gear-workbench-download',JSON.stringify({target:downloadTarget,format:downloadFormat}));}catch{}q('output-status').textContent='';};
function download(){
 stop();try{
 const result=GearDownloads.build({target:downloadTarget,format:downloadFormat,poses:poses(downloadTarget==='selected'?'selected':'all'),mount:mountInfo});
 const url=URL.createObjectURL(new Blob([result.data],{type:result.mime})),a=document.createElement('a');a.href=url;a.download=result.name;root.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);q('output-status').textContent='已送出下載：'+result.note;
 }catch(e){q('output-status').textContent='匯出失敗：'+e.message;}
}
q('download').onclick=download;
function syncFloating(){
 const g=selected(),changed=floatingId!==g.id;floatingId=g.id;
 q('floating-title').textContent=g.name;q('floating-kind').textContent=E.types[g.type];
 for(const key of ['m','teeth','width','bore','beta','wall','base','alpha','x','y','recessDepth']){
  const input=q('floating-'+key),source=q(key);
  const external=input.dataset.modelValue!==undefined&&input.dataset.modelValue!==String(g[key]);
  if(changed||external||(document.activeElement!==input&&input.getAttribute('aria-invalid')!=='true'))input.value=g[key];
  input.dataset.modelValue=String(g[key]);
  for(const attr of ['min','max','step']){const value=source.getAttribute(attr);value===null?input.removeAttribute(attr):input.setAttribute(attr,value);}
  if(changed||external){input.setCustomValidity('');input.removeAttribute('aria-invalid');}
 }
 q('floating-error').textContent=[...root.querySelectorAll('[data-floating-key][aria-invalid=true]')].map(i=>i.validationMessage).join('；');
 q('floating-module-label').textContent=g.type==='helical'?'法向模數 mₙ · mm':'模數 m · mm';
 q('floating-teeth-label').textContent=g.type==='rack'?'齒條齒數':'齒數 z';
 q('floating-recess-wrap').hidden=!['spur','helical'].includes(g.type);
 q('floating-bore-wrap').hidden=!['spur','helical'].includes(g.type);
 q('floating-beta-wrap').hidden=g.type!=='helical';q('floating-wall-wrap').hidden=g.type!=='internal';q('floating-base-wrap').hidden=g.type!=='rack';
 const d=E.dims(g);q('floating-size').textContent=g.type==='rack'?'長 '+d.length.toFixed(1)+' mm':'節徑 Ø'+(2*d.r).toFixed(1)+' mm';
}
function positionFloating(){
 const panel=q('floating'),show=floatingOpen&&!drag&&!playing&&!!fit&&canvasSize.w>0;
 q('floating-toggle').setAttribute('aria-pressed',String(show));panel.hidden=!show;if(!show)return;
 if(window.matchMedia('(max-width:600px)').matches){panel.dataset.placement='mobile';panel.style.left='';panel.style.top='';panel.style.bottom='';return;}
 panel.style.bottom='';const w=panel.offsetWidth,h=panel.offsetHeight,W=canvasSize.w,H=canvasSize.h,pad=8;
 const clampX=x=>Math.max(pad,Math.min(W-w-pad,x)),clampY=y=>Math.max(pad,Math.min(H-h-pad,y));
 if(panel.contains(document.activeElement)&&document.activeElement.matches('input')){panel.style.left=clampX(parseFloat(panel.style.left)||pad)+'px';panel.style.top=clampY(parseFloat(panel.style.top)||pad)+'px';return;}
 const g=E.pose(selected(),solution,elapsed);let points;
 try{const shape=geom(g);points=shape.previewOuter.flatMap(v=>[screen(world(g,v)),screen(world(g,E.rot(v,state.view==='3d'?shape.d.twist:0),state.view==='3d'?g.width:0))]);}catch{points=[screen([g.x,g.y,g.z])];}
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),cx=(left+right)/2,cy=(top+bottom)/2;
 const candidates=[{x:right+12,y:cy-h/2,side:'right'},{x:left-w-12,y:cy-h/2,side:'left'},{x:cx-w/2,y:bottom+12,side:'below'},{x:cx-w/2,y:top-h-12,side:'above'}];
 for(const p of candidates){const x=clampX(p.x),y=clampY(p.y),overlap=Math.max(0,Math.min(x+w,right)-Math.max(x,left))*Math.max(0,Math.min(y+h,bottom)-Math.max(y,top));p.score=overlap*8+Math.abs(x-p.x)+Math.abs(y-p.y);p.x=x;p.y=y;}
 const best=candidates.sort((a,b)=>a.score-b.score)[0];panel.style.left=best.x+'px';panel.style.top=best.y+'px';panel.dataset.placement=best.side;
}
function closeFloating(){floatingOpen=false;positionFloating();}
q('floating-close').onclick=()=>{closeFloating();canvas.focus({preventScroll:true});};
q('floating-toggle').onclick=()=>{const show=q('floating').hidden;stop();floatingOpen=show;syncFloating();positionFloating();};
q('floating-more').onclick=()=>{closeFloating();root.querySelector('[data-fold=geometry]').open=true;q('m').focus({preventScroll:true});q('m').scrollIntoView({block:'nearest',behavior:'auto'});};
q('floating').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeFloating();canvas.focus({preventScroll:true});}});
for(const input of root.querySelectorAll('[data-floating-key]')){
 input.addEventListener('input',()=>{input.setCustomValidity('');input.removeAttribute('aria-invalid');q('floating-error').textContent='';});
 input.addEventListener('change',()=>{
  const key=input.dataset.floatingKey,value=input.valueAsNumber,g=selected(),errors=!Number.isFinite(value)||!input.checkValidity()?['請輸入有效的 '+input.previousElementSibling.textContent]:E.validate({...g,[key]:value});
  if(errors.length){input.setCustomValidity(errors.join('；'));input.setAttribute('aria-invalid','true');q('floating-error').textContent=errors.join('；');return;}
  input.setCustomValidity('');input.removeAttribute('aria-invalid');q('floating-error').textContent='';
  if(Object.is(g[key],value))return;if(!updateParameter(key,value,false)){input.setAttribute('aria-invalid','true');q('floating-error').textContent=notice;}
 });
}
q('floating').addEventListener('focusout',()=>requestAnimationFrame(()=>{syncFloating();positionFloating();}));
new ResizeObserver(()=>positionFloating()).observe(q('floating'));
function pointInPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function hitGearAt(x,y){
 const all=poses(),ordered=state.view==='3d'?all.slice().sort((a,b)=>projected([a.x,a.y,a.z])[1]-projected([b.x,b.y,b.z])[1]):all.slice().sort((a,b)=>(a.type==='internal'?-1:0)-(b.type==='internal'?-1:0));
 for(const p of ordered.reverse()){
  if(E.validate(p).length)continue;const shape=geom(p),z=state.view==='3d'?p.width:0,twist=state.view==='3d'?shape.d.twist:0,outer=shape.previewOuter.map(v=>screen(world(p,E.rot(v,twist),z)));
  if(pointInPolygon(x,y,outer)){if(p.type!=='internal'||!pointInPolygon(x,y,shape.previewInner.map(v=>screen(world(p,v,z)))))return p;}
  if(state.view==='3d')for(let i=0;i<shape.previewOuter.length;i++){const j=(i+1)%shape.previewOuter.length,a=shape.previewOuter[i],b=shape.previewOuter[j];if(pointInPolygon(x,y,[screen(world(p,a)),screen(world(p,b)),outer[j],outer[i]]))return p;}
 }
 return null;
}
let drag=null;
canvas.onpointerdown=e=>{
 if(!fit||e.button!==0)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,hit=hitGearAt(x,y);
 if(state.view==='3d'){drag={kind:'camera',x,y,yaw:camera.yaw,tilt:camera.tilt,hit:hit?.id,moved:false};positionFloating();canvas.setPointerCapture(e.pointerId);return;}
 if(!hit){closeFloating();return;}
 stop();state.selected=hit.id;floatingOpen=true;const g=selected();drag={kind:'gear',x,y,gx:g.x,gy:g.y,elapsed,moved:false};refresh(false);canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove=e=>{
 if(!drag)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(!drag.moved&&Math.hypot(x-drag.x,y-drag.y)<4)return;
 if(drag.kind==='camera'){drag.moved=true;camera.yaw=drag.yaw+(x-drag.x)/180;camera.tilt=Math.max(.2,Math.min(1.35,drag.tilt+(y-drag.y)/220));fitScene();draw();}
 else{if(!drag.moved){beginEdit();drag.moved=true;}selected().x=Number((drag.gx+(x-drag.x)/fit.s).toFixed(2));selected().y=Number((drag.gy-(y-drag.y)/fit.s).toFixed(2));snapPreview=autoSnap?snapCandidate():null;refresh(false);}
};
canvas.onpointerup=e=>{
 if(!drag)return;const d=drag;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 if(d.kind==='camera'&&!d.moved){if(d.hit){stop();state.selected=d.hit;floatingOpen=true;}else closeFloating();}
 if(d.kind==='gear'&&d.moved)applySnap();snapPreview=null;refresh(false);persist();
};
canvas.onpointercancel=()=>{const d=drag;drag=null;snapPreview=null;if(d?.kind==='gear'&&d.moved&&history.length){state=history.pop();elapsed=d.elapsed;}refresh(false);persist();};
canvas.onlostpointercapture=()=>{if(drag)canvas.onpointercancel();};
function snapCandidate(){return E.snapMesh(state.gears,state.links,state.selected,state.driver,state.speed,Math.max(selected().m*1.5,fit?12/fit.s:0));}
function applySnap(){
 if(!autoSnap)return false;
 const result=snapCandidate();
 if(!result){notice='未吸附：需接近相容齒輪的節圓；既有連動、固定條件與 Z 重疊須有效。';return false;}
 state.gears=result.gears;state.links=result.links;state.autoPhase=true;
 notice='已吸附至 '+state.gears.find(g=>g.id===result.anchorId).name+'，並建立連動（可復原）';return true;
}
q('snap').checked=autoSnap;
q('snap').onchange=()=>{snapPreview=null;autoSnap=q('snap').checked;try{localStorage.setItem('gear-workbench-snap',String(autoSnap));}catch{}notice=autoSnap?'自動吸附已開啟：2D 拖近齒輪後放開即可對位。':'自動吸附已關閉';refresh(false);};
function setLevel(value){
 level=value;root.dataset.level=level;q('basic').setAttribute('aria-pressed',level==='basic');q('expert').setAttribute('aria-pressed',level==='expert');
 try{localStorage.setItem('gear-workbench-level',level);}catch{}
 if(level==='basic'){root.querySelector('[data-fold=geometry]').open=true;root.querySelector('[data-fold=scene]').open=true;root.querySelector('[data-fold=outputs]').open=true;}
 requestAnimationFrame(resize);
}
q('basic').onclick=()=>setLevel('basic');q('expert').onclick=()=>setLevel('expert');

function syncMountPanel(){
 const m=mountInfo;for(const k of Object.keys(M.defaults)){const input=q('mount-'+k);if(!input)continue;if(k==='enabled')input.checked=state.mount.enabled;else {input.value=state.mount[k];input.disabled=!state.mount.enabled&&!['backlash','shaftClearance'].includes(k);}}
 q('mount-summary').textContent=state.mount.enabled?(m.errors.length?'設定需調整':m.width+'×'+m.height+' mm'):'可拔插洞洞板';
 const info=m.errors.length?m.errors.join('；'):`${m.width} × ${m.height} × ${m.settings.thickness} mm · ${m.holes.length} 孔 · ${m.pins.length} 支桿；${m.pins.filter(p=>p.aligned).length} 支已對孔。`+(m.warnings.length?' '+m.warnings.join('；'):'')+(m.pins.length?` 桿徑依各輪軸孔自動縮小 ${m.settings.shaftClearance} mm。`:'');
 q('mount-info').textContent=state.mount.enabled?info:'開啟後會預覽底盤與支撐桿。';q('mount-info').dataset.error=!!(m.errors.length||m.unmounted.length);
 q('mount-grid').disabled=!state.mount.enabled||!!m.errors.length||!m.unmounted.length;
 q('mount-copy-pins').checked=includeMountPins;q('mount-copy-pins').disabled=!state.mount.enabled||!q('copy-board').checked;

}
for(const k of Object.keys(M.defaults))q('mount-'+k).onchange=()=>{const next={...state.mount,[k]:k==='enabled'?q('mount-enabled').checked:Number(q('mount-'+k).value)};const errors=M.build(state.gears,next).errors;const gearErrors=state.gears.flatMap(g=>E.validate({...g,backlash:next.backlash/2}));if(errors.length||gearErrors.length){notice=[...errors,...gearErrors].join('；');refresh(false);return;}beginEdit();state.mount=next;finishEdit(true);};
q('mount-grid').onclick=()=>{
 const candidate=clone(state.gears);for(const g of candidate){if(!mountInfo.pins.some(p=>p.id===g.id))continue;g.x=Math.round(g.x/state.mount.pitch)*state.mount.pitch;g.y=Math.round(g.y/state.mount.pitch)*state.mount.pitch;}
 const checked=E.solve(candidate,state.links,state.driver,state.speed,state.autoPhase);
 if(checked.errors.length){q('mount-info').textContent='孔位對齊會破壞連動，已保留原位置。請調整孔距：'+checked.errors.join('；');return;}
 beginEdit();state.gears=candidate;notice='輪心已對齊洞洞板孔位；可用復原配置撤銷。';finishEdit(true);
};
q('mount-copy-pins').onchange=()=>{includeMountPins=q('mount-copy-pins').checked;try{localStorage.setItem('gear-workbench-mount-copy-pins',String(includeMountPins));}catch{}refresh(false);};
q('copy-board').onchange=()=>refresh(false);


function drawMount(){
 const m=mountInfo;if(!state.mount?.enabled||!m||m.errors.length)return;
 const polygon=(verts,fill,stroke)=>{ctx.beginPath();verts.forEach((v,i)=>{const p=screen(v);i?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
 const circle=(x,y,r,z,fill,stroke)=>polygon(Array.from({length:24},(_,i)=>[x+r*Math.cos(E.TAU*i/24),y+r*Math.sin(E.TAU*i/24),z]),fill,stroke);
 const corners=[[m.x0,m.y0],[m.x1,m.y0],[m.x1,m.y1],[m.x0,m.y1]];ctx.save();ctx.lineWidth=.6;
 if(state.view==='3d')for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];polygon([[...a,m.bottom],[...b,m.bottom],[...b,m.top],[...a,m.top]],colors.mountSide,colors.rule);}
 polygon(corners.map(v=>[...v,m.top]),colors.mount,colors.rule);
 for(const h of m.holes){circle(h.x,h.y,m.recessDiameter/2,m.top,colors.mountSide,colors.rule);circle(h.x,h.y,m.hole/2,state.view==='3d'?m.top-m.settings.recess:m.top,colors.paper,colors.rule);}
 for(const p of m.pins){if(!p.aligned)continue;const profile=M.pinProfile(p,m).filter(([,z])=>z>=m.top-1e-7);if(state.view==='3d')for(let l=0;l<profile.length-1;l++){const [r,z]=profile[l],[R,Z]=profile[l+1];for(let i=0;i<16;i++){const a=E.TAU*i/16,b=E.TAU*(i+1)/16;polygon([[p.x+r*Math.cos(a),p.y+r*Math.sin(a),z],[p.x+r*Math.cos(b),p.y+r*Math.sin(b),z],[p.x+R*Math.cos(b),p.y+R*Math.sin(b),Z],[p.x+R*Math.cos(a),p.y+R*Math.sin(a),Z]],colors.side,null);}}
 circle(p.x,p.y,p.shaft/2,state.view==='3d'?profile.at(-1)[1]:m.top,colors.side,colors.muted);}
 for(const p of m.unmounted){const r=3;ctx.strokeStyle=colors.warning;ctx.lineWidth=2;ctx.beginPath();const a=screen([p.x-r,p.y-r,m.top]),b=screen([p.x+r,p.y+r,m.top]),c=screen([p.x-r,p.y+r,m.top]),d=screen([p.x+r,p.y-r,m.top]);ctx.moveTo(...a);ctx.lineTo(...b);ctx.moveTo(...c);ctx.lineTo(...d);ctx.stroke();}ctx.restore();
}
function drawPinTips(){
 const m=mountInfo;if(state.view!=='3d'||!state.mount?.enabled||!m||m.errors.length)return;
 const polygon=points=>{ctx.beginPath();points.forEach((p,i)=>{const v=screen(p);i?ctx.lineTo(...v):ctx.moveTo(...v)});ctx.closePath();ctx.fill();};
 ctx.save();ctx.fillStyle=colors.side;ctx.strokeStyle=colors.muted;ctx.lineWidth=.7;
 for(const p of m.pins){if(!p.aligned)continue;const z0=p.z+p.width,z1=z0+1.1,z2=z0+1.5,r=p.shaft/2,R=Math.max(.5,r-.4);
  for(let i=0;i<24;i++){const a=E.TAU*i/24,b=E.TAU*(i+1)/24;polygon([[p.x+r*Math.cos(a),p.y+r*Math.sin(a),z0],[p.x+r*Math.cos(b),p.y+r*Math.sin(b),z0],[p.x+r*Math.cos(b),p.y+r*Math.sin(b),z1],[p.x+r*Math.cos(a),p.y+r*Math.sin(a),z1]]);polygon([[p.x+r*Math.cos(a),p.y+r*Math.sin(a),z1],[p.x+r*Math.cos(b),p.y+r*Math.sin(b),z1],[p.x+R*Math.cos(b),p.y+R*Math.sin(b),z2],[p.x+R*Math.cos(a),p.y+R*Math.sin(a),z2]]);}
  polygon(Array.from({length:24},(_,i)=>[p.x+R*Math.cos(E.TAU*i/24),p.y+R*Math.sin(E.TAU*i/24),z2]));ctx.stroke();
 }ctx.restore();
}
function setupPanels(){
  const panels=[...root.querySelectorAll('details[data-fold]')],key='gear-workbench-panels-v1';let saved={};
  try{const v=JSON.parse(localStorage.getItem(key)||'{}');if(v&&typeof v==='object'&&!Array.isArray(v))saved=v;}catch{}
  const small=window.matchMedia('(max-width:740px)').matches;
  for(const panel of panels){const id=panel.dataset.fold;if(typeof saved[id]==='boolean')panel.open=saved[id];else if(small&&(id==='geometry'||id==='scene'))panel.open=false;}
  function update(){const any=panels.some(p=>p.open);q('fold-all').textContent=any?'收合設定':'展開設定';q('fold-all').setAttribute('aria-label',any?'收合所有設定區塊':'展開所有設定區塊');}
  function save(){try{localStorage.setItem(key,JSON.stringify(Object.fromEntries(panels.map(p=>[p.dataset.fold,p.open]))));}catch{}update();}
  for(const panel of panels)panel.addEventListener('toggle',save);
  q('fold-all').onclick=()=>{const expand=!panels.some(p=>p.open);for(const panel of panels)panel.open=expand;save();};update();
}
setupPanels();setLevel(level);
new ResizeObserver(resize).observe(canvas);theme();refresh(true);resize();window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{theme();draw();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){stop();persist();}});
root.labTest={E,X,getState:()=>clone(state),getSolution:()=>solution,getElapsed:()=>elapsed,load:s=>{stop();snapPreview=null;floatingOpen=false;state=clone(s);elapsed=0;refresh(true);},presets:preset,poses:()=>poses(),M,getMount:()=>mountInfo,isPlaying:()=>playing,getSnapPreview:()=>snapPreview?clone(snapPreview):null,screenPoint:(id,xy=[0,0])=>{const p=poses().find(p=>p.id===id);return screen(world(p,E.rot(xy,state.view==='3d'?E.dims(p).twist:0),state.view==='3d'?p.width:0));}};
})();
