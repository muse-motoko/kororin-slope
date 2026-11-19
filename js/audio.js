// やさしい音：WebAudio の合成だけ（外部音源なし）。ブラウザの決まりで、最初の操作のあとに鳴り始める。
// AudioContext が無い環境・失敗しても、何も鳴らないだけで落ちない。
import { AUDIO } from './config.js';

export const midiFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);
// 転がる音の大きさ：速さに応じてなめらかに増える（0〜1）。空中では鳴らさない
export function rollLevel(speed, grounded) {
  if (!grounded) return 0;
  const t = Math.min(1, Math.max(0, speed / AUDIO.rollSpeedRef));
  return t * t * (3 - 2 * t);
}
// 風の大きさ（0〜1）：速いほど強く、止まっていても少しだけ
export function windLevel(speed) { return 0.15 + 0.85 * Math.min(1, Math.max(0, speed / AUDIO.rollSpeedRef)); }

export function createAudio(storage) {
  let ctx = null, master = null, rollG = null, rollF = null, windG = null, windF = null, failed = false;
  let muted = false;
  try { muted = !!storage && storage.getItem(AUDIO.storageKey) === '1'; } catch (e) { muted = false; }

  function noiseBuffer(c) {
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0; // ブラウンノイズ（やわらかい低め）
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }
  function loopNoise(c) { const s = c.createBufferSource(); s.buffer = noiseBuffer(c); s.loop = true; s.start(); return s; }

  function build() {
    const C = window.AudioContext || window.webkitAudioContext;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = muted ? 0 : AUDIO.master; master.connect(ctx.destination);
    // 環境音：ゆっくり揺れるやわらかい和音
    const pad = ctx.createGain(); pad.gain.value = AUDIO.ambient; pad.connect(master);
    const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 900; padF.connect(pad);
    AUDIO.chord.forEach((n, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midiFreq(n); o.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain(); g.gain.value = 0.25;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + i * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 0.18; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      o.connect(g); g.connect(padF); o.start();
    });
    // 風
    windG = ctx.createGain(); windG.gain.value = 0; windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.5;
    loopNoise(ctx).connect(windF); windF.connect(windG); windG.connect(master);
    // 転がる音
    rollG = ctx.createGain(); rollG.gain.value = 0; rollF = ctx.createBiquadFilter(); rollF.type = 'lowpass'; rollF.frequency.value = 300;
    loopNoise(ctx).connect(rollF); rollF.connect(rollG); rollG.connect(master);
  }
  // ユーザー操作の中で呼ぶ。2回目以降は何もしない
  function unlock() {
    if (failed) return;
    try {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { failed = true; ctx = null; }
  }
  const ready = () => !!ctx && ctx.state === 'running';

  // 1音：start→end に滑らせる丸い音（立ち上がり・減衰つき）
  function tone(freq, freqEnd, dur, vol, type, delay) {
    if (!ready() || muted) return;
    const t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (freqEnd && freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const v = Math.max(0.0002, vol * AUDIO.effects);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    land: (power) => tone(150, 60, 0.18, Math.min(1, 0.3 + power * 0.08), 'sine'),             // ぽすっ
    hit: (power) => { const f = 330 + Math.min(1, power / 10) * 200; tone(f, f * 0.7, 0.35, 0.6, 'triangle'); }, // ぽよん
    pop: () => { tone(300, 760, 0.12, 0.8, 'sine'); tone(900, 900, 0.08, 0.3, 'sine', 0.06); },  // ぽんっ
    merge: () => tone(620, 280, 0.2, 0.6, 'sine'),                                                // すうっ
    found: () => { [76, 80, 83].forEach((n, i) => tone(midiFreq(n), 0, 0.5, 0.55, 'sine', i * 0.1)); }, // 具を見つけた：ぽろろん
    rare: () => { [76, 80, 83, 88, 92].forEach((n, i) => tone(midiFreq(n), 0, 0.7, 0.55, 'triangle', i * 0.09)); },
    click: () => tone(520, 520, 0.06, 0.4, 'sine'),
    shutter: () => { tone(1400, 500, 0.05, 0.5, 'square'); tone(900, 300, 0.09, 0.4, 'square', 0.06); },
  };

  // 毎フレーム：速さと接地で、転がる音と風をなめらかに変える
  function update(speed, grounded) {
    if (!ready()) return;
    const t = ctx.currentTime, r = rollLevel(speed, grounded), w = windLevel(speed);
    rollG.gain.setTargetAtTime(r * AUDIO.roll, t, 0.08);
    rollF.frequency.setTargetAtTime(160 + r * 700, t, 0.1);
    windG.gain.setTargetAtTime(w * AUDIO.wind, t, 0.3);
    windF.frequency.setTargetAtTime(350 + w * 700, t, 0.3);
  }
  function setMuted(m) {
    muted = !!m;
    try { storage && storage.setItem(AUDIO.storageKey, muted ? '1' : '0'); } catch (e) { /* 保存できなくても動く */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : AUDIO.master, ctx.currentTime, 0.05);
  }
  return { unlock, update, sfx, setMuted, get muted() { return muted; }, get started() { return ready(); }, get supported() { return !failed; } };
}
