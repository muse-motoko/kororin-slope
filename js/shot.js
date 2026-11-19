// 撮影：UI なしの PNG と、距離・具・タイトル入りのシェア画像。
// 描画直後（同じタスク内）に canvas を読む必要があるため、呼び出し側が render() してから capture を呼ぶ。
import { SHOT } from './config.js';

export function shareLayout(w, h) {
  const scale = Math.min(1, SHOT.maxWidth / w), W = Math.round(w * scale), H = Math.round(h * scale);
  const band = Math.round(H * SHOT.bandRatio);
  return { W, H, band, pad: Math.round(band * 0.22), font: Math.round(band * 0.34) };
}
export function fileStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function rgb(a) { return 'rgb(' + a.map((v) => Math.min(255, Math.round(v * 40))).join(',') + ')'; }
// 具つきのおむすびを小さく描く（ずかんの見た目と同じ）
function drawOnigiri(g, f, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 52, s / 52);
  g.beginPath(); g.moveTo(26, 4); g.lineTo(50, 46); g.quadraticCurveTo(48, 52, 42, 52); g.lineTo(10, 52); g.quadraticCurveTo(4, 52, 2, 46); g.closePath();
  g.fillStyle = f.rice; g.fill(); g.clip();
  if (f.nori) { g.fillStyle = rgb(f.nori); g.fillRect(6, 36, 40, 16); }
  g.restore();
  g.save(); g.translate(x, y); g.scale(s / 52, s / 52);
  g.beginPath(); g.arc(26, 9, 6, 0, Math.PI * 2); g.fillStyle = f.top.color; g.fill(); g.restore();
}

// info: { dist, biome, filling }。戻り値は PNG の Blob を返す Promise
export function makeShareImage(srcCanvas, info) {
  const L = shareLayout(srcCanvas.width, srcCanvas.height);
  const c = document.createElement('canvas'); c.width = L.W; c.height = L.H;
  const g = c.getContext('2d');
  g.drawImage(srcCanvas, 0, 0, L.W, L.H);
  const y0 = L.H - L.band, grad = g.createLinearGradient(0, y0 - L.band * 0.5, 0, L.H);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(40,30,60,.35)'); grad.addColorStop(1, 'rgba(40,30,60,.6)');
  g.fillStyle = grad; g.fillRect(0, y0 - L.band * 0.5, L.W, L.band * 1.5);
  g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = L.font * 0.2; g.textBaseline = 'middle';
  const cy = y0 + L.band / 2, fam = 'system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif';
  let x = L.pad;
  if (info.filling) { drawOnigiri(g, info.filling, x, cy - L.band * 0.36, L.band * 0.72); x += L.band * 0.72 + L.pad; }
  g.textAlign = 'left';
  g.font = 'bold ' + L.font * 1.5 + 'px ' + fam; g.fillText(Math.floor(info.dist) + ' m', x, cy - L.font * 0.2);
  g.font = L.font * 0.62 + 'px ' + fam;
  g.fillText((info.filling ? '具：' + info.filling.name + (info.filling.rare ? ' ★レア' : '') + '　' : '') + (info.biome || ''), x, cy + L.font * 0.85);
  g.textAlign = 'right'; g.font = 'bold ' + L.font * 0.8 + 'px ' + fam; g.fillText('無限ころりんスロープ', L.W - L.pad, cy);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}
export function plainImage(srcCanvas) {
  return new Promise((res, rej) => srcCanvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}

// 端末が共有に対応していれば共有シートを、なければ保存（ダウンロード）にする
export async function deliver(blob, name, preferShare) {
  const file = new File([blob], name, { type: 'image/png' });
  if (preferShare && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '無限ころりんスロープ' }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
