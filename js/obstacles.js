// 障害物（もちもち・ふわふわキノコ・丸岩）：シード付き配置と、球との衝突・バネの揺れ。Three.js 非依存。
import { OBSTACLES as O, SIM } from './config.js';
import { mulberry32, worldHeight } from './physics.js';

const TYPE_NAMES = Object.keys(O.types);

// チャンク k の障害物（決定論）。乱数は置かれるかどうかに関係なく同じ順で消費する。
export function layoutObstacles(seed, k) {
  const rng = mulberry32((Math.imul(seed | 0, 2654435761) ^ Math.imul(k, 40503) ^ 0x7a3c) >>> 0);
  const total = TYPE_NAMES.reduce((a, n) => a + O.types[n].weight, 0);
  const z0 = k * SIM.CHUNK_LEN, list = [];
  for (let i = 0; i < O.slots; i++) {
    let roll = rng() * total, type = TYPE_NAMES[TYPE_NAMES.length - 1];
    for (const n of TYPE_NAMES) { if (roll < O.types[n].weight) { type = n; break; } roll -= O.types[n].weight; }
    const x = (rng() * 2 - 1) * O.xRange, z = z0 + O.edgeMargin + rng() * (SIM.CHUNK_LEN - 2 * O.edgeMargin);
    const sc = 1 + (rng() * 2 - 1) * O.scaleVar, keep = rng(), spin = rng() * Math.PI * 2;
    if (keep >= O.density || z < O.clearStart) continue;
    const T = O.types[type], r = T.r * sc;
    if (list.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + O.gap)) continue; // 近すぎるものは置かない
    list.push({ id: k * 16 + i, type, x, z, r, spin, cy: worldHeight(seed, x, z) + r * T.lift,
      s: 0, sv: 0, hx: 0, hy: 1, hz: 0 }); // s/sv：揺れ（つぶれ量とその速度）、h：最後に当たった向き
  }
  return list;
}

// 球（または子）b {x,y,z,vx,vy,vz}（ローカル座標）と障害物の衝突。めり込みを押し出し、反発し、障害物を揺らす。
// 戻り値：ぶつかった速さ（なければ 0）
export function collideBody(sim, b, radius) {
  const L = SIM.CHUNK_LEN, k0 = Math.floor((b.z + sim.oz) / L);
  let best = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const list = sim.obs.get(k);
    if (!list) continue;
    for (const o of list) {
      const dx = b.x - (o.x - sim.ox), dy = b.y - (o.cy - sim.oy), dz = b.z - (o.z - sim.oz);
      const R = o.r + radius, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2);
      let nx = 0, ny = 1, nz = 0;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; }
      const pen = R - d;
      b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;      // 押し出し（高速でもすり抜けない）
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn >= 0) continue;                                  // もう離れていく
      const T = O.types[o.type], speed = -vn;
      const out = Math.min(O.outMax, Math.max(T.e * speed, T.minOut));            // 跳ね返る速さ
      b.vx += (out - vn) * nx; b.vy += (out - vn) * ny; b.vz += (out - vn) * nz;
      o.sv += speed * T.kick;  // バネを蹴る
      o.hx = -nx; o.hy = -ny; o.hz = -nz;
      sim.wobbling.add(o);
      if (speed > best) best = speed;
    }
  }
  return best;
}

// 揺れのバネ（つぶれ量 s が 0 に戻ろうとして振動し、減衰する）
export function stepWobble(sim, dt) {
  for (const o of sim.wobbling) {
    const T = O.types[o.type];
    o.sv += (-T.K * o.s - T.C * o.sv) * dt;
    o.s += o.sv * dt;
    o.s = Math.max(-O.wobbleMax, Math.min(O.wobbleMax, o.s));
    if (Math.abs(o.s) < 1e-3 && Math.abs(o.sv) < 1e-2) { o.s = 0; o.sv = 0; sim.wobbling.delete(o); }
  }
}
