const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../assets/engine.js');
require('../assets/exports.js');
const E = globalThis.GearEngine;
const X = globalThis.GearExports;
const gear = (id, changes = {}) => ({ id, name: id, type: 'spur', m: 2, teeth: 20, alpha: 20, width: 10, bore: 8, wall: 6, base: 6, beta: 20, x: 0, y: 0, z: 0, yaw: 0, phase: 0, rotation: 0, fixed: false, ...changes });
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('custom module decimals preserve the pitch diameter', () => {
  for (const m of [0.5, 1.25, 1.5, 2.5, 1.2345]) {
    const g = gear('a', { m, bore: 0 });
    close(2 * E.dims(g).r, m * g.teeth);
    assert.equal(E.validate(g).length, 0);
  }
  const h = gear('h', { type: 'helical', m: 1.25 });
  close(2 * E.dims(h).r, h.m * h.teeth / Math.cos(E.rad(h.beta)));
});

test('spur train reverses direction and preserves tooth ratios', () => {
  const a = gear('a'), b = gear('b', { x: 60, teeth: 40 }), c = gear('c', { x: 120 });
  const s = E.solve([a, b, c], [{ a: 'a', b: 'b', kind: 'mesh' }, { a: 'b', b: 'c', kind: 'mesh' }], 'a', 30);
  assert.deepEqual(s.errors, []);
  close(s.rates.b, -s.rates.a / 2);
  close(s.rates.c, s.rates.a);
});

test('internal mesh, rigid shaft and finite rack motion', () => {
  const a = gear('a', { x: 40 }), ring = gear('ring', { type: 'internal', teeth: 60 });
  const s = E.solve([a, ring], [{ a: 'a', b: 'ring', kind: 'mesh' }], 'a', 30);
  assert.deepEqual(s.errors, []);
  close(s.rates.ring, s.rates.a / 3);
  const pin = gear('pin'), rack = gear('rack', { type: 'rack', y: -20, teeth: 20 });
  const links = [{ a: 'pin', b: 'rack', kind: 'mesh' }];
  const t = E.solve([pin, rack], links, 'pin', 30);
  assert.deepEqual(t.errors, []);
  close(t.rates.rack, t.rates.pin * 20);
  assert.ok(E.rackEngaged([pin, rack], links, t, 0));
  assert.ok(!E.rackEngaged([pin, rack], links, t, 20));
  const shaft = gear('shaft', { z: 15, teeth: 60 });
  const u = E.solve([pin, shaft], [{ a: 'pin', b: 'shaft', kind: 'shaft' }], 'pin', 30);
  assert.deepEqual(u.errors, []);
  close(u.rates.pin, u.rates.shaft);
});

test('impossible motion and mismatched helical hands are rejected', () => {
  const a = gear('a'), b = gear('b', { x: 40 }), c = gear('c', { x: 20, y: 20 * Math.sqrt(3) });
  const s = E.solve([a, b, c], [{ a: 'a', b: 'b', kind: 'mesh' }, { a: 'b', b: 'c', kind: 'mesh' }, { a: 'c', b: 'a', kind: 'mesh' }], 'a', 30);
  assert.ok(s.errors.some(e => e.includes('鎖死')));
  assert.ok(E.match(gear('h1', { type: 'helical' }), gear('h2', { type: 'helical' })).length);
  b.fixed = true;
  assert.ok(E.solve([a, b], [{ a: 'a', b: 'b', kind: 'mesh' }], 'a', 30).errors.some(e => e.includes('固定')));
});

