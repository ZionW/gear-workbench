const {test}=require('node:test'),assert=require('node:assert/strict');
require('../assets/engine.js');require('../assets/exports.js');require('../assets/mount.js');require('../assets/downloads.js');
const D=globalThis.GearDownloads,M=globalThis.GearMount;
const gear=(id,x=0)=>({id,name:'測試齒輪 '+id,type:'spur',m:2,teeth:20,alpha:20,width:10,bore:8,beta:20,wall:6,base:6,x,y:0,z:7,yaw:0,phase:0,rotation:0,backlash:.1});
function unpack(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=[];let pos=0;while(v.getUint32(pos,true)===0x04034b50){const size=v.getUint32(pos+18,true),n=v.getUint16(pos+26,true),start=pos+30+n;files.push({name:new TextDecoder().decode(bytes.slice(pos+30,start)),data:bytes.slice(start,start+size)});pos=start+size;}assert.equal(v.getUint32(pos,true),0x02014b50);assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);assert.equal(v.getUint16(bytes.length-12,true),files.length);return files;}
function minZ(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(80,true);let min=Infinity;for(let i=0;i<n;i++)for(let j=0;j<3;j++)min=Math.min(min,v.getFloat32(84+50*i+12+j*12+8,true));assert.equal(bytes.length,84+n*50);return min;}
test('one complete print kit carries separate grounded gears, board, posts and UTF-8 instructions',()=>{
 const poses=[gear('a',-20),gear('b',20)],before=JSON.stringify(poses),mount=M.build(poses,{enabled:true});const result=D.build({target:'kit',format:'stl',poses,mount});assert.equal(result.name,'gear-print-kit.zip');const files=unpack(result.data);assert.equal(files.length,5);assert.equal(files.filter(f=>f.name.endsWith('.stl')).length,4);for(const f of files.filter(f=>f.name.endsWith('.stl')))assert.equal(minZ(f.data),0,f.name);assert.ok(new TextDecoder().decode(files.at(-1).data).includes('測試齒輪'));assert.equal(JSON.stringify(poses),before);
});
test('kit works with disabled board; native single format downloads keep their format',()=>{
 const poses=[gear('a')],mount=M.build(poses);assert.equal(unpack(D.build({target:'kit',format:'stl',poses,mount}).data).length,2);
 for(const format of ['stl','step','dxf']){const r=D.build({target:'selected',format,poses,mount});assert.ok(r.name.endsWith('.'+format));assert.ok(r.data.length);}
});
test('mount downloads reject disabled, off-grid and unsupported formats without partial packages',()=>{
 const poses=[gear('a',1)],off=M.build(poses,{enabled:true});for(const target of ['pins','kit'])assert.throws(()=>D.build({target,format:'stl',poses,mount:off}),/輪心未對孔位/);assert.ok(D.build({target:'board',format:'stl',poses,mount:off}).data.length);
 assert.throws(()=>D.build({target:'board',format:'stl',poses,mount:M.build(poses)}),/啟用/);for(const target of ['kit','board','pins'])for(const format of ['step','dxf'])assert.throws(()=>D.build({target,format,poses,mount:off}),/目前提供 STL/);
});
