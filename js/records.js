// 記録（最長距離・ずかん）の保存と、距離に応じた進行管理（Three.js 非依存）。
// storage は localStorage 互換（getItem / setItem）。使えない・壊れている場合も落ちずに既定値で動く。
import { FILLING } from './config.js';
import { fillingById, fillingForBand, rollEvent, bandOf, eventWindowOf } from './fillings.js';

export function loadRecords(storage) {
  const rec = { best: 0, found: [] };
  try {
    const raw = storage && storage.getItem(FILLING.STORAGE_KEY);
    if (!raw) return rec;
    const d = JSON.parse(raw);
    if (d && typeof d.best === 'number' && isFinite(d.best) && d.best > 0) rec.best = Math.floor(d.best);
    if (d && Array.isArray(d.found)) rec.found = [...new Set(d.found.filter((id) => typeof id === 'string' && fillingById(id)))];
  } catch (e) { /* 壊れたデータは捨てる */ }
  return rec;
}

export function saveRecords(storage, rec) {
  try {
    storage.setItem(FILLING.STORAGE_KEY, JSON.stringify({ best: Math.floor(rec.best), found: rec.found }));
    return true;
  } catch (e) { return false; }
}

// 進行管理。update(距離 m) を毎フレーム呼ぶと、具の切り替え・ずかん登録・最長記録・イベントを処理する。
export function createProgress(storage, rng) {
  const rec = loadRecords(storage);
  const st = {
    rec, filling: null, band: -1, newFound: null, event: null, eventWindow: -1, dirty: false,
    bandFillings: new Map(), // 帯ごとの結果を覚える（同じ帯の間は具が変わらない）
  };
  function discover(f) {
    if (rec.found.indexOf(f.id) >= 0) return false;
    rec.found.push(f.id); st.dirty = true; return true;
  }
  // 戻り値: { filling, changed, discovered（新しく出会った具 or null）, event（今当たったイベント or null） }
  function update(dist) {
    const out = { filling: st.filling, changed: false, discovered: null, event: null };
    const band = bandOf(dist);
    if (band !== st.band) {
      st.band = band;
      if (!st.bandFillings.has(band)) st.bandFillings.set(band, fillingForBand(band, rng));
      if (st.bandFillings.size > 4) st.bandFillings.delete(st.bandFillings.keys().next().value);
      st.filling = st.bandFillings.get(band);
      out.filling = st.filling; out.changed = true;
      if (discover(st.filling)) out.discovered = st.filling;
    }
    const win = eventWindowOf(dist);
    if (win !== st.eventWindow) {
      st.eventWindow = win;
      if (win > 0) out.event = rollEvent(rng); // 最初の区間ではイベントなし
    }
    const m = Math.floor(dist);
    if (m > rec.best) { rec.best = m; st.dirty = true; }
    return out;
  }
  function flush() {
    if (!st.dirty) return false;
    st.dirty = false;
    return saveRecords(storage, rec);
  }
  return { rec, update, flush, get filling() { return st.filling; }, get dirty() { return st.dirty; } };
}
