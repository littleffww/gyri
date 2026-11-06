const aborted = () => new DOMException('Cancelled', 'AbortError');
export function requestMedia(constraints, signal, mediaDevices = navigator.mediaDevices, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (error, stream) => {
      if (settled) { stream?.getTracks().forEach(t => t.stop()); return; }
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(stream);
    };
    const cancel = () => finish(aborted());
    if (signal.aborted) { reject(aborted()); return; }
    signal.addEventListener('abort', cancel, {once:true});
    timer = setTimeout(() => finish(Error('等待设备权限超时，请在浏览器设置中允许访问后重试。')), timeoutMs);
    try { Promise.resolve(mediaDevices.getUserMedia(constraints)).then(s => finish(null,s),e => finish(e)); }
    catch (e) { finish(e); }
  });
}
export class Sensors {
  constructor(video, notify) {
    this.video=video; this.notify=notify; this.stream=null; this.context=null; this.analyser=null;
    this.kind=null; this.starting=false; this.epoch=0; this.abort=null; this.tasks={}; this.lastVideo=-1; this.lastFrame=0;
  }
  stop() {
    this.epoch++; this.abort?.abort(); this.abort=null;
    this.stream?.getTracks().forEach(t=>t.stop()); this.stream=null;
    if(this.context) this.context.close().catch(()=>{});
    this.context=null; this.analyser=null; this.video.pause(); this.video.srcObject=null;
    this.kind=null; this.starting=false;
  }
  async task(kind) {
    if(!this.tasks[kind]) this.tasks[kind]=(async()=>{
      const {FilesetResolver,HandLandmarker,FaceLandmarker}=await import('./vendor/vision_bundle.mjs?v=agency-final');
      this.vision ||= FilesetResolver.forVisionTasks('./vendor/wasm');
      const vision=await this.vision;
      const base={runningMode:'VIDEO',baseOptions:{delegate:'CPU',modelAssetPath:kind==='hand'?'./vendor/hand_landmarker.task':'./vendor/face_landmarker.task'}};
      return kind==='hand'
        ? HandLandmarker.createFromOptions(vision,{...base,numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55})
        : FaceLandmarker.createFromOptions(vision,{...base,numFaces:1,outputFaceBlendshapes:true,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55});
    })().catch(e=>{delete this.tasks[kind];throw e});
    return this.tasks[kind];
  }
  async start(kind) {
    this.stop(); const epoch=this.epoch; this.starting=true; this.abort=new AbortController();
    const signal=this.abort.signal;
    let candidate=null, context=null;
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw Error('此浏览器无法访问设备。请在 Chrome / Safari 中用 HTTPS 打开。');
      if(kind==='audio') {
        const Audio=window.AudioContext||window.webkitAudioContext;
        if(!Audio)throw Error('此浏览器不支持声音分析。');
        context=new Audio(); this.context=context;
        await context.resume();
      } else {
        this.notify('正在加载'+(kind==='hand'?'双手':'眼部')+'识别模型，可以随时取消…');
        const tracker=await this.task(kind);
        if(epoch!==this.epoch)throw aborted();
        this.tracker=tracker;
      }
      if(epoch!==this.epoch)throw aborted();
      this.notify('等待'+(kind==='audio'?'麦克风':'摄像头')+'权限，请在浏览器弹窗中允许访问。');
      candidate=await requestMedia(kind==='audio'?{audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false}:{video:{width:640,height:480,facingMode:'user'},audio:false},signal);
      if(epoch!==this.epoch)throw aborted();
      this.stream=candidate;
      if(kind==='audio') {
        this.analyser=context.createAnalyser(); this.analyser.fftSize=1024;
        this.audioSource=context.createMediaStreamSource(candidate); this.audioSource.connect(this.analyser);
        this.samples=new Float32Array(this.analyser.fftSize);this.spectrum=new Uint8Array(this.analyser.frequencyBinCount);
        if(context.state==='suspended')await context.resume();
      } else {this.video.srcObject=candidate; await this.video.play();}
      if(epoch!==this.epoch)throw aborted();
      this.kind=kind;this.starting=false;this.lastVideo=-1;this.lastFrame=0;
      candidate.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(epoch===this.epoch){this.stop();this.notify('设备已断开。重新连接后可再次开启。');}},{once:true}));
      return true;
    } catch(e) {
      candidate?.getTracks().forEach(t=>t.stop());
      if(context&&context!==this.context)context.close().catch(()=>{});
      if(epoch===this.epoch){this.stop();if(e.name!=='AbortError')this.notify(e.name==='NotAllowedError'?'设备权限未开启。允许后重试，也可以使用鼠标探索。':e.name==='NotFoundError'?'未找到所需设备。可以先使用鼠标或播放演示。':e.message);}
      return false;
    }
  }
  frame(now) {
    if(!this.kind||this.kind==='audio'||this.video.readyState<2||now-this.lastFrame<80||this.video.currentTime===this.lastVideo)return null;
    this.lastFrame=now;this.lastVideo=this.video.currentTime;
    return this.tracker.detectForVideo(this.video,now);
  }
  frequency(){if(!this.analyser)return null;this.analyser.getByteFrequencyData(this.spectrum);return {bins:this.spectrum,sampleRate:this.context.sampleRate,minDb:this.analyser.minDecibels,maxDb:this.analyser.maxDecibels};}
  audio(){if(!this.analyser)return null;this.analyser.getFloatTimeDomainData(this.samples);return this.samples;}
}
