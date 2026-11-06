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
  constructor(context, recording, output, onFirstSound) {
    this.onFirstSound = onFirstSound;
    this.previewUntil = -Infinity;
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
    this.filter.connect(this.direct).connect(output);
    this.filter.connect(this.reflection).connect(predelay).connect(room).connect(output);
  }

  update(dt, shape) {
    const previous = this.previous;
    this.previous = shape;
    if (!previous || dt <= 0) return;
    const now = this.context.currentTime;
    if (this.previewRequested) {
      this.previewUntil = now + 2.5;
      this.previewRequested = false;
    }
    const speed = (Math.abs(shape.scatter - previous.scatter) * 2.5
      + Math.abs(shape.scale - previous.scale) + Math.abs(shape.inflate - previous.inflate)
      + Math.abs(shape.stretch - previous.stretch) * 0.6 + Math.abs(shape.twist - previous.twist) * 0.45
      + Math.abs(shape.pull - previous.pull) * 0.65 + Math.abs(shape.suggestion - previous.suggestion)) / dt;
    const inOpening = Number.isFinite(shape.openingTime);
    if (inOpening || now < this.previewUntil || speed > 0.026) this.lastMotion = now;
    const moving = now - this.lastMotion < 0.28;
    if (!this.source && !moving) return;
    if (!this.source) {
      const source = this.context.createBufferSource();
      source.buffer = this.recording;
      source.loop = true;
      source.connect(this.envelope);
      if (inOpening) this.position = shape.openingTime % this.recording.duration;
      source.start(now, this.position);
      this.source = source;
      this.onFirstSound?.();
      this.onFirstSound = null;
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
  let paused = false;
  const label = document.createElement('span');
  button.replaceChildren(label);
  let previousLabel;
  function requestPreview() {
    if (!session) return;
    if (session.voice) session.voice.previewRequested = true;
    else session.previewPending = true;
  }
  function waiting() {
    return enabled && !paused && !!session && (session.context.state !== 'running' || (session.player && !session.playerPlaying));
  }
  function syncButton() {
    const needsTap = enabled && !paused && !!session &&
      (waiting() || (!!session.voice && !session.hasPlayed));
    const audible = enabled && !paused && !!session?.voice && !needsTap;
    button.dataset.needsTap = String(needsTap);
    button.setAttribute('aria-pressed', String(audible));
    button.dataset.sound = audible ? 'on' : 'off';
    const nextLabel = !enabled ? '开启作品人声' : paused ? '人声已暂停' :
      needsTap ? '点一下听人声' : audible ? '关闭作品人声' : '正在载入人声…';
    if (previousLabel === nextLabel) return;
    label.textContent = nextLabel;
    if (previousLabel && label.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      label.getAnimations().forEach(animation => animation.cancel());
      label.animate([{opacity: .4}, {opacity: 1}], {duration: 150, easing: 'ease-out'});
    }
    previousLabel = nextLabel;
  }
  syncButton();
  function off() {
    const old = session;
    session = null;
    enabled = false;
    syncButton();
    if (old) {
      old.abort.abort();
      if (old.player) {
        old.player.pause();
        old.player.srcObject = null;
        old.mediaOutput.stream.getTracks().forEach(track => track.stop());
      }
      if (old.restoreType !== undefined) {
        try { navigator.audioSession.type = old.restoreType; } catch {}
      }
      old.context.close().catch(() => {});
    }
  }
  async function start(preview = false) {
    if (!enabled || session) return;
    let current;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      current = {context: new Context(), abort: new AbortController()};
      session = current;
      current.previewPending = preview;
      // WebKit's ambient audio route obeys the iPhone silent switch.
      let mediaRoute = false;
      try {
        if (navigator.audioSession) {
          current.restoreType = navigator.audioSession.type;
          navigator.audioSession.type = 'playback';
          mediaRoute = navigator.audioSession.type === 'playback';
        }
      } catch {}
      const appleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (appleTouch && !mediaRoute) {
        current.mediaOutput = current.context.createMediaStreamDestination();
        const player = current.player = new Audio();
        player.setAttribute('playsinline', '');
        player.srcObject = current.mediaOutput.stream;
        player.onplaying = () => {
          if (session !== current) return;
          current.playerPlaying = true;
          syncButton();
        };
        player.onpause = player.onwaiting = () => {
          if (session !== current) return;
          current.playerPlaying = false;
          syncButton();
        };
      }
      current.context.onstatechange = () => { if (session === current) syncButton(); };
      syncButton();
      resume(false);

      if (!recording) {
        const response = await fetch(new URL('./audio/human-voice.m4a', import.meta.url), {signal: current.abort.signal});
        if (!response.ok) throw Error('Voice unavailable');
        const audio = await current.context.decodeAudioData(await response.arrayBuffer());
        if (session !== current) return;
        recording = audio;
      }
      if (session !== current) return;
      current.voice = new SculptureVoice(current.context, recording,
        current.mediaOutput || current.context.destination, () => {
          current.hasPlayed = true;
          syncButton();
        });
      if (current.previewPending) requestPreview();
      syncButton();
    } catch {
      if (current && session !== current) return;
      off();
      reportError('人声载入失败，点击可重试。');
    }
  }
  function resume(preview = true) {
    if (!session || !enabled || paused) return;
    if (preview) requestPreview();
    const {context, player} = session;
    // Both requests must be made inside the tap, before any await.
    if (context.state !== 'running') context.resume().catch(syncButton);
    if (player && !session.playerPlaying) player.play().catch(syncButton);
  }
  function setPaused(value) {
    if (paused === value) return;
    paused = value;
    if (session && enabled) {
      if (paused) {
        session.player?.pause();
        session.context.suspend().catch(syncButton);
      } else {
        session.context.resume().catch(syncButton);
        resume(false);
      }
    }
    syncButton();
  }
  // A trusted press can unlock the context before its click handler runs.
  let requestedPlayback = false;
  function rememberIntent() { requestedPlayback = button.dataset.needsTap === 'true'; }
  button.addEventListener('pointerdown', rememberIntent);
  button.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') rememberIntent();
  });
  button.onclick = () => {
    const unlock = requestedPlayback || button.dataset.needsTap === 'true';
    requestedPlayback = false;
    if (unlock) { resume(); return; }
    if (enabled) return off();
    enabled = true;
    syncButton();
    start(true);
  };
  return {start, off, resume, setPaused, get waiting() { return waiting(); },
    get active() { return enabled && !paused && session && !waiting() ? session.voice : null; }};
}
