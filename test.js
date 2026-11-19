// 実行: node kororin-slope/test.js（js/physics.js を ES Modules として読み込みます）
import * as S from './js/physics.js';
import assert from 'node:assert';
import { sample, biomeAt } from './js/biomes.js';
import { layoutDecor, buildDecorGeometry } from './js/decor.js';
import { createWorld } from './js/world.js';
import { BIOMES, QUALITY_LEVELS, OBSTACLES, SPLIT } from './js/config.js';
import { layoutObstacles, collideBody, stepWobble } from './js/obstacles.js';
import { stepKids, aliveCount, kidRadius } from './js/split.js';
import { popScale, mergeScale, fadeAlpha } from './js/split-view.js';

const C = S.SIM;

function run(seed, targetZ, opts) {
  var sim = S.create(seed, opts), maxLocal = 0, maxChunks = 0, minChunks = 1e9, airEver = false, maxX = 0;
  var maxSteps = Math.ceil(1200 / C.DT); // 最大20分
  while (sim.z + sim.oz < targetZ && sim.steps < maxSteps) {
    S.step(sim, null);
    assert(isFinite(sim.x + sim.y + sim.z + sim.vx + sim.vy + sim.vz), 'NaN/Infinity');
    maxLocal = Math.max(maxLocal, Math.abs(sim.x), Math.abs(sim.y), Math.abs(sim.z));
    maxX = Math.max(maxX, Math.abs(sim.x + sim.ox));
    maxChunks = Math.max(maxChunks, sim.chunks.size); minChunks = Math.min(minChunks, sim.chunks.size);
    if (!sim.grounded) airEver = true;
    // 球は常に地面より上（めり込まない）
    assert(sim.y >= S.localHeight(sim, sim.x, sim.z) + C.RADIUS - 1e-6, 'めり込み');
  }
  return { sim: sim, maxLocal: maxLocal, maxChunks: maxChunks, minChunks: minChunks, air: airEver, maxX: maxX };
}

// 1. 高さ関数・乱数の決定論
assert.strictEqual(S.worldHeight(1, 12.3, 456.7), S.worldHeight(1, 12.3, 456.7));
assert.notStrictEqual(S.worldHeight(1, 12.3, 456.7), S.worldHeight(2, 12.3, 456.7));
var r1 = S.mulberry32(5), r2 = S.mulberry32(5);
for (var i = 0; i < 10; i++) assert.strictEqual(r1(), r2());

// 2. 5 km を複数シードで走破（破綻しない）
[1, 7, 42, 12345].forEach(function (seed) {
  var res = run(seed, 5000);
  var sim = res.sim, w = S.world(sim);
  assert(w.z >= 5000, 'seed ' + seed + ': 5 km に到達できない（z=' + w.z.toFixed(0) + '）');
  assert(sim.airSteps * C.DT > 2 && sim.airSteps * C.DT < sim.steps * C.DT * 0.5, 'seed ' + seed + ': 空中時間が不自然 ' + sim.airSteps * C.DT);
  assert(res.air, 'seed ' + seed + ': 一度も空中に出ない');
  assert(res.maxLocal < C.REBASE_DIST + 100, 'seed ' + seed + ': ローカル座標が膨らんだ ' + res.maxLocal);
  assert(sim.rebases > 10, 'フローティングオリジンが働いていない');
  assert(res.maxX < C.CHUNK_W / 2 - 2, 'seed ' + seed + ': 坂の幅から外れた x=' + res.maxX);
  // チャンクは一定数に保たれ、生成と破棄が釣り合う
  assert(res.maxChunks <= Math.ceil((C.AHEAD + C.BEHIND) / C.CHUNK_LEN) + 2, 'チャンクが溜まっている');
  assert(res.minChunks >= Math.floor((C.AHEAD + C.BEHIND) / C.CHUNK_LEN) - 1, 'チャンクが足りない');
  assert(sim.made > 200 && sim.dropped > sim.made - 20, '生成・破棄の数が不自然');
  var sp = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy + sim.vz * sim.vz);
  assert(sp <= C.MAX_SPEED + 1e-9);
  console.log('seed ' + seed + ': ' + (sim.steps * C.DT).toFixed(0) + ' 秒で ' + w.z.toFixed(0) + ' m, 空中 ' +
    (sim.airSteps * C.DT).toFixed(1) + ' 秒, 原点移動 ' + sim.rebases + ' 回, チャンク生成 ' + sim.made + '/破棄 ' + sim.dropped);
});

