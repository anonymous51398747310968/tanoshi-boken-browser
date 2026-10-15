import {probeContext} from './graphics.mjs';
const result={};
for (const api of ['webgl2','webgl']) {
  try {result[api]=probeContext(new OffscreenCanvas(2,2),api);}
  catch(error) {result[api]={ok:false,error:String(error.message || error)};}
}
self.postMessage(result);
