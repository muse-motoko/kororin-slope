// おむすび本体：丸みのある三角形の厚みのある形に、米粒・海苔のテクスチャ（Canvas で自前生成）と
// 縁のほんのり明るいサブサーフェス風の味付け。つぶれ（スカッシュ）のバネもここ。
import * as THREE from '../vendor/three.module.min.js';
import { ONIGIRI, SIM } from './config.js';
import { mulberry32 } from './physics.js';

// ===== Canvas テクスチャ（Node など document が無い環境では null を返し、無地になる） =====
function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toTexture(c, srgb) {
  if (!c) return null;
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 米粒：ふっくらした楕円を向きをばらして敷き詰める。色用と凹凸用（bump）を同時に描く。
export function makeRiceTextures(seed) {
  const S = 512, col = makeCanvas(S, S), bump = makeCanvas(S, S);
  if (!col || !bump) return { map: null, bump: null };
  const cx = col.getContext('2d'), bx = bump.getContext('2d');
  const rng = mulberry32(seed);
  cx.fillStyle = '#e9e1cf'; cx.fillRect(0, 0, S, S);   // 粒のすき間は少し影
  bx.fillStyle = '#303030'; bx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1700; i++) {
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI, len = 15 + rng() * 6, wid = 7.5 + rng() * 2.5;
    const l = 94 + rng() * 5, tint = rng() < 0.15 ? 'hsl(48,45%,' : 'hsl(42,22%,';
    cx.save(); cx.translate(x, y); cx.rotate(a);
    const g = cx.createRadialGradient(-len * 0.12, -wid * 0.2, 1, 0, 0, len * 0.6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, tint + l + '%)'); g.addColorStop(1, tint + (l - 9) + '%)');
    cx.fillStyle = g; cx.beginPath(); cx.ellipse(0, 0, len / 2, wid / 2, 0, 0, TAU); cx.fill();
    cx.restore();
    bx.save(); bx.translate(x, y); bx.rotate(a);
    bx.fillStyle = 'rgba(255,255,255,0.55)'; bx.beginPath(); bx.ellipse(0, 0, len / 2, wid / 2, 0, 0, TAU); bx.fill();
    bx.restore();
  }
  return { map: toTexture(col, true), bump: toTexture(bump, false) };
}
const TAU = Math.PI * 2;

// 海苔：黒緑の地に、繊維のすじとツヤのムラ。
export function makeNoriTexture(seed) {
  const S = 256, c = makeCanvas(S, S);
  if (!c) return null;
  const x = c.getContext('2d'), rng = mulberry32(seed + 77);
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#16231c'); g.addColorStop(0.5, '#1f3329'); g.addColorStop(1, '#14201a');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const px = rng() * S, py = rng() * S, len = 6 + rng() * 40, a = (rng() - 0.5) * 0.5;
    x.strokeStyle = rng() < 0.5 ? 'rgba(70,110,85,0.22)' : 'rgba(5,10,8,0.3)';
    x.lineWidth = 0.6 + rng() * 1.2;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
  }
  for (let i = 0; i < 40; i++) { // ごく小さな透けた穴
    x.fillStyle = 'rgba(90,120,70,0.25)'; x.beginPath();
    x.ellipse(rng() * S, rng() * S, 1 + rng() * 2.5, 0.8 + rng() * 1.5, rng() * 3, 0, TAU); x.fill();
  }
  return toTexture(c, true);
}