// 3. 決定論：同じシードなら同じ軌跡
var a = run(99, 1000).sim, b = run(99, 1000).sim;
assert.strictEqual(a.steps, b.steps);
assert.deepStrictEqual(S.world(a), S.world(b));

// 4. フローティングオリジンで軌跡が変わらない（原点移動なし版とワールド座標で比較）
var f = S.create(3), g = S.create(3, { rebaseDist: Infinity });
for (i = 0; i < 6000; i++) { S.step(f, null); S.step(g, null); }
var wf = S.world(f), wg = S.world(g);
assert(f.rebases > 0 && g.rebases === 0);
assert(Math.abs(wf.x - wg.x) < 1e-6 && Math.abs(wf.y - wg.y) < 1e-6 && Math.abs(wf.z - wg.z) < 1e-6, '原点移動で軌跡がずれた');

// 5. 球が坂を下る（スタートより前に進み、高さが下がる）
var s = S.create(8), y0 = S.world(s).y;
for (i = 0; i < 1200; i++) S.step(s, null);
assert(S.world(s).z > 10 && S.world(s).y < y0, '転がらない');

// 6. 空中では放物運動（速度の水平成分がほぼ保たれ、vy は重力で減る）
var p = S.create(1); p.grounded = false; p.y += 200; p.vx = 0; p.vz = 3; p.vy = 0;
for (i = 0; i < 120; i++) S.step(p, null);
assert(Math.abs(p.vy + C.GRAVITY) < 0.5, '放物運動になっていない vy=' + p.vy);

// 7. バイオーム：3種以上が距離で切り替わり、境目はなめらかにつながる・周回する
assert(BIOMES.length >= 3);
var seen = {};
for (var z = 0; z < BIOMES.length * 500 * 2; z += 25) seen[sample(z).name] = 1;
assert(Object.keys(seen).length === BIOMES.length, 'バイオームが全部は現れない');
assert.strictEqual(sample(100).name, sample(100 + BIOMES.length * 500).name, '周回しない');
var prevS = sample(0);
for (z = 1; z < 4000; z++) {
  var cur = sample(z);
  assert(Math.abs(cur.fogFar - prevS.fogFar) < 3 && Math.abs(cur.sunElev - prevS.sunElev) < 0.05, 'バイオームの境目で値が飛ぶ z=' + z);
  prevS = cur;
}
assert(biomeAt(-30).a >= 0, '負の距離');

// 8. 装飾：決定論、密度を下げると間引かれるだけ、メッシュ化できる
var ch = { k: 3, x0: -24, z0: 3 * C.CHUNK_LEN };
var full = layoutDecor(1, ch, 1, sample), again = layoutDecor(1, ch, 1, sample);
assert.deepStrictEqual(full, again);
var some = layoutDecor(1, ch, 0.3, sample);
assert(some.length < full.length && layoutDecor(1, ch, 0, sample).length === 0, '密度が効かない');
some.forEach(function (it) { assert(full.some(function (f) { return JSON.stringify(f) === JSON.stringify(it); }), '低密度の配置が高密度に含まれない'); });
var types = {};
for (var k2 = 0; k2 < 400; k2++) layoutDecor(1, { k: k2, z0: k2 * C.CHUNK_LEN }, 1, sample).forEach(function (it) { types[it.type] = 1; });
['tree', 'flower', 'cloud', 'hill'].forEach(function (t) { assert(types[t], t + ' が配置されない'); });
var geo = buildDecorGeometry(1, ch, Math.round(S.worldHeight(1, 0, ch.z0 + 10)), full, sample);
assert(geo && geo.attributes.position.count > 0);
assert(Array.prototype.every.call(geo.attributes.position.array, isFinite) && Array.prototype.every.call(geo.attributes.color.array, isFinite));

