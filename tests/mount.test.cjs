const {test}=require('node:test'),assert=require('node:assert/strict');
require('../assets/engine.js');require('../assets/mount.js');
const E=globalThis.GearEngine,M=globalThis.GearMount;
const gear=(id,over={})=>({id,name:id,type:'spur',m:2,teeth:20,alpha:20,width:10,bore:8,beta:20,wall:6,base:6,x:0,y:0,z:0,yaw:0,phase:0,fixed:false,...over});
function inspect(tris){
 const edges=new Map(),vertices=new Set();let volume=0,minZ=Infinity;
 const key=v=>v.map(n=>Math.round(n*1e6)).join(',');
 for(const [a,b,c]of tris){const v=[a,b,c];volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 for(let i=0;i<3;i++){const x=key(v[i]),y=key(v[(i+1)%3]);vertices.add(x);minZ=Math.min(minZ,v[i][2]);assert.notEqual(x,y,'degenerate edge');const k=[x,y].sort().join('|'),e=edges.get(k)||{count:0,direction:0};e.count++;e.direction+=x<y?1:-1;edges.set(k,e);}}
 for(const [k,e]of edges){assert.equal(e.count,2,'non-manifold '+k);assert.equal(e.direction,0,'inconsistent normal '+k);}assert.ok(volume>0);return {volume,minZ,euler:vertices.size-edges.size+tris.length};
}
test('recessed pegboard is one closed orientable solid with every hole open',()=>{
 const m=M.build([gear('a')],{enabled:true}),tris=M.boardTriangles(m),result=inspect(tris);
 assert.deepEqual(m.errors,[]);assert.equal(m.holes.length,49);assert.equal(result.euler,2-2*m.holes.length);assert.equal(result.minZ,0);
 const s=m.settings,r=m.hole/2,R=m.recessDiameter/2,areaFactor=32*Math.sin(E.TAU/32)/2;
 const expected=m.width*m.height*s.thickness-m.holes.length*areaFactor*(r*r*(s.thickness-s.recess)+s.recess/3*(R*R+R*r+r*r));
 assert.ok(Math.abs(result.volume-expected)<1e-6*expected);
 const stl=M.makeSTL(m);assert.equal(new DataView(stl.buffer).getUint32(80,true),tris.length);assert.equal(stl.length,84+50*tris.length);
});
test('removable pegs are closed, separately laid out, with the specified physical clearances',()=>{
 const m=M.build([gear('a',{x:-60}),gear('b',{teeth:40}),gear('c',{x:60,width:29,bore:6})],{enabled:true});
 assert.equal(m.pins.length,3);assert.equal(m.unmounted.length,0);const result=inspect(M.pinsTriangles(m));assert.equal(result.euler,6);assert.equal(result.minZ,0);
 for(const p of m.pins){const profile=M.pinProfile(p,m);assert.ok(Math.abs(profile[0][1]-m.bottom-.3)<1e-8);assert.ok(p.shaft>0);assert.ok(Math.abs(p.shaft+m.settings.clearance-(p.id==='c'?6:8))<1e-8);assert.equal(profile.at(-1)[1],p.z+p.width+1.5);}
 assert.ok(Math.abs(m.hole-m.settings.plug-m.settings.clearance)<1e-8);
});
test('off-grid centers remain unchanged and cannot generate misleading peg prints',()=>{
 const gears=[gear('a'),gear('b',{x:41})],before=JSON.stringify(gears),m=M.build(gears,{enabled:true});
 assert.equal(m.unmounted.length,1);assert.equal(m.unmounted[0].offset,1);assert.equal(JSON.stringify(gears),before);assert.throws(()=>M.makeSTL(m,'pins'),/未對孔位/);assert.ok(M.makeSTL(m).length>84);
});
test('mount rejects excessive holes, overlapping collars and invalid dimensions',()=>{
 for(const change of [{pitch:2},{clearance:NaN},{thickness:3,recess:3},{plug:12,pitch:10},{pitch:10,margin:100}])assert.ok(M.build([gear('a')],change).errors.length);
 assert.ok(M.build([gear('a'),gear('b')]).errors.some(e=>e.includes('重疊')));
 assert.ok(M.build([gear('a',{teeth:100,m:10,bore:10})]).errors.length);
});
test('unsupported gear fixtures are explicit; no misleading rods are generated',()=>{
 for(const over of [{type:'rack',bore:0},{type:'internal',teeth:60,bore:0},{bore:0}]){const m=M.build([gear('a',over)]);assert.equal(m.pins.length,0);assert.ok(m.warnings.length);assert.throws(()=>M.makeSTL(m,'pins'),/沒有可列印/);}
});

