// 丸い装飾（木・花・雲・丘）。チャンクごとに「配置の決定（純粋）」→「1枚の頂点カラーメッシュにまとめる」の2段階。
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, SIM } from './config.js';
import { mulberry32, worldHeight } from './physics.js';

// ===== 配置（Three.js 非依存・決定論）=====
// 乱数は密度に関係なく同じ順で消費するので、密度を下げても「間引かれるだけ」で配置は変わりません。
// sampleFn(z) はバイオームのパラメータ（biomes.sample）。
export function layoutDecor(seed, chunk, density, sampleFn) {
  const rng = mulberry32((Math.imul(seed | 0, 73856093) ^ Math.imul(chunk.k, 19349663) ^ 0x2f1d) >>> 0);
  const items = [], z0 = chunk.z0, L = SIM.CHUNK_LEN;
  for (let i = 0; i < 12; i++) { // 木：コースの外側（壁の斜面側）
    const side = rng() < 0.5 ? -1 : 1, x = side * (10 + rng() * 13), z = z0 + rng() * L;
    const s = 0.8 + rng() * 0.9, col = rng(), keep = rng();
    if (keep < density * sampleFn(z).tree) items.push({ type: 'tree', x, z, s, col });
  }
  for (let i = 0; i < 8; i++) { // 花：5輪ずつの花だまり
    const cx = (rng() * 2 - 1) * 20, cz = z0 + rng() * L, keep = rng();
    const w = sampleFn(cz).flower;
    for (let f = 0; f < 5; f++) {
      const dx = (rng() * 2 - 1) * 1.6, dz = (rng() * 2 - 1) * 1.6, ci = Math.floor(rng() * PALETTE.flowers.length), s = 0.7 + rng() * 0.6;
      if (keep < density * w) items.push({ type: 'flower', x: cx + dx, z: cz + dz, s, ci });
    }
  }
  for (let i = 0; i < 5; i++) { // 雲：空中
    const x = (rng() * 2 - 1) * 45, z = z0 + rng() * L, hh = rng(), s0 = 1 + rng(), keep = rng();
    const w = sampleFn(z);
    if (keep < density * w.cloudW) {
      items.push({ type: 'cloud', x, z, s: s0 * (1 + 0.5 * w.cloudLow), up: (11 + hh * 17) * (1 - w.cloudLow) + (8 + hh * 7) * w.cloudLow });
    }
  }
  for (let i = 0; i < 4; i++) { // 近景の丘：壁の縁に丸いこんもり
    const side = rng() < 0.5 ? -1 : 1, x = side * (16 + rng() * 5), z = z0 + rng() * L;
    const r = 3 + rng() * 2.5, col = rng(), keep = rng();
    if (keep < density * sampleFn(z).hill) items.push({ type: 'hill', x, z, r, col });
  }
  return items;
}

// ===== メッシュ化 =====
const tpl = {};
function tmpl(name, geo) {
  if (!tpl[name]) { const g = geo().toNonIndexed(); tpl[name] = { p: g.attributes.position.array, n: g.attributes.normal.array }; }
  return tpl[name];
}
const SPH = () => tmpl('sph', () => new THREE.SphereGeometry(1, 10, 7));
const SPH_S = () => tmpl('sphS', () => new THREE.SphereGeometry(1, 5, 3));
const SPH_M = () => tmpl('sphM', () => new THREE.SphereGeometry(1, 14, 8));
const CYL = () => tmpl('cyl', () => new THREE.CylinderGeometry(0.16, 0.24, 1, 6, 1, false));

class Acc {
  constructor() { this.p = []; this.n = []; this.c = []; }
  // テンプレートを 拡大(sx,sy,sz) → Y回転 → 平行移動して追加。下ほど少し暗くして丸みを出す。
  part(t, x, y, z, sx, sy, sz, color, rotY) {
    const cs = Math.cos(rotY || 0), sn = Math.sin(rotY || 0);
    for (let i = 0; i < t.p.length; i += 3) {
      const px = t.p[i] * sx, py = t.p[i + 1] * sy, pz = t.p[i + 2] * sz;
      this.p.push(px * cs + pz * sn + x, py + y, -px * sn + pz * cs + z);
      let nx = t.n[i] / sx, ny = t.n[i + 1] / sy, nz = t.n[i + 2] / sz;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.n.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
      const shade = 0.8 + 0.2 * (ny * 0.5 + 0.5);
      this.c.push(color.r * shade, color.g * shade, color.b * shade);
    }
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

// 位置はチャンクグループのローカル座標（x はそのまま、y は地面高さ − base、z は z0 からの距離）
export function buildDecorGeometry(seed, chunk, base, items, sampleFn) {
  const acc = new Acc(), c1 = new THREE.Color(), c2 = new THREE.Color();
  for (const it of items) {
    const env = sampleFn(it.z), x = it.x, z = it.z - chunk.z0;
    const y0 = worldHeight(seed, it.x, it.z) - base;
    if (it.type === 'tree') {
      const s = it.s;
      acc.part(CYL(), x, y0 + 0.7 * s, z, s, 1.6 * s, s, c1.setHex(env.trunk), 0);
      c1.setHex(env.foliage).lerp(c2.setHex(env.foliage2), it.col);
      acc.part(SPH(), x, y0 + 2.5 * s, z, 1.3 * s, 1.2 * s, 1.3 * s, c1, 0);
      acc.part(SPH(), x + 0.7 * s, y0 + 3.1 * s, z + 0.2 * s, 0.8 * s, 0.75 * s, 0.8 * s, c1, 0);
    } else if (it.type === 'flower') {
      const s = it.s;
      acc.part(CYL(), x, y0 + 0.25 * s, z, 0.2 * s, 0.5 * s, 0.2 * s, c1.setHex(env.foliage), 0);
      c1.setHex(PALETTE.flowers[it.ci]);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        acc.part(SPH_S(), x + Math.cos(a) * 0.13 * s, y0 + 0.5 * s, z + Math.sin(a) * 0.13 * s, 0.11 * s, 0.07 * s, 0.11 * s, c1, 0);
      }
      acc.part(SPH_S(), x, y0 + 0.53 * s, z, 0.09 * s, 0.07 * s, 0.09 * s, c2.setHex(PALETTE.flowerCenter), 0);
    } else if (it.type === 'cloud') {
      c1.setHex(env.cloud);
      for (let k = 0; k < 5; k++) {
        const r = it.s * (1.0 + 0.45 * (1 - Math.abs(k - 2) / 2));
        acc.part(SPH(), x + (k - 2) * 1.4 * it.s, y0 + it.up + 0.2 * r * Math.sin(k * 2.1), z + 0.3 * r * Math.cos(k * 1.7), r, r * 0.7, r, c1, 0);
      }
    } else if (it.type === 'hill') {
      c1.setHex(env.ground2).lerp(c2.setHex(env.ground), it.col);
      acc.part(SPH_M(), x, y0 - 0.15 * it.r, z, it.r, it.r * 0.6, it.r * 1.1, c1, 0);
    }
  }
  return acc.geometry();
}
