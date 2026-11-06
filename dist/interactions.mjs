export const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, (a.z || 0)-(b.z || 0));
export function handMetrics(hands) {
  if (!hands.length) return null;
  const h = hands[0];
  const palm = Math.max(.025, distance(h[0], h[9]));
  const openness = [8,12,16,20].reduce((sum,i) => sum + distance(h[i],h[0])/palm, 0)/4;
  const pinch = distance(h[4],h[8])/palm;
  const roll = clamp(Math.atan2(h[9].x-h[0].x, h[0].y-h[9].y), -.9,.9);
  const one = {spread:clamp((openness-1.15)/1.05,0,1), scale:clamp(.65+pinch*.6,.6,1.5), rotation:(.5-h[9].x)*5, roll:-roll*.6, pinch, count:1};
  if(hands.length<2) return one;
  const [left,right] = [...hands].sort((a,b)=>a[9].x-b[9].x);
  const gap = Math.hypot(right[9].x-left[9].x,right[9].y-left[9].y);
  return {...one,count:2,pinch:null,spread:clamp((gap-.12)/.5,0,1),scale:clamp(.6+gap*1.35,.6,1.5),rotation:(.5-(left[9].x+right[9].x)/2)*5,roll:clamp(Math.atan2(right[9].y-left[9].y,right[9].x-left[9].x),-.8,.8)};
}
export class PinchRelease {
  constructor(){this.reset()}
  reset(){this.since=null;this.armed=false;this.last=-Infinity}
  update(value,now){
    if(value==null){this.since=null;this.armed=false;return false}
    if(value<.28){if(this.since===null)this.since=now;if(now-this.since>=120)this.armed=true;return false}
    if(value>.5){const fire=this.armed&&now-this.last>800;this.since=null;this.armed=false;if(fire)this.last=now;return fire}
    return false;
  }
}
export class BlinkTrigger {
  constructor(){this.reset()}
  reset(){this.closedAt=null;this.last=-Infinity}
  update(left,right,now){
    if(left==null||right==null){this.closedAt=null;return false}
    if(left>.6&&right>.6){if(this.closedAt===null)this.closedAt=now;return false}
    if(left<.3&&right<.3&&this.closedAt!==null){const duration=now-this.closedAt;this.closedAt=null;const fire=duration>=70&&duration<=650&&now-this.last>900;if(fire)this.last=now;return fire}
    return false;
  }
}
export function irisRatio(points){
  if(points.length<478)return null;
  const ratio=(center,a,b)=>{
    const eye=points[center],left=points[a],right=points[b];
    const dx=right.x-left.x,dy=right.y-left.y,den=dx*dx+dy*dy;
    if(den<1e-6)return null;
    // Orient each eye's axis from image-left to image-right, removing in-plane head roll.
    const value=((eye.x-left.x)*dx+(eye.y-left.y)*dy)/den;
    return dx>=0?value:1-value;
  };
  const a=ratio(468,33,133),b=ratio(473,362,263);
  return a===null||b===null?null:clamp((a+b)/2,0,1);
}
export function audioLevel(samples,sensitivity=1){
  if(!samples.length)return 0;
  let sum=0;for(const x of samples)sum+=x*x;
  return clamp((Math.sqrt(sum/samples.length)-.006)*9*sensitivity,0,1);
}
export class RisingBeat {
  constructor(){this.high=false;this.last=-Infinity}
  update(level,now){if(level<.28)this.high=false;if(level>.58&&!this.high){this.high=true;if(now-this.last>550){this.last=now;return true}}return false}
}
export function blend(current,target,dt,speed=9){return current+(target-current)*(1-Math.exp(-speed*Math.min(dt,.1)))}

export function bodyGesture(hands){
 if(!hands.length)return null;
 const h=hands[0],m=handMetrics(hands),palm=Math.max(.025,distance(h[0],h[9]));
 const extended=[8,12,16,20].map(i=>distance(h[i],h[0])>distance(h[i-2],h[0])*1.12&&distance(h[i],h[i-3])>palm*.65);
 const fingers=extended.filter(Boolean).length;
 const point={x:1-(h[4].x+h[8].x)/2,y:(h[4].y+h[8].y)/2};
 if(hands.length>1){const [a,b]=[...hands].sort((a,b)=>a[9].x-b[9].x);const dx=b[9].x-a[9].x,dy=b[9].y-a[9].y,len=Math.max(.01,Math.hypot(dx,dy));const first = handMetrics([a]), second = handMetrics([b]);
  if (first.pinch < .32 && second.pinch < .32) return {kind:'resize',gap:len,point};
  const counter = first.roll - second.roll;
  if (first.roll * second.roll < 0 && Math.abs(counter) > .42)
   return {kind:'wring',amount:clamp(counter*2.2,-2.15,2.15),point};
  return {kind:'stretch',amount:clamp((len-.12)/.48,0,1)*1.15,axis:[dx/len,dy/len,0],point,rotation:m.rotation,pinch:null};}
 if(fingers===0)return {kind:'compress',amount:-.48,point,rotation:m.rotation,pinch:m.pinch};
 if(m.pinch<.32&&fingers>=1)return {kind:'pull',amount:1,point,rotation:m.rotation,pinch:m.pinch};
 if(extended[0]&&fingers===1)return {kind:'touch',amount:1,point:{x:1-h[8].x,y:h[8].y},rotation:m.rotation,pinch:m.pinch};
 if(fingers>=3&&Math.abs(m.roll)>.23)return {kind:'twist',amount:clamp(m.roll*3.5,-1.6,1.6),point,rotation:m.rotation,pinch:m.pinch};
 if(fingers>=3)return {kind:'inflate',amount:clamp((m.spread-.15)*1.05,.15,.85),point,rotation:m.rotation,pinch:m.pinch};
 return {kind:'rest',amount:0,point,rotation:m.rotation,pinch:m.pinch};
}
export class StablePose {
 constructor(){this.current='rest';this.candidate=null;this.since=0}
 reset(){this.current='rest';this.candidate=null;this.since=0}
 update(raw,now){if(!raw){this.reset();return null}if(raw.kind!==this.candidate){this.candidate=raw.kind;this.since=now}if(raw.kind===this.current||now-this.since>=180){this.current=raw.kind;return raw}return null}
}
