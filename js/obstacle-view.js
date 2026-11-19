// 障害物の見た目（もちもち・ふわふわキノコ・丸岩）。物理の sim.obs に合わせてメッシュを作り、揺れ（バネ）をつぶれ・のびで表す。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
import { OBSTACLES } from './config.js';
import { noise2 } from './physics.js';

function mat(color, rough) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }); }

export function createObstacleView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const sphere = new THREE.SphereGeometry(1, 28, 18);
  const rockGeo = new THREE.IcosahedronGeometry(1, 3);   // 丸岩：ゆるい凹凸をつけた丸
  {
    const p = rockGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + 0.09 * noise2(11, x * 1.6 + 5, y * 1.6 + z * 1.3) + 0.05 * noise2(12, z * 3.1, x * 3.1 + y);
      p.setXYZ(i, x * d, y * d, z * d);
    }
    rockGeo.computeVertexNormals();
  }
  const M = {
    mochi: mat(0xfff0f3, 0.45), cheek: mat(0xffb3c6, 0.8), eye: mat(0x4a3b4a, 0.5),
    cap: mat(0xff8fa8, 0.55), dot: mat(0xffffff, 0.6), stem: mat(0xfff3df, 0.8), rock: mat(0xb7b2d4, 0.9),
  };
  let castShadow = true;

  function mesh(geo, m, sx, sy, sz, x, y, z) {
    const o = new THREE.Mesh(geo, m);
    o.scale.set(sx, sy, sz); o.position.set(x, y, z);
    o.castShadow = castShadow; o.receiveShadow = true; o.frustumCulled = false;
    return o;
  }
  // 原点＝衝突球の中心。地面は y = -r×lift あたり
  function buildShape(o) {
    const g = new THREE.Group(), r = o.r, T = OBSTACLES.types[o.type];
    if (o.type === 'mochi') {
      g.add(mesh(sphere, M.mochi, r, r * 0.88, r, 0, -r * 0.05, 0));
      // おだんごの顔（カメラ側＝坂の上側 −z に向ける）
      for (const sx of [-1, 1]) {
        g.add(mesh(sphere, M.eye, r * 0.07, r * 0.09, r * 0.05, sx * r * 0.3, r * 0.2, -r * 0.88));
        g.add(mesh(sphere, M.cheek, r * 0.13, r * 0.08, r * 0.04, sx * r * 0.5, r * 0.02, -r * 0.82));
      }
      g.userData.noSpin = true;
    } else if (o.type === 'mushroom') {
      const top = -r * T.lift;
      g.add(mesh(sphere, M.cap, r, r * 0.78, r, 0, r * 0.12, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.34, 0.42, 1, 16), M.stem, r, r * 0.95, r, 0, (top + r * 0.12) / 2 - r * 0.1, 0));
      for (let i = 0; i < 6; i++) {            // 笠の水玉
        const a = (i / 6) * Math.PI * 2 + 0.4, el = i % 2 ? 0.95 : 0.6;
        g.add(mesh(sphere, M.dot, r * 0.15, r * 0.06, r * 0.15, Math.cos(a) * r * 0.62 * el, r * 0.12 + r * 0.78 * Math.sqrt(1 - 0.38 * el * el) * 0.99 - (i % 2 ? 0.05 * r : 0), Math.sin(a) * r * 0.62 * el));
      }
    } else {
      g.add(mesh(rockGeo, M.rock, r, r * 0.85, r, 0, -r * 0.05, 0));
    }
    return g;
  }

  const views = new Map();           // 障害物 id → { outer, squash, shape, o }
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion(), qi = new THREE.Quaternion(), qs = new THREE.Quaternion();
  function create(o) {
    const outer = new THREE.Group(), squash = new THREE.Group(), shape = buildShape(o);
    outer.add(squash); squash.add(shape); root.add(outer);
    const v = { outer, squash, shape, o, lastS: NaN, spinQ: new THREE.Quaternion().setFromAxisAngle(up, shape.userData.noSpin ? 0 : o.spin) };
    views.set(o.id, v);
    return v;
  }
  function remove(id) {
    const v = views.get(id);
    root.remove(v.outer);
    views.delete(id);
  }

  function update(sim) {
    const seen = new Set();
    for (const list of sim.obs.values()) {
      for (const o of list) {
        seen.add(o.id);
        const v = views.get(o.id) || create(o);
        v.outer.position.set(o.x - sim.ox, o.cy - sim.oy, o.z - sim.oz);
        if (v.lastS !== o.s) {           // 揺れている間だけ向きとつぶれを更新
          v.lastS = o.s;
          dir.set(o.hx, o.hy, o.hz);
          q.setFromUnitVectors(up, dir); qi.copy(q).invert();
          v.outer.quaternion.copy(q);
          v.shape.quaternion.copy(qi).multiply(v.spinQ);
          v.squash.scale.set(1 + o.s * 0.5, 1 - o.s, 1 + o.s * 0.5);
        }
      }
    }
    for (const id of [...views.keys()]) if (!seen.has(id)) remove(id);
  }
  function setQuality(qual) {
    castShadow = qual.shadows;
    for (const v of views.values()) v.shape.traverse((m) => { if (m.isMesh) m.castShadow = castShadow; });
  }
  return { group: root, update, setQuality, views };
}
