// This probe uses disposable canvases, never the game's transferable canvas.
export function probeContext(canvas, api) {
  let gl;
  try {
    gl=canvas.getContext(api,{alpha:false,antialias:false,failIfMajorPerformanceCaveat:false});
    if (!gl) return {ok:false,error:`${api}: context creation returned null`};
    gl.clearColor(0,1,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel=new Uint8Array(4);
    gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const result={ok:!gl.isContextLost() && pixel[1]===255,
      renderer:gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      version:gl.getParameter(gl.VERSION),maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE)};
    if (!result.ok) result.error='WebGL context exists but drawing/readback failed';
    return result;
  } catch (error) {
    return {ok:false,error:String(error.message || error)};
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export async function startCheckedPlayer(report, loadPlayer) {
  if (!report.main?.webgl2?.ok) throw new Error('WebGL 2の初期化に失敗しました。下の「クラウドPCでの起動方法」を確認してください。');
  if (!report.worker?.webgl2?.ok) throw new Error('Worker内のWebGL 2の初期化に失敗しました。下の「クラウドPCでの起動方法」を確認してください。');
  return loadPlayer();
}

export async function graphicsReport() {
  const main={};
  for (const api of ['webgl2','webgl']) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=2;
    main[api]=probeContext(canvas,api);
  }
  const worker=await new Promise(resolve => {
    let instance;
    let timer;
    const finish=result=>{clearTimeout(timer);instance?.terminate();resolve(result);};
    try {
      instance=new Worker(new URL('./graphics-worker.mjs',import.meta.url),{type:'module'});
      instance.onmessage=event=>finish(event.data);
      instance.onerror=event=>{event.preventDefault();finish({error:event.message || 'Worker failed'});};
      timer=setTimeout(()=>finish({error:'Worker graphics test timed out after 15 seconds'}),15000);
    } catch(error) {finish({error:String(error.message || error)});}
  });
  return {version:1,userAgent:navigator.userAgent,crossOriginIsolated,
    offscreenCanvas:typeof OffscreenCanvas!=='undefined',main,worker};
}
