/* Printable mounting kit. Millimeters; diametral clearances, not per-side offsets. */
globalThis.GearMount=(()=>{
 const E=globalThis.GearEngine,TAU=2*Math.PI;
 const defaults={enabled:false,pitch:10,thickness:6,margin:10,plug:6,clearance:.3,shaftClearance:.3,backlash:.2,recess:1.5,standOff:4};
 function normalize(value={}){if(!value||typeof value!=='object')value={};const s={...defaults};s.enabled=value.enabled===true;for(const k of Object.keys(defaults))if(k!=='enabled'&&value[k]!==undefined)s[k]=Number(value[k]);if(value.shaftClearance===undefined&&value.clearance!==undefined)s.shaftClearance=Number(value.clearance);return s;}
 function build(gears,value={}){
  const s=normalize(value),errors=[],warnings=[],pins=[],unmounted=[];
  const limits={pitch:[6,50],thickness:[3,20],margin:[5,40],plug:[3,12],clearance:[.15,1],shaftClearance:[.15,1],backlash:[0,.6],recess:[.5,3],standOff:[2,20]};
  for(const [k,[min,max]] of Object.entries(limits))if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)errors.push(k+' 超出範圍 '+min+'–'+max+' mm');
  if(s.thickness<=s.recess+1)errors.push('板厚需大於沉槽深度至少 1 mm');
  const hole=s.plug+s.clearance,recessDiameter=hole+1.8*s.recess;
  if(s.pitch<recessDiameter+1)errors.push('孔距太小：沉槽之間需保留至少 1 mm');
  if(!gears.length||gears.some(g=>E.validate(g).length))errors.push('請先修正齒輪尺寸');
  if(errors.length)return {settings:s,errors,warnings,pins,unmounted};
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const g of gears){const d=E.dims(g),ext=g.type==='rack'?d.length/2+g.base+g.m:d.outer;minX=Math.min(minX,g.x-ext);maxX=Math.max(maxX,g.x+ext);minY=Math.min(minY,g.y-ext);maxY=Math.max(maxY,g.y+ext);}
  const i0=Math.floor((minX-s.margin+s.pitch/2)/s.pitch),i1=Math.ceil((maxX+s.margin-s.pitch/2)/s.pitch),j0=Math.floor((minY-s.margin+s.pitch/2)/s.pitch),j1=Math.ceil((maxY+s.margin-s.pitch/2)/s.pitch);
  const cols=i1-i0+1,rows=j1-j0+1,rim=2,width=cols*s.pitch+2*rim,height=rows*s.pitch+2*rim,top=Math.min(...gears.map(g=>g.z))-s.standOff,bottom=top-s.thickness;
  if(cols*rows>600)errors.push('孔位超過 600 個，請加大孔距或縮小配置');
  if(width>256||height>256)warnings.push('底盤超過 A1 的 256 × 256 mm 成形範圍，請縮小配置或分割後列印');
  if(width>500||height>500)errors.push('底盤超過 500 mm，請縮小配置');
  const holes=[];if(!errors.length)for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)holes.push({x:i*s.pitch,y:j*s.pitch,i,j});
  for(const g of gears){
   if(!['spur','helical'].includes(g.type)){warnings.push(g.name+'：需另外的環形支撐／齒條滑軌，本版不生成其桿件');continue;}
   if(g.bore<3){warnings.push(g.name+'：軸孔至少 3 mm 才能生成桿件');continue;}
   const x=Math.round(g.x/s.pitch)*s.pitch,y=Math.round(g.y/s.pitch)*s.pitch,offset=Math.hypot(x-g.x,y-g.y);
   if(offset>.05)unmounted.push({id:g.id,name:g.name,offset,x,y});
   const shaft=g.bore-s.shaftClearance,collar=Math.max(s.plug+1.8*s.recess,g.bore+3);
   pins.push({id:g.id,name:g.name,x:g.x,y:g.y,holeX:x,holeY:y,z:g.z,width:g.width,shaft,collar,aligned:offset<=.05});
  }
  for(let i=0;i<pins.length;i++)for(let j=i+1;j<pins.length;j++)if(Math.hypot(pins[i].x-pins[j].x,pins[i].y-pins[j].y)<(pins[i].collar+pins[j].collar)/2+.2)errors.push(pins[i].name+' 與 '+pins[j].name+' 的支撐座重疊');
  if(unmounted.length)warnings.push(unmounted.length+' 個輪心未對孔位；請調整孔距，或使用「對齊孔位」');
  if(!pins.length)warnings.push('尚無可用支撐桿；外齒輪需有至少 3 mm 軸孔');
  return {settings:s,errors,warnings,pins,unmounted,holes,cols,rows,width,height,top,bottom,hole,recessDiameter,rim,i0,i1,j0,j1,x0:(i0-.5)*s.pitch-rim,x1:(i1+.5)*s.pitch+rim,y0:(j0-.5)*s.pitch-rim,y1:(j1+.5)*s.pitch+rim};
 }
 // A tapered seat prints without a suspended flange underside and can be lifted out.
 function pinProfile(pin,m){
  const s=m.settings,r=s.plug/2,rf=r+.9*s.recess,rc=pin.collar/2,rs=pin.shaft/2,z0=m.top-s.recess-(s.thickness-s.recess-.3),seat=m.top-s.recess;
  const rise=Math.min(rc-rf,pin.z-m.top-.5);
  return [[r-.4,z0],[r,z0+.4],[r,seat],[rf,m.top],[rc,m.top+Math.max(0,rise)],[rc,pin.z],[rs,pin.z],[rs,pin.z+pin.width+1.1],[Math.max(.5,rs-.4),pin.z+pin.width+1.5]];
 }
 function boardTriangles(m,segments=32){
  if(m.errors.length)throw Error(m.errors.join('；'));
  const t=[],s=m.settings,n=segments,r=m.hole/2,R=m.recessDiameter/2,z0=0,z1=s.thickness-s.recess,z2=s.thickness;
  const tri=(a,b,c)=>t.push([a,b,c]),quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d);};
  for(const h of m.holes){
   const x=h.x-m.x0,y=h.y-m.y0,outer=[],small=[],large=[];
   for(let k=0;k<n;k++){const a=TAU*k/n,c=Math.cos(a),v=Math.sin(a),q=s.pitch/2/Math.max(Math.abs(c),Math.abs(v));outer.push([x+q*c,y+q*v]);small.push([x+r*c,y+r*v]);large.push([x+R*c,y+R*v]);}
   const V=(p,z)=>[p[0],p[1],z];
   for(let k=0;k<n;k++){
    const j=(k+1)%n;
    quad(V(outer[k],z2),V(outer[j],z2),V(large[j],z2),V(large[k],z2));
    quad(V(outer[k],z0),V(small[k],z0),V(small[j],z0),V(outer[j],z0));
    quad(V(small[k],z0),V(small[k],z1),V(small[j],z1),V(small[j],z0));
    quad(V(small[k],z1),V(large[k],z2),V(large[j],z2),V(small[j],z1));
    const a=outer[k],b=outer[j],near=(a,b)=>Math.abs(a-b)<1e-7;
    const boundary=(h.i===m.i0&&near(a[0],x-s.pitch/2)&&near(b[0],x-s.pitch/2))||(h.i===m.i1&&near(a[0],x+s.pitch/2)&&near(b[0],x+s.pitch/2))||(h.j===m.j0&&near(a[1],y-s.pitch/2)&&near(b[1],y-s.pitch/2))||(h.j===m.j1&&near(a[1],y+s.pitch/2)&&near(b[1],y+s.pitch/2));
    if(boundary){
     // A solid 2 mm perimeter frame keeps the outermost recesses away from thin edges.
     const extend=p=>[near(p[0],m.rim)?0:near(p[0],m.width-m.rim)?m.width:p[0],near(p[1],m.rim)?0:near(p[1],m.height-m.rim)?m.height:p[1]],A=extend(a),B=extend(b);
     quad(V(a,z2),V(A,z2),V(B,z2),V(b,z2));
     quad(V(a,z0),V(b,z0),V(B,z0),V(A,z0));
     quad(V(A,z0),V(B,z0),V(B,z2),V(A,z2));
    }
   }
  }
  return t;
 }
 function pinsTriangles(m,segments=64){
  if(m.errors.length||m.unmounted.length)throw Error([...m.errors,...m.warnings].join('；'));
  if(!m.pins.length)throw Error('沒有可列印的支撐桿');
  const t=[],tri=(a,b,c)=>t.push([a,b,c]);let nextX=0;
  for(const p of m.pins){
   const profile=pinProfile(p,m),minZ=profile[0][1],x=nextX+p.collar/2,y=p.collar/2;
   const point=(r,z,k)=>[x+r*Math.cos(TAU*k/segments),y+r*Math.sin(TAU*k/segments),z-minZ];
   for(let l=0;l<profile.length-1;l++){const [r,z]=profile[l],[R,Z]=profile[l+1];if(Math.abs(r-R)+Math.abs(z-Z)<1e-8)continue;for(let k=0;k<segments;k++){const j=(k+1)%segments,a=point(r,z,k),b=point(r,z,j),c=point(R,Z,j),d=point(R,Z,k);tri(a,b,c);tri(a,c,d);}}
   for(let k=0;k<segments;k++){const j=(k+1)%segments,[r,z]=profile[0],[R,Z]=profile.at(-1);tri([x,y,0],point(r,z,j),point(r,z,k));tri([x,y,Z-minZ],point(R,Z,k),point(R,Z,j));}
   nextX+=p.collar+8;
  }
  return t;
 }
 function stl(tris,label){
  const out=new Uint8Array(84+50*tris.length),dv=new DataView(out.buffer);out.set(new TextEncoder().encode('Gear Workbench '+label+' | millimeters'));dv.setUint32(80,tris.length,true);let k=84;
  for(const v of tris){const u=v[1].map((n,i)=>n-v[0][i]),w=v[2].map((n,i)=>n-v[0][i]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],len=Math.hypot(...n);if(len<1e-12)throw Error('底盤網格含退化三角形');for(const a of [n.map(n=>n/len),...v])for(const x of a){dv.setFloat32(k,x,true);k+=4;}dv.setUint16(k,0,true);k+=2;}
  return out;
 }
 const makeSTL=(m,part='board')=>stl(part==='board'?boardTriangles(m):pinsTriangles(m),part);
 return {defaults,normalize,build,pinProfile,boardTriangles,pinsTriangles,makeSTL};
})();
