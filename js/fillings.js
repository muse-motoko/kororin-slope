// 具の定義と、距離に応じた抽選（Three.js 非依存）。
// rice＝米の色（米テクスチャに掛ける）、nori＝海苔の色の倍率 [r,g,b]（null＝海苔なし）、
// top＝頭からチラ見せする小さな具（shape: ball / disc / cone / trio）。
import { FILLING } from './config.js';

export const COMMON_FILLINGS = [
  { id: 'sake', name: '鮭', rice: '#ffe9e4', nori: [1, 1, 1], top: { shape: 'disc', color: '#ff8a6b', size: 0.11 } },
  { id: 'ume', name: '梅', rice: '#ffe0e8', nori: [1, 1, 1], top: { shape: 'ball', color: '#c62a4a', size: 0.075 } },
  { id: 'tunamayo', name: 'ツナマヨ', rice: '#fff6dc', nori: [1, 1, 1], top: { shape: 'cone', color: '#fff3c4', size: 0.1 } },
  { id: 'konbu', name: '昆布', rice: '#e6ecd8', nori: [2.4, 1.7, 1.2], top: { shape: 'disc', color: '#2f3b2a', size: 0.11 } },
  { id: 'okaka', name: 'おかか', rice: '#f0e0cc', nori: [1.6, 1.2, 1], top: { shape: 'trio', color: '#d6a778', size: 0.05 } },
  { id: 'tarako', name: 'たらこ', rice: '#ffd9d6', nori: [1, 1, 1], top: { shape: 'ball', color: '#ff9c8f', size: 0.08 } },
  { id: 'mentaiko', name: '明太子', rice: '#ffd0c4', nori: [1.4, 0.9, 0.9], top: { shape: 'cone', color: '#ff5a3c', size: 0.1 } },
  { id: 'shirasu', name: 'しらす', rice: '#f2f6f8', nori: [1, 1, 1], top: { shape: 'trio', color: '#f7f7ff', size: 0.05 } },
  { id: 'yukari', name: 'ゆかり', rice: '#e9c9ee', nori: [1, 1, 1.4], top: { shape: 'trio', color: '#8a2f9a', size: 0.045 } },
  { id: 'yaki', name: '焼きおにぎり', rice: '#d9a05b', nori: null, top: { shape: 'disc', color: '#7a3d17', size: 0.1 } },
  { id: 'takana', name: '高菜', rice: '#dcebb0', nori: [0.5, 2.2, 0.7], top: { shape: 'cone', color: '#5ea63a', size: 0.1 } },
  { id: 'soboro', name: 'そぼろ', rice: '#f3d9a8', nori: [1.3, 1, 0.8], top: { shape: 'trio', color: '#b5702f', size: 0.05 } },
];
export const RARE_FILLINGS = [
  { id: 'ikura', name: 'いくら', rare: true, weight: 5, rice: '#ffd8c0', nori: [1, 1, 1], top: { shape: 'trio', color: '#ff6a00', size: 0.07 } },
  { id: 'goldsake', name: '金の鮭', rare: true, weight: 3, rice: '#ffe27a', nori: [2.6, 2.1, 0.6], top: { shape: 'disc', color: '#ffc400', size: 0.13 } },
  { id: 'truffle', name: '白トリュフ', rare: true, weight: 2, rice: '#f3efe6', nori: [1.5, 1.5, 1.7], top: { shape: 'ball', color: '#e6d9bd', size: 0.09 } },
];
export const ALL_FILLINGS = COMMON_FILLINGS.concat(RARE_FILLINGS);
const BY_ID = new Map(ALL_FILLINGS.map((f) => [f.id, f]));
export const fillingById = (id) => BY_ID.get(id) || null;

export const EVENTS = [
  { id: 'meteor', name: '流れ星がきらり！', color: '#fff3a8', weight: 5 },
  { id: 'rainbow', name: 'にじが出た！', color: '#b8e6ff', weight: 3 },
  { id: 'lucky', name: 'ラッキー！ おむすびがぴかぴか', color: '#ffd1f0', weight: 2 },
];

export const bandOf = (dist) => Math.max(0, Math.floor(dist / FILLING.BAND_LEN));
export const eventWindowOf = (dist) => Math.max(0, Math.floor(dist / FILLING.EVENT_LEN));

// 重み付き選択。rng は 0 以上 1 未満を返す関数（シードに依存しない確率は rng 側の一様乱数で決まる）
export function pickWeighted(list, rng) {
  let total = 0;
  for (const x of list) total += x.weight;
  let r = rng() * total;
  for (const x of list) { r -= x.weight; if (r < 0) return x; }
  return list[list.length - 1];
}

// 距離帯 band の具。通常は鮭→梅→ツナマヨ→…の順（周回）。RARE_CHANCE の確率でレア具に置き換わる。
// 最初の帯（band 0）はレアにならない。
export function fillingForBand(band, rng) {
  const common = COMMON_FILLINGS[band % COMMON_FILLINGS.length];
  if (band > 0 && rng() < FILLING.RARE_CHANCE) return pickWeighted(RARE_FILLINGS, rng);
  return common;
}

// レアイベントの抽選。当たらなければ null
export function rollEvent(rng) {
  if (rng() >= FILLING.EVENT_CHANCE) return null;
  return pickWeighted(EVENTS, rng);
}