// 9. 世界（Three.js シーン）を Node で通し：全バイオームを走り、品質を切り替えても落ちない
var wsim = S.create(5), world = createWorld(), wnames = {};
for (var qn in QUALITY_LEVELS) {
  world.setQuality(QUALITY_LEVELS[qn]);
  wsim = S.create(5);
  for (i = 0; i < 120 * 20; i++) {
    var o = [wsim.ox, wsim.oy, wsim.oz];
    S.update(wsim, 1 / 60, { steer: 0 });
    world.shift(wsim.ox - o[0], wsim.oy - o[1], wsim.oz - o[2]);
    world.update(wsim, 1 / 60);
    wnames[world.getBiomeName()] = 1;
  }
}
assert(world.terrain.children.length > 5, 'チャンクが表示されていない');
// 走って全バイオームを通る（距離を直接進めて確認）
for (z = 0; z < 2100; z += 100) { wsim.oz = z; world.update(wsim, 1 / 60); wnames[world.getBiomeName()] = 1; }
assert(Object.keys(wnames).length >= 3, 'バイオーム名が切り替わらない');
var wtotal = 0; wsim.obs.forEach(function (l) { wtotal += l.length; });
assert(wtotal > 0 && world.obstacleView.views.size === wtotal, '障害物の見た目が物理と一致しない ' + world.obstacleView.views.size + '/' + wtotal);
assert(world.splitView.used.size === wsim.kids.length, '子の見た目が物理と一致しない');
console.log('世界の通し OK（バイオーム ' + Object.keys(wnames).join('/') + '）');

// 10. カメラ：自動ショットが進む／ドラッグ・ズームの後、離すと自動に戻る／地面にめり込まない
import { createCameraRig } from './js/camera.js';
import { buildOnigiriGeometries } from './js/onigiri.js';
var rig = createCameraRig(), cb = { x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 10 }, shots = {}, minClear = 1e9;
var ground = function (x, z) { return 4 - 0.3 * z; };
for (i = 0; i < 60 * 80; i++) {
  cb.z += 10 / 60; cb.y = ground(0, cb.z) + 0.5; rig.update(1 / 60, cb, ground); shots[rig.shotI] = 1;
  assert(isFinite(rig.position.x + rig.position.y + rig.position.z + rig.fov), 'カメラが NaN');
  minClear = Math.min(minClear, rig.position.y - ground(rig.position.x, rig.position.z));
}
assert(Object.keys(shots).length >= 4, '自動ショットが切り替わらない');
assert(minClear > 0.5, 'カメラが地面にめり込んだ: ' + minClear);
rig.gesture = true; rig.drag(200, -80); rig.zoomBy(0.5); rig.gesture = false;
assert(Math.abs(rig.userYaw) > 0.5 && Math.abs(rig.userZoom) > 0.3, 'ドラッグ・ズームが効かない');
for (i = 0; i < 60 * 12; i++) { cb.z += 10 / 60; cb.y = ground(0, cb.z) + 0.5; rig.update(1 / 60, cb, ground); }
assert(Math.abs(rig.userYaw) < 0.05 && Math.abs(rig.userPitch) < 0.05 && Math.abs(rig.userZoom) < 0.05, '離しても自動に戻らない');
var og = buildOnigiriGeometries();
assert(og.rice.attributes.position.count > 1000 && og.nori.index.count > 300 && og.nori.index.count < og.rice.index.count, 'おむすびの形状・海苔の帯が不正');
assert(Array.prototype.every.call(og.rice.attributes.normal.array, isFinite), 'おむすびの法線が NaN');
console.log('カメラ・おむすび OK（ショット ' + Object.keys(shots).length + ' 種）');

// 11. 障害物：シード付き配置（決定論）、3種以上、すき間・範囲・スタート付近の空き
var oa = layoutObstacles(3, 40), ob = layoutObstacles(3, 40);
assert.deepStrictEqual(oa, ob);
assert(JSON.stringify(layoutObstacles(4, 40)) !== JSON.stringify(oa), 'シードが配置に効かない');
var otypes = {}, ocount = 0;
for (var ok = 0; ok < 400; ok++) {
  var ol = layoutObstacles(1, ok);
  ocount += ol.length;
  ol.forEach(function (o, ix) {
    otypes[o.type] = (otypes[o.type] || 0) + 1;
    assert(Math.abs(o.x) <= OBSTACLES.xRange && o.z >= ok * C.CHUNK_LEN + OBSTACLES.edgeMargin - 1e-9 && o.z <= (ok + 1) * C.CHUNK_LEN - OBSTACLES.edgeMargin + 1e-9, '配置範囲');
    assert(o.z >= OBSTACLES.clearStart, 'スタート付近に置かれた');
    assert(Math.abs(o.cy - S.worldHeight(1, o.x, o.z) - o.r * OBSTACLES.types[o.type].lift) < 1e-9, '地面からの高さ');
    for (var jx = 0; jx < ix; jx++) assert(Math.hypot(o.x - ol[jx].x, o.z - ol[jx].z) >= o.r + ol[jx].r + OBSTACLES.gap - 1e-9, '障害物が近すぎる');
  });
}
assert(Object.keys(otypes).length >= 3, '障害物が3種以上ない');
assert(ocount > 400 * OBSTACLES.slots * OBSTACLES.density * 0.6 && ocount < 400 * OBSTACLES.slots, '障害物の数が不自然 ' + ocount);
// 隣のチャンクの障害物ともすき間が保たれる
for (ok = 30; ok < 200; ok++) {
  var l1 = layoutObstacles(1, ok), l2 = layoutObstacles(1, ok + 1);
  l1.forEach(function (p1) { l2.forEach(function (p2) { assert(Math.hypot(p1.x - p2.x, p1.z - p2.z) >= p1.r + p2.r + OBSTACLES.gap - 1e-9, '隣のチャンクと近すぎる'); }); });
}
var osim = S.create(1); for (i = 0; i < 12; i++) S.step(osim, null);
assert(osim.obs.size === osim.chunks.size, '障害物がチャンクと同期していない');
console.log('障害物の配置 OK（' + JSON.stringify(otypes) + '）');

