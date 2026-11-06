import * as THREE from './vendor/three.module.js';
// Empty paper-white space. Reflection cards light the object but are never a visible backdrop.
export function createGallery(scene,renderer){
 scene.background=new THREE.Color('#f7f7f7');scene.fog=null;
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({color:'#000000',opacity:.12}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-2.06;shadow.receiveShadow=true;scene.add(shadow);
 const hemi=new THREE.HemisphereLight('#ffffff','#888888',1.1);scene.add(hemi);
 const key = new THREE.DirectionalLight('#ffffff', 2.25);
 scene.add(key.target);
 key.position.set(0, 2.65, 8);
 key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:24});key.shadow.bias=-.0002;key.shadow.normalBias=.012;key.shadow.radius=5;scene.add(key);
 const fill=new THREE.DirectionalLight('#ffffff',.8);fill.position.set(-5,3,2);scene.add(fill);
 // Neutral wrap supplies reflected light between the cards, especially on the inward-facing folds.
 const studio=new THREE.Scene();studio.background=new THREE.Color('#adadad');
 for(const [x,y,z,w,h,rotation,intensity]of [[0,1.5,6,6,7,0,1.7],[-4,2,2,5,9,Math.PI/3,2.5],[5,1,1,4,7,-Math.PI/3,1.4],[0,2,-6,2,8,0,.50]]){const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color('#ffffff').multiplyScalar(intensity),side:THREE.DoubleSide}));card.position.set(x,y,z);card.rotation.y=rotation;studio.add(card)}
 const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.035);scene.environment=environment.texture;pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});
 return {
  setColors(){},
  respond(v) {
   shadow.material.opacity = Math.max(.04, Math.min(.22, .1 + v.space * .1));
   key.position.x = key.target.position.x + THREE.MathUtils.clamp(v.light, -1, 1) * 1.1;
   key.intensity = 2.25 + v.brightness * .45;
   fill.intensity = .85 + v.brightness * .15;
  },
  setVisible(value){shadow.visible=value;},
  update(x, y) {
   key.target.position.set(x, y, 0);
   key.position.set(x, y + 2.65, 8);
   shadow.position.y = y - 1.97;
  },
  get visible(){return shadow.visible}
 };
}
