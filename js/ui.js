import { QUALITY_LEVELS } from './config.js';
import { ALL_FILLINGS } from './fillings.js';

// 品質トグルの枠。クリックで高/低を切り替え、onChange(name) を呼ぶ。
export function setupQualityToggle(button, initial, onChange) {
  const names = Object.keys(QUALITY_LEVELS);
  let current = initial;
  const render = () => { button.textContent = '画質: ' + QUALITY_LEVELS[current].label; };
  button.addEventListener('click', () => {
    current = names[(names.indexOf(current) + 1) % names.length];
    render();
    onChange(current);
  });
  render();
}

// ずかん：出会った具は色つきで、未発見はシルエット（名前は「？？？」）。
function onigiriSwatch(f) {
  const noriColor = f.nori ? 'rgb(' + f.nori.map((v) => Math.min(255, Math.round(v * 40))).join(',') + ')' : 'transparent';
  return '<div class="onigiri"><div class="body" style="background:' + f.rice + '"></div>' +
    '<div class="nori" style="background:' + noriColor + '"></div>' +
    '<div class="top" style="background:' + f.top.color + '"></div></div>';
}
export function setupZukan(button, panel, found) {
  const grid = panel.querySelector('#zukan-grid'), count = panel.querySelector('#zukan-count');
  function render() {
    grid.innerHTML = ALL_FILLINGS.map((f) => {
      const ok = found.indexOf(f.id) >= 0;
      return '<div class="card' + (ok ? '' : ' unknown') + (ok && f.rare ? ' rare' : '') + '">' + onigiriSwatch(f) +
        '<div>' + (ok ? f.name + (f.rare ? ' ★' : '') : '？？？') + '</div></div>';
    }).join('');
    count.textContent = found.length + ' / ' + ALL_FILLINGS.length + ' 種';
  }
  button.addEventListener('click', () => { render(); panel.hidden = false; });
  panel.querySelector('#zukan-close').addEventListener('click', () => { panel.hidden = true; });
  panel.addEventListener('click', (e) => { if (e.target === panel) panel.hidden = true; });
  return { render };
}