// 12. 障害物との衝突：押し出し・反発・バネの揺れ
function stub() { return { ox: 0, oy: 0, oz: 0, obs: new Map(), wobbling: new Set() }; }
function mk(type, x, cy, z) { return { id: 1, type: type, x: x, z: z, r: OBSTACLES.types[type].r, spin: 0, cy: cy, s: 0, sv: 0, hx: 0, hy: 1, hz: 0 }; }
function hitOnce(type, speed) {
  var st = stub(), o = mk(type, 0, 0, 100); st.obs.set(Math.floor(100 / C.CHUNK_LEN), [o]);
  var b = { x: 0, y: 0, z: 100 - (o.r + 0.5) + 0.1, vx: 0, vy: 0, vz: speed }; // 0.1 m めり込んで +z 向きに突っ込む
  var imp = collideBody(st, b, 0.5);
  return { st: st, o: o, b: b, imp: imp };
}
['mochi', 'mushroom', 'rock'].forEach(function (t) {
  var T = OBSTACLES.types[t], h = hitOnce(t, 10);
  assert(Math.abs(h.imp - 10) < 1e-9, t + ': 衝突速度');
  assert(Math.hypot(h.b.x, h.b.y, h.b.z - 100) >= h.o.r + 0.5 - 1e-9, t + ': めり込みが残る');
  var back = -h.b.vz; // 障害物の手前（-z）へ戻る速さ
  assert(Math.abs(back - Math.min(OBSTACLES.outMax, Math.max(T.e * 10, T.minOut))) < 1e-9, t + ': 反発の速さ ' + back);
  assert(h.o.sv > 0 && h.st.wobbling.has(h.o), t + ': 揺れ始めない');
  assert(h.o.hz > 0.99, t + ': 当たった向きが記録されない');
  assert(hitOnce(t, 0.5).imp > 0 && hitOnce(t, 30).b.vz >= -OBSTACLES.outMax - 1e-9, t + ': 速さの上限');
});
assert(-hitOnce('mushroom', 3).b.vz >= OBSTACLES.types.mushroom.minOut - 1e-9, 'キノコは遅くても弾く');
assert(-hitOnce('rock', 10).b.vz < -hitOnce('mushroom', 10).b.vz, '丸岩はキノコより弾まない');
assert(hitOnce('mochi', 10).o.sv > hitOnce('rock', 10).o.sv, 'もちもちは岩より大きく揺れる');
// 離れていく球には何もしない／当たっていなければ何も起きない
var sep = hitOnce('mochi', -5); assert(sep.imp === 0 && sep.b.vz === -5 && sep.o.sv === 0, '離れていく球に反発した');
var far = stub(); far.obs.set(5, [mk('rock', 0, 0, 100)]);
assert.strictEqual(collideBody(far, { x: 5, y: 0, z: 100, vx: 0, vy: 0, vz: 5 }, 0.5), 0);
// バネ：揺れは符号を変えながら減衰し、やがて止まる
var wh = hitOnce('mochi', 10), flips = 0, prevSign = 0, peak0 = 0, peakLate = 0;
for (i = 0; i < 120 * 20 && wh.st.wobbling.size; i++) {
  stepWobble(wh.st, C.DT);
  assert(Math.abs(wh.o.s) <= OBSTACLES.wobbleMax + 1e-9 && isFinite(wh.o.s), '揺れが発散');
  var sg = Math.sign(wh.o.s); if (sg && prevSign && sg !== prevSign) flips++; if (sg) prevSign = sg;
  if (i < 120) peak0 = Math.max(peak0, Math.abs(wh.o.s)); if (i >= 120 * 2 && i < 120 * 3) peakLate = Math.max(peakLate, Math.abs(wh.o.s));
}
assert(flips >= 2 && peakLate < peak0 * 0.7 && wh.st.wobbling.size === 0 && wh.o.s === 0, 'バネが揺れて収まらない flips=' + flips);
// 実シミュレーション：目の前の岩に最高速で突っ込んでも、すり抜けず・めり込まず・跳ね返る
var rs = S.create(5), rk = Math.floor((rs.z + 12) / C.CHUNK_LEN), rock = mk('rock', rs.x + 0.3, 0, 12);
rock.cy = S.worldHeight(5, rock.x, 12) + rock.r * 0.45; rock.id = 999;
rs.obs.set(rk, (rs.obs.get(rk) || []).concat([rock]));
rs.vz = C.MAX_SPEED; rs.vx = 0; rs.vy = -C.MAX_SPEED * C.SLOPE; rs.grounded = true;
var minD = 1e9, bounced = false;
for (i = 0; i < 240 && !(rs.hits && rs.vz < 0 && i > 5); i++) {
  S.step(rs, null);
  minD = Math.min(minD, Math.hypot(rs.x - (rock.x - rs.ox), rs.y - (rock.cy - rs.oy), rs.z - (rock.z - rs.oz)) - rock.r - C.RADIUS);
  if (rs.hits && rs.vz < 0) bounced = true;
}
assert(rs.hits >= 1 && bounced && minD > -1e-6, '高速でも岩にすり抜け／めり込み minD=' + minD);
var pass = 0; for (var sd = 1; sd <= 3; sd++) { var ps = run(sd, 800).sim; pass += ps.hits; }
assert(pass > 3, '通常のコースで障害物に当たらない');
console.log('障害物の衝突・バネ OK（通常コースの衝突 ' + pass + ' 回）');

