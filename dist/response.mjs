import {clamp} from './interactions.mjs?v=agency-final';
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
export const LOOKS={
 acid:{name:'酸性色域',colors:['#c7f51c','#fa246a','#352cc0'],roughness:.44,metalness:.12,iridescence:.16,env:.55},
 ember:{name:'冷暖错位',colors:['#1537e0','#ff4822','#f6ce98'],roughness:.5,metalness:.12,iridescence:.12,env:.55},
 oil:{name:'液态银',colors:['#a6bad1','#d4e718','#8b56dc'],roughness:.2,metalness:.78,iridescence:.8,env:1.1},
 quiet:{name:'素色',colors:['#777b71','#777b71','#777b71'],roughness:.64,metalness:0,iridescence:0,env:.24}
};
export const CHANNELS={
 hue:{label:'色带流向',source:'position',gain:1},
 saturation:{label:'色彩浓度',source:'energy',gain:.65},
 gloss:{label:'光泽 / 金属感',source:'energy',gain:1},
 pattern:{label:'色带扰动',source:'motion',gain:1},
 light:{label:'光源位置',source:'position',gain:1},
 brightness:{label:'光照明暗',source:'pulse',gain:.75},
 space:{label:'投影浓度',source:'energy',gain:.8}
};
export const SOURCE_LABELS={
 manual:{position:'鼠标左右',energy:'鼠标上下',motion:'移动速度',pulse:'按下 / 双击',off:'不跟随'},
 hand:{position:'手的左右位置',energy:'张掌 / 双手距离',motion:'移动速度',pulse:'捏合后松开',off:'不跟随'},
 eye:{position:'视线左右',energy:'目光偏移幅度',motion:'视线移动速度',pulse:'眨眼',off:'不跟随'},
 audio:{position:'声音的高低频分布',energy:'音量',motion:'声音起伏',pulse:'节拍',off:'不跟随'}
};
export const defaultRoutes=()=>Object.fromEntries(Object.entries(CHANNELS).map(([k,v])=>[k,{source:v.source,gain:v.gain}]));
export function mapResponse(signal,routes,amount=1){
 const inputs={position:clamp(finite(signal.position,.5),0,1)-.5,energy:clamp(finite(signal.energy),0,1),motion:clamp(finite(signal.motion),0,1),pulse:clamp(finite(signal.pulse),0,1),off:0};
 return Object.fromEntries(Object.keys(CHANNELS).map(k=>{const r=routes[k]||CHANNELS[k];return [k,(inputs[r.source]??0)*clamp(finite(r.gain),0,1.5)*clamp(finite(amount),0,1.5)]}));
}
// No clock-driven animation: the clock only smooths, decays impulses, and expires lost input.
export class ResponseField{
 constructor(){this.reset()}
 reset(){this.value={position:.5,energy:0,motion:0,pulse:0};this.raw={...this.value};this.last=-Infinity;this.previous=null;this.persistent=false;this.pulseAt=-Infinity;}
 feed(input,now,persistent=false){
  const position=clamp(finite(input.position,.5),0,1),energy=clamp(finite(input.energy),0,1);
  const seconds=this.previous?clamp((now-this.last)/1000,.016,.3):1;
  const speed=this.previous?Math.hypot(position-this.previous.position,energy-this.previous.energy)/seconds*.16:0;
  Object.assign(this.raw,{position,energy,motion:clamp(finite(input.motion,speed),0,1)});
  this.previous={position,energy};this.last=now;this.persistent=persistent;
 }
 trigger(now){this.pulseAt=now;}
 clear(){this.last=-Infinity;this.persistent=false;this.previous=null;this.pulseAt=-Infinity;}
 step(dt,now,memory=.6){
  dt=clamp(finite(dt),0,.1);const active=this.persistent||now-this.last<650;
  const rate=1-Math.exp(-dt/(.12+clamp(memory,0,2)*.6));
  const pulse=Math.exp(-Math.max(0,now-this.pulseAt)/420);
  const target={position:active?this.raw.position:.5,energy:active?this.raw.energy:0,motion:active?this.raw.motion*Math.exp(-Math.max(0,now-this.last)/220):0,pulse};
  for(const k in this.value){this.value[k]+=(target[k]-this.value[k])*rate;if(Math.abs(target[k]-this.value[k])<1e-6)this.value[k]=target[k];}
  return this.value;
 }
}
// Byte spectrum bins are uniformly spaced up to Nyquist; convert dB bins to power.
export function spectralPosition(bins,sampleRate=48000,minDb=-100,maxDb=-30){
 if(!bins?.length)return .5;
 let weighted=0,total=0;const step=sampleRate/(2*bins.length);
 for(let i=1;i<bins.length;i++){const hz=i*step;if(hz<80||hz>8000||bins[i]<8)continue;const power=10**((minDb+(maxDb-minDb)*bins[i]/255)/10);weighted+=power*hz;total+=power;}
 if(total<1e-8)return .5;
 return clamp(Math.log2(Math.max(100,weighted/total)/100)/Math.log2(8000/100),0,1);
}
