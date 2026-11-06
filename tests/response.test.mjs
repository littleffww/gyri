import test from 'node:test';
import assert from 'node:assert/strict';
import {ResponseField,mapResponse,defaultRoutes,spectralPosition} from '../dist/response.mjs';

test('an idle scene has no clock-driven colour or light motion',()=>{
 const f=new ResponseField();const a={...f.step(.1,0)};
 for(let now=100;now<20000;now+=100)f.step(.1,now);
 assert.deepEqual(f.value,a);
});
test('a held mouse position remains stable, motion and impulses decay',()=>{
 const f=new ResponseField();f.feed({position:.9,energy:.8,motion:1},0,true);f.trigger(0);
 for(let now=0;now<10000;now+=16)f.step(.016,now);
 assert.ok(Math.abs(f.value.position-.9)<1e-5);assert.ok(Math.abs(f.value.energy-.8)<1e-5);
 assert.ok(f.value.motion<1e-5&&f.value.pulse<1e-5);
});
test('lost tracking and mode changes return every visual channel to rest',()=>{
 for(const clear of [false,true]){const f=new ResponseField();f.feed({position:.05,energy:1,motion:1},0,clear);f.trigger(0);
 for(let now=0;now<=500;now+=16)f.step(.016,now);if(clear)f.clear();
 for(let now=516;now<12000;now+=16)f.step(.016,now);
 assert.ok(Math.abs(f.value.position-.5)<1e-5);assert.ok(f.value.energy<1e-5&&f.value.motion<1e-5&&f.value.pulse<1e-5);}
});
test('routing can independently remap or disable a channel; global zero is exact',()=>{
 const routes=defaultRoutes(),signal={position:.1,energy:.9,motion:.4,pulse:.7};
 routes.hue={source:'energy',gain:1};routes.light={source:'off',gain:1};
 assert.equal(mapResponse(signal,routes).hue,.9);assert.equal(mapResponse(signal,routes).light,0);
 routes.hue.gain=0;assert.equal(mapResponse(signal,routes).hue,0);
 assert.ok(Object.values(mapResponse(signal,routes,0)).every(x=>x===0));
});
test('bad samples and extreme settings cannot create unbounded uniforms',()=>{
 const f=new ResponseField();f.feed({position:Infinity,energy:NaN,motion:-20},0,true);
 const values=mapResponse(f.step(1,16),{hue:{source:'missing',gain:Infinity}},Infinity);
 assert.ok(Object.values(values).every(Number.isFinite));
});
test('spectrum distinguishes bass and treble, silence has a neutral colour position',()=>{
 const bass=new Uint8Array(512),treble=new Uint8Array(512);bass[4]=255;treble[90]=255;
 assert.ok(spectralPosition(treble)>spectralPosition(bass)+.5);
 assert.equal(spectralPosition(new Uint8Array(512)),.5);
 assert.equal(spectralPosition(null),.5);
});
