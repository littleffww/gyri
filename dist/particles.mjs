import * as T from './vendor/three.module.js';
import {deformationGLSL,dissolveGLSL,makeSoftMaterial} from './softbody.mjs?v=agency-final';
// Samples retain their source triangle and barycentric weights, including when a personal trace is saved.
export function createParticles(geometry,root,shared=makeSoftMaterial().uniforms){
 const n=42000,p=new Float32Array(n*3),center=new Float32Array(n*3),seed=new Float32Array(n*3),sphere=new Float32Array(n*3),helix=new Float32Array(n*3),assembly=new Float32Array(n*3),samples=new Uint32Array(n*3),weights=new Float32Array(n*3),a=geometry.attributes.position.array,centers=geometry.attributes.aCenter?.array,ix=geometry.index.array;
 let randomSeed=481;const rand=()=>((randomSeed=(1664525*randomSeed+1013904223)>>>0)/4294967296);
 const cumulative=[],v1=new T.Vector3(),v2=new T.Vector3();let area=0;
 for(let i=0;i<ix.length;i+=3){const x=ix[i]*3,y=ix[i+1]*3,z=ix[i+2]*3;v1.set(a[y]-a[x],a[y+1]-a[x+1],a[y+2]-a[x+2]);v2.set(a[z]-a[x],a[z+1]-a[x+1],a[z+2]-a[x+2]);area+=v1.cross(v2).length()/2;cumulative.push(area)}
 if(!area)throw Error('Cannot sample an empty surface');
 for(let i=0;i<n;i++){
  let lo=0,hi=cumulative.length-1,r=rand()*area;while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<r)lo=mid+1;else hi=mid}
  const u=Math.sqrt(rand()),v=rand(),j=i*3;weights.set([1-u,u*(1-v),u*v],j);samples.set([ix[lo*3],ix[lo*3+1],ix[lo*3+2]],j);
  for(let k=0;k<3;k++){for(let b=0;b<3;b++){p[j+k]+=a[samples[j+b]*3+k]*weights[j+b];center[j+k]+=(centers?.[samples[j+b]*3+k]||0)*weights[j+b]}seed[j+k]=rand()*2-1}
  const z=1-2*(i+.5)/n,radius=Math.sqrt(1-z*z),phi=i*2.39996323,angle=i/n*Math.PI*10+(i%2?Math.PI:0),group=i%5/5*Math.PI*2;
  sphere.set([1.45*radius*Math.cos(phi),1.45*z,1.45*radius*Math.sin(phi)],j);
  helix.set([Math.cos(angle)*.95,(i/n-.5)*3.5,Math.sin(angle)*.95],j);
  assembly.set([p[j]*.42+Math.cos(group)*1.25,p[j+1]*.42+Math.sin(group)*.85,p[j+2]*.42+Math.sin(group)*.65],j);
 }
 const geo=new T.BufferGeometry();for(const [name,array]of Object.entries({position:p,aCenter:center,aTrace:p.slice(),seed,sphere,helix,assembly}))geo.setAttribute(name,new T.BufferAttribute(array,3));
 const formWeights=new T.Vector4(1,0,0,0);
 const uniforms={...shared,scatter:{value:0},formWeights:{value:formWeights},size:{value:2.3},tint:{value:new T.Color('#515151')},tintB:{value:new T.Color('#949494')}};
 const mat=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:true,vertexShader:deformationGLSL+dissolveGLSL+`
 attribute vec3 seed,sphere,helix,assembly;uniform float scatter,size;uniform vec4 formWeights;varying float shade,visibility;
 void main(){
 float threshold=dissolveThreshold(position,aCenter);
 float revealed=smoothstep(threshold-.018,threshold+.012,uDissolve);
 float escape=smoothstep(threshold+.025,1.,scatter);
 vec3 q=deformBody(position)*formWeights.x+sphere*formWeights.y+helix*formWeights.z+assembly*formWeights.w;
 float drift=mix(scatter,escape,formWeights.x);
 q+=seed*drift*1.25;
 q+=vec3(sin(position.y*3.+seed.x*2.+drift*3.),cos(position.x*3.+seed.y),sin(position.y*2.+seed.z))*drift*.3;
 vec4 mv=modelViewMatrix*vec4(q,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*(10./-mv.z),1.,6.);
 shade=seed.y*.5+.5;visibility=revealed;
 }`,fragmentShader:`uniform vec3 tint,tintB;varying float shade,visibility;void main(){float r=length(gl_PointCoord-.5);if(r>.5||visibility<.02)discard;float light=.5+.5*sqrt(max(0.,1.-r*r*4.));gl_FragColor=vec4(mix(tint,tintB,shade)*light,visibility*smoothstep(.5,.34,r));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const points=new T.Points(geo,mat);points.frustumCulled=false;points.visible=false;root.add(points);
 let form='original',s=0,migrating=false;const names=['original','sphere','helix','assembly'];
 function setColors(colors) {
  uniforms.tint.value.set(colors[0]);
  uniforms.tintB.value.set(colors[1]);
 }
 return {
 setColors,
 reset() {
  form = 'original';
  migrating = false;
  s = uniforms.scatter.value = shared.uDissolve.value = 0;
  formWeights.set(1, 0, 0, 0);
  points.visible = false;
 },
 setForm(name){if(!names.includes(name)||name===form)return;form=name;migrating=true;},
 updateTrace(trace){const dst=geo.attributes.aTrace.array;for(let j=0;j<n*3;j+=3)for(let k=0;k<3;k++){dst[j+k]=0;for(let b=0;b<3;b++)dst[j+k]+=trace[samples[j+b]*3+k]*weights[j+b]}geo.attributes.aTrace.needsUpdate=true;},
 update(dt,amount,colors,opening=false){
  const goal=migrating?1:T.MathUtils.clamp(amount,0,1);s=opening&&!migrating?goal:s+(goal-s)*(1-Math.exp(-dt*3.2));if(Math.abs(goal-s)<.0001)s=goal;
  if(migrating&&s>.86){const wanted=names.indexOf(form),w=formWeights.toArray();let error=0;for(let k=0;k<4;k++){w[k]+=((k===wanted?1:0)-w[k])*(1-Math.exp(-dt*4));error+=Math.abs((k===wanted?1:0)-w[k])}if(error<.002){w.fill(0);w[wanted]=1;migrating=false}formWeights.fromArray(w)}
  uniforms.scatter.value=s;shared.uDissolve.value=Math.max(s,1-formWeights.x);
  setColors(colors);points.visible=shared.uDissolve.value>.005;
  return 1-shared.uDissolve.value;
 },get form(){return form},get transitioning(){return migrating},get amount(){return s}
 };
}