// 13. 分裂：ぽんっと増える・上限・フェードで戻る・合流で戻る・決定論・原点移動で一致
function runSplit(seed, secs, hook) {
  var sm = S.create(seed), maxAlive = 1, steps = secs * 120, incr = {}, prevAlive = 1;
  for (var q2 = 0; q2 < steps; q2++) {
    var s0 = sm.splits; S.step(sm, null);
    var al = aliveCount(sm); maxAlive = Math.max(maxAlive, al);
    if (sm.splits !== s0) { var inc = al - prevAlive; incr[inc] = (incr[inc] || 0) + 1; }
    prevAlive = al;
    assert(al <= SPLIT.MAX_TOTAL && sm.kids.length <= SPLIT.MAX_KIDS, '分裂の上限を超えた ' + al);
    sm.kids.forEach(function (k) {
      assert(isFinite(k.x + k.y + k.z + k.vx + k.vy + k.vz), '子が NaN');
      assert(k.y >= S.localHeight(sm, k.x, k.z) + k.r - 1e-6, '子が地面にめり込んだ');
    });
    if (hook) hook(sm);
  }
  return { sim: sm, maxAlive: maxAlive, incr: incr };
}
var sp1 = runSplit(1, 240);
assert(sp1.sim.splits >= 8 && sp1.sim.merges + sp1.sim.fades >= 8, '分裂・合流・フェードが動かない');
assert(sp1.sim.fades > 0 && sp1.sim.merges > 0, 'フェード／合流のどちらかが起きない f=' + sp1.sim.fades + ' m=' + sp1.sim.merges);
assert(Object.keys(sp1.incr).every(function (d) { return d === '1' || d === '2'; }) && sp1.incr[1] && sp1.incr[2], '1回で1〜2個ずつ増える（合計2個・3個）' + JSON.stringify(sp1.incr));
// 同じシードなら同じ分裂
var spA = runSplit(2, 90).sim, spB = runSplit(2, 90).sim;
assert.deepStrictEqual(spA.kids, spB.kids); assert.strictEqual(spA.splits, spB.splits);
// 上限：分裂を何度も強制しても本体を含めて8個まで
var cap = S.create(3);
for (i = 0; i < 120 * 10; i++) { cap.splitT = 0; cap.kids.forEach(function (k) { k.life = 1e9; }); S.step(cap, null); assert(aliveCount(cap) <= SPLIT.MAX_TOTAL, '上限超え'); }
assert(aliveCount(cap) === SPLIT.MAX_TOTAL, '上限まで増えない ' + aliveCount(cap));
// フェード：離れた子は数えなくなり（数が戻る）、FADE_TIME 後に消える。フェード中も上限の枠は空く
var fd = S.create(4); fd.splitT = 0; S.step(fd, null); S.step(fd, null);
var nBefore = aliveCount(fd); assert(nBefore >= 2, '分裂していない');
var victim = fd.kids[0]; victim.x += SPLIT.LOST_DIST + 5; // 置いていかれた
S.step(fd, null);
assert(victim.state === 'fade' && aliveCount(fd) === nBefore - 1 && fd.fades === 1, 'フェードに入らない');
fd.splitT = 1e9;
var t0 = fd.steps;
while (fd.kids.indexOf(victim) >= 0 && fd.steps - t0 < 120 * 5) S.step(fd, null);
assert(fd.kids.indexOf(victim) < 0 && (fd.steps - t0) * C.DT >= SPLIT.FADE_TIME - 0.1, 'フェード後に消えない');
assert(fadeAlpha(0) === 1 && fadeAlpha(SPLIT.FADE_TIME) === 0 && fadeAlpha(SPLIT.FADE_TIME / 2) > 0.3 && fadeAlpha(SPLIT.FADE_TIME / 2) < 0.7, 'フェードの曲線');
// 合流：寿命が来て近ければ本体に合流して数が戻る
var mg = S.create(4); mg.splitT = 0; S.step(mg, null); S.step(mg, null);
var nM = aliveCount(mg); mg.splitT = 1e9;
mg.kids.forEach(function (k) { k.life = 0; k.x = mg.x; k.z = mg.z - 1; k.y = S.localHeight(mg, k.x, k.z) + k.r; });
for (i = 0; i < 120 * 3 && mg.kids.length; i++) S.step(mg, null);
assert(mg.kids.length === 0 && mg.merges === nM - 1 && aliveCount(mg) === 1, '合流しない');
// 見た目の曲線
assert(popScale(0) === 0 && Math.max.apply(null, [0.05, 0.1, 0.15, 0.2].map(popScale)) > 1.02 && Math.abs(popScale(SPLIT.POP_TIME) - 1) < 0.05, 'ぽんっの曲線');
assert(mergeScale(0) === 1 && mergeScale(SPLIT.MERGE_TIME) === 0, '合流の曲線');
// 原点移動しても子の軌跡（ワールド座標）が変わらない
var rf = S.create(6), rg = S.create(6, { rebaseDist: Infinity });
for (i = 0; i < 120 * 40; i++) { S.step(rf, null); S.step(rg, null); }
assert(rf.rebases > 0 && rf.kids.length === rg.kids.length && rf.kids.length > 0, '比較する子がいない');
rf.kids.forEach(function (k, ix) {
  var g2 = rg.kids[ix];
  assert(Math.abs(k.x + rf.ox - g2.x) < 1e-5 && Math.abs(k.y + rf.oy - g2.y) < 1e-5 && Math.abs(k.z + rf.oz - g2.z) < 1e-5, '原点移動で子がずれた');
});
console.log('分裂 OK（最大 ' + sp1.maxAlive + ' 個、分裂 ' + sp1.sim.splits + ' 回、合流 ' + sp1.sim.merges + ' 回、フェード ' + sp1.sim.fades + ' 回）');