require('../assets/exports.js');
const X=globalThis.GearExports;
const readCopy=macro=>JSON.parse(JSON.parse(macro.match(/data = json.loads\(u(.+)\)/)[1]));
test('mount clipboard preserves recessed board and removable posts in assembly coordinates',()=>{
 const gears=[gear('a',{x:-60,z:7}),gear('b',{teeth:40,z:7}),gear('c',{x:60,z:7,bore:6,width:29})],m=M.build(gears,{enabled:true});
 const macro=X.rhinoMountMacro(m),data=readCopy(macro);assert.equal(data.length,4);
 const b=data[0];assert.equal(b.kind,'board');assert.equal(b.holes.length,m.holes.length);assert.equal(b.x0,m.x0);assert.equal(b.x1,m.x1);assert.equal(b.top,3);assert.equal(b.bottom,-3);assert.equal(b.hole,m.hole);assert.equal(b.recessDiameter,m.recessDiameter);
 assert.deepEqual(b.holes,m.holes.map(h=>[h.x,h.y]));
 for(let i=0;i<3;i++){const p=data[i+1];assert.equal(p.kind,'pin');assert.deepEqual(p.center,[gears[i].x,gears[i].y]);assert.deepEqual(p.profile,M.pinProfile(m.pins[i],m));assert.ok(Math.abs(p.profile[0][1]-m.bottom-.3)<1e-8);}
 assert.ok(macro.startsWith('! _-RunPythonScript ('));
 assert.ok(macro.includes('Brep.CreateFromLoft'));assert.ok(macro.includes('Brep.CreateFromRevSurface'));assert.ok(!macro.includes('_-SelLayer'));
});
test('board-only copy stays available off-grid while post copy requires alignment',()=>{
 const m=M.build([gear('a'),gear('b',{x:41})],{enabled:true});
 assert.equal(m.unmounted.length,1);assert.throws(()=>X.rhinoMountMacro(m,true),/輪心未對孔位/);
 const data=readCopy(X.rhinoMountMacro(m,false));assert.equal(data.length,1);assert.equal(data[0].kind,'board');
});
test('mount copy rejects disabled or invalid boards before writing a command',()=>{
 assert.throws(()=>X.rhinoMountMacro(M.build([gear('a')])),/開啟/);
 assert.throws(()=>X.rhinoMountMacro(M.build([gear('a')],{enabled:true,pitch:2})),/超出範圍/);
});

test('independent A1 fits preserve older saved plug clearance without coupling new settings',()=>{
 const old=M.normalize({clearance:.4});assert.equal(old.shaftClearance,.4);
 const m=M.build([gear('a')],{enabled:true,clearance:.25,shaftClearance:.45,backlash:.2});
 assert.deepEqual(m.errors,[]);assert.ok(Math.abs(m.hole-6-.25)<1e-9);assert.ok(Math.abs(m.pins[0].shaft-8+.45)<1e-9);
});
test('unified copy contains all compensated gears, board and posts in one atomic command',()=>{
 const gears=[gear('a',{x:-60,rotation:0,backlash:.1}),gear('b',{teeth:40,rotation:0,backlash:.1}),gear('c',{x:60,rotation:0,backlash:.1})],m=M.build(gears,{enabled:true});
 const macro=X.rhinoAssemblyMacro(gears,m),data=readCopy(macro);assert.equal(data.length,7);assert.equal(data.filter(p=>p.kind==='board').length,1);assert.equal(data.filter(p=>p.kind==='pin').length,3);assert.equal((macro.match(/def gear_workbench_paste/g)||[]).length,1);
 assert.deepEqual(data.slice(0,3),readCopy(X.rhinoMacro(gears)));assert.equal(readCopy(X.rhinoAssemblyMacro(gears,null)).length,3);assert.equal(readCopy(X.rhinoAssemblyMacro(gears,m,false)).length,4);
 const off=M.build([gear('a',{x:1})],{enabled:true});assert.throws(()=>X.rhinoAssemblyMacro(gears,off),/輪心/);
});
test('backlash removes gear material for every type without changing pitch dimensions',()=>{
 for(const type of ['spur','helical','internal','rack']){
 const a=gear('a',{type,teeth:type==='internal'?60:20}),b={...a,backlash:.1};assert.deepEqual(E.validate(b),[]);assert.deepEqual(E.dims(a),E.dims(b));
 const area=g=>Math.abs(E.rawProfile(g).reduce((s,p,i,pts)=>{const q=pts[(i+1)%pts.length];return s+p[0]*q[1]-p[1]*q[0]},0)/2);
 assert.ok(type==='internal'?area(b)>area(a):area(b)<area(a),type+' material removal');
 const g=E.geometry(b);assert.ok(g.outer);assert.ok(X.makeSTL([{...b,rotation:0}]).length>84);assert.ok(X.makeSTEP([{...b,rotation:0}]).includes('MANIFOLD_SOLID_BREP'));
 }
 assert.ok(E.validate({...gear('a'),backlash:NaN}).length);assert.ok(E.validate({...gear('a'),m:.3,bore:0,backlash:.2}).length);
});
