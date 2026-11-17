'use strict';
/* 사운드: WebAudio로 효과음과 배경음악을 실시간 합성 (음원 파일 없음) */
(function () {
  const A = (G.audio = { ctx: null, muted: false });
  let noiseBuf = null, eng = null, music = null;
  const last = {};
  const ok = (name, gap) => { // 같은 소리가 너무 촘촘히 겹치지 않게
    if (!A.ctx || A.ctx.state !== 'running') return false;
    const t = A.ctx.currentTime;
    if (last[name] && t - last[name] < gap) return false;
    last[name] = t; return true;
  };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (A.ctx = new AC());
    A.master = ctx.createGain(); A.master.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor();
    A.master.connect(comp); comp.connect(ctx.destination);
    A.sfx = ctx.createGain(); A.sfx.gain.value = 0.9; A.sfx.connect(A.master);
    A.mus = ctx.createGain(); A.mus.gain.value = 0.2; A.mus.connect(A.master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startEngine(); startMusic();
  };

  function tone(type, f0, f1, dur, vol, delay) {
    const ctx = A.ctx, t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, ftype, f0, f1, q, dest, delay) {
    const ctx = A.ctx, t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || A.sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
  }

  // ---------- 효과음 ----------
  A.laser = () => { if (ok('laser', 0.06)) { tone('square', 1250, 320, 0.09, 0.05); tone('sawtooth', 620, 180, 0.07, 0.035); } };
  A.enemyLaser = v => { if (ok('elaser', 0.09)) tone('sawtooth', 520, 150, 0.14, 0.06 * v); };
  A.explosion = (size, v) => {
    if (v < 0.02 || !ok('exp', 0.05)) return;
    const d = Math.min(2.4, 0.5 + size * 0.28);
    noise(d, Math.min(0.9, 0.42 * v * (0.6 + size * 0.25)), 'lowpass', 1800 + size * 200, 60, 0.7);
    tone('sine', 110, 28, d * 0.8, Math.min(0.8, 0.5 * v));
  };
  A.missile = () => { if (ok('msl', 0.1)) { noise(0.7, 0.3, 'bandpass', 400, 2600, 1.2); tone('sawtooth', 160, 60, 0.4, 0.12); } };
  A.lockTick = () => { if (ok('tick', 0.11)) tone('sine', 1150, 1150, 0.04, 0.07); };
  A.locked = () => { if (ok('locked', 0.3)) { tone('square', 1700, 1700, 0.07, 0.07); tone('square', 2200, 2200, 0.1, 0.07, 0.09); } };
  A.hit = () => { if (ok('hit', 0.08)) { noise(0.16, 0.4, 'lowpass', 900, 120, 1); tone('sine', 170, 55, 0.2, 0.4); } };
  A.shieldHit = () => { if (ok('shit', 0.08)) { tone('sine', 880, 440, 0.18, 0.14); noise(0.1, 0.12, 'highpass', 3000, 5000, 1); } };
  A.enemyHit = () => { if (ok('ehit', 0.05)) tone('triangle', 900, 500, 0.05, 0.07); };
  A.roll = () => { if (ok('roll', 0.2)) noise(0.5, 0.22, 'bandpass', 500, 2400, 2); };
  A.boostOn = () => { if (ok('boost', 0.4)) { noise(0.8, 0.26, 'bandpass', 300, 3200, 1.5); tone('sawtooth', 90, 260, 0.6, 0.1); } };
  A.alarm = () => { if (ok('alarm', 0.6)) { tone('square', 620, 620, 0.12, 0.08); tone('square', 620, 620, 0.12, 0.08, 0.2); } };
  A.ui = () => { if (ok('ui', 0.05)) { tone('sine', 660, 990, 0.12, 0.12); } };
  A.fanfare = () => {
    if (!ok('fan', 1)) return;
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.5, 0.16, i * 0.14));
  };
  A.beamCharge = () => { if (ok('bch', 1)) tone('sawtooth', 120, 900, 1.5, 0.1); };
  A.beamFire = () => { if (ok('bfr', 0.5)) { noise(1.3, 0.5, 'bandpass', 900, 300, 0.8); tone('sawtooth', 70, 50, 1.3, 0.3); } };
  A.ascentRoar = () => { if (ok('roar', 2)) { noise(7, 0.5, 'lowpass', 300, 2400, 0.6); tone('sawtooth', 50, 130, 6.5, 0.16); } };

  // ---------- 엔진음 ----------
  function startEngine() {
    const ctx = A.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
    const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 320;
    const og = ctx.createGain(); og.gain.value = 0;
    o.connect(of); of.connect(og); og.connect(A.sfx); o.start();
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 600; nf.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0;
    n.connect(nf); nf.connect(ng); ng.connect(A.sfx); n.start();
    eng = { o, of, og, nf, ng };
  }
  // k: 0(정지)~1(부스트), on: 엔진 소리 켜기
  A.setEngine = function (k, on) {
    if (!eng) return;
    const t = A.ctx.currentTime;
    eng.o.frequency.setTargetAtTime(52 + k * 70, t, 0.15);
    eng.of.frequency.setTargetAtTime(260 + k * 700, t, 0.15);
    eng.nf.frequency.setTargetAtTime(450 + k * 1900, t, 0.15);
    eng.og.gain.setTargetAtTime(on ? 0.05 + k * 0.05 : 0, t, 0.2);
    eng.ng.gain.setTargetAtTime(on ? 0.035 + k * 0.11 : 0, t, 0.2);
  };

  // ---------- 배경음악 (스텝 시퀀서) ----------
  const MOODS = {
    title: { bpm: 96,  roots: [45, 41, 48, 43], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], drums: 0 },
    sky:   { bpm: 124, roots: [45, 41, 48, 43], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], drums: 2 },
    space: { bpm: 128, roots: [38, 34, 43, 45], chords: [[0, 3, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], drums: 2 },
    boss:  { bpm: 140, roots: [40, 40, 36, 38], chords: [[0, 3, 7], [0, 3, 6], [0, 4, 7], [0, 4, 7]], drums: 3 },
  };
  const ARP = [0, 1, 2, 1, 2, 1, 0, 1, 2, 0, 1, 2, 1, 2, 0, 2];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function note(type, freq, t, dur, vol, cutoff) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    let out = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); out = f; }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(g); g.connect(A.mus); o.start(t); o.stop(t + dur + 0.05);
  }
  function drum(kind, t) {
    const ctx = A.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(A.mus); o.start(t); o.stop(t + 0.22);
    } else {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 7500; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045); }
      else { f.type = 'bandpass'; f.frequency.value = 1900; g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); }
      s.connect(f); f.connect(g); g.connect(A.mus); s.start(t, Math.random()); s.stop(t + 0.2);
    }
  }
  function schedStep(step, t, M, spb) {
    const bar = Math.floor(step / 16) % 4, s = step % 16;
    const root = M.roots[bar], ch = M.chords[bar];
    if (M.drums >= 1 && s % 4 === 0) drum('kick', t);
    if (M.drums >= 2 && s % 4 === 2) drum('hat', t);
    if (M.drums >= 2 && (s === 4 || s === 12)) drum('snare', t);
    if (M.drums >= 3 && s % 2 === 1) drum('hat', t);
    if (s % 2 === 0) note('sawtooth', mtof(root + (s % 8 === 6 ? 12 : 0)), t, spb * 1.8, 0.36, 420);
    const a = ch[ARP[s]] + (s >= 8 ? 12 : 0);
    note('triangle', mtof(root + 24 + a), t, spb * 1.6, M.drums ? 0.13 : 0.1);
    if (s === 0) for (let i = 0; i < 3; i++) { // 패드
      note('sawtooth', mtof(root + 12 + ch[i]) * 1.004, t, spb * 15.5, 0.05, 900);
      note('sawtooth', mtof(root + 12 + ch[i]) * 0.996, t, spb * 15.5, 0.05, 900);
    }
  }
  function startMusic() {
    music = { step: 0, next: A.ctx.currentTime + 0.1, mood: 'title' };
    setInterval(() => {
      if (!A.ctx || A.ctx.state !== 'running') return;
      const now = A.ctx.currentTime;
      if (music.next < now - 0.25) music.next = now + 0.05; // 탭이 잠들었다 깨어난 경우
      const M = MOODS[music.mood], spb = 60 / M.bpm / 4;
      while (music.next < now + 0.16) { schedStep(music.step, music.next, M, spb); music.step++; music.next += spb; }
    }, 40);
  }
  A.setMood = function (m) {
    if (!music || music.mood === m) return;
    music.mood = m; music.step = Math.ceil(music.step / 16) * 16; // 다음 마디부터
  };

  A.toggleMute = function () {
    A.muted = !A.muted;
    if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 0.75, A.ctx.currentTime, 0.05);
    return A.muted;
  };
  A.suspend = () => { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };
  A.resume = () => { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };
})();