// ===== 形状 =====
// 球を「丸い三角形の輪郭 × ふくらんだ面」に変形する。頂点を上にした三角形で、底が平ら。
function outlineRadius(phi) {
  return ONIGIRI.R0 * (1 - ONIGIRI.cornerAmp * 0.45 + ONIGIRI.cornerAmp * Math.cos(3 * (phi - Math.PI / 2)));
}
export function buildOnigiriGeometries() {
  const g = new THREE.SphereGeometry(1, ONIGIRI.segW, ONIGIRI.segH);
  const pa = g.attributes.position, n = pa.count;
  const uv = new Float32Array(n * 2);
  const UVK = 0.3; // UV の広がり。正面から端まで 0.5±0.47 に収める
  for (let i = 0; i < n; i++) {
    // 球の軸を Z（正面）向きに回す：(X,Y,Z) → (X,-Z,Y)
    const px = pa.getX(i), py = -pa.getZ(i), pz = pa.getY(i);
    const phi = Math.atan2(py, px), R = outlineRadius(phi);
    const z = Math.sign(pz) * Math.pow(Math.abs(pz), ONIGIRI.pillow) * ONIGIRI.thick;
    pa.setXYZ(i, px * R, py * R, z);
    // 正面の中心からの等距離（方位）投影。表と裏が縁でつながるのでテクスチャの継ぎ目が出ない
    const t = Math.acos(Math.min(1, Math.abs(pz))) * UVK;
    uv[i * 2] = 0.5 + Math.cos(phi) * t; uv[i * 2 + 1] = 0.5 + Math.sin(phi) * t;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // 球の継ぎ目・極で同じ位置にある頂点の法線をそろえる（そのままだと線が見える）
  const sums = new Map(), key = (i) => Math.round(pa.getX(i) * 1e4) + ',' + Math.round(pa.getY(i) * 1e4) + ',' + Math.round(pa.getZ(i) * 1e4);
  const na = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const k = key(i), s = sums.get(k) || [0, 0, 0];
    s[0] += na.getX(i); s[1] += na.getY(i); s[2] += na.getZ(i); sums.set(k, s);
  }
  for (let i = 0; i < n; i++) {
    const s = sums.get(key(i)), l = Math.hypot(s[0], s[1], s[2]) || 1;
    na.setXYZ(i, s[0] / l, s[1] / l, s[2] / l);
  }
  // 海苔の帯：底側（y が低い）の三角形だけを、少し浮かせて別メッシュにする
  const idx = g.index.array, keep = [];
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    const y = (pa.getY(a) + pa.getY(b) + pa.getY(c)) / 3, x = (pa.getX(a) + pa.getX(b) + pa.getX(c)) / 3;
    if (y < ONIGIRI.noriBottom + ONIGIRI.noriWave * Math.sin(x * 26)) keep.push(a, b, c);
  }
  const lp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    lp[i * 3] = pa.getX(i) + na.getX(i) * ONIGIRI.noriLift;
    lp[i * 3 + 1] = pa.getY(i) + na.getY(i) * ONIGIRI.noriLift;
    lp[i * 3 + 2] = pa.getZ(i) + na.getZ(i) * ONIGIRI.noriLift;
  }
  const nori = new THREE.BufferGeometry();
  nori.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  nori.setAttribute('normal', na.clone());
  nori.setAttribute('uv', g.attributes.uv.clone());
  nori.setIndex(keep);
  return { rice: g, nori };
}

// 縁（見る角度が浅いところ）をほんのり暖かく明るくする。ふわっと光が透けるサブサーフェス風。
function addRim(mat, rim) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: rim.color };
    sh.uniforms.rimStrength = { value: ONIGIRI.rimStrength };
    sh.uniforms.rimPower = { value: ONIGIRI.rimPower };
    sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>',
        'float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), rimPower);\n' +
        'outgoingLight += rimColor * rimF * rimStrength;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'onigiri-rim';
}

