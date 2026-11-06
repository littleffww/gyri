import * as THREE from './vendor/three.module.js';
// Empty paper-white space. Reflection cards light the object but are never a visible backdrop.
export function createGallery(scene,renderer){
 scene.background=new THREE.Color('#f7f7f7');scene.fog=null;
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({color:'#000000',opacity:.12}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-2.06;shadow.receiveShadow=true;scene.add(shadow);
 const hemi=new THREE.HemisphereLight('#ffffff','#888888',1.1);scene.add(hemi);
 const key=new THREE.DirectionalLight('#ffffff',2.8);key.position.set(-4,7,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:24});key.shadow.bias=-.0002;key.shadow.normalBias=.012;key.shadow.radius=5;scene.add(key);
 const fill=new THREE.DirectionalLight('#ffffff',.8);fill.position.set(4,2,-3);scene.add(fill);
 // Neutral wrap supplies reflected light between the cards, especially on the inward-facing folds.
 const studio=new THREE.Scene();studio.background=new THREE.Color('#adadad');
 for(const [x,y,z,w,h,rotation,intensity]of [[-4,2,2,5,9,Math.PI/3,2.5],[5,1,1,4,7,-Math.PI/3,1.4],[0,2,-6,2,8,0,.50]]){const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color('#ffffff').multiplyScalar(intensity),side:THREE.DoubleSide}));card.position.set(x,y,z);card.rotation.y=rotation;studio.add(card)}
 const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.035);scene.environment=environment.texture;pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
 let night = false;
 let response = {space: 0, light: 0, brightness: 0};
 function respond(values) {
  response = values;
  shadow.material.opacity = Math.max(.04, Math.min(.22, .1 + values.space * .1));
  key.position.x = -4 + values.light * 5;
  key.intensity = (night ? 1.5 : 2.5) + values.brightness * .5;
  fill.intensity = (night ? 1.15 : .8) + values.brightness * .2;
 }
 function setNight(enabled) {
  night = enabled;
  scene.background.set(night ? '#17191c' : '#f7f7f7');
  hemi.intensity = night ? .68 : 1.1;
  key.color.set(night ? '#e5e9f2' : '#ffffff');
  fill.color.set(night ? '#bdc8da' : '#ffffff');
  respond(response);
 }
 return {setNight, setColors(){}, respond, setVisible(value){shadow.visible=value;},update(x,y){shadow.position.y=y-1.97;},get visible(){return shadow.visible}};
}
