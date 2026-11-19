// 空のグラデーション・星・遠景の丘・花びら/綿毛のパーティクル。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
import { mulberry32 } from './physics.js';

// ===== 空：カメラに追従する大きな球にグラデーションを描く =====
export function createSky() {
  const uniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;',
      'varying vec3 vDir;',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float t = smoothstep(0.0, 0.3, d.y);', // 画面に映るのは水平線の上 十数度なので、低い所で上の色に到達させる
      '  vec3 col = mix(horizon, top, t);',
      '  float s = max(dot(d, sunDir), 0.0);',
      '  col += sunColor * (pow(s, 48.0) * 0.5 + pow(s, 6.0) * 0.18);', // ほのかな光のにじみ
      '  col += sunColor * smoothstep(0.9988, 0.9992, s) * 1.5;', // 太陽・月の円
      '  gl_FragColor = vec4(col, 1.0);',
      '#include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;

  // 星：低い空に多めに散らす（画面に映る空は水平線の上 十数度だけなので）
  const MAX = 800, rng = mulberry32(2024), pos = new Float32Array(MAX * 3);
  for (let i = 0; i < MAX; i++) {
    const y = 0.02 + 0.7 * Math.pow(rng(), 1.6), a = rng() * Math.PI * 2, h = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * h * 140; pos[i * 3 + 1] = y * 140; pos[i * 3 + 2] = Math.sin(a) * h * 140;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(sg, starMat);
  stars.renderOrder = -9; stars.frustumCulled = false; stars.visible = false;

  return {
    mesh, stars, uniforms,
    setStars(n) { sg.setDrawRange(0, Math.min(n, MAX)); },
    follow(p) { mesh.position.copy(p); stars.position.copy(p); },
  };
}

// ===== 遠景：水平線にかすむ、丸い丘の2層 =====
export function createFarHills() {
  const group = new THREE.Group(), rng = mulberry32(77), layers = [];
  const geo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); // 半球
  const specs = [
    { dist: 150, count: 14, hmin: 24, hmax: 40, haze: 0.55 },
    { dist: 172, count: 12, hmin: 28, hmax: 46, haze: 0.78 },
  ];
  for (const sp of specs) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    for (let i = 0; i < sp.count; i++) {
      const th = ((i + rng() * 0.8) / sp.count - 0.5) * Math.PI * 1.25; // 前方 ±112° に並べる
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.sin(th) * sp.dist, -20, Math.cos(th) * sp.dist);
      m.scale.set(25 + rng() * 25, sp.hmin + rng() * (sp.hmax - sp.hmin), 25 + rng() * 25);
      m.frustumCulled = false;
      group.add(m);
    }
    layers.push({ mat, haze: sp.haze });
  }
  return { group, layers };
}

// ===== パーティクル：花びら（ひらひら落ちる）と綿毛（ふわふわ漂う）=====
function dotTexture(kind) {
  if (typeof document === 'undefined') return null; // Node（テスト）では作らない
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'petal') {
    g.translate(32, 32); g.rotate(-0.6); g.scale(1, 0.55);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 28);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 28, 0, Math.PI * 2); g.fill();
  } else {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BOX = { hx: 16, hy: 8, hz: 22, cy: 2, cz: 12 }; // ボールの周りの漂う範囲（半幅・中心オフセット）
export function createParticles(max = 160) {
  const rng = mulberry32(31337);
  function make(kind, size) {
    const pos = new Float32Array(max * 3), phase = new Float32Array(max);
    for (let i = 0; i < max; i++) { pos[i * 3] = (rng() * 2 - 1) * BOX.hx; pos[i * 3 + 1] = (rng() * 2 - 1) * BOX.hy; pos[i * 3 + 2] = (rng() * 2 - 1) * BOX.hz; phase[i] = rng() * 6.28; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: dotTexture(kind), size, transparent: true, depthWrite: false, opacity: 0 });
    const points = new THREE.Points(g, m);
    points.frustumCulled = false; points.visible = false;
    return { kind, pos, phase, g, points, mat: m, count: max, init: false };
  }
  const petals = make('petal', 0.32), fluff = make('fluff', 0.45);
  const wrap = (v, c, h) => c + ((((v - c + h) % (2 * h)) + 2 * (2 * h)) % (2 * h)) - h;

  function step(p, dt, t, cx, cy, cz) {
    const n = p.count, a = p.pos;
    for (let i = 0; i < n; i++) {
      const o = i * 3, ph = p.phase[i];
      if (!p.init) { a[o] += cx; a[o + 1] += cy + BOX.cy; a[o + 2] += cz + BOX.cz; }
      if (p.kind === 'petal') {
        a[o] += Math.sin(t * 1.1 + ph) * 0.7 * dt; a[o + 1] -= (0.8 + 0.3 * Math.sin(t * 2 + ph)) * dt; a[o + 2] += (0.4 + 0.3 * Math.cos(t * 0.9 + ph)) * dt;
      } else {
        a[o] += Math.sin(t * 0.6 + ph * 2) * 0.5 * dt; a[o + 1] += (0.12 + 0.2 * Math.sin(t * 0.8 + ph)) * dt; a[o + 2] += 0.3 * dt;
      }
      a[o] = wrap(a[o], cx, BOX.hx); a[o + 1] = wrap(a[o + 1], cy + BOX.cy, BOX.hy); a[o + 2] = wrap(a[o + 2], cz + BOX.cz, BOX.hz);
    }
    p.init = true;
    p.g.attributes.position.needsUpdate = true;
  }
  return {
    petals, fluff,
    setCount(n) { for (const p of [petals, fluff]) { p.count = Math.min(n, max); p.g.setDrawRange(0, p.count); } },
    // cx,cy,cz：ボール位置（ローカル座標）
    update(dt, t, cx, cy, cz) { step(petals, dt, t, cx, cy, cz); step(fluff, dt, t, cx, cy, cz); },
    // フローティングオリジンの平行移動に合わせて位置をずらす
    shift(dx, dy, dz) {
      for (const p of [petals, fluff]) { for (let i = 0; i < p.count * 3; i += 3) { p.pos[i] -= dx; p.pos[i + 1] -= dy; p.pos[i + 2] -= dz; } }
    },
  };
}
