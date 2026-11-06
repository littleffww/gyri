import {deformPoint} from './softbody.mjs?v=agency-final';
// The original remains immutable. A saved trace is a separate, reversible surface.
export function captureTrace(original,centers,previous,retention,state){
 const result=new Float32Array(original.length),p=[0,0,0],c=[0,0,0];
 for(let j=0;j<original.length;j+=3){for(let k=0;k<3;k++){p[k]=original[j+k]+(previous[j+k]-original[j+k])*retention;c[k]=centers[j+k]}
 result.set(deformPoint(p,c,state),j);}
 return result;
}