// ===== おむすび =====
// 形状とテクスチャは重いので、子（分裂）では1回作ったものを共有する
export function createOnigiriShared() {
  return { geos: buildOnigiriGeometries(), rice: makeRiceTextures(ONIGIRI.seed), noriMap: makeNoriTexture(ONIGIRI.seed) };
}
export function createOnigiri(shared) {
  const { geos, rice, noriMap } = shared || createOnigiriShared();
  const rim = { color: new THREE.Color(ONIGIRI.rimColor) };
  const riceMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: rice.map, bumpMap: rice.bump, bumpScale: 1.2, roughness: 0.82, metalness: 0,
  });
  const noriMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: noriMap, roughness: 0.4, metalness: 0.05,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  if (!noriMap) noriMat.color.setHex(0x1c2b22);
  addRim(riceMat, rim); addRim(noriMat, rim);

  const body = new THREE.Mesh(geos.rice, riceMat);   // 転がりの回転が入る
  const band = new THREE.Mesh(geos.nori, noriMat);
  body.castShadow = true; band.castShadow = false;
  body.add(band);
  const root = new THREE.Group();                    // 位置と、接地面の向き・つぶれが入る
  root.add(body);

  // 頭にちょこんと乗る具のチラ見せ（転がりには付いてこない。形は ball / disc / cone / trio）
  const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  const topGroup = new THREE.Group();
  const topShapes = {
    ball: [new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), topMat)],
    disc: [new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), topMat)],
    cone: [new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 12), topMat)],
    trio: [0, 1, 2].map(() => new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), topMat)),
  };
  topShapes.disc[0].scale.set(1.3, 0.45, 1.3);
  const trioPos = [[-0.1, 0, 0.02], [0.1, 0.01, 0], [0, 0.1, 0.04]];
  topShapes.trio.forEach((m, i) => { m.position.set(...trioPos[i]); m.scale.setScalar(0.9 + (i === 2 ? 0.2 : 0)); });
  Object.values(topShapes).forEach((arr) => arr.forEach((m) => { m.castShadow = true; topGroup.add(m); }));
  topGroup.position.set(0, ONIGIRI.topY, ONIGIRI.topZ);
  root.add(topGroup);

  // 具を切り替える：米の色・海苔の色（null なら海苔なし）・頭の具
  function setFilling(f) {
    riceMat.color.set(f.rice);
    if (f.nori) { band.visible = true; noriMat.color.setRGB(f.nori[0], f.nori[1], f.nori[2]); } else band.visible = false;
    topMat.color.set(f.top.color);
    for (const k in topShapes) topShapes[k].forEach((m) => { m.visible = k === f.top.shape; });
    const sc = f.top.size / 0.1; // 基準の大きさ 0.1m
    topGroup.scale.setScalar(f.top.shape === 'trio' ? sc * 1.8 : sc);
    topMat.metalness = f.rare ? 0.45 : 0; topMat.roughness = f.rare ? 0.3 : 0.5;
  }

  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), rollQ = new THREE.Quaternion();
  const stepQ = new THREE.Quaternion(), axis = new THREE.Vector3(), vel = new THREE.Vector3(), rootQ = new THREE.Quaternion();
  const st = { s: 0, sv: 0, wasGrounded: true, airVy: 0, normal: new THREE.Vector3(0, 1, 0) };

  // sim：物理の状態。normalFn(x,z)：接地面の法線。frameDt：実時間。
  function update(sim, frameDt, normalFn, radius) {
    vel.set(sim.vx, sim.vy, sim.vz);
    const sp = vel.length();
    if (sp > 1e-6) { // 進行方向に前転する向きに回す（物理の球と同じ）
      axis.crossVectors(up, vel).normalize();
      stepQ.setFromAxisAngle(axis, (sp * frameDt) / (radius || SIM.RADIUS));
      rollQ.premultiply(stepQ);
    }
    // 着地の衝撃を記録してつぶれに変える
    if (!sim.grounded) st.airVy = Math.max(st.airVy, -sim.vy);
    if (sim.grounded && !st.wasGrounded) {
      st.s = Math.max(st.s, Math.min(ONIGIRI.squashMax, st.airVy * ONIGIRI.squashLand));
      st.airVy = 0;
    }
    st.wasGrounded = sim.grounded;
    // バネ：空中は少しのび、接地は 0 へ。細かく刻んで安定させる
    const target = sim.grounded ? 0 : -Math.min(ONIGIRI.stretchMax, sp * ONIGIRI.squashStretch);
    const sub = Math.max(1, Math.ceil(frameDt / 0.008)), h = frameDt / sub;
    for (let i = 0; i < sub; i++) {
      st.sv += (-ONIGIRI.springK * (st.s - target) - ONIGIRI.springC * st.sv) * h;
      st.s += st.sv * h;
    }
    st.s = Math.max(-ONIGIRI.stretchMax * 1.5, Math.min(ONIGIRI.squashMax * 1.3, st.s));

    // 接地面の法線にそろえて、法線方向につぶす（平らな面にペタッと乗る）
    if (sim.grounded && normalFn) { const nn = normalFn(sim.x, sim.z); n.set(nn.x, nn.y, nn.z); } else n.copy(up);
    st.normal.lerp(n, Math.min(1, frameDt * 12)).normalize();
    rootQ.setFromUnitVectors(up, st.normal);
    root.quaternion.copy(rootQ);
    root.scale.set(1 + st.s * 0.5, 1 - st.s, 1 + st.s * 0.5);
    body.quaternion.copy(rootQ).invert().multiply(rollQ); // 転がりはワールド基準のまま
    // つぶれても底が地面から離れないよう、中心を法線の逆へ下げる
    const drop = st.s * ONIGIRI.R0;
    root.position.set(sim.x - st.normal.x * drop, sim.y - st.normal.y * drop, sim.z - st.normal.z * drop);
  }

  return { object: root, update, setFilling, rimColor: rim.color, squash: st, materials: [riceMat, noriMat] };
}
