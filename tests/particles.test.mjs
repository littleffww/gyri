import test from 'node:test';import assert from 'node:assert/strict';import * as T from '../dist/vendor/three.module.js';import {createParticles} from '../dist/particles.mjs';import {makeSoftMaterial} from '../dist/softbody.mjs';
const colors=['#555','#aaa'];
test('particles use the same deformation and dissolve uniforms as the solid',()=>{const shared=makeSoftMaterial().uniforms,root=new T.Group(),g=new T.BoxGeometry(1,3,1),p=createParticles(g,root,shared),u=root.children[0].material.uniforms;assert.equal(u.uTwist,shared.uTwist);assert.equal(u.uDissolve,shared.uDissolve);assert.equal(u.uTraceAmount,shared.uTraceAmount);for(let i=0;i<300;i++)p.update(.03,1,colors);assert.equal(shared.uDissolve.value,1);for(let i=0;i<300;i++)p.update(.03,0,colors);assert.equal(shared.uDissolve.value,0);});
test('all forms reassemble and return without changing original surface samples',()=>{const root=new T.Group(),p=createParticles(new T.BoxGeometry(1,3,1),root),g=root.children[0].geometry,original=g.attributes.position.array.slice();for(const form of ['sphere','helix','assembly','original']){p.setForm(form);for(let i=0;i<500;i++)p.update(.03,0,colors);assert.equal(p.transitioning,false);for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));}assert.equal(p.form,'original');assert.equal(p.update(.03,0,colors),1);assert.deepEqual(g.attributes.position.array,original);});
test('saved surface trace is resampled from the same triangles, with exact translation',()=>{const g=new T.BoxGeometry(),root=new T.Group(),p=createParticles(g,root);const trace=g.attributes.position.array.map((v,i)=>v+[2,-1,.5][i%3]);p.updateTrace(trace);const a=root.children[0].geometry.attributes;for(let i=0;i<a.position.array.length;i++)assert.ok(Math.abs(a.aTrace.array[i]-a.position.array[i]-[2,-1,.5][i%3])<1e-6);});

test('restore uses the visible mixed formation and never creates an outward burst',()=>{
 const shared=makeSoftMaterial().uniforms,root=new T.Group(),p=createParticles(new T.BoxGeometry(),root,shared);
 p.setForm('helix');
 for(let i=0;i<25;i++)p.update(.04,0,colors);
 const u=root.children[0].material.uniforms, first=u.formWeights.value.clone(), scatter=p.amount, dissolved=shared.uDissolve.value;
 assert.ok(first.w===0 && first.z>0 && first.z<1);
 const restore=p.beginReturn();restore(0);
 assert.deepEqual(u.formWeights.value,first);assert.equal(p.amount,scatter);assert.equal(shared.uDissolve.value,dissolved);
 let previous=p.amount;
 for(let step=1;step<=10;step++){restore(step/10);assert.ok(p.amount<=previous);previous=p.amount;}
 assert.deepEqual(u.formWeights.value.toArray(),[1,0,0,0]);assert.equal(shared.uDissolve.value,0);
 const solidReturn=p.beginReturn();solidReturn(.5);assert.equal(root.children[0].visible,false);
});
