// バイオーム（距離で切り替わる世界の雰囲気）。Three.js 非依存の純関数なので Node でもテストできます。
import { BIOMES, WORLD } from './config.js';

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'fog', 'hemiSky', 'hemiGround', 'sunColor', 'ground', 'ground2', 'cliff', 'foliage', 'foliage2', 'trunk', 'cloud', 'petalColor', 'fluffColor'];
const NUM_KEYS = ['fogNear', 'fogFar', 'hemiInt', 'sunInt', 'sunElev', 'stars', 'petals', 'fluff', 'tree', 'flower', 'cloudW', 'cloudLow', 'hill'];

function lerpHex(a, b, t) {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

// 距離 z (m) での「今のバイオーム a、次のバイオーム b、混ざり具合 t」
export function biomeAt(z) {
  const u = z / WORLD.BIOME_LEN, i = Math.floor(u), f = u - i;
  const start = 1 - WORLD.BIOME_BLEND;
  let t = 0;
  if (f > start) { const x = (f - start) / WORLD.BIOME_BLEND; t = x * x * (3 - 2 * x); }
  const n = BIOMES.length, a = ((i % n) + n) % n;
  return { a, b: (a + 1) % n, t, index: t < 0.5 ? a : (a + 1) % n };
}

// 距離 z での全パラメータ（色は 0xRRGGBB、数値は補間済み）
export function sample(z) {
  const m = biomeAt(z), A = BIOMES[m.a], B = BIOMES[m.b], t = m.t;
  const o = { index: m.index, t, name: BIOMES[m.index].name };
  for (const k of COLOR_KEYS) o[k] = t === 0 ? A[k] : lerpHex(A[k], B[k], t);
  for (const k of NUM_KEYS) o[k] = A[k] + (B[k] - A[k]) * t;
  return o;
}
