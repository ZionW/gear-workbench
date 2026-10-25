globalThis.GearExports=(()=>{
const E=globalThis.GearEngine,{TAU,rot,numberText:num}=E;
const world=(p,xy,z=0)=>{const a=rot(xy,p.rotation||0);return [a[0]+p.x,a[1]+p.y,p.z+z]},ref=a=>'('+a.join(',')+')';
function makeSVG(poses){const pieces=[],bounds=[];for(const p of poses){const g=E.geometry(p),parts=[];for(const c of [g.outer,g.inner].filter(Boolean)){if(c.kind==='circle')parts.push(`M${c.r},0 A${c.r},${c.r} 0 1 0 ${-c.r},0 A${c.r},${c.r} 0 1 0 ${c.r},0 Z`);else{let d='M'+c.poles[0].map(num).join(',');for(let i=0;i<c.n;i++)d+=' C'+c.poles.slice(i*3+1,i*3+4).map(a=>a.map(num).join(',')).join(' ');parts.push(d+'Z');}}
for(const v of E.sample(g.outer,1))bounds.push(world(p,v));pieces.push(`<g transform="translate(${p.x},${-p.y}) rotate(${-E.deg(p.rotation||0)}) scale(1,-1)"><path d="${parts.join(' ')}" fill="none" stroke="black" stroke-width="0.1"/></g>`);}
const xs=bounds.map(v=>v[0]),ys=bounds.map(v=>-v[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${x-.1} ${y-.1} ${w+.2} ${h+.2}"><title>Gear Workbench; mm; approximate geometry</title>${pieces.join('')}</svg>`;}
function makeDXF(poses){const a=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1027','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','1','0','LAYER','2','CUT','70','0','62','7','6','CONTINUOUS','0','ENDTAB','0','ENDSEC','0','SECTION','2','ENTITIES'],put=(c,v)=>a.push(String(c),String(v));for(const p of poses){const g=E.geometry(p);for(const c of [g.outer,g.inner].filter(Boolean)){put(0,c.kind==='circle'?'CIRCLE':'SPLINE');put(100,'AcDbEntity');put(8,'CUT');put(100,c.kind==='circle'?'AcDbCircle':'AcDbSpline');if(c.kind==='circle'){put(10,p.x);put(20,p.y);put(30,0);put(40,c.r);}else{put(210,0);put(220,0);put(230,1);put(70,9);put(71,3);put(72,c.poles.length+4);put(73,c.poles.length);put(74,0);put(42,1e-9);put(43,1e-9);for(let i=0;i<=c.n;i++)for(let j=0;j<(i===0||i===c.n?4:3);j++)put(40,i);for(const v of c.poles){const W=world(p,v);put(10,num(W[0]));put(20,num(W[1]));put(30,0);}}}}
a.push('0','ENDSEC','0','EOF');return a.join('\n')+'\n';}
function earClip(points){const ix=points.map((_,i)=>i),tris=[],cross=(A,B,C)=>(B[0]-A[0])*(C[1]-B[1])-(B[1]-A[1])*(C[0]-B[0]),inTri=(P,A,B,C)=>cross(A,B,P)>-1e-10&&cross(B,C,P)>-1e-10&&cross(C,A,P)>-1e-10;let tries=0;while(ix.length>3){let found=false;for(let i=0;i<ix.length;i++){const a=ix[(i+ix.length-1)%ix.length],b=ix[i],c=ix[(i+1)%ix.length];if(cross(points[a],points[b],points[c])<=1e-10)continue;if(ix.some(j=>j!==a&&j!==b&&j!==c&&inTri(points[j],points[a],points[b],points[c])))continue;tris.push([a,b,c]);ix.splice(i,1);found=true;break;}if(!found||tries++>points.length)throw Error('齒條輪廓無法三角化，請調整規格');}tris.push(ix);return tris;}
function makeSTL(poses){const tris=[];function tri(A,B,C){const u=B.map((x,i)=>x-A[i]),v=C.map((x,i)=>x-A[i]),N=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...N);if(l>1e-10)tris.push({v:[A,B,C],n:N.map(x=>x/l)});}
for(const p of poses){const geom=E.geometry(p),twist=geom.d.twist,b=p.width;let O,I;if(p.type==='internal'){I=E.sample(geom.inner,2);O=I.map(([x,y])=>{const a=Math.atan2(y,x);return [geom.outer.r*Math.cos(a),geom.outer.r*Math.sin(a)]});}else{O=E.sample(geom.outer,2);I=geom.inner?O.map(([x,y])=>{const l=Math.hypot(x,y);return [x/l*geom.inner.r,y/l*geom.inner.r]}):O.map(()=>[0,0]);}
if(p.type==='rack'){// Remove exactly collinear perimeter samples before both the caps and side wall.
let changed=true;while(changed){changed=false;O=O.filter((B,i)=>{const A=O[(i+O.length-1)%O.length],C=O[(i+1)%O.length],cross=(B[0]-A[0])*(C[1]-B[1])-(B[1]-A[1])*(C[0]-B[0]);if(Math.abs(cross)<1e-10){changed=true;return false;}return true;});}const cap=earClip(O);for(const [i,j,k]of cap){tri(world(p,O[i],b),world(p,O[j],b),world(p,O[k],b));tri(world(p,O[i]),world(p,O[k]),world(p,O[j]));}for(let i=0;i<O.length;i++){const j=(i+1)%O.length;tri(world(p,O[i]),world(p,O[j]),world(p,O[j],b));tri(world(p,O[i]),world(p,O[j],b),world(p,O[i],b));}continue;}
const levels=Math.max(1,Math.ceil(Math.abs(twist)/E.rad(2))),V=(v,z)=>world(p,rot(v,twist*z/b),z),n=O.length;
for(let i=0;i<n;i++){const j=(i+1)%n,A=V(O[i],b),B=V(O[j],b),C=V(I[i],b),D=V(I[j],b),F=V(O[i],0),G=V(O[j],0),H=V(I[i],0),J=V(I[j],0);tri(A,B,D);tri(A,D,C);tri(F,J,G);tri(F,H,J);for(let z=0;z<levels;z++){const z0=b*z/levels,z1=b*(z+1)/levels;tri(V(O[i],z0),V(O[j],z0),V(O[j],z1));tri(V(O[i],z0),V(O[j],z1),V(O[i],z1));if(geom.inner){tri(V(I[i],z0),V(I[i],z1),V(I[j],z1));tri(V(I[i],z0),V(I[j],z1),V(I[j],z0));}}}}
if(tris.length>1500000)throw Error('組合網格超過 150 萬三角形，請選單顆或降低齒數');const out=new Uint8Array(84+50*tris.length),dv=new DataView(out.buffer);out.set(new TextEncoder().encode('Gear Workbench | millimeters | approximate geometry'));dv.setUint32(80,tris.length,true);let k=84;for(const t of tris){for(const v of [t.n,...t.v])for(const x of v){dv.setFloat32(k,x,true);k+=4;}dv.setUint16(k,0,true);k+=2;}return out;}
function makeSTEP(poses){const rows=[],add=s=>{rows.push(s);return '#'+rows.length},pt=a=>add(`CARTESIAN_POINT('',(${a.map(num).join(',')}))`),dir=a=>add(`DIRECTION('',(${a.map(num).join(',')}))`),vec=(a,l=1)=>add(`VECTOR('',${dir(a)},${num(l)})`),ax=(a,angle=0)=>add(`AXIS2_PLACEMENT_3D('',${pt(a)},${dir([0,0,1])},${dir([Math.cos(angle),Math.sin(angle),0])})`),line=(a,v)=>add(`LINE('',${pt(a)},${vec(v)})`),edge=(v1,v2,c)=>add(`EDGE_CURVE('',${v1},${v2},${c},.T.)`),orient=(e,pos=true)=>add(`ORIENTED_EDGE('',*,*,${e},.${pos?'T':'F'}.)`),bound=(es,pos=true)=>add(`FACE_BOUND('',${add(`EDGE_LOOP('',${ref(es)})`)},.${pos?'T':'F'}.)`),face=(bounds,s,pos=true)=>add(`ADVANCED_FACE('',${ref(bounds)},${s},.${pos?'T':'F'}.)`),mult=n=>Array.from({length:n+1},(_,i)=>i===0||i===n?4:3),knots=n=>Array.from({length:n+1},(_,i)=>num(i));
const app=add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`);const pc=add(`PRODUCT_CONTEXT('',${app},'mechanical')`),prod=add(`PRODUCT('Gear assembly','Gear assembly','approximate tooth profiles',(${pc}))`),form=add(`PRODUCT_DEFINITION_FORMATION('','',${prod})`),pdc=add(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`),pd=add(`PRODUCT_DEFINITION('design','',${form},${pdc})`),pds=add(`PRODUCT_DEFINITION_SHAPE('','',${pd})`),units=add('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )'),ang=add('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )'),sa=add('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )'),unc=add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),${units},'distance_accuracy_value','')`),ctx=add(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${units},${ang},${sa})) REPRESENTATION_CONTEXT('','') )`),ctx2=add("( GEOMETRIC_REPRESENTATION_CONTEXT(2) PARAMETRIC_REPRESENTATION_CONTEXT() REPRESENTATION_CONTEXT('','') )");
const pcurve=(s,c)=>add(`PCURVE('',${s},${add(`DEFINITIONAL_REPRESENTATION('',(${c}),${ctx2})`)})`),sc=(c,pcs,seam=false)=>add(`${seam?'SEAM_CURVE':'SURFACE_CURVE'}('',${c},${ref(pcs)},.PCURVE_S1.)`),splineCurve=(poles,n,closed)=>add(`B_SPLINE_CURVE_WITH_KNOTS('',3,${ref(poles.map(pt))},.UNSPECIFIED.,.${closed?'T':'F'}.,.F.,(${mult(n)}),(${knots(n)}),.UNSPECIFIED.)`),solids=[];
for(const p of poses){const geom=E.geometry(p),b=p.width,faces=[],bottom=[],top=[],plane0=add(`PLANE('',${ax([0,0,p.z])})`),plane1=add(`PLANE('',${ax([0,0,p.z+b])})`);for(const [curve,isHole]of [[geom.outer,false],[geom.inner,true]]){if(!curve)continue;let c0,c1,c20,c21,side,seamGeo,first0,first1,uMax,vMax=b;
if(curve.kind==='circle'){const center=[p.x,p.y],angle=p.rotation||0;c0=add(`CIRCLE('',${ax([...center,p.z],angle)},${num(curve.r)})`);c1=add(`CIRCLE('',${ax([...center,p.z+b],angle)},${num(curve.r)})`);c20=add(`CIRCLE('',${add(`AXIS2_PLACEMENT_2D('',${pt(center)},${dir([Math.cos(angle),Math.sin(angle)])})`)},${num(curve.r)})`);c21=c20;side=add(`CYLINDRICAL_SURFACE('',${ax([...center,p.z],angle)},${num(curve.r)})`);first0=world(p,[curve.r,0]);first1=world(p,[curve.r,0],b);seamGeo=line(first0,[0,0,1]);uMax=TAU;}
else{const twist=geom.d.twist,base=curve.poles.map(v=>world(p,v)),end=curve.poles.map(v=>world(p,rot(v,twist),b));c0=splineCurve(base,curve.n,true);c1=splineCurve(end,curve.n,true);c20=splineCurve(base.map(v=>v.slice(0,2)),curve.n,true);c21=splineCurve(end.map(v=>v.slice(0,2)),curve.n,true);first0=base[0];first1=end[0];uMax=curve.n;
if(Math.abs(twist)<1e-10){side=add(`SURFACE_OF_LINEAR_EXTRUSION('',${c0},${vec([0,0,1])})`);seamGeo=line(first0,[0,0,1]);}else{const nv=Math.max(1,Math.ceil(Math.abs(twist)/E.rad(5)));vMax=nv;const grid=curve.poles.map(v=>{const control=[world(p,v)];for(let j=0;j<nv;j++){const t0=j/nv,t1=(j+1)/nv,A=rot(v,twist*t0),B=rot(v,twist*t1),At=rot([-A[1]*twist/nv,A[0]*twist/nv],p.rotation||0),Bt=rot([-B[1]*twist/nv,B[0]*twist/nv],p.rotation||0),W0=world(p,A,b*t0),W1=world(p,B,b*t1);control.push([W0[0]+At[0]/3,W0[1]+At[1]/3,W0[2]+b/nv/3],[W1[0]-Bt[0]/3,W1[1]-Bt[1]/3,W1[2]-b/nv/3],W1);}return control;});side=add(`B_SPLINE_SURFACE_WITH_KNOTS('',3,3,${ref(grid.map(row=>ref(row.map(pt))))},.UNSPECIFIED.,.T.,.F.,.F.,(${mult(curve.n)}),(${mult(nv)}),(${knots(curve.n)}),(${knots(nv)}),.UNSPECIFIED.)`);seamGeo=splineCurve(grid[0],nv,false);}}
const v0=add(`VERTEX_POINT('',${pt(first0)})`),v1=add(`VERTEX_POINT('',${pt(first1)})`),seam=edge(v0,v1,sc(seamGeo,[pcurve(side,line([0,0],[0,1])),pcurve(side,line([uMax,0],[0,1]))],true)),e0=edge(v0,v0,sc(c0,[pcurve(side,line([0,0],[1,0])),pcurve(plane0,c20)])),e1=edge(v1,v1,sc(c1,[pcurve(side,line([0,vMax],[1,0])),pcurve(plane1,c21)]));faces.push(face([bound([orient(e0),orient(seam),orient(e1,false),orient(seam,false)])],side,!isHole));bottom.push(bound([orient(e0)],isHole));top.push(bound([orient(e1)],!isHole));}
faces.push(face(bottom,plane0,false),face(top,plane1));solids.push(add(`MANIFOLD_SOLID_BREP('${p.id}',${add(`CLOSED_SHELL('',${ref(faces)})`)})`));}
const repr=add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',${ref([ax([0,0,0]),...solids])},${ctx})`);add(`SHAPE_DEFINITION_REPRESENTATION(${pds},${repr})`);add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Gear Workbench approximate geometry'),'2;1');\nFILE_NAME('gears.step','${new Date().toISOString().slice(0,19)}',(''),(''),'Gear Workbench','Gear Workbench','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n${rows.map((s,i)=>'#'+(i+1)+' = '+s+';').join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;}
function gearPayload(poses){
  // One built-in Python command avoids nested interactive selection during Rhino Paste.
  // No files, extra plugin, document curves, or localized command options are required.
  const payload=poses.map((p,i)=>{
    const g=E.geometry(p),loop=c=>c.kind==='circle'?{kind:'circle',center:[p.x,p.y,p.z],radius:c.r}:{kind:'nurbs',poles:c.poles.map(v=>world(p,v))};
    return {name:p.name||'Gear '+(i+1),center:[p.x,p.y,p.z],width:p.width,twist:g.d.twist,loops:[g.outer,g.inner].filter(Boolean).map(loop)};
  });
  return payload;
}
function rhinoMacro(poses){return rhinoSolidCommand(gearPayload(poses));}
function mountPayload(m,includePins=true){
  if(!m||!m.settings.enabled)throw Error('請先開啟生成列印底盤');
  if(m.errors.length)throw Error(m.errors.join('；'));
  if(includePins&&m.unmounted.length)throw Error('輪心未對孔位：請先對齊孔位，或取消包含支撐桿');
  const payload=[{kind:'board',name:'凹槽洞洞板',x0:m.x0,x1:m.x1,y0:m.y0,y1:m.y1,top:m.top,bottom:m.bottom,hole:m.hole,recessDiameter:m.recessDiameter,recess:m.settings.recess,holes:m.holes.map(h=>[h.x,h.y])}];
  if(includePins)for(const p of m.pins)payload.push({kind:'pin',name:p.name+' 支撐桿',center:[p.x,p.y],profile:globalThis.GearMount.pinProfile(p,m)});
  return payload;
}
function rhinoMountMacro(m,includePins=true){return rhinoSolidCommand(mountPayload(m,includePins));}
function rhinoAssemblyMacro(poses,m,includePins=true){return rhinoSolidCommand([...gearPayload(poses),...(m?mountPayload(m,includePins):[])]);}
function rhinoSolidCommand(payload){
  const literal=JSON.stringify(JSON.stringify(payload)).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  return `! _-RunPythonScript (
# -*- coding: utf-8 -*-
# Gear Workbench solid-copy-v3: build, join, cap and validate before adding anything.
import Rhino
import System
import json

def gear_workbench_paste():
    doc = Rhino.RhinoDoc.ActiveDoc
    if doc is None:
        raise RuntimeError('No active Rhino document')
    data = json.loads(u${literal})
    scale = Rhino.RhinoMath.UnitScale(Rhino.UnitSystem.Millimeters, doc.ModelUnitSystem)
    tol = max(1e-7 * scale, min(doc.ModelAbsoluteTolerance, 0.001 * scale))
    def point(v):
        return Rhino.Geometry.Point3d(v[0] * scale, v[1] * scale, v[2] * scale)
    def curve(spec):
        if spec['kind'] == 'circle':
            plane = Rhino.Geometry.Plane(point(spec['center']), Rhino.Geometry.Vector3d.ZAxis)
            return Rhino.Geometry.Circle(plane, spec['radius'] * scale).ToNurbsCurve()
        poles = spec['poles']
        result = Rhino.Geometry.NurbsCurve(3, False, 4, len(poles))
        for i, v in enumerate(poles):
            result.Points.SetPoint(i, point(v))
        for i in range(result.Knots.Count):
            result.Knots[i] = float(i // 3)
        if not result.IsValid or not result.IsClosed:
            raise RuntimeError('Invalid closed gear profile')
        return result
    def circle_at(x, y, z, radius):
        plane = Rhino.Geometry.Plane(point([x, y, z]), Rhino.Geometry.Vector3d.ZAxis)
        return Rhino.Geometry.Circle(plane, radius * scale).ToNurbsCurve()
    def make_board(p):
        corners = [[p['x0'], p['y0']], [p['x1'], p['y0']], [p['x1'], p['y1']], [p['x0'], p['y1']]]
        def outline(z):
            return Rhino.Geometry.PolylineCurve([point([v[0], v[1], z]) for v in corners + [corners[0]]])
        lower = [outline(p['bottom'])]
        upper = [outline(p['top'])]
        for h in p['holes']:
            lower.append(circle_at(h[0], h[1], p['bottom'], p['hole'] / 2))
            upper.append(circle_at(h[0], h[1], p['top'], p['recessDiameter'] / 2))
        faces = []
        for loops in [lower, upper]:
            caps = Rhino.Geometry.Brep.CreatePlanarBreps(loops, tol)
            if caps is None or len(caps) != 1:
                raise RuntimeError('Could not create perforated board face')
            faces.append(caps[0])
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            side = Rhino.Geometry.Brep.CreateFromCornerPoints(point([a[0], a[1], p['bottom']]), point([b[0], b[1], p['bottom']]), point([b[0], b[1], p['top']]), point([a[0], a[1], p['top']]), tol)
            if side is None:
                raise RuntimeError('Could not create board edge')
            faces.append(side)
        seat_z = p['top'] - p['recess']
        for h in p['holes']:
            bottom_ring = circle_at(h[0], h[1], p['bottom'], p['hole'] / 2)
            lower_ring = circle_at(h[0], h[1], seat_z, p['hole'] / 2)
            upper_ring = circle_at(h[0], h[1], p['top'], p['recessDiameter'] / 2)
            wall = Rhino.Geometry.Surface.CreateExtrusion(bottom_ring, Rhino.Geometry.Vector3d(0, 0, (seat_z - p['bottom']) * scale))
            if wall is None:
                raise RuntimeError('Could not create board hole')
            faces.append(wall.ToBrep())
            recess = Rhino.Geometry.Brep.CreateFromLoft([lower_ring, upper_ring], Rhino.Geometry.Point3d.Unset, Rhino.Geometry.Point3d.Unset, Rhino.Geometry.LoftType.Straight, False)
            if recess is None or len(recess) != 1:
                raise RuntimeError('Could not create recessed hole')
            faces.append(recess[0])
        result = Rhino.Geometry.Brep.JoinBreps(faces, tol)
        if result is None or len(result) != 1:
            raise RuntimeError('Could not join the recessed pegboard')
        return result[0]
    def make_pin(p):
        x, y = p['center']
        points = []
        for radius, z in p['profile']:
            v = point([x + radius, y, z])
            if not points or v.DistanceTo(points[-1]) > 1e-9 * scale:
                points.append(v)
        profile = Rhino.Geometry.PolylineCurve(points)
        axis = Rhino.Geometry.Line(point([x, y, p['profile'][0][1]]), point([x, y, p['profile'][-1][1]]))
        surface = Rhino.Geometry.RevSurface.Create(profile, axis)
        if surface is None:
            raise RuntimeError('Could not revolve removable post')
        return Rhino.Geometry.Brep.CreateFromRevSurface(surface, True, True)
    ready = []
    for p in data:
        if p.get('kind') == 'board':
            solid = make_board(p)
        elif p.get('kind') == 'pin':
            solid = make_pin(p)
        else:
            curves = [curve(c) for c in p['loops']]
            bases = Rhino.Geometry.Brep.CreatePlanarBreps(curves, tol)
            if bases is None or len(bases) != 1:
                raise RuntimeError('Could not create one holed gear region')
            walls = []
            direction = Rhino.Geometry.Vector3d(0, 0, p['width'] * scale)
            for c in curves:
                surface = Rhino.Geometry.Surface.CreateExtrusion(c, direction)
                if surface is None:
                    raise RuntimeError('Could not extrude gear wall')
                walls.append(surface.ToBrep())
            joined = Rhino.Geometry.Brep.JoinBreps([bases[0]] + walls, tol)
            if joined is None or len(joined) != 1:
                raise RuntimeError('Could not join the gear base and walls')
            solid = joined[0].CapPlanarHoles(tol)
            if solid is None:
                raise RuntimeError('Could not cap the gear')
            if abs(p['twist']) > 1e-10:
                axis = Rhino.Geometry.Line(point(p['center']), point([p['center'][0], p['center'][1], p['center'][2] + p['width']]))
                morph = Rhino.Geometry.Morphs.TwistSpaceMorph()
                morph.TwistAxis = axis
                morph.TwistAngleRadians = p['twist']
                morph.InfiniteTwist = True
                morph.PreserveStructure = False
                morph.Tolerance = tol
                if not morph.Morph(solid):
                    raise RuntimeError('Could not twist the helical gear')
        if solid is None or not solid.IsValid or not solid.IsSolid:
            raise RuntimeError('Gear is not a valid closed solid; nothing was added')
        if solid.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
            solid.Flip()
        ready.append((p['name'], solid, p.get('kind', 'gear')))
    # All shapes pass first. Each paste gets its own layer, including repeated pastes.
    layer = Rhino.DocObjects.Layer()
    layer.Name = 'GearPaste_' + System.Guid.NewGuid().ToString('N')
    record = doc.BeginUndoRecord('Paste Gear Workbench solids')
    created = []
    layer_index = -1
    try:
        layer_index = doc.Layers.Add(layer)
        if layer_index < 0:
            raise RuntimeError('Could not create the gear layer')
        for name, solid, kind in ready:
            attrs = Rhino.DocObjects.ObjectAttributes()
            attrs.LayerIndex = layer_index
            attrs.Name = name
            attrs.SetUserString('GearWorkbench', 'solid-copy-v3')
            attrs.SetUserString('GearWorkbenchPart', kind)
            object_id = doc.Objects.AddBrep(solid, attrs)
            if object_id == System.Guid.Empty:
                raise RuntimeError('Could not add the gear solid')
            created.append(object_id)
    except:
        for object_id in created:
            doc.Objects.Delete(object_id, True)
        if layer_index >= 0:
            doc.Layers.Delete(layer_index, True)
        raise
    finally:
        doc.EndUndoRecord(record)
    doc.Views.Redraw()
    print('Gear Workbench: created {0} valid closed solids (mm).'.format(len(created)))

gear_workbench_paste()
)
`;
}
return {makeSVG,makeDXF,makeSTL,makeSTEP,rhinoMacro,rhinoMountMacro,rhinoAssemblyMacro};
})();
