// 分裂した子たちの見た目：小さなおむすび。「ぽんっ」と膨らんで現れ、合流で吸い込まれて縮み、落ちたら静かに透けていく。
import * as THREE from '../vendor/three.module.min.js';
import { SPLIT, ONIGIRI } from './config.js';
import { createOnigiri, createOnigiriShared } from './onigiri.js';

// ぽんっ：0 から少し大きめに膨らんでから 1 に落ち着く
export function popScale(age) { return age <= 0 ? 0 : 1 - Math.exp(-age * 11) * Math.cos(age * 19); }
// 合流：吸い込まれながら縮む
export function mergeScale(t) { const u = Math.min(1, t / SPLIT.MERGE_TIME); return 1 - u * u * (3 - 2 * u); }
// フェード：ゆっくり透明に
export function fadeAlpha(t) { const u = Math.min(1, t / SPLIT.FADE_TIME); return 1 - u * u * (3 - 2 * u); }

export function createSplitView(scene) {
  const shared = createOnigiriShared();
  const group = new THREE.Group();
  scene.add(group);
  const free = [], used = new Map();   // 使い回しのプール／子の id → 見た目
  function acquire() {
    const inst = free.pop() || createOnigiri(shared);
    if (!inst.object.parent) group.add(inst.object);
    inst.object.visible = true;
    return inst;
  }

  // sim.kids を反映。normalFn(x,z)：接地面の法線
  function update(sim, frameDt, normalFn, rimColor) {
    const alive = new Set();
    for (const k of sim.kids) {
      alive.add(k.id);
      let inst = used.get(k.id);
      if (!inst) { inst = acquire(); used.set(k.id, inst); }
      inst.rimColor.copy(rimColor);
      inst.update(k, frameDt, normalFn, k.r);
      let s = SPLIT.SCALE * popScale(k.age), a = 1;
      if (k.state === 'merge') s = SPLIT.SCALE * mergeScale(k.t);
      if (k.state === 'fade') a = fadeAlpha(k.t);
      const o = inst.object, n = inst.squash.normal, drop = inst.squash.s * ONIGIRI.R0 * s; // つぶれても底が浮かない
      o.scale.multiplyScalar(Math.max(s, 1e-4));
      o.position.set(k.x - n.x * drop, k.y - n.y * drop, k.z - n.z * drop);
      for (const m of inst.materials) { m.transparent = a < 1; m.opacity = a; m.depthWrite = a >= 1; }
    }
    for (const [id, inst] of used) {
      if (alive.has(id)) continue;
      inst.object.visible = false; used.delete(id); free.push(inst);
    }
  }
  return { group, update, used };
}