for (const type of ['spur', 'helical', 'internal', 'rack']) {
  test(`${type}: compensated STL closes, STEP contains a solid and DXF declares mm`, () => {
    const g = gear('part', { type, backlash: .1, teeth: type === 'internal' ? 60 : type === 'rack' ? 12 : 20 });
    const bytes = X.makeSTL([g]), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    assert.equal(bytes.length, 84 + 50 * count);
    const edges = new Map(); let volume = 0;
    const key = p => p.map(v => Math.abs(v) < 1e-6 ? '0.000000' : v.toFixed(6)).join(',');
    for (let i = 0; i < count; i++) {
      const offset = 84 + 50 * i + 12;
      const points = [0, 1, 2].map(j => [0, 1, 2].map(k => view.getFloat32(offset + j * 12 + k * 4, true)));
      const [a, b, c] = points;
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const id = [key(u), key(v)].sort().join('|'); edges.set(id, (edges.get(id) || 0) + 1);
      }
    }
    assert.ok(volume > 0);
    assert.ok([...edges.values()].every(n => n === 2));
    const step = X.makeSTEP([g]);
    assert.ok(step.startsWith('ISO-10303-21;'));
    assert.equal((step.match(/ADVANCED_FACE\(/g) || []).length, type === 'rack' ? 3 : 4);
    assert.ok(step.includes('MANIFOLD_SOLID_BREP'));
    const ids = new Set([...step.matchAll(/^#(\d+) =/gm)].map(m => m[1]));
    for (const ref of step.matchAll(/#(\d+)/g)) assert.ok(ids.has(ref[1]));
    assert.ok(X.makeDXF([g]).includes('$INSUNITS\n70\n4'));
  });
}

test('Rhino clipboard preserves exact profiles and poses in one self-contained command', () => {
  const poses = ['spur','helical','internal','rack'].map((type,i)=>gear('p'+i,{type,name:'齒輪 '+i,teeth:type==='internal'?60:type==='rack'?12:20,x:i*150,y:-7,z:13,width:29,rotation:.37}));
  const macro=X.rhinoMacro(poses);
  assert.ok(macro.startsWith('! _-RunPythonScript (\n'));
  const literal=macro.match(/data = json.loads\(u(.+)\)/)[1];
  const payload=JSON.parse(JSON.parse(literal));
  assert.equal(payload.length,poses.length);
  for(let i=0;i<poses.length;i++){
    const p=poses[i],part=payload[i],shape=E.geometry(p);
    assert.equal(part.name,p.name);assert.deepEqual(part.center,[p.x,p.y,p.z]);assert.equal(part.width,29);close(part.twist,shape.d.twist);
    for(const [j,c]of [shape.outer,shape.inner].filter(Boolean).entries()){
      const loop=part.loops[j];
      if(c.kind==='circle'){assert.equal(loop.radius,c.r);assert.deepEqual(loop.center,[p.x,p.y,p.z]);}
      else{assert.equal(loop.poles.length,3*c.n+1);assert.deepEqual(loop.poles[0],loop.poles.at(-1));for(const k of [0,1,c.poles.length-1]){const xy=E.rot(c.poles[k],p.rotation);close(loop.poles[k][0],xy[0]+p.x);close(loop.poles[k][1],xy[1]+p.y);close(loop.poles[k][2],p.z);}}
    }
  }
  assert.ok(!/_-SelLayer|_SelLast|_What\b|_Check\b|RunScript\(|open\(/.test(macro));
  assert.ok(macro.indexOf('CapPlanarHoles')<macro.indexOf('not solid.IsValid or not solid.IsSolid'));
  assert.ok(macro.indexOf('not solid.IsValid or not solid.IsSolid')<macro.indexOf('doc.Objects.AddBrep'));
  assert.ok(macro.includes('System.Guid.NewGuid()'));
  assert.ok(macro.includes('doc.Objects.Delete(object_id, True)'));
  assert.ok(macro.includes('Rhino.RhinoMath.UnitScale'));
});

test('Rhino copy treats user names as JSON data, not executable code',()=>{
  const name='齒輪 \" )\n__import__("os").system("example")\n(';
  const macro=X.rhinoMacro([gear('safe',{name})]);
  const literal=macro.match(/data = json.loads\(u(.+)\)/)[1];
  assert.equal(JSON.parse(JSON.parse(literal))[0].name,name);
  assert.equal(macro.split('\n').filter(l=>l.startsWith('__import__')).length,0);
});

test('nearby compatible gears snap to pitch distance without mutating input', () => {
 const a=gear('a'),b=gear('b',{x:43});const original=JSON.stringify([a,b]);
 const s=E.snapMesh([a,b],[],'b','a',30,4);
 assert.ok(s);close(s.gears[1].x,40);assert.equal(s.links.length,1);
 close(E.solve(s.gears,s.links,'a',30).rates.b,-Math.PI);
 assert.equal(JSON.stringify([a,b]),original);
 assert.equal(E.snapMesh([a,gear('b',{x:50})],[],'b','a',30,4),null);
 for(const change of [{m:3},{alpha:25},{z:20},{fixed:true}])assert.equal(E.snapMesh([a,gear('b',{x:42,...change})],[],'b','a',30,4),null);
});

test('snap handles internal, helical and rack meshes, preserving rack position along teeth', () => {
 const cases=[
  [gear('a',{type:'internal',teeth:60}),gear('b',{x:42})],
  [gear('a',{type:'helical',beta:20}),gear('b',{type:'helical',beta:-20,x:44})],
  [gear('a',{type:'rack',bore:0}),gear('b',{x:15,y:22})],
  [gear('a'),gear('b',{type:'rack',bore:0,x:15,y:-22})]
 ];
 for(const gears of cases){const s=E.snapMesh(gears,[],'b','a',30,4);assert.ok(s);assert.deepEqual(E.relation(...s.gears).errors,[]);if(gears[1].type==='rack')close(s.gears[1].x,15);}
 assert.equal(E.snapMesh([gear('a',{type:'rack',bore:0}),gear('b',{x:200,y:22})],[],'b','a',30,4),null);
 assert.equal(E.snapMesh([gear('a',{type:'helical'}),gear('b',{type:'helical',x:44})],[],'b','a',30,4),null);
});

test('snap preserves other constraints, avoids duplicate links and refuses locked loops', () => {
 const a=gear('a'),b=gear('b',{x:42}),link={id:'ab',a:'a',b:'b',kind:'mesh'};
 const s=E.snapMesh([a,b],[link],'b','a',30,4);assert.ok(s);assert.equal(s.links.length,1);
 assert.equal(E.snapMesh([a,b],[{...link,kind:'shaft'}],'b','a',30,4),null);
 assert.equal(E.snapMesh([gear('a',{fixed:true}),b],[],'b','a',30,4),null);
 const c=gear('c',{x:20,y:Math.sqrt(1200)}),loop=[link,{id:'ac',a:'a',b:'c',kind:'mesh'}];
 assert.equal(E.snapMesh([a,gear('b',{x:40}),c],loop,'c','a',30,0.01)?.links.length,2);
 // Adding the third edge of an external three-gear loop would reverse the same gear twice.
 const closed=[...loop,{id:'bc',a:'b',b:'c',kind:'mesh'}];
 assert.equal(E.snapMesh([a,gear('b',{x:40}),c],closed,'c','a',30,1),null);
});

test('pegboard snap finds a hole position that also meshes instead of rounding a radial snap',()=>{const a=gear('a'),b=gear('b',{x:38,y:5}),before=JSON.stringify([a,b]),s=E.snapMesh([a,b],[],'b','a',30,6,{pitch:10,ids:['a','b']});assert(s);assert.equal(s.gridAligned,true);for(const g of s.gears){close(g.x/10,Math.round(g.x/10));close(g.y/10,Math.round(g.y/10));}assert.deepEqual(E.solve(s.gears,s.links,'a',30).errors,[]);assert.equal(JSON.stringify([a,b]),before);});
test('pegboard snap can align an unfixed anchor but preserves fixed anchors and incompatible hole pitches',()=>{const a=gear('a',{x:1,y:1}),b=gear('b',{x:41,y:2});const s=E.snapMesh([a,b],[],'b','a',30,4,{pitch:10});assert(s);close(s.gears[0].x,0);close(s.gears[0].y,0);assert.equal(E.snapMesh([{...a,fixed:true},b],[],'b','a',30,4,{pitch:10}),null);assert.equal(E.snapMesh([gear('a'),gear('b',{x:40})],[],'b','a',30,6,{pitch:13}),null);});
test('pegboard snap rejects a correction that would break existing connections',()=>{const a=gear('a',{x:1,y:1}),b=gear('b',{x:41,y:1}),c=gear('c',{x:-38,y:4}),links=[{a:'a',b:'b',kind:'mesh'}];assert.equal(E.snapMesh([a,b,c],links,'c','a',30,6,{pitch:10}),null);});
