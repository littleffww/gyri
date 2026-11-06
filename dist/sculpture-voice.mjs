// One recorded voice, heard directly and through a diffuse stereo reflection.
const unit = value => Math.max(0, Math.min(1, value));

function roomResponse(context) {
  const frames = Math.ceil(context.sampleRate * 2.2);
  const impulse = context.createBuffer(2, frames, context.sampleRate);
  let seed = 82;
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < frames; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      smooth = 0.6 * smooth + 0.4 * (2 * seed / 4294967296 - 1);
      const t = i / context.sampleRate;
      data[i] = smooth * Math.min(1, t / 0.022) * Math.exp(-3.3 * t);
    }
  }
  return impulse;
}

export class SculptureVoice {
  constructor(context, recording) {
    this.context = context;
    this.recording = recording;
    this.position = 0;
    this.rate = 1;
    this.previous = null;
    this.source = null;
    this.lastMotion = -Infinity;
    this.envelope = context.createGain();
    this.envelope.gain.value = 0;
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 100;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.55;
    this.direct = context.createGain();
    this.reflection = context.createGain();
    const predelay = context.createDelay();
    predelay.delayTime.value = 0.034;
    const room = context.createConvolver();
    room.buffer = roomResponse(context);
    this.envelope.connect(highpass).connect(this.filter);
    this.filter.connect(this.direct).connect(context.destination);
    this.filter.connect(this.reflection).connect(predelay).connect(room).connect(context.destination);
  }

  update(dt, shape) {
    const previous = this.previous;
    this.previous = shape;
    if (!previous || dt <= 0) return;
    const now = this.context.currentTime;
    const speed = (Math.abs(shape.scatter - previous.scatter) * 2.5
      + Math.abs(shape.scale - previous.scale) + Math.abs(shape.inflate - previous.inflate)
      + Math.abs(shape.stretch - previous.stretch) * 0.6 + Math.abs(shape.twist - previous.twist) * 0.45
      + Math.abs(shape.pull - previous.pull) * 0.65 + Math.abs(shape.suggestion - previous.suggestion)) / dt;
    if (speed > 0.026) this.lastMotion = now;
    const moving = now - this.lastMotion < 0.28;
    if (!this.source && !moving) return;
    if (!this.source) {
      const source = this.context.createBufferSource();
      source.buffer = this.recording;
      source.loop = true;
      source.connect(this.envelope);
      source.start(now, this.position);
      this.source = source;
      this.lastTick = now;
    }
    this.position = (this.position + (now - this.lastTick) * this.rate) % this.recording.duration;
    this.lastTick = now;
    if (now - this.lastMotion > 1.65) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
      return;
    }

    const expansion = unit(shape.inflate + (shape.scale - 1) * 1.5 + Math.max(0, shape.stretch) * 0.3);
    const space = unit(shape.scatter * 0.92 + expansion * 0.52);
    this.direct.gain.setTargetAtTime(0.9 - space * 0.58, now, 0.12);
    this.reflection.gain.setTargetAtTime(0.15 + space * 1.08, now, 0.12);
    this.filter.frequency.setTargetAtTime(7900 - space * 3900, now, 0.14);
    this.rate = 1 - expansion * 0.055;
    this.source.playbackRate.setTargetAtTime(this.rate, now, 0.16);
    const level = moving ? 0.50 + unit(speed * 0.8) * 0.32 : 0;
    this.envelope.gain.setTargetAtTime(level, now, moving ? 0.09 : 0.22);
  }
}

// The button owns the AudioContext. Cancelling a load cannot start a stale session.
export function connectVoiceButton(button, reportError) {
  let session = null;
  let recording = null;
  let enabled = true;
  function syncButton() {
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? '关闭作品人声' : '开启作品人声';
  }
  syncButton();
  function off() {
    const old = session;
    session = null;
    enabled = false;
    syncButton();
    if (old) {
      old.abort.abort();
      old.context.close().catch(() => {});
    }
  }
  async function start() {
    if (!enabled || session) return;
    let current;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      current = {context: new Context(), abort: new AbortController()};
      session = current;
      button.setAttribute('aria-pressed', 'true');
      button.textContent = '正在载入人声…';
      await current.context.resume();
      if (!recording) {
        const response = await fetch(new URL('./audio/human-voice.m4a', import.meta.url), {signal: current.abort.signal});
        if (!response.ok) throw Error('Voice unavailable');
        const audio = await current.context.decodeAudioData(await response.arrayBuffer());
        if (session !== current) return;
        recording = audio;
      }
      if (session !== current) return;
      current.voice = new SculptureVoice(current.context, recording);
      button.textContent = '关闭作品人声';
    } catch {
      if (current && session !== current) return;
      off();
      reportError('人声载入失败，点击可重试。');
    }
  }
  button.onclick = () => {
    if (enabled) return off();
    enabled = true;
    syncButton();
    start();
  };
  return {start, off, get loading() { return !!session && !session.voice; }, get active() { return session?.voice; }};
}
