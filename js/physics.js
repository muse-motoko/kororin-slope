// 自前の軽量物理：シード付き高さ関数、チャンク生成/破棄、フローティングオリジン、固定ステップ。
// Three.js には依存しない（Node の test.js からもそのまま使える）。
import { SIM } from './config.js';
import { layoutObstacles, collideBody, stepWobble } from './obstacles.js';
import { initSplit, stepKids } from './split.js';

// ===== シード付き乱数（決定論） =====
export function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 格子点 (ix,iz) の値を -1〜1 で返すハッシュ（シード付き）
function lattice(seed, ix, iz) {
  var h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
export function noise2(seed, x, z) {
  var ix = Math.floor(x), iz = Math.floor(z);
  var fx = fade(x - ix), fz = fade(z - iz);
  var a = lattice(seed, ix, iz), b = lattice(seed, ix + 1, iz);
  var c = lattice(seed, ix, iz + 1), d = lattice(seed, ix + 1, iz + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

// ===== 高さ関数（ワールド座標。同じシードなら必ず同じ地形） =====
export function worldHeight(seed, x, z) {
  return -SIM.SLOPE * z
    + SIM.HILL_AMP * noise2(seed + 101, x / (SIM.HILL_LEN * 2), z / SIM.HILL_LEN)
    + SIM.BUMP_AMP * noise2(seed + 202, x / SIM.BUMP_LEN_X, z / SIM.BUMP_LEN_Z)
    + SIM.BOWL * x * x
    + SIM.WALL * Math.pow(Math.max(0, Math.abs(x) - SIM.WALL_X), 2);
}

// ===== チャンク =====
export function makeChunk(seed, k) {
  var nx = SIM.CHUNK_W / SIM.CELL, nz = SIM.CHUNK_LEN / SIM.CELL;
  var x0 = -SIM.CHUNK_W / 2, z0 = k * SIM.CHUNK_LEN;
  var h = new Float64Array((nx + 1) * (nz + 1));
  for (var j = 0; j <= nz; j++)
    for (var i = 0; i <= nx; i++)
      h[j * (nx + 1) + i] = worldHeight(seed, x0 + i * SIM.CELL, z0 + j * SIM.CELL);
  return { k: k, x0: x0, z0: z0, nx: nx, nz: nz, h: h };
}

// ===== シミュレーション =====
export function create(seed, opts) {
  var sim = {
    seed: seed | 0,
    rebaseDist: opts && opts.rebaseDist != null ? opts.rebaseDist : SIM.REBASE_DIST,
    ox: 0, oy: 0, oz: 0,                 // 原点のオフセット（ワールド = ローカル + オフセット）
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, // ローカル座標
    grounded: false, airSteps: 0, steps: 0, rebases: 0,
    chunks: new Map(), made: 0, dropped: 0, acc: 0,
    obs: new Map(), wobbling: new Set(), hits: 0, lastHit: 0, stillT: 0, unstuck: 0, ax: 0, ay: 0, az: 0 // 障害物（チャンク番号→配列）、揺れ中の障害物、ぶつかった回数と最後の速さ
  };
  initSplit(sim, mulberry32((seed ^ 0x5bd1e995) >>> 0));
  var rng = mulberry32(seed);
  sim.x = (rng() - 0.5) * 2;             // 開始位置を少し散らす（シード依存）
  sim.z = 0;
  sim.y = localHeight(sim, sim.x, sim.z) + SIM.RADIUS + 0.5;
  refreshChunks(sim);
  return sim;
}
export function localHeight(sim, x, z) { return worldHeight(sim.seed, x + sim.ox, z + sim.oz) - sim.oy; }
export function world(sim) { return { x: sim.x + sim.ox, y: sim.y + sim.oy, z: sim.z + sim.oz }; }

export function refreshChunks(sim) {
  var zw = sim.z + sim.oz;
  var kmin = Math.floor((zw - SIM.BEHIND) / SIM.CHUNK_LEN);
  var kmax = Math.floor((zw + SIM.AHEAD) / SIM.CHUNK_LEN);
  for (var k = kmin; k <= kmax; k++)
    if (!sim.chunks.has(k)) { sim.chunks.set(k, makeChunk(sim.seed, k)); sim.obs.set(k, layoutObstacles(sim.seed, k)); sim.made++; }
  sim.chunks.forEach(function (_, k) {
    if (k < kmin || k > kmax) {
      (sim.obs.get(k) || []).forEach(function (o) { sim.wobbling.delete(o); });
      sim.chunks.delete(k); sim.obs.delete(k); sim.dropped++;
    }
  });
}

export function rebase(sim) {
  var d = sim.rebaseDist, s = SIM.REBASE_STEP;
  var sx = Math.abs(sim.x) > d ? Math.round(sim.x / s) * s : 0;
  var sy = Math.abs(sim.y) > d ? Math.round(sim.y / s) * s : 0;
  var sz = Math.abs(sim.z) > d ? Math.round(sim.z / s) * s : 0;
  if (!sx && !sy && !sz) return;
  sim.x -= sx; sim.y -= sy; sim.z -= sz;
  sim.ax -= sx; sim.ay -= sy; sim.az -= sz;
  for (var i = 0; i < sim.kids.length; i++) { sim.kids[i].x -= sx; sim.kids[i].y -= sy; sim.kids[i].z -= sz; }
  sim.ox += sx; sim.oy += sy; sim.oz += sz;
  sim.rebases++;
}

export function normalAt(sim, x, z) {
  var e = 0.1;
  var dx = (localHeight(sim, x + e, z) - localHeight(sim, x - e, z)) / (2 * e);
  var dz = (localHeight(sim, x, z + e) - localHeight(sim, x, z - e)) / (2 * e);
  var l = Math.sqrt(dx * dx + 1 + dz * dz);
  return { x: -dx / l, y: 1 / l, z: -dz / l };
}

// 固定ステップ1回分。input: {steer: -1..1}
export function step(sim, input) {
  var dt = SIM.DT, g = SIM.GRAVITY, r = SIM.RADIUS;
  var steer = input && input.steer ? Math.max(-1, Math.min(1, input.steer)) : 0;
  var n, gy;
  if (sim.grounded) {
    n = normalAt(sim, sim.x, sim.z);
    // 重力の斜面方向成分（接線）
    var gnDot = -g * n.y;
    var ax = (0 - gnDot * n.x), ay = (-g - gnDot * n.y), az = (0 - gnDot * n.z);
    sim.vx += ax * SIM.ROLL_FACTOR * dt + steer * SIM.STEER * dt;
    sim.vy += ay * SIM.ROLL_FACTOR * dt;
    sim.vz += az * SIM.ROLL_FACTOR * dt;
    // 転がり抵抗＋空気抵抗（速度と逆向き。符号は反転させない）
    var sp = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy + sim.vz * sim.vz);
    if (sp > 1e-9) {
      var dec = (SIM.ROLL_RESIST * g * n.y + SIM.AIR_DRAG * sp * sp) * dt;
      var f = Math.max(0, sp - dec) / sp;
      sim.vx *= f; sim.vy *= f; sim.vz *= f;
    }
    // 速度から法線成分を取り除く（面に沿って動く）
    var vn = sim.vx * n.x + sim.vy * n.y + sim.vz * n.z;
    sim.vx -= vn * n.x; sim.vy -= vn * n.y; sim.vz -= vn * n.z;
    clampSpeed(sim);
    var nx = sim.x + sim.vx * dt, nz = sim.z + sim.vz * dt;
    var ballisticY = sim.y + sim.vy * dt - 0.5 * g * dt * dt;
    gy = localHeight(sim, nx, nz) + r;
    if (ballisticY > gy + SIM.STICK) {       // 地面が下がって球が離れた → 空中へ
      sim.x = nx; sim.y = ballisticY; sim.z = nz;
      sim.vy -= g * dt;
      sim.grounded = false;
    } else {                               // 地形に追従
      sim.x = nx; sim.z = nz; sim.y = gy;
      var n2 = normalAt(sim, nx, nz);      // 新しい面に合わせて速度を接線へ
      var vn3 = sim.vx * n2.x + sim.vy * n2.y + sim.vz * n2.z;
      sim.vx -= vn3 * n2.x; sim.vy -= vn3 * n2.y; sim.vz -= vn3 * n2.z;
    }
  } else {
    sim.vy -= g * dt;
    var spd = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy + sim.vz * sim.vz);
    var k = 1 - SIM.AIR_DRAG * spd * dt;
    sim.vx *= k; sim.vy *= k; sim.vz *= k;
    sim.vx += steer * SIM.STEER * 0.3 * dt;  // 空中は操作が弱い
    clampSpeed(sim);
    sim.x += sim.vx * dt; sim.y += sim.vy * dt; sim.z += sim.vz * dt;
    sim.airSteps++;
    gy = localHeight(sim, sim.x, sim.z) + r;
    if (sim.y <= gy) {                      // 着地
      sim.y = gy;
      n = normalAt(sim, sim.x, sim.z);
      var vn2 = sim.vx * n.x + sim.vy * n.y + sim.vz * n.z;
      if (vn2 < 0) {
        var e = -vn2 > 2 ? SIM.RESTITUTION : 0;   // 小さな衝撃では跳ねない
        sim.vx -= (1 + e) * vn2 * n.x; sim.vy -= (1 + e) * vn2 * n.y; sim.vz -= (1 + e) * vn2 * n.z;
      }
      sim.grounded = e0(sim, n);
    }
  }
  // ほとんど進めない状態が続いたら「ぽんっ」と前へ小さく弾み直す（くぼみや岩のすき間で止まって進めなくなるのを防ぐ）
  sim.stillT += dt;
  if (sim.stillT >= SIM.STUCK_TIME) {
    var dxs = sim.x - sim.ax, dys = sim.y - sim.ay, dzs = sim.z - sim.az;
    if (dxs * dxs + dys * dys + dzs * dzs < SIM.STUCK_DIST * SIM.STUCK_DIST) {
      sim.unstuck++;
      sim.vx += (sim.unstuck % 2 ? 1 : -1) * SIM.STUCK_KICK * 0.3; sim.vy += SIM.STUCK_KICK * 0.5; sim.vz += SIM.STUCK_KICK;
      sim.grounded = false;
    }
    sim.stillT = 0; sim.ax = sim.x; sim.ay = sim.y; sim.az = sim.z;
  }
  // 障害物との衝突：押し出して反発し、障害物をバネで揺らす
  var hit = collideBody(sim, sim, r);
  if (hit > 0) {
    sim.hits++; sim.lastHit = hit;
    clampSpeed(sim);
    sim.grounded = false;                 // 弾かれたら一度空中扱い（次のステップで着地判定）
  }
  var gyh = localHeight(sim, sim.x, sim.z) + r; // 押し出されても地面にはめり込まない
  if (sim.y < gyh) sim.y = gyh;
  // 見えない縁：弾かれて壁を越えても、チャンクの幅の外へ出ないように押し戻す
  var wx = sim.x + sim.ox;
  if (Math.abs(wx) > SIM.EDGE_X) {
    var sgn = wx > 0 ? 1 : -1;
    sim.x = sgn * SIM.EDGE_X - sim.ox;
    if (sim.vx * sgn > 0) sim.vx *= -0.3;
    var gye = localHeight(sim, sim.x, sim.z) + r;
    if (sim.y < gye) sim.y = gye;
  }
  stepWobble(sim, dt);
  stepKids(sim, dt);
  sim.steps++;
  rebase(sim);
  if (sim.steps % 12 === 0) refreshChunks(sim);
}
// 着地後に法線方向へまだ離れる速度が大きければ空中のまま（跳ねる）
function e0(sim, n) { return (sim.vx * n.x + sim.vy * n.y + sim.vz * n.z) < 0.5; }
function clampSpeed(sim) {
  var s2 = sim.vx * sim.vx + sim.vy * sim.vy + sim.vz * sim.vz;
  if (s2 > SIM.MAX_SPEED * SIM.MAX_SPEED) {
    var f = SIM.MAX_SPEED / Math.sqrt(s2);
    sim.vx *= f; sim.vy *= f; sim.vz *= f;
  }
}

// 実時間 dtReal 秒ぶん進める（固定ステップに分割）。戻り値は実行ステップ数
export function update(sim, dtReal, input) {
  sim.acc += Math.min(dtReal, 0.1);
  var n = 0;
  while (sim.acc >= SIM.DT) { step(sim, input); sim.acc -= SIM.DT; n++; }
  return n;
}


export { SIM };