// ===== 具・距離・ずかん・記録 =====
import { COMMON_FILLINGS, RARE_FILLINGS, ALL_FILLINGS, fillingForBand, rollEvent, bandOf, eventWindowOf, pickWeighted, EVENTS } from './js/fillings.js';
import { loadRecords, saveRecords, createProgress } from './js/records.js';
import { FILLING } from './js/config.js';
function fakeStorage(init) { var d = Object.assign({}, init); return { d: d, getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); } }; }
// 具の種類：12種以上、見た目（米の色＋頭の具）がすべて異なる
assert(COMMON_FILLINGS.length >= 12 && RARE_FILLINGS.length >= 1, '具が足りない');
assert.strictEqual(new Set(ALL_FILLINGS.map(function (f) { return f.id; })).size, ALL_FILLINGS.length, 'id 重複');
assert.strictEqual(new Set(ALL_FILLINGS.map(function (f) { return f.rice + f.top.color + f.top.shape; })).size, ALL_FILLINGS.length, '見た目が同じ具がある');
assert.deepStrictEqual(COMMON_FILLINGS.slice(0, 3).map(function (f) { return f.name; }), ['鮭', '梅', 'ツナマヨ']);
// 距離に応じて変わる（レアなしの乱数では 鮭→梅→ツナマヨ→…と周回）
var never = function () { return 0.999; };
for (i = 0; i < COMMON_FILLINGS.length * 2; i++) assert.strictEqual(fillingForBand(i, never), COMMON_FILLINGS[i % COMMON_FILLINGS.length]);
assert.strictEqual(bandOf(0), 0); assert.strictEqual(bandOf(FILLING.BAND_LEN - 0.1), 0); assert.strictEqual(bandOf(FILLING.BAND_LEN), 1); assert.strictEqual(bandOf(-5), 0);
// レア：先頭の帯は常に通常。乱数が小さければレア、境界は RARE_CHANCE
assert.strictEqual(fillingForBand(0, function () { return 0; }), COMMON_FILLINGS[0]);
assert(fillingForBand(1, function () { return 0; }).rare, 'レアにならない');
assert(!fillingForBand(1, function () { return FILLING.RARE_CHANCE; }).rare && fillingForBand(1, function () { return FILLING.RARE_CHANCE - 1e-9; }).rare, '確率の境界');
// 確率はシード（地形のシード）に依存せず、実際の確率に収束する（固定の乱数列で再現可能）
var rr = S.mulberry32(2024), nRare = 0, N = 40000, perId = {};
for (i = 0; i < N; i++) { var ff = fillingForBand(1 + (i % 50), rr); if (ff.rare) { nRare++; perId[ff.id] = (perId[ff.id] || 0) + 1; } }
assert(Math.abs(nRare / N - FILLING.RARE_CHANCE) < 0.01, 'レア確率がずれている ' + nRare / N);
assert(Object.keys(perId).length === RARE_FILLINGS.length && perId.ikura > perId.truffle, 'レア具の重み付け');
// イベント
var evN = 0, evIds = {}; rr = S.mulberry32(9);
for (i = 0; i < N; i++) { var ev0 = rollEvent(rr); if (ev0) { evN++; evIds[ev0.id] = 1; } }
assert(Math.abs(evN / N - FILLING.EVENT_CHANCE) < 0.01 && Object.keys(evIds).length === EVENTS.length, 'イベント確率 ' + evN / N);
assert.strictEqual(rollEvent(function () { return 0.99; }), null);
assert.strictEqual(pickWeighted([{ weight: 1, v: 1 }, { weight: 1, v: 2 }], function () { return 0.99; }).v, 2);
// 保存：往復、壊れたデータ・未知の id・不正な値・保存失敗
var st1 = fakeStorage();
assert.deepStrictEqual(loadRecords(st1), { best: 0, found: [] });
assert(saveRecords(st1, { best: 1234.9, found: ['sake', 'ume'] }));
assert.deepStrictEqual(loadRecords(st1), { best: 1234, found: ['sake', 'ume'] });
var bad = [fakeStorage({ [FILLING.STORAGE_KEY]: '{oops' }), fakeStorage({ [FILLING.STORAGE_KEY]: '{"best":"x","found":"y"}' }), fakeStorage({ [FILLING.STORAGE_KEY]: '{"best":-5,"found":["zzz",3,"sake","sake"]}' })];
assert.deepStrictEqual(loadRecords(bad[0]), { best: 0, found: [] });
assert.deepStrictEqual(loadRecords(bad[1]), { best: 0, found: [] });
assert.deepStrictEqual(loadRecords(bad[2]), { best: 0, found: ['sake'] });
assert.deepStrictEqual(loadRecords(null), { best: 0, found: [] });
assert.strictEqual(saveRecords({ setItem: function () { throw new Error('quota'); } }, { best: 1, found: [] }), false);
// 進行：距離に応じて具が変わり、ずかん登録・最長記録が保存・復元される
var st2 = fakeStorage(), pg = createProgress(st2, never), seen = [];
for (var d = 0; d < FILLING.BAND_LEN * 3 + 1; d += 5) { var o = pg.update(d); if (o.changed) seen.push(o.filling.name); assert(!o.event || d >= FILLING.EVENT_LEN, '最初の区間にイベント'); }
assert.deepStrictEqual(seen, ['鮭', '梅', 'ツナマヨ', '昆布']);
assert.deepStrictEqual(pg.rec.found, ['sake', 'ume', 'tunamayo', 'konbu']);
assert(pg.dirty && pg.flush() && !pg.dirty, '保存されない');
assert.deepStrictEqual(loadRecords(st2), { best: FILLING.BAND_LEN * 3, found: ['sake', 'ume', 'tunamayo', 'konbu'] });
var pg2 = createProgress(st2, never); // 再起動：記録が残り、最長は下がらず、既知の具は再発見にならない
var o2 = pg2.update(3); assert(o2.changed && o2.discovered === null && pg2.rec.best === FILLING.BAND_LEN * 3, '復元できない');
assert(!pg2.dirty, '変化がないのに保存しようとする');
// 同じ帯の間は具が変わらない（乱数を毎回引き直さない）
var calls = 0, pg3 = createProgress(fakeStorage(), function () { calls++; return 0.999; }); pg3.update(0); var c0 = calls; for (d = 0; d < 200; d += 10) pg3.update(d); assert.strictEqual(calls, c0, '同じ帯で再抽選している');
// レアが出たらずかんに載り、レア印が付く
var pg4 = createProgress(fakeStorage(), function () { return 0; }); pg4.update(0); var o4 = pg4.update(FILLING.BAND_LEN);
assert(o4.filling.rare && o4.discovered === o4.filling && pg4.rec.found.indexOf(o4.filling.id) >= 0, 'レア登録');
assert.strictEqual(eventWindowOf(FILLING.EVENT_LEN), 1);
// 見た目：全ての具に切り替えても例外が出ない（Node ではテクスチャなし）
var vw = createWorld(); ALL_FILLINGS.forEach(function (f) { vw.setFilling(f); });
console.log('具・記録 OK（具 ' + ALL_FILLINGS.length + ' 種、レア確率 ' + (nRare / N).toFixed(3) + '、イベント ' + (evN / N).toFixed(3) + '）');

