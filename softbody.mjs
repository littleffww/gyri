import * as THREE from './vendor/three.module.js';
export function springStep(value,velocity,target,dt,elastic=true){
  if(!elastic)return [value+(target-value)*(1-Math.exp(-20*dt)),0];
  const steps=Math.max(1,Math.ceil(dt/.012)),h=dt/steps;
  for(let i=0;i<steps;i++){velocity+=(28*(target-value)-7.6*velocity)*h;value+=velocity*h}
  return [value,velocity];
}
export function deformPoint(p,center,s){
  let [x,y,z]=p;const {inflate=0,stretch=0,twist=0,axis=[1,0,0],grab=[0,0,0],delta=[0,0,0],grip=0,scatter=0,pulse=99}=s;
  const envelope=.6+.75*Math.exp(-y*y*.75),radial=Math.max(.23,1+inflate*envelope);
  x=(x+(x-center[0])*inflate*.16)*radial;z=(z+(z-center[2])*inflate*.16)*radial;y=(y+(y-center[1])*inflate*.1)*(1+inflate*.12);
  const t=twist*y*.85,c=Math.cos(t),sn=Math.sin(t);[x,z]=[x*c-z*sn,x*sn+z*c];
  const projection=x*axis[0]+y*axis[1]+z*axis[2],compression=1/Math.sqrt(Math.max(.3,1+stretch*.55));
  x=x*compression+axis[0]*projection*(1+stretch-compression);y=y*compression+axis[1]*projection*(1+stretch-compression);z=z*compression+axis[2]*projection*(1+stretch-compression);
  const weight=Math.exp(-((p[0]-grab[0])**2+(p[1]-grab[1])**2+(p[2]-grab[2])**2)/.65**2)*grip;
  x+=delta[0]*weight;y+=delta[1]*weight;z+=delta[2]*weight;
  const radius=Math.hypot(center[0],center[2]);if(radius>.001){x+=center[0]/radius*scatter*.22;z+=center[2]/radius*scatter*.22}
  const wave=Math.exp(-Math.pow((p[1]+1.8-pulse*2.3)/.3,2))*Math.max(0,1-pulse/2.4);x*=1+wave*.35;z*=1+wave*.35;
  return [x,y,z];
}
export const deformationGLSL=`
attribute vec3 aCenter,aTrace;
uniform float uTraceAmount;
uniform float uInflate,uStretch,uTwist,uGrip,uScatter,uPulse;
uniform vec3 uAxis,uGrab,uDelta;
vec3 deformBody(vec3 p){
 p+=(aTrace-position)*uTraceAmount;
 vec3 q=p;
 float radial=max(.23,1.+uInflate*(.6+.75*exp(-p.y*p.y*.75)));
 q+= (p-aCenter)*uInflate*vec3(.16,.1,.16);
 q.xz*=radial;q.y*=1.+uInflate*.12;
 float a=uTwist*q.y*.85;float cs=cos(a),sn=sin(a);q.xz=mat2(cs,sn,-sn,cs)*q.xz;
 float projection=dot(q,uAxis);float compression=inversesqrt(max(.3,1.+uStretch*.55));q=q*compression+uAxis*projection*(1.+uStretch-compression);
 float weight=exp(-dot(p-uGrab,p-uGrab)/(.65*.65))*uGrip;q+=uDelta*weight;
 float r=length(aCenter.xz);if(r>.001)q.xz+=aCenter.xz/r*uScatter*.22;
 float wave=exp(-pow((p.y+1.8-uPulse*2.3)/.3,2.))*max(0.,1.-uPulse/2.4);q.xz*=1.+wave*.35;
 return q;
}
`;
export const dissolveGLSL=`
uniform float uDissolve;
float hashCell(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float dissolveThreshold(vec3 p,vec3 center){return .025+.64*hashCell(floor(center*31.))+.28*hashCell(floor(p*85.));}
`;
export function makeSoftMaterial(){
 const uniforms={uTraceAmount:{value:1},uDissolve:{value:0},uInflate:{value:0},uStretch:{value:0},uTwist:{value:0},uGrip:{value:0},uScatter:{value:0},uPulse:{value:99},uAxis:{value:new THREE.Vector3(1,0,0)},uGrab:{value:new THREE.Vector3()},uDelta:{value:new THREE.Vector3()}};
 Object.assign(uniforms,{uArtMix:{value:1},uPigmentA:{value:new THREE.Color('#c7f51c')},uPigmentB:{value:new THREE.Color('#fa246a')},uPigmentC:{value:new THREE.Color('#352cc0')},uColorPhase:{value:0},uColorWarp:{value:.2},uColorSaturation:{value:1}});
 const material=new THREE.MeshPhysicalMaterial({flatShading:true,color:'#777b71',roughness:.44,metalness:.12,side:THREE.DoubleSide,envMapIntensity:.55,clearcoat:.45,clearcoatRoughness:.25,iridescence:.16,iridescenceIOR:1.35,iridescenceThicknessRange:[100,400]});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying vec3 vPigment,vPart;\n'+deformationGLSL+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`vec3 nn=normalize(normal);vec3 helper=abs(nn.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.);vec3 tt=normalize(cross(helper,nn));vec3 bb=normalize(cross(nn,tt));vec3 base=deformBody(position);vec3 tangentA=deformBody(position+tt*.003)-base;vec3 tangentB=deformBody(position+bb*.003)-base;vec3 objectNormal=normalize(cross(tangentA,tangentB));`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=deformBody(position);vPigment=position;vPart=aCenter;`);
  shader.fragmentShader=dissolveGLSL+'varying vec3 vPigment,vPart;uniform vec3 uPigmentA,uPigmentB,uPigmentC;uniform float uArtMix,uColorPhase,uColorWarp,uColorSaturation;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    if(uDissolve>dissolveThreshold(vPigment,vPart))discard;
    vec3 pp=vPigment;
    float ripple=sin(pp.y*3.7+pp.z*2.1+uColorPhase*2.)*uColorWarp;
    float band=sin(pp.y*1.9+pp.x*2.7+sin(pp.z*2.8)*.7+uColorPhase*5.+ripple);
    vec3 pigment=mix(uPigmentA,uPigmentB,smoothstep(-.65,.7,band));
    float accent=sin(pp.y*2.5-pp.x*2.+pp.z*3.-uColorPhase*3.+ripple*.6);
    pigment=mix(pigment,uPigmentC,smoothstep(.42,.9,accent)*.85);
    float grey=dot(pigment,vec3(.2126,.7152,.0722));
    pigment=max(vec3(.002),mix(vec3(grey),pigment,uColorSaturation));
    diffuseColor.rgb=mix(diffuseColor.rgb,pigment,uArtMix);
  `);
 };
 material.customProgramCacheKey=()=> 'gyri-surface-dissolve-v2';
 const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
 depthMaterial.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying vec3 vPigment,vPart;\n'+deformationGLSL+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=deformBody(position);vPigment=position;vPart=aCenter;');shader.fragmentShader=dissolveGLSL+'varying vec3 vPigment,vPart;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('void main() {','void main() { if(uDissolve>dissolveThreshold(vPigment,vPart))discard;');};
 depthMaterial.customProgramCacheKey=()=> 'gyri-surface-depth-v2';
 return {material,uniforms,depthMaterial};
}
export async function loadSoftGeometry(){
 const [metaResponse,binResponse]=await Promise.all([fetch('./soft-geometry.json'),fetch('./soft-geometry.bin')]);
 if(!metaResponse.ok||!binResponse.ok)throw Error('模型资源加载失败');
 const meta=await metaResponse.json(),buffer=await binResponse.arrayBuffer();
 if(buffer.byteLength!==meta.positionBytes+meta.centerBytes+meta.indexCount*4)throw Error('模型数据不完整');
 const p=new Float32Array(buffer,0,meta.vertexCount*3),c=new Float32Array(buffer,meta.positionBytes,meta.vertexCount*3),ix=new Uint32Array(buffer,meta.positionBytes+meta.centerBytes,meta.indexCount);
 const make=section=>{const geo=new THREE.BufferGeometry();const begin=section.vertexStart,end=begin+section.vertexCount;geo.setAttribute('position',new THREE.BufferAttribute(p.slice(begin*3,end*3),3));geo.setAttribute('aTrace',new THREE.BufferAttribute(p.slice(begin*3,end*3),3));geo.setAttribute('aCenter',new THREE.BufferAttribute(c.slice(begin*3,end*3),3));geo.setIndex(new THREE.BufferAttribute(ix.slice(section.indexStart,section.indexStart+section.indexCount).map(v=>v-begin),1));geo.computeVertexNormals();geo.computeBoundingSphere();return geo};
 return {body:make(meta.sections[0]),base:make(meta.sections[1]),meta};
}
