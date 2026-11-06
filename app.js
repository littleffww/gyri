import {captureTrace} from './identity.mjs?v=agency-final';
import {createParticles} from './particles.mjs?v=agency-final';
import './languages.mjs?v=voice-v7.5';
import {connectVoiceButton} from './sculpture-voice.mjs';
import * as THREE from './vendor/three.module.js';
import {clamp,bodyGesture,handMetrics,StablePose,BlinkTrigger,irisRatio,audioLevel,RisingBeat,blend} from './interactions.mjs?v=agency-final';
import {Sensors} from './sensors.mjs?v=agency-final';
import {makeSoftMaterial,loadSoftGeometry,springStep,deformPoint} from './softbody.mjs?v=agency-final';
import {createGallery} from './gallery.mjs?v=agency-final';
import {LOOKS,CHANNELS,SOURCE_LABELS,defaultRoutes,ResponseField,mapResponse,spectralPosition} from './response.mjs?v=agency-final';
const $=id=>document.getElementById(id),all=s=>[...document.querySelectorAll(s)];
const defaults={mode:'manual',look:'quiet',reactivity:.85,memory:.6,roomColor:false,shape:'inflate',spread:.7,scale:1,rotation:.55,roll:0,demo:false,frozen:false,motion:!matchMedia('(prefers-reduced-motion: reduce)').matches,speed:1,palette:'mint',elastic:true};
const state={...defaults};
const field=new ResponseField();let routes=defaultRoutes();
let lastAudioLevel=0;
const targets={inflate:0,stretch:0,twist:0,grip:0};
const current={inflate:0,stretch:0,twist:0,grip:0},velocity={inflate:0,stretch:0,twist:0,grip:0};
const targetAxis=new THREE.Vector3(1,0,0),targetDelta=new THREE.Vector3(),grabPoint=new THREE.Vector3(),smoothDelta=new THREE.Vector3();
const poseFilter=new StablePose(),blink=new BlinkTrigger(),beat=new RisingBeat();
let conformity=0,hasTrace=false,lastPointerMotion=0;
let particles=null,particleAmount=0,particleHold=false,particleBurst=0;
const openingLegSeconds = 10;
const openingHoldSeconds = 1.5;
let openingPending = state.motion;
let openingActive = false;
let openingElapsed = 0;
let sculpture=null,baseMesh=null,ready=false,phase=0,pulseAge=99,lastTime=0,lastUI=0,trace=0,tracked=false,calibration=null,gazeZero=null,toastTimer,pullOrigin=null,previousRaw=null,demoStep=-1,demoTime=0;
const shapes={
 inflate:{number:'01 / INFLATE',title:'张掌 · 让表面鼓起',description:'板片向外鼓胀，体积变得饱满。<br>每个部件本身都在变形。'},
 compress:{number:'02 / PRESSURE',title:'握拳 · 施加压力',description:'让结构向内收缩、受压。<br>松手后，它缓慢恢复。'},
 stretch:{number:'03 / EXTEND',title:'双手 · 把它拉长',description:'双手之间的方向，就是拉伸方向。<br>横向、纵向、斜向都可以。'},
 twist:{number:'04 / TORSION',title:'转腕 · 拧曲身体',description:'张开手掌，再左右倾斜。<br>形体上下产生不同程度的扭转。'},
 pull:{number:'05 / TOUCH',title:'捏合 · 牵引局部',description:'手的高度决定触碰的位置。<br>捏住、移动，再松开。'}
};
const modes = {
 manual: {badge: '鼠标', guide: '拖动雕塑塑形，按住不动让它散开。'},
 hand: {badge: '手势', guide: '张掌膨胀，握拳压缩。双手拉伸，捏合牵引。'},
 eye: {badge: '目光', guide: '看向中央校准，再左右看。眨眼释放粒子。'},
 audio: {badge: '声音', guide: '对着麦克风轻声哼唱，或拍手释放粒子。'}
};
function status(t){$('status').textContent=t}
// Run once after the geometry is ready; actual input immediately takes over.
// A cached page shell can briefly precede the audio control during a Pages rollout.
let voiceButton = $('voiceSwitch');
if (!voiceButton) {
 voiceButton = document.createElement('button');
 voiceButton.id = 'voiceSwitch';
 voiceButton.className = 'voice-switch';
 voiceButton.setAttribute('aria-pressed', 'false');
 voiceButton.textContent = '开启作品人声';
 $('instructions').before(voiceButton);
}
const voice = connectVoiceButton(voiceButton, toast);
function stopOpening(event){
 if(event?.target?.closest?.('#voiceSwitch'))return;
 if(!openingPending&&!openingActive)return;
 openingPending=false;
 if(openingActive){openingActive=false;particleAmount=event?.type==='input'&&event.target===$('particleRange')?+event.target.value:0;$('particleRange').value=particleAmount;status('')}
}
function stepOpening(dt) {
 if (!ready || document.hidden) return;
 if (openingPending) {
  openingPending = false;
  openingActive = true;
  openingElapsed = 0;
  status('开场演示中，触碰即可开始操作。');
  return;
 }
 if (!openingActive) return;

 openingElapsed += dt;
 const gatherStart = openingLegSeconds + openingHoldSeconds;
 const duration = gatherStart + openingLegSeconds;
 const progress = clamp(Math.min(openingElapsed, duration - openingElapsed) / openingLegSeconds, 0, 1);
 // Ease into the fully scattered pose, hold it, then retrace the same curve.
 particleAmount = progress * progress * (3 - 2 * progress);
 $('particleRange').value = particleAmount;
 if (openingElapsed >= duration) {
  openingActive = false;
  status('');
 }
}
for(const type of ['pointerdown','wheel','input','click'])document.addEventListener(type,stopOpening,{capture:true,passive:true});
document.addEventListener('keydown',e=>{if(!['Tab','Shift','Control','Alt','Meta'].includes(e.key))stopOpening(e)},{capture:true});
function toast(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2200)}
function describeShape(shape){state.shape=shape;}
function clearTargets(){field.clear();for(const key in targets)targets[key]=0;pullOrigin=null;previousRaw=null;}
function poseLabel(label){const readout=$('poseName');readout.hidden=state.mode==='manual';readout.textContent=label;}
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.01,100);camera.position.set(0,1,10);camera.lookAt(0,0,0);
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})}catch(e){status('当前浏览器无法启动三维显示，请换用 Chrome / Safari。');throw e}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;$('stage').appendChild(renderer.domElement);
const gallery=createGallery(scene,renderer);
const root=new THREE.Group();scene.add(root);
const {material,uniforms,depthMaterial}=makeSoftMaterial();
const marker=new THREE.Mesh(new THREE.SphereGeometry(.028,12,8),new THREE.MeshBasicMaterial({color:'#333333',transparent:true,opacity:.6,depthTest:false}));const markerMaterial=marker.material;root.add(marker);marker.visible=false;marker.renderOrder=10;
function layout(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const mobile=innerWidth<=760;camera.position.set(0,mobile?1.5:1.7,mobile?17:10.3);const width=2*Math.tan(THREE.MathUtils.degToRad(18))*camera.position.z*camera.aspect;root.position.set(mobile?.35:-width*.035,mobile?1.35:-.09,0);camera.lookAt(0,mobile?.35:-.15,0);gallery.update(root.position.x,root.position.y)}layout();addEventListener('resize',layout);
const sensors=new Sensors($('video'),message=>{if(!sensors.kind&&!sensors.starting)clearTargets();status(message);syncSensorUI()});
function syncSensorUI(){const active=!!sensors.kind,busy=sensors.starting,manual=state.mode==='manual';$('sensorStart').hidden=manual||active||busy;$('sensorStart').textContent=state.mode==='audio'?'开启麦克风':'开启摄像头';$('sensorStop').hidden=!active&&!busy;$('sensorStop').textContent=busy?'取消启动':'停止'+(state.mode==='audio'?'麦克风':'摄像头');$('videoBox').hidden=!active||state.mode==='audio';$('eyeControls').hidden=state.mode!=='eye';$('audioControls').hidden=state.mode!=='audio';$('calibrate').disabled=sensors.kind!=='eye';}
function updateControls(){$('voiceSwitch').disabled=state.mode==='audio'||state.frozen;for(const id of ['spread','scale','speed','reactivity','memory'])$(id).value=state[id];$('reactivityValue').textContent=Math.round(state.reactivity*100)+'%';$('memoryValue').textContent=state.memory.toFixed(1)+'×';$('spreadValue').textContent=Math.round(state.spread*100)+'%';$('scaleValue').textContent=state.scale.toFixed(2)+'×';$('speedValue').textContent=state.speed.toFixed(1)+'×';$('motion').checked=state.motion;$('demo').textContent=state.demo?'停止演示':'播放演示';$('freeze').textContent=state.frozen?'继续画面':'暂停画面';$('freeze').setAttribute('aria-pressed',String(state.frozen));document.body.classList.toggle('frozen',state.frozen);
 all('[data-shape]').forEach(b=>{const active=state.mode==='manual'&&state.shape===b.dataset.shape&&Object.values(targets).some(v=>Math.abs(v)>.02);b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active))});
}
function selectMode(mode){if(mode==='audio')voice.off();$('voiceSwitch').disabled=mode==='audio'||state.frozen;sensors.stop();state.mode=mode;lastAudioLevel=0;renderRoutes();state.demo=false;tracked=false;poseFilter.reset();blink.reset();gazeZero=null;calibration=null;clearTargets();$('calibrate').textContent='看向模型中央，校准目光';$('audioMeter').style.width='0%';all('.meter')[0].setAttribute('aria-valuenow','0');all('[data-mode]').forEach(b=>{const selected=b.dataset.mode===mode;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected))});$('instructions').textContent=modes[mode].guide;poseLabel('等待一次触碰',mode==='manual'?'鼠标 / 模拟输入':modes[mode].badge+'未开启');status('');syncSensorUI();updateControls()}
function simulate(shape,fromDemo=false){if(!fromDemo){selectMode('manual');state.frozen=false}describeShape(shape);clearTargets();targetAxis.set(1,0,0);if(shape==='inflate')targets.inflate=.85;if(shape==='compress')targets.inflate=-.48;if(shape==='stretch')targets.stretch=1.15;if(shape==='twist')targets.twist=1.6;if(shape==='pull'){grabPoint.set(0,.65,0);targetDelta.set(1.1,.45,.2);targets.grip=1}const simulation={inflate:{position:.8,energy:.95,motion:.35},compress:{position:.15,energy:.08,motion:.2},stretch:{position:.62,energy:.65,motion:.6},twist:{position:.22,energy:.72,motion:.9},pull:{position:.92,energy:.5,motion:.55}}[shape];field.feed(simulation,performance.now(),true);field.trigger(performance.now());poseLabel(shapes[shape].title,fromDemo?'自动演示 · 模拟输入':'模拟输入 · 未使用摄像头');if(!fromDemo)status('模拟手势效果，未使用摄像头。');updateControls()}
function release(announce=true){state.demo=false;clearTargets();poseLabel('松手 · 等待下一次决定',sensors.kind?'实时输入仍开启':'模拟输入');if(announce)toast(sensors.kind?'已释放；下一个实时动作会继续控制模型':'松手，让形体恢复');updateControls()}
function emitPulse(announce=false){if(state.frozen)return;pulseAge=0;trace=1;particleBurst=1;field.trigger(performance.now());if(announce)toast('波纹正在穿过表面')}
function setLook(name){state.look=LOOKS[name]?name:'acid';const look=LOOKS[state.look];uniforms.uArtMix.value=state.look==='quiet'?0:1;uniforms.uPigmentA.value.set(look.colors[0]);uniforms.uPigmentB.value.set(look.colors[1]);uniforms.uPigmentC.value.set(look.colors[2]);gallery.setColors(look.colors[0],look.colors[1]);all('[data-look]').forEach(b=>{const active=b.dataset.look===state.look;b.setAttribute('aria-pressed',String(active));b.classList.toggle('selected',active)});}
function renderRoutes(){
 const labels=SOURCE_LABELS[state.mode];
 $('routeList').innerHTML=Object.entries(CHANNELS).map(([key,item])=>`<div class="route"><div class="route-heading"><label for="route-${key}">${item.label}</label><select id="route-${key}" data-route="${key}" aria-label="${item.label}的输入">${Object.entries(labels).map(([source,label])=>`<option value="${source}" ${routes[key].source===source?'selected':''}>${label}</option>`).join('')}</select></div><div class="route-gain"><input id="gain-${key}" data-gain="${key}" type="range" min="0" max="1.5" step=".05" value="${routes[key].gain}" aria-label="${item.label}的变化幅度"><output id="gain-value-${key}" for="gain-${key}">${Math.round(routes[key].gain*100)}%</output></div></div>`).join('');
 all('[data-route]').forEach(el=>el.onchange=()=>{routes[el.dataset.route].source=el.value});
 all('[data-gain]').forEach(el=>el.oninput=()=>{routes[el.dataset.gain].gain=+el.value;$('gain-value-'+el.dataset.gain).textContent=Math.round(+el.value*100)+'%'});
}
function updateAppearance(dt,now){
 const signal=field.step(dt,now,state.memory),values=mapResponse(signal,routes,state.reactivity),look=LOOKS[state.look];
 const quiet={mint:{roughness:.36,metalness:.72,env:1.1},violet:{roughness:.64,metalness:0,env:.24},amber:{roughness:.83,metalness:0,env:.4}}[state.palette];
 const surface=state.look==='quiet'?quiet:look;
 uniforms.uColorPhase.value=values.hue*2.2;uniforms.uColorWarp.value=clamp(.2+values.pattern*2,0,3);uniforms.uColorSaturation.value=clamp(.9+values.saturation*.6,.2,1.5);
 material.roughness=clamp(surface.roughness-values.gloss*.45,.12,.95);material.metalness=clamp(surface.metalness+values.gloss*.48,0,.95);material.envMapIntensity=surface.env;
 material.clearcoat=clamp(.15+values.gloss*.7,.001,1);material.clearcoatRoughness=clamp(.35-values.gloss*.2,.08,.5);material.iridescence=state.look==='quiet'?0:clamp((look.iridescence||0)+values.gloss*.4,.001,1);material.iridescenceThicknessRange[1]=clamp(380+values.hue*180+values.gloss*180,150,650);
 gallery.respond(values,state.roomColor&&state.look!=='quiet');
}
all('[data-look]').forEach(b=>b.onclick=()=>setLook(b.dataset.look));
all('.panel details').forEach(detail=>detail.addEventListener('toggle',()=>{if(!detail.open)document.querySelector('.panel').scrollTo({top:0,behavior:'auto'})}));
$('restoreRoutes').onclick=()=>{routes=defaultRoutes();renderRoutes();toast('已恢复当前输入的默认映射')};
$('roomColor').onchange=e=>state.roomColor=e.target.checked;
for(const id of ['reactivity','memory'])$(id).oninput=e=>{state[id]=+e.target.value;updateControls()};
function palette(name){state.palette=name;const p={mint:{body:'#999999',roughness:.36,metalness:.72,env:1.1},violet:{body:'#777777',roughness:.64,metalness:0,env:.24},amber:{body:'#ae7660',roughness:.83,metalness:0,env:.4}}[name];material.color.set(p.body);material.roughness=p.roughness;material.metalness=p.metalness;material.envMapIntensity=p.env;all('[data-palette]').forEach(b=>{const selected=b.dataset.palette===name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))})}
all('[data-mode]').forEach(b=>b.onclick=()=>selectMode(b.dataset.mode));all('[data-shape]').forEach(b=>b.onclick=()=>simulate(b.dataset.shape));all('[data-palette]').forEach(b=>b.onclick=()=>{palette(b.dataset.palette);setLook('quiet')});
$('sensorStart').onclick=async()=>{state.demo=false;state.frozen=false;const mode=state.mode,pending=sensors.start(mode);syncSensorUI();const ok=await pending;if(ok&&mode===state.mode){poseFilter.reset();clearTargets();tracked=false;gazeZero=null;calibration=null;poseLabel('等待识别',modes[mode].badge+'实时输入');status(mode==='hand'?'掌心朝向镜头。先张掌，再握拳，观察表面变化。':mode==='eye'?'看向模型中央，点击校准目光。':'麦克风已开启。说话或拍手，让身体鼓胀。')}syncSensorUI()};
$('sensorStop').onclick=()=>{sensors.stop();release(false);tracked=false;poseFilter.reset();calibration=null;poseLabel('松手 · 缓慢回弹','设备已关闭');status('输入已关闭，模型将回弹。可以继续模拟动作。');syncSensorUI()};
$('release').onclick=()=>{particleAmount=0;particleHold=false;particleBurst=0;$('particleRange').value=0;release()};
function savePersonalTrace(announce=true){
 if(!sculpture||state.frozen)return;
 const g=sculpture.geometry;
 const trace=captureTrace(g.attributes.position.array,g.attributes.aCenter.array,g.attributes.aTrace.array,1-conformity,{...current,grip:uniforms.uGrip.value,axis:uniforms.uAxis.value.toArray(),grab:grabPoint.toArray(),delta:smoothDelta.toArray(),pulse:pulseAge});
 g.attributes.aTrace.array.set(trace);g.attributes.aTrace.needsUpdate=true;particles.updateTrace(trace);
 conformity=0;$('conformity').value=0;$('conformityValue').textContent='0%';uniforms.uTraceAmount.value=1;
 clearTargets();for(const k in current){current[k]=0;velocity[k]=0}for(const key of ['uInflate','uStretch','uTwist','uGrip'])uniforms[key].value=0;
 pulseAge=99;uniforms.uPulse.value=99;hasTrace=true;$('traceStatus').textContent='痕迹已留下；建议可以撤回。';if(announce)toast('留下的是你的动作，而不是系统的答案。');
}
function clearPersonalTrace(){if(sculpture){const g=sculpture.geometry;g.attributes.aTrace.array.set(g.attributes.position.array);g.attributes.aTrace.needsUpdate=true;particles?.updateTrace(g.attributes.position.array)}hasTrace=false;conformity=0;$('conformity').value=0;$('conformityValue').textContent='0%';$('traceStatus').textContent='还没有留下痕迹。';}
$('keepTrace').onclick=()=>savePersonalTrace();$('clearTrace').onclick=()=>{clearPersonalTrace();release(false)};
$('conformity').oninput=e=>{conformity=+e.target.value;$('conformityValue').textContent=Math.round(conformity*100)+'%';$('traceStatus').textContent=conformity>0?'系统正把形体推向预设原形。':hasTrace?'建议已撤回，你的痕迹仍在。':'还没有留下痕迹。';};
$('scatter').onclick=()=>{particleAmount=1;$('particleRange').value=1};
$('gather').onclick=()=>{particleAmount=0;particleHold=false;particleBurst=0;$('particleRange').value=0;release(false)};
$('particleRange').oninput=e=>particleAmount=+e.target.value;
all('[data-form]').forEach(b=>b.onclick=()=>{release(false);particles?.setForm(b.dataset.form);particleAmount=0;$('particleRange').value=0;all('[data-form]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
$('demo').onclick=()=>{const next=!state.demo;if(next){selectMode('manual');state.frozen=false;demoTime=0;demoStep=-1}state.demo=next;if(!next)clearTargets();status(next?'正在依次模拟张掌、握拳、拉伸、扭曲和局部牵引。':'演示已停止，身体正在恢复。');updateControls()};
$('freeze').onclick=()=>{state.frozen=!state.frozen;if(state.frozen)voice.off();updateControls();toast(state.frozen?(sensors.kind?'画面暂停；实时输入仍开启':'画面已暂停'):'继续运动')};
for(const id of ['spread','scale','speed'])$(id).oninput=e=>{state[id]=+e.target.value;updateControls()};$('sensitivity').oninput=e=>$('sensitivityValue').textContent=(+e.target.value).toFixed(1)+'×';$('motion').onchange=e=>state.motion=e.target.checked;$('elastic').onchange=e=>state.elastic=e.target.checked;$('wire').onchange=e=>material.wireframe=e.target.checked;$('space').onchange=e=>gallery.setVisible(e.target.checked);$('base').onchange=e=>{if(baseMesh)baseMesh.visible=e.target.checked};
$('calibrate').onclick=()=>{if(sensors.kind!=='eye')return;calibration={start:performance.now(),values:[]};gazeZero=null;$('calibrate').textContent='校准中，请保持头部稳定…';status('看向模型中央，自然睁眼，约 2 秒完成校准。')};
$('conceptOpen').onclick=()=>$('concept').showModal();$('conceptClose').onclick=()=>$('concept').close();
function reset(){voice.off();clearPersonalTrace();particleAmount=0;particleHold=false;particleBurst=0;particles?.setForm('original');$('particleRange').value=0;all('[data-form]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.form==='original')));clearTimeout(toastTimer);$('toast').hidden=true;selectMode('manual');Object.assign(state,defaults);field.reset();routes=defaultRoutes();renderRoutes();$('roomColor').checked=false;setLook('quiet');for(const k in current){current[k]=0;velocity[k]=0}clearTargets();smoothDelta.set(0,0,0);phase=0;pulseAge=99;trace=0;material.wireframe=false;$('wire').checked=false;$('base').checked=false;if(baseMesh)baseMesh.visible=false;$('space').checked=true;gallery.setVisible(true);$('keepOnRelease').checked=true;$('elastic').checked=true;$('blinkEnabled').checked=true;$('sensitivity').value=1.5;$('sensitivityValue').textContent='1.5×';describeShape('inflate');palette('mint');updateControls();status('已恢复原形，摄像头和麦克风均已关闭。')}
$('reset').onclick=reset;$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('当前浏览器不支持全屏')}};
$('snapshot').onclick=()=>{if(!ready)return;renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(!blob){toast('保存失败，请重试');return}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Gyri-UNSMOOTH-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('已保存场景，不包含摄像头画面')},'image/png')};
let drag=false,dragPull=false,px=0,py=0,mouseOrigin=null;
function pointerResponse(e){field.feed({position:e.clientX/innerWidth,energy:1-e.clientY/innerHeight},performance.now(),true)}
renderer.domElement.style.touchAction='none';
renderer.domElement.onpointerdown=e=>{if(sensors.kind||sensors.starting||state.mode!=='manual')selectMode('manual');state.demo=false;particleHold=false;lastPointerMotion=performance.now();drag=true;dragPull=state.shape==='pull'||e.shiftKey;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);if(dragPull){clearTargets();describeShape('pull');grabPoint.set(0,clamp((.5-e.clientY/innerHeight)*5,-1.6,1.6),0);targetDelta.set(0,0,0);targets.grip=1;mouseOrigin={x:e.clientX,y:e.clientY};poseLabel('拖动 · 局部牵引','鼠标输入')}pointerResponse(e);field.trigger(performance.now());updateControls()};
renderer.domElement.onpointermove=e=>{if(state.mode==='manual'&&!state.demo&&!state.frozen)pointerResponse(e);if(!drag||state.frozen)return;particleHold=false;lastPointerMotion=performance.now();if(dragPull){targetDelta.set(clamp((e.clientX-mouseOrigin.x)/innerWidth*7,-1.6,1.6),clamp((mouseOrigin.y-e.clientY)/innerHeight*5,-1.6,1.6),.15)}else if(e.altKey){state.rotation+=(e.clientX-px)*.008;state.roll=clamp(state.roll+(e.clientY-py)*.002,-.4,.4)}else{const dx=(e.clientX-px)/innerWidth*8,dy=(py-e.clientY)/innerHeight*7;if(state.shape==='inflate')targets.inflate=clamp(targets.inflate+dy,-.45,1.1);if(state.shape==='compress')targets.inflate=clamp(targets.inflate-Math.abs(dy)-Math.abs(dx)*.5,-.6,0);if(state.shape==='stretch')targets.stretch=clamp(targets.stretch+dx,-.5,1.6);if(state.shape==='twist')targets.twist=clamp(targets.twist+dx*2,-2.2,2.2)}px=e.clientX;py=e.clientY};
renderer.domElement.onpointerup=renderer.domElement.onpointercancel=e=>{if(drag&&$('keepOnRelease').checked&&Object.values(current).some(v=>Math.abs(v)>.005))savePersonalTrace(false);release(false);particleHold=false;drag=false;dragPull=false;if(e.pointerType==='touch')field.clear()};
renderer.domElement.onpointerleave=()=>{if(!drag&&state.mode==='manual'&&!state.demo)field.clear()};
renderer.domElement.ondblclick=()=>emitPulse(true);renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();state.scale=clamp(state.scale-e.deltaY*.001,.6,1.4);updateControls()},{passive:false});
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat||$('concept').open||['INPUT','BUTTON','TEXTAREA','SELECT','SUMMARY'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();$('freeze').click()}else if(e.key.toLowerCase()==='k')savePersonalTrace();else if(e.key.toLowerCase()==='r')reset();else if(e.key==='Escape')release();else if('12345'.includes(e.key)&&e.key.length===1)simulate(Object.keys(shapes)[Number(e.key)-1])});
const canvas=$('skeleton'),ctx=canvas.getContext('2d');
function drawHands(hands){ctx.clearRect(0,0,640,480);for(const [j,hand] of hands.entries()){ctx.strokeStyle=j?'#d6cbb5':'#d6e2c7';ctx.lineWidth=2;for(const chain of [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]]){ctx.beginPath();chain.forEach((i,k)=>{const p=hand[i];k?ctx.lineTo(p.x*640,p.y*480):ctx.moveTo(p.x*640,p.y*480)});ctx.stroke()}ctx.fillStyle='#fff';for(const p of hand){ctx.beginPath();ctx.arc(p.x*640,p.y*480,2.5,0,Math.PI*2);ctx.fill()}}}
function drawEyes(points){ctx.clearRect(0,0,640,480);ctx.strokeStyle='#d6e2c7';ctx.lineWidth=2;for(const indexes of [[33,160,158,133,153,144,33],[362,385,387,263,373,380,362]]){ctx.beginPath();indexes.forEach((i,k)=>{const p=points[i];k?ctx.lineTo(p.x*640,p.y*480):ctx.moveTo(p.x*640,p.y*480)});ctx.stroke()}for(const i of [468,473]){const p=points[i];if(p){ctx.beginPath();ctx.arc(p.x*640,p.y*480,4,0,Math.PI*2);ctx.stroke()}}}
function applyHand(raw,now){
 const stable=poseFilter.update(raw,now);
 if(!raw){if(tracked){if($('keepOnRelease').checked&&Object.values(current).some(v=>Math.abs(v)>.005))savePersonalTrace(false);clearTargets();poseLabel('松手 · 正在回弹','没有检测到手');status('手已离开镜头，身体缓慢回弹。')}tracked=false;previousRaw=null;return}
 if(previousRaw==='pull'&&raw.kind!=='pull'){targets.grip=0;pullOrigin=null;trace=1;emitPulse(false)}previousRaw=raw.kind;
 if(!stable)return;
 if(!tracked)status('已识别。尝试张掌、握拳、双手拉开，以及捏合后移动。');tracked=true;
 const g=stable,oldGrip=targets.grip;
 for(const k in targets)targets[k]=0;
 if(g.kind==='inflate'||g.kind==='compress'){targets.inflate=g.amount;describeShape(g.kind);state.rotation=g.rotation*.12}
 if(g.kind==='stretch'){targets.stretch=g.amount;targetAxis.set(...g.axis);describeShape('stretch')}
 if(g.kind==='twist'){targets.twist=g.amount;targets.inflate=.1;describeShape('twist')}
 if(g.kind==='pull'){
  if(!pullOrigin){pullOrigin={...g.point};grabPoint.set(0,clamp((.5-g.point.y)*5,-1.6,1.6),0);targetDelta.set(0,0,0)}
  targets.grip=1;targetDelta.set(clamp((g.point.x-pullOrigin.x)*5,-1.6,1.6),clamp((pullOrigin.y-g.point.y)*5,-1.6,1.6),.15);describeShape('pull');
 }else if(g.kind==='touch'){pullOrigin=null;grabPoint.set(0,clamp((.5-g.point.y)*5,-1.6,1.6),0);targetDelta.set((g.point.x-.5)*.7,0,.75);targets.grip=.7;describeShape('pull')}
 else {pullOrigin=null;if(oldGrip>.1)trace=1}
 const names={inflate:'张掌 · 鼓胀',compress:'握拳 · 受压',stretch:'双手 · 定向拉伸',twist:'转腕 · 拧曲',pull:'捏合 · 局部牵引',touch:'食指 · 局部触碰',rest:'放松 · 回弹'};poseLabel(names[g.kind], '摄像头 · 实时手势');$('trackingLabel').textContent=names[g.kind];
}
function trackFrame(now){const result=sensors.frame(now);if(!result)return;
 if(sensors.kind==='hand'){drawHands(result.landmarks);const raw=bodyGesture(result.landmarks);applyHand(raw,now);if(raw){const metrics=handMetrics(result.landmarks);const center=result.landmarks.reduce((sum,h)=>sum+(1-h[9].x),0)/result.landmarks.length;field.feed({position:center,energy:metrics.spread},now)}if(!raw)$('trackingLabel').textContent='没有看到手';}
 else if(sensors.kind==='eye'){
  const face=result.faceLandmarks[0];if(!face){ctx.clearRect(0,0,640,480);blink.update(null,null,now);clearTargets();$('trackingLabel').textContent='没有看到面部';if(calibration&&now-calibration.start>6000){calibration=null;$('calibrate').textContent='重新校准目光';status('校准未完成，请改善光线后重试。')}tracked=false;return}
  drawEyes(face);const scores=Object.fromEntries((result.faceBlendshapes[0]?.categories||[]).map(v=>[v.categoryName,v.score])),left=scores.eyeBlinkLeft,right=scores.eyeBlinkRight;
  if(blink.update(left,right,now)&&$('blinkEnabled').checked&&!calibration)emitPulse();
  const ratio=irisRatio(face),open=(left??1)<.3&&(right??1)<.3;
  if(calibration){if(open&&ratio!==null&&now-calibration.start>400)calibration.values.push(ratio);if(now-calibration.start>1800&&calibration.values.length>=16){const samples=calibration.values.sort((a,b)=>a-b);gazeZero=samples[Math.floor(samples.length/2)];calibration=null;$('calibrate').textContent='重新校准目光';status('校准完成。保持头部稳定，左右看使身体扭曲。');toast('目光中心已校准')}else if(now-calibration.start>6000){calibration=null;$('calibrate').textContent='重新校准目光';status('校准未完成，请改善光线后重试。')}}
  if(gazeZero!==null&&open&&ratio!==null){const delta=ratio-gazeZero;targets.twist=clamp(-Math.sign(delta)*Math.max(0,Math.abs(delta)-.012)*12,-1.6,1.6);field.feed({position:clamp(.5-delta*6,0,1),energy:clamp(Math.abs(delta)*10,0,1)},now);describeShape('twist');poseLabel('注视 · 轻轻拧动','摄像头 · 目光估算')}
  if(!tracked&&!calibration)status(gazeZero===null?'面部已识别。看向模型中央，点击校准目光。':'面部已恢复。保持头部稳定。');tracked=true;$('trackingLabel').textContent=calibration?'正在校准':gazeZero!==null?'目光估算 · 已校准':'面部已识别 · 待校准';
 }
}
function sensorTick(now){try{trackFrame(now);const samples=sensors.audio();if(samples){const level=audioLevel(samples,+$('sensitivity').value);targets.inflate=level*.9;targets.stretch=0;targets.twist=0;const frequency=sensors.frequency();field.feed({position:level>.015?spectralPosition(frequency.bins,frequency.sampleRate,frequency.minDb,frequency.maxDb):.5,energy:level,motion:clamp(Math.abs(level-lastAudioLevel)*12,0,1)},now);lastAudioLevel=level;if(beat.update(level,now))emitPulse();$('audioMeter').style.width=(level*100)+'%';all('.meter')[0].setAttribute('aria-valuenow',Math.round(level*100));describeShape('inflate');poseLabel('声音 · 体积起伏','麦克风 · 实时音量')}}catch(e){sensors.stop();clearTargets();status('识别中断，输入已关闭。可以重试或用模拟手势。');syncSensorUI();console.error(e)}}
loadSoftGeometry().then(({body,base,meta})=>{sculpture=new THREE.Mesh(body,material);sculpture.frustumCulled=false;sculpture.castShadow=true;sculpture.receiveShadow=true;sculpture.customDepthMaterial=depthMaterial;root.add(sculpture);particles=createParticles(body,root,uniforms);baseMesh=new THREE.Mesh(base,new THREE.MeshStandardMaterial({color:'#c0beb5',roughness:.64,metalness:.2}));baseMesh.visible=false;baseMesh.castShadow=true;root.add(baseMesh);ready=true;if(!sensors.kind&&!sensors.starting)status('')}).catch(e=>{status('模型未能加载，请刷新重试。');console.error(e)});
const markerState={axis:[1,0,0],grab:[0,0,0],delta:[0,0,0]};
function animate(now){requestAnimationFrame(animate);const dt=lastTime?Math.min((now-lastTime)/1000,.1):.016;lastTime=now;sensorTick(now);
 if(!state.frozen){stepOpening(dt);if(state.motion||state.demo)phase+=dt*state.speed;
  if(state.demo){demoTime+=dt*state.speed;const stage=Math.floor(demoTime/4.8)%6;if(stage!==demoStep){demoStep=stage;if(stage<5)simulate(Object.keys(shapes)[stage],true);else{clearTargets();poseLabel('松手 · 缓慢回弹','自动演示 · 模拟输入')}}if(stage===2)targetAxis.set(Math.cos(demoTime*.12),Math.sin(demoTime*.12),0);if(stage===4)targetDelta.set(.8+Math.sin(demoTime)*.3,.35,.2);if(stage<5)field.feed({position:.5+Math.sin(demoTime*.4)*.4,energy:.5+Math.sin(demoTime*.65)*.45,motion:.3+Math.sin(demoTime*.7)*.2},now,true)}
  let energy=0;for(const k in current){let goal=targets[k]*(k==='grip'?1:state.spread)*(1-conformity);[current[k],velocity[k]]=springStep(current[k],velocity[k],goal,dt,state.elastic);energy+=Math.abs(current[k])*.3;trace=Math.max(trace,Math.min(1,Math.abs(velocity[k])*.12))}
  trace*=Math.exp(-dt*(state.elastic?.65:3));pulseAge+=dt;
  uniforms.uTraceAmount.value=1-conformity;uniforms.uInflate.value=current.inflate;uniforms.uStretch.value=current.stretch;uniforms.uTwist.value=current.twist;uniforms.uGrip.value=current.grip*state.spread;uniforms.uScatter.value=0;uniforms.uPulse.value=pulseAge;uniforms.uAxis.value.lerp(targetAxis,1-Math.exp(-dt*8)).normalize();uniforms.uGrab.value.copy(grabPoint);smoothDelta.lerp(targetDelta,1-Math.exp(-dt*10));uniforms.uDelta.value.copy(smoothDelta);
  root.rotation.y=blend(root.rotation.y,state.rotation,dt,7);root.rotation.z=blend(root.rotation.z,state.roll,dt,7);const size=blend(root.scale.x,state.scale,dt);root.scale.setScalar(size);
  updateAppearance(dt,now);
  particleBurst=Math.max(0,particleBurst-dt*.6);
  particleHold=drag&&!dragPull&&now-lastPointerMotion>650;
  const live=sensors.kind==='hand'&&tracked?field.value.energy:sensors.kind==='audio'?field.value.energy*.85:0;
  particles?.update(dt,Math.max(particleAmount,particleHold?1:0,particleBurst,live),state.look==='quiet'?['#454545','#999999']:LOOKS[state.look].colors);
  if (ready && voice.active) {
   voice.active.update(dt, {
    scatter: particles.amount, scale: size, inflate: current.inflate,
    stretch: current.stretch, twist: current.twist, pull: current.grip * (1 + smoothDelta.length()),
    suggestion: hasTrace ? conformity : 0
   });
  }
  if(sculpture){sculpture.visible=true;sculpture.castShadow=true;}

  marker.visible=current.grip>.03;if(marker.visible){Object.assign(markerState,{inflate:current.inflate,stretch:current.stretch,twist:current.twist,grip:uniforms.uGrip.value,axis:uniforms.uAxis.value.toArray(),grab:grabPoint.toArray(),delta:smoothDelta.toArray(),pulse:pulseAge});const point=deformPoint(grabPoint.toArray(),grabPoint.toArray(),markerState);marker.position.set(...point);markerMaterial.opacity=Math.min(.7,current.grip*.6);marker.rotation.y=-root.rotation.y;}

 }
 if(now-lastUI>100){updateControls();lastUI=now}renderer.render(scene,camera)
}
addEventListener('pagehide',()=>{voice.off();sensors.stop()});document.addEventListener('visibilitychange',()=>{if(document.hidden)voice.off();if(document.hidden&&(sensors.kind||sensors.starting)){sensors.stop();clearTargets();calibration=null;status('页面进入后台，设备已关闭。返回后可重新开启。');syncSensorUI()}});
selectMode('manual');describeShape('inflate');palette('mint');setLook('quiet');updateControls();requestAnimationFrame(animate);
