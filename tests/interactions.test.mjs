import test from 'node:test';
import assert from 'node:assert/strict';
import {PinchRelease,BlinkTrigger,handMetrics,irisRatio,audioLevel,RisingBeat} from '../dist/interactions.mjs';
import {requestMedia} from '../dist/sensors.mjs';

test('pinch fires once on sustained release; loss of tracking cannot fire it',()=>{
 const p=new PinchRelease();assert.equal(p.update(.2,0),false);assert.equal(p.update(.2,150),false);assert.equal(p.update(.6,200),true);assert.equal(p.update(.7,220),false);
 p.update(.2,1200);p.update(.2,1400);p.update(null,1500);assert.equal(p.update(.7,1600),false);
 p.update(.2,2000);assert.equal(p.update(.7,2040),false);
});
test('blink requires both eyes and ignores prolonged closure and lost faces',()=>{
 const b=new BlinkTrigger();b.update(.8,.1,0);assert.equal(b.update(.1,.1,120),false);b.update(.8,.8,200);assert.equal(b.update(.1,.1,320),true);
 b.update(.8,.8,1500);assert.equal(b.update(.1,.1,2400),false);b.update(.8,.8,3000);b.update(null,null,3100);assert.equal(b.update(.1,.1,3200),false);
});
function hand(x){const h=Array.from({length:21},()=>({x,y:.5,z:0}));h[0].y=.7;h[9].y=.5;for(const i of [8,12,16,20])h[i].y=.28;h[4]={x:x-.08,y:.4,z:0};return h;}
test('two-hand mapping is order-independent and bounded',()=>{
 assert.equal(handMetrics([]),null);const a=hand(.2),b=hand(.8);assert.deepEqual(handMetrics([a,b]),handMetrics([b,a]));const near=handMetrics([hand(.45),hand(.55)]),far=handMetrics([a,b]);assert.ok(far.spread>near.spread);assert.ok(far.scale>near.scale);assert.ok(far.scale<=1.5);assert.equal(far.count,2);
});
test('eye ratios normalize face translation and size; missing iris is rejected',()=>{
 const face=Array.from({length:478},()=>({x:.5,y:.5,z:0}));Object.assign(face[33],{x:.2});Object.assign(face[133],{x:.4});Object.assign(face[362],{x:.6});Object.assign(face[263],{x:.8});Object.assign(face[468],{x:.3});Object.assign(face[473],{x:.7});assert.ok(Math.abs(irisRatio(face)-.5)<1e-6);const transformed=face.map(p=>({x:p.x*.6+.1,y:p.y*.6+.1,z:0}));assert.ok(Math.abs(irisRatio(face)-irisRatio(transformed))<1e-6);assert.equal(irisRatio([]),null);
});
test('audio silence stays zero and sustained loudness does not retrigger a beat',()=>{
 assert.equal(audioLevel(new Float32Array(1024)),0);assert.equal(audioLevel(new Float32Array(20).fill(1),4),1);const b=new RisingBeat();assert.equal(b.update(.8,0),true);assert.equal(b.update(.9,1000),false);b.update(.1,1200);assert.equal(b.update(.8,1400),true);
});
test('cancelling pending camera access stops a stream that arrives late',async()=>{
 let resolveMedia,stops=0;const device={getUserMedia:()=>new Promise(resolve=>resolveMedia=resolve)},abort=new AbortController();const p=requestMedia({},abort.signal,device);abort.abort();await assert.rejects(p,{name:'AbortError'});resolveMedia({getTracks:()=>[{stop:()=>stops++}]});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(stops,1);
});
test('timed-out camera requests also stop late streams',async()=>{
 let resolveMedia,stops=0;const device={getUserMedia:()=>new Promise(resolve=>resolveMedia=resolve)};const p=requestMedia({},new AbortController().signal,device,5);await assert.rejects(p,/超时/);resolveMedia({getTracks:()=>[{stop:()=>stops++}]});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(stops,1);
});

test('opposed wrist tilts and dual pinches take priority over two-hand stretch',async()=>{
 const {bodyGesture}=await import('../dist/interactions.mjs');
 const left=hand(.28),right=hand(.72);
 left[0].x-=.16;right[0].x+=.16;
 assert.equal(bodyGesture([left,right]).kind,'wring');
 assert.equal(bodyGesture([right,left]).amount,bodyGesture([left,right]).amount);
 for(const h of [left,right])h[4]={...h[8]};
 const resize=bodyGesture([left,right]);assert.equal(resize.kind,'resize');assert.ok(resize.gap>.4);
});
