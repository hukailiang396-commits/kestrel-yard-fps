// Synthesised sound only: no audio files, no network. Every sound is a few oscillators
// and a noise buffer through the Web Audio API. The context is created lazily on the first
// user gesture, so loading the page never needs audio permission; in screenshot mode
// (no gesture) every call is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    if (!Number.isFinite(vol) || vol <= 0) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!ensure()) return;
    if (!Number.isFinite(vol) || vol <= 0) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Distance-attenuated volume: 1 at the source, fading to 0 past ~40 m.
  function falloff(distance) {
    return Math.max(0, 1 - distance / 42);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot(kind, distance = 0) {
      const v = 0.5 * falloff(distance) + (distance === 0 ? 0.25 : 0);
      if (kind === 'pistol') {
        noise(0.09, v, 2400, 'bandpass');
        tone(190, 0.08, 'square', v * 0.5, 70);
      } else if (kind === 'smg') {
        noise(0.07, v * 0.8, 3000, 'bandpass');
        tone(240, 0.06, 'square', v * 0.4, 90);
      } else if (kind === 'dmr') {
        noise(0.22, v, 1500, 'bandpass');
        tone(130, 0.2, 'sawtooth', v * 0.6, 45);
      } else if (kind === 'shotgun') {
        noise(0.28, v, 1100, 'lowpass');
        tone(110, 0.18, 'sawtooth', v * 0.7, 40);
      } else {
        noise(0.11, v, 2000, 'bandpass');
        tone(170, 0.1, 'square', v * 0.5, 60);
      }
    },
    dryClick() {
      tone(1400, 0.03, 'square', 0.12);
    },
    hit(killed) {
      tone(killed ? 1250 : 950, 0.07, 'sine', 0.3);
      if (killed) tone(1560, 0.12, 'sine', 0.28);
    },
    reload() {
      tone(700, 0.04, 'square', 0.15);
      setTimeout(() => tone(500, 0.04, 'square', 0.15), 260);
      setTimeout(() => tone(900, 0.05, 'square', 0.18), 620);
    },
    buy() {
      tone(660, 0.08, 'sine', 0.25);
      setTimeout(() => tone(990, 0.1, 'sine', 0.25), 90);
    },
    denied() {
      tone(220, 0.12, 'square', 0.2, 160);
    },
    plantBeep(final) {
      tone(final ? 1320 : 880, final ? 0.3 : 0.09, 'sine', 0.3);
    },
    defuseBeep() {
      tone(1040, 0.09, 'sine', 0.28);
    },
    explosion(distance = 0) {
      const v = 0.7 * falloff(distance) + (distance === 0 ? 0.3 : 0);
      noise(0.7, v, 420, 'lowpass');
      tone(70, 0.6, 'sine', v * 0.8, 28);
    },
    flashPop(distance = 0) {
      noise(0.12, 0.5 * falloff(distance), 5000, 'highpass');
      tone(2200, 0.2, 'sine', 0.2 * falloff(distance), 300);
    },
    throwWhoosh() {
      noise(0.18, 0.25, 900, 'bandpass');
    },
    step(distance = 0) {
      const v = 0.1 * falloff(distance);
      if (v <= 0.01) return;
      noise(0.05, v, 500, 'lowpass');
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.3), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.24, 'triangle', 0.28), i * 140));
    },
  };
}