// 音・撮影・公開前の品質（Three.js / ブラウザ非依存の部分）
import { midiFreq, rollLevel, windLevel, createAudio } from './js/audio.js';
import { shareLayout, fileStamp } from './js/shot.js';
import { AUDIO, SHOT } from './js/config.js';
import { readFileSync, readdirSync } from 'node:fs';
assert(Math.abs(midiFreq(69) - 440) < 1e-9 && Math.abs(midiFreq(81) - 880) < 1e-9, 'midiFreq');
assert.strictEqual(rollLevel(50, false), 0);
assert(rollLevel(0, true) === 0 && rollLevel(AUDIO.rollSpeedRef, true) === 1 && rollLevel(AUDIO.rollSpeedRef / 2, true) > 0 && rollLevel(AUDIO.rollSpeedRef / 2, true) < 1);
assert(windLevel(0) > 0 && windLevel(1000) === 1);
var au = createAudio(fakeStorage({ [AUDIO.storageKey]: '1' })); // AudioContext の無い Node でも落ちない・保存したミュートを復元
assert(au.muted && !au.started); au.unlock(); au.update(10, true); au.sfx.pop(); au.setMuted(false); assert(!au.muted);
var au2 = createAudio(null); au2.setMuted(true); assert(au2.muted);
var L = shareLayout(3000, 1500); assert(L.W === SHOT.maxWidth && L.H === 800 && L.band > 0);
L = shareLayout(800, 1600); assert(L.W === 800 && L.H === 1600); // 縦長もそのまま
assert.strictEqual(fileStamp(new Date(2026, 10, 9, 8, 7, 6)), '20261109-080706');
// 公開の下準備：相対パスのみ（絶対パス・外部 URL を使わない）
var files = ['index.html', 'style.css'].concat(readdirSync(new URL('./js/', import.meta.url)).map(function (f) { return 'js/' + f; }));
files.forEach(function (f) {
  var t = readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!/(src|href)=["']\//.test(t) && !/from ['"]\//.test(t) && !/url\(["']?\//.test(t), f + ' に絶対パス');
  assert(!/(src|href)=["']https?:/.test(t) && !/from ['"]https?:/.test(t) && !/import\(["']https?:/.test(t) && !/@import/.test(t), f + ' に外部読み込み');
});
console.log('音・撮影・相対パス OK');

console.log('PASS');
