import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
import { QUALITY_LEVELS, DEFAULT_QUALITY, DPR_HARD_MAX, POST, AUDIO, SHOT } from './config.js';
import { createPost } from './post.js';
import { createAudio } from './audio.js';
import { makeShareImage, plainImage, deliver, fileStamp } from './shot.js';
import { createWorld } from './world.js';
import { create, update as stepSim } from './physics.js';
import { attachCameraControls } from './camera.js';
import { setupQualityToggle, setupZukan } from './ui.js';
import { createProgress } from './records.js';
import { FILLING } from './config.js';

const canvas = document.getElementById('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  window.__kororinFail('この端末・ブラウザでは 3D 表示が使えないようです。', '別のブラウザ（最新の Chrome / Safari など）で開いてみてください。');
  throw e;
}
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 記録・設定：localStorage が使えなくても（プライベートモード等）落ちずに動く
let store = null;
try { store = window.localStorage; } catch (e) { store = null; }
const getItem = (k) => { try { return store && store.getItem(k); } catch (e) { return null; } };
const setItem = (k, v) => { try { store && store.setItem(k, v); } catch (e) { /* 保存できなくても動く */ } };
const post = createPost(renderer);
const audio = createAudio(store);
const fx = { on: getItem(POST.storageKey) !== '0' }; // やわらか効果（ブルーム・チルトシフト・ヴィネット）

const world = createWorld();
const SEED = Number(new URLSearchParams(location.search).get('seed')) || 1;
const sim = create(SEED);

// 左右操作：←→ / A D、またはタッチ・クリックで画面の左右半分
const keys = new Set();
let touchSteer = 0;
let steered = false;
const unlockAudio = () => audio.unlock();
addEventListener('keydown', (e) => { keys.add(e.code); unlockAudio(); if (e.code === 'Escape') setShoot(false); });
addEventListener('pointerdown', unlockAudio);
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('pointerdown', (e) => { touchSteer = e.clientX < innerWidth / 2 ? -1 : 1; });
addEventListener('pointerup', () => { touchSteer = 0; });
addEventListener('pointercancel', () => { touchSteer = 0; });
attachCameraControls(canvas, world.rig);
function steerInput() {
  if (world.rig.gesture) return 0; // ドラッグ・ピンチ中は左右操作しない
  const r = keys.has('ArrowRight') || keys.has('KeyD'), l = keys.has('ArrowLeft') || keys.has('KeyA');
  // カメラは +Z を向く（画面右＝ワールド -X）
  const v = -((r ? 1 : 0) - (l ? 1 : 0) || touchSteer);
  if (v) steered = true;
  return v;
}
let quality = DEFAULT_QUALITY;

function applyQuality(name) {
  quality = name;
  const q = QUALITY_LEVELS[name];
  world.setQuality(q);
  renderer.shadowMap.enabled = q.shadows;
  world.sun.castShadow = q.shadows;
  world.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
  if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  world.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  resize();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_LEVELS[quality].dprMax, DPR_HARD_MAX);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(sz.x, sz.y);
  world.camera.aspect = window.innerWidth / window.innerHeight;
  world.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

setupQualityToggle(document.getElementById('quality'), quality, applyQuality);
applyQuality(quality);

const usePost = () => fx.on && post.ok && QUALITY_LEVELS[quality].post;
const postBtn = document.getElementById('post-btn'), soundBtn = document.getElementById('sound-btn');
const renderToggles = () => {
  postBtn.textContent = '効果: ' + (fx.on ? 'あり' : 'なし'); postBtn.classList.toggle('off', !fx.on);
  soundBtn.textContent = '音: ' + (audio.muted ? 'なし' : 'あり'); soundBtn.classList.toggle('off', audio.muted);
};
postBtn.addEventListener('click', () => { fx.on = !fx.on; setItem(POST.storageKey, fx.on ? '1' : '0'); renderToggles(); audio.sfx.click(); });
soundBtn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.muted); renderToggles(); audio.sfx.click(); });
renderToggles();

function renderFrame() {
  if (usePost()) post.render(world.scene, world.camera, { bloom: true, tilt: true, vignette: true });
  else { renderer.setRenderTarget(null); renderer.render(world.scene, world.camera); }
}

