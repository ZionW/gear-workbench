const {test}=require('node:test'),assert=require('node:assert/strict');require('../assets/engine.js');require('../assets/exports.js');const E=globalThis.GearEngine,X=globalThis.GearExports;
const g=(id,patch={})=>({id,name:id,type:'spur',m:2,teeth:20,alpha:20,width:10,bore:8,beta:20,wall:6,base:6,x:0,y:0,z:0,yaw:0,phase:0,rotation:0,fixed:false,recessDepth:0,rimWall:2,hubWall:2,...patch});
const links=[{a:'a',b:'b',kind:'mesh'},{a:'b',b:'c',kind:'mesh'}];
test('parameter changes atomically reflow a connected train with compatible modules',()=>{
 const before=[g('a',{x:-60}),g('b',{teeth:40}),g('c',{x:60})],snapshot=JSON.stringify(before);
 const n=E.reconfigure(before,links,'a',{teeth:30},'a',30);assert.equal(n[0].x,-60);assert.equal(n[1].x,10);assert.equal(n[2].x,70);assert.deepEqual(E.solve(n,links,'a',30).errors,[]);
 const m=E.reconfigure(before,links,'b',{m:3},'a',30);assert(m.every(g=>g.m===3));assert.equal(m[1].x,0);assert.equal(m[0].x,-90);assert.equal(m[2].x,90);assert.equal(JSON.stringify(before),snapshot);
});
test('reflow handles internal gears, helical hands, racks and compound shaft thickness',()=>{
 for(const [a,b,patch] of [[g('a',{x:40}),g('b',{type:'internal',teeth:60}),{teeth:24}],[g('a',{type:'helical'}),g('b',{type:'helical',beta:-20,x:40/Math.cos(E.rad(20))}),{beta:30}],[g('a'),g('b',{type:'rack',y:-20,bore:0}),{teeth:30}]]){const l=[{a:'a',b:'b',kind:'mesh'}],n=E.reconfigure([a,b],l,'a',patch,'a',30);assert.deepEqual(E.solve(n,l,'a',30).errors,[]);}
 const a=g('a'),b=g('b',{z:12,teeth:40}),n=E.reconfigure([a,b],[{a:'a',b:'b',kind:'shaft'}],'a',{width:20},'a',30);assert.equal(n[1].z,22);
});
test('impossible dimensions and locked cycles are rejected without changing inputs',()=>{
 const a=[g('a'),g('b',{x:40}),g('c',{x:20,y:20*Math.sqrt(3)})],s=JSON.stringify(a);assert.throws(()=>E.reconfigure(a,[...links,{a:'c',b:'a',kind:'mesh'}],'a',{teeth:30},'a',30));assert.equal(JSON.stringify(a),s);
 assert.throws(()=>E.reconfigure([g('a')],[],'a',{width:1,recessDepth:1},'a',30),/底厚/);
});
function meshInfo(bytes){const v=new DataView(bytes.buffer),edges=new Map();let volume=0;const key=p=>p.map(n=>Math.round(n*1e5)).join(',');for(let i=0;i<v.getUint32(80,true);i++){const p=[0,1,2].map(j=>[0,1,2].map(k=>v.getFloat32(84+50*i+12+12*j+4*k,true))),[a,b,c]=p;volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;for(let j=0;j<3;j++){const a=key(p[j]),b=key(p[(j+1)%3]),k=[a,b].sort().join('|'),e=edges.get(k)||[0,0];assert.notEqual(a,b);e[0]++;e[1]+=a<b?1:-1;edges.set(k,e);}}for(const e of edges.values())assert.deepEqual(e,[2,0]);assert.ok(volume>0);return volume;}
for(const type of ['spur','helical'])for(const bore of [0,8])test(`${type} bore ${bore}: annular recess stays manifold and removes the expected material`,()=>{
 const a=g('a',{type,bore}),b={...a,recessDepth:6},pocket=E.pocket(b);assert.deepEqual(E.validate(b),[]);const full=meshInfo(X.makeSTL([a])),cut=meshInfo(X.makeSTL([b])),expected=Math.PI*(pocket.outer**2-pocket.inner**2)*6;assert.ok(Math.abs(full-cut-expected)<expected*.002);assert.equal(pocket.floor,4);assert.ok(X.makeSTEP([b]).includes('MANIFOLD_SOLID_BREP'));const macro=X.rhinoMacro([b]);assert.ok(macro.includes('CreateBooleanDifference'));assert.ok(macro.includes('pocket'));
});
