import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
import { COLORS, CAMERA, ONIGIRI, SIM, WORLD, QUALITY_LEVELS, DEFAULT_QUALITY } from './config.js';
import { worldHeight, noise2, localHeight, normalAt } from './physics.js';
import { createOnigiri } from './onigiri.js';
import { createCameraRig } from './camera.js';
import { sample } from './biomes.js';
import { layoutDecor, buildDecorGeometry } from './decor.js';
import { createObstacleView } from './obstacle-view.js';
import { createSplitView } from './split-view.js';
import { createSky, createFarHills, createParticles } from './scenery.js';

// 地形チャンクの見た目。物理と同じ高さ関数から格子メッシュを作る。
function buildChunkMesh(seed, chunk, material) {
  const { nx, nz, x0, z0 } = chunk;
  const base = Math.round(worldHeight(seed, 0, z0 + SIM.CHUNK_LEN / 2)); // 桁落ち対策：チャンク基準高さ
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const nor = new Float32Array(pos.length);
  const col = new Float32Array(pos.length);
  const e = 0.25, c = new THREE.Color(), g1 = new THREE.Color(), g2 = new THREE.Color(), cl = new THREE.Color();
  for (let j = 0; j <= nz; j++) {
    const z = z0 + j * SIM.CELL, env = sample(z); // バイオームの色は z だけで決まるので行ごとに1回
    g1.setHex(env.ground); g2.setHex(env.ground2); cl.setHex(env.cliff);
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * SIM.CELL, p = (j * (nx + 1) + i) * 3;
      const h = chunk.h[j * (nx + 1) + i];
      pos[p] = x; pos[p + 1] = h - base; pos[p + 2] = j * SIM.CELL;
      // 隣のチャンクとつながるよう、高さ関数から直接法線を求める
      const dx = (worldHeight(seed, x + e, z) - worldHeight(seed, x - e, z)) / (2 * e);
      const dz = (worldHeight(seed, x, z + e) - worldHeight(seed, x, z - e)) / (2 * e);
      const l = Math.hypot(dx, 1, dz);
      nor[p] = -dx / l; nor[p + 1] = 1 / l; nor[p + 2] = -dz / l;
      // パステルの頂点カラー：2色のまだら（大きなノイズ）＋急な面は土色
      const patch = 0.5 + 0.5 * noise2(seed + 9, x / 9, z / 9);
      const steep = Math.min(1, Math.max(0, (1 - nor[p + 1] - 0.05) * 2.2));
      c.copy(g1).lerp(g2, patch).lerp(cl, steep);
      const shade = 0.95 + 0.05 * Math.sin(x * 0.7) * Math.sin(z * 0.7); // 動きが分かるごく淡い格子模様
      col[p] = c.r * shade; col[p + 1] = c.g * shade; col[p + 2] = c.b * shade;
    }
  }
  const idx = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, f = d + 1;
      idx.push(a, d, b, b, d, f);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // 位置は毎フレーム更新するので境界は自前管理
  mesh.userData.base = base;
  return mesh;
}

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  const fog = new THREE.Fog(COLORS.sky, 30, 110); // 色・距離はバイオームごとに毎フレーム更新
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  const rig = createCameraRig();

  const sky = createSky();
  const farHills = createFarHills();
  const particles = createParticles();
  scene.add(sky.mesh, sky.stars, farHills.group, particles.petals.points, particles.fluff.points);

  // 半球ライト（空色と地面色）＋太陽（月）の柔らかい影
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
  sun.shadow.radius = 4; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const decorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const terrain = new THREE.Group();
  scene.add(terrain);
  const meshes = new Map(); // チャンク番号 → グループ（地形＋装飾）
  let quality = QUALITY_LEVELS[DEFAULT_QUALITY];
  const obstacleView = createObstacleView(scene);

  function buildChunk(seed, chunk) {
    const group = new THREE.Group();
    const m = buildChunkMesh(seed, chunk, terrainMat);
    group.userData.base = m.userData.base;
    group.add(m);
    const items = layoutDecor(seed, chunk, quality.decor, sample);
    const dg = items.length ? buildDecorGeometry(seed, chunk, m.userData.base, items, sample) : null;
    if (dg) {
      const d = new THREE.Mesh(dg, decorMat);
      d.castShadow = quality.shadows; d.receiveShadow = true; d.frustumCulled = false;
      group.add(d);
    }
    return group;
  }
  function removeChunk(k) {
    const grp = meshes.get(k);
    terrain.remove(grp);
    grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    meshes.delete(k);
  }

  // 品質の適用。装飾の密度・影は作り直しが必要なので、チャンクを破棄して次の update で再生成する。
  function setQuality(q) {
    quality = q;
    for (const k of [...meshes.keys()]) removeChunk(k);
    sky.setStars(q.stars);
    particles.setCount(q.particles);
    farHills.group.visible = q.farHills;
    obstacleView.setQuality(q);
  }
  setQuality(quality);

  const onigiri = createOnigiri();
  scene.add(onigiri.object);
  const splitView = createSplitView(scene);
  let seenSplits = 0, seenMerges = 0, seenHits = 0;

  const tmpC = new THREE.Color(), tmpF = new THREE.Color(), sunDir = new THREE.Vector3();
  let time = 0, biomeName = '';

  // バイオーム（距離）に応じて、空・霧・ライト・遠景・パーティクルの色と強さを更新する
  function applyEnvironment(env) {
    biomeName = env.name;
    tmpF.setHex(env.fog);
    fog.color.copy(tmpF); scene.background.copy(tmpF);
    fog.near = env.fogNear; fog.far = env.fogFar;
    hemi.color.setHex(env.hemiSky); hemi.groundColor.setHex(env.hemiGround); hemi.intensity = env.hemiInt;
    sun.color.setHex(env.sunColor); sun.intensity = env.sunInt;
    const e = env.sunElev, h = Math.sqrt(1 - e * e);
    sunDir.set(WORLD.SUN_AZIM[0] * h, e, WORLD.SUN_AZIM[1] * h);
    sky.uniforms.top.value.setHex(env.skyTop);
    sky.uniforms.horizon.value.setHex(env.skyHorizon);
    sky.uniforms.sunDir.value.copy(sunDir);
    sky.uniforms.sunColor.value.setHex(env.sunColor);
    sky.stars.material.opacity = env.stars;
    sky.stars.visible = env.stars > 0.01;
    for (const L of farHills.layers) L.mat.color.setHex(env.ground).lerp(tmpF, L.haze); // 遠いほど霧の色にかすむ
    onigiri.rimColor.setHex(ONIGIRI.rimColor).lerp(tmpC.setHex(env.hemiSky), 0.35);
    particles.petals.mat.color.setHex(env.petalColor); particles.petals.mat.opacity = env.petals * 0.9;
    particles.petals.points.visible = env.petals > 0.02;
    particles.fluff.mat.color.setHex(env.fluffColor); particles.fluff.mat.opacity = env.fluff * 0.85;
    particles.fluff.points.visible = env.fluff > 0.02;
  }

  // sim の状態を反映する。frameDt は実時間（カメラ追従・球の回転用）。
  function update(sim, frameDt) {
    time += frameDt;
    // チャンク：生成されたものに合わせてメッシュを作成、破棄されたものは解放
    for (const [k, chunk] of sim.chunks) {
      if (!meshes.has(k)) {
        const m = buildChunk(sim.seed, chunk);
        meshes.set(k, m); terrain.add(m);
      }
    }
    for (const k of [...meshes.keys()]) if (!sim.chunks.has(k)) removeChunk(k);
    // フローティングオリジン：メッシュ位置はローカル座標（ワールド − オフセット）
    for (const [k, m] of meshes) {
      m.position.set(0, m.userData.base - sim.oy, k * SIM.CHUNK_LEN - sim.oz);
    }

    onigiri.update(sim, frameDt, (x, z) => normalAt(sim, x, z));
    // 出来事に合わせて、本体がぽよんとつぶれる（バネ）
    const st = onigiri.squash;
    if (sim.splits !== seenSplits) { seenSplits = sim.splits; st.s = Math.max(st.s, 0.14); }
    if (sim.merges !== seenMerges) { seenMerges = sim.merges; st.s = Math.max(st.s, 0.07); }
    if (sim.hits !== seenHits) { seenHits = sim.hits; st.s = Math.max(st.s, Math.min(ONIGIRI.squashMax, sim.lastHit * 0.012)); }
    obstacleView.update(sim);
    splitView.update(sim, frameDt, (x, z) => normalAt(sim, x, z), onigiri.rimColor);

    applyEnvironment(sample(sim.z + sim.oz));
    sun.position.set(sim.x + sunDir.x * WORLD.SUN_DIST, sim.y + sunDir.y * WORLD.SUN_DIST, sim.z + sunDir.z * WORLD.SUN_DIST);
    sun.target.position.set(sim.x, sim.y, sim.z);
    particles.update(frameDt, time, sim.x, sim.y, sim.z);

    rig.update(frameDt, sim, (x, z) => localHeight(sim, x, z));
    camera.position.set(rig.position.x, rig.position.y, rig.position.z);
    camera.lookAt(rig.look.x, rig.look.y, rig.look.z);
    if (Math.abs(camera.fov - rig.fov) > 0.01) { camera.fov = rig.fov; camera.updateProjectionMatrix(); }

    sky.follow(camera.position);
    farHills.group.position.set(camera.position.x * WORLD.FAR_HILLS_PARALLAX, camera.position.y, camera.position.z);
  }

  // フローティングオリジンの平行移動は camera.position もずらす必要があるため、移動量を受け取る
  function shift(dx, dy, dz) {
    rig.shift(dx, dy, dz);
    particles.shift(dx, dy, dz);
  }

  return { scene, camera, rig, sun, update, shift, terrain, setQuality, obstacleView, splitView, getBiomeName: () => biomeName, setFilling: onigiri.setFilling };
}