// 撮影モード：UI を隠して、PNG 保存／シェア画像を作る
const shootBar = document.getElementById('shootbar'), shotMsg = document.getElementById('shot-msg');
let shotMsgT = 0;
function say(text) { shotMsg.textContent = text; shotMsg.classList.add('show'); clearTimeout(shotMsgT); shotMsgT = setTimeout(() => shotMsg.classList.remove('show'), 2400); }
function setShoot(on) { document.body.classList.toggle('shoot', on); shootBar.hidden = !on; if (!on) shotMsg.classList.remove('show'); }
document.getElementById('shoot-btn').addEventListener('click', () => { setShoot(true); audio.sfx.click(); });
document.getElementById('shot-close').addEventListener('click', () => setShoot(false));
async function takeShot(share) {
  try {
    renderFrame(); // 直後に canvas を読む（描画バッファが消える前）
    const info = { dist: Math.max(0, sim.z + sim.oz), biome: world.getBiomeName(), filling: progress.filling };
    const blob = share ? await makeShareImage(canvas, info) : await plainImage(canvas);
    audio.sfx.shutter();
    const r = await deliver(blob, SHOT.fileName + (share ? '-share-' : '-') + fileStamp(new Date()) + '.png', share);
    say(r === 'saved' ? '保存しました' : r === 'shared' ? '共有しました' : 'キャンセルしました');
  } catch (e) { say('画像を作れませんでした'); }
}
document.getElementById('shot-png').addEventListener('click', () => takeShot(false));
document.getElementById('shot-share').addEventListener('click', () => takeShot(true));

const progress = createProgress(store, Math.random);
const zukan = setupZukan(document.getElementById('zukan-btn'), document.getElementById('zukan'), progress.rec.found);
const distEl = document.getElementById('dist'), bestEl = document.getElementById('best'), fillEl = document.getElementById('filling');
const toastEl = document.getElementById('toast'), flashEl = document.getElementById('flash');
let toastT = 0, saveT = 0;
function toast(text, color) {
  toastEl.textContent = text; toastEl.style.color = color || '#fff'; toastEl.classList.add('show'); toastT = FILLING.EVENT_SHOW_TIME;
}
addEventListener('pagehide', () => progress.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) progress.flush(); });

// 最初の10秒：幕がひらく → タイトル → 操作のヒント → ふっと消える
const introEl = document.getElementById('intro'), curtain = document.getElementById('curtain');
const firstRun = getItem(SHOT.seenKey) !== '1';
setItem(SHOT.seenKey, '1');
introEl.classList.toggle('first', firstRun);
let introT = 0, introDone = false, booted = false;

const biomeLabel = document.getElementById('biome');
let wasGrounded = false, airVy = 0, seenSplits = 0, seenMerges = 0, seenHits = 0;
let labelText = '';
function introStep(dt) {
  if (introDone) return;
  introT += dt;
  introEl.classList.toggle('silent', !audio.started && !audio.muted && audio.supported);
  if (introT >= SHOT.introTitleAt) introEl.classList.add('title');
  if (introT >= SHOT.introHintAt) introEl.classList.add('hint');
  if (introT >= SHOT.introEnd || (steered && introT >= SHOT.introHintAt + 1.5) || document.body.classList.contains('shoot')) {
    introDone = true; introEl.classList.add('done');
  }
}
let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  const ox = sim.ox, oy = sim.oy, oz = sim.oz;
  stepSim(sim, dt, { steer: steerInput() });
  world.shift(sim.ox - ox, sim.oy - oy, sim.oz - oz);
  world.update(sim, Math.min(dt, 0.1));
  const dist = Math.max(0, sim.z + sim.oz);
  const ev = progress.update(dist);
  if (ev.changed) {
    world.setFilling(ev.filling);
    fillEl.textContent = '具：' + ev.filling.name + (ev.filling.rare ? ' ★レア' : '');
    if (ev.discovered) { audio.sfx[ev.discovered.rare ? 'rare' : 'found'](); }
    if (ev.discovered) { toast('「' + ev.discovered.name + '」を見つけた！' + (ev.discovered.rare ? '（レア）' : ''), ev.discovered.rare ? '#ffd84a' : '#fff'); zukan.render(); }
  }
  if (ev.event) { audio.sfx.rare(); toast(ev.event.name, ev.event.color); flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go'); }
  if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('show');
  distEl.textContent = Math.floor(dist) + ' m';
  bestEl.textContent = '最長 ' + progress.rec.best + ' m';
  saveT += dt;
  if (progress.dirty && saveT >= FILLING.SAVE_INTERVAL) { saveT = 0; progress.flush(); }
  const text = world.getBiomeName() + '　' + Math.floor(dist) + ' m';
  if (text !== labelText) { labelText = text; biomeLabel.textContent = text; }
  // 音：転がり・風はなめらかに、着地・ぶつかり・分裂・合流はその瞬間に
  audio.update(Math.hypot(sim.vx, sim.vy, sim.vz), sim.grounded);
  if (!sim.grounded) airVy = Math.max(airVy, -sim.vy);
  else if (!wasGrounded) { if (airVy > AUDIO.landMinVy) audio.sfx.land(airVy); airVy = 0; }
  wasGrounded = sim.grounded;
  if (sim.hits !== seenHits) { seenHits = sim.hits; audio.sfx.hit(sim.lastHit); }
  if (sim.splits !== seenSplits) { seenSplits = sim.splits; audio.sfx.pop(); }
  if (sim.merges !== seenMerges) { seenMerges = sim.merges; audio.sfx.merge(); }
  introStep(Math.min(dt, 0.1));
  renderFrame();
  if (!booted) { booted = true; window.__kororinBooted(); requestAnimationFrame(() => curtain.classList.add('open')); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
