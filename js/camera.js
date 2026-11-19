// カメラの動き。Three.js には依存しない（Node の test.js からも使える）。
// 自動追従：ショットを順に切り替え、ゆるく揺れ、速いほど引いて広角になる。
// 手動操作：ドラッグ回転・ホイール／ピンチで寄り引き。操作を離して少しすると自動に戻る。
import { CAMERA } from './config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };

export function createCameraRig() {
  const C = CAMERA;
  const r = {
    position: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, fov: C.fov,
    gesture: false,                    // 手動操作中（ドラッグ／ピンチ）
    userYaw: 0, userPitch: 0, userZoom: 0, // 手動の上乗せ（zoom は対数）
    idle: 99, time: 0, shotT: 0, shotI: 0,
    focus: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0.4, dist: 7.5, lift: 0, ready: false,
  };

  r.interact = () => { r.idle = 0; };
  r.drag = (dx, dy) => {
    r.userYaw += dx * C.dragYaw;
    r.userPitch = clamp(r.userPitch + dy * C.dragPitch, -1.2, 1.2);
    r.interact();
  };
  r.zoomBy = (factor) => { // factor > 1 で引く
    r.userZoom = clamp(r.userZoom + Math.log(factor), Math.log(C.zoomMin), Math.log(C.zoomMax));
    r.interact();
  };
  // フローティングオリジンの平行移動に合わせる
  r.shift = (dx, dy, dz) => { r.focus.x -= dx; r.focus.y -= dy; r.focus.z -= dz; };
  r.isUserActive = () => r.gesture || r.idle < C.returnDelay ||
    Math.abs(r.userYaw) > 0.03 || Math.abs(r.userPitch) > 0.03 || Math.abs(r.userZoom) > 0.03;

  // b: 球の状態 {x,y,z,vx,vy,vz}（ローカル座標）。groundFn(x,z): 地面の高さ。
  r.update = (dt, b, groundFn) => {
    dt = Math.min(dt, 0.1);
    r.time += dt; r.idle += dt;
    if (!r.ready) {
      r.focus.x = b.x; r.focus.y = b.y; r.focus.z = b.z;
      r.yaw = C.shots[0].yaw; r.pitch = C.shots[0].pitch; r.dist = C.shots[0].dist;
      r.ready = true;
    }
    // 手動の上乗せを自動へ戻す
    if (!r.gesture && r.idle > C.returnDelay) {
      const k = damp(C.returnRate, dt);
      r.userYaw = wrap(r.userYaw); r.userYaw -= r.userYaw * k;
      r.userPitch -= r.userPitch * k; r.userZoom -= r.userZoom * k;
    }
    // ショットの切り替え（操作中は止める）
    if (!r.isUserActive()) r.shotT += dt;
    let shot = C.shots[r.shotI];
    if (r.shotT > shot.dur) { r.shotT = 0; r.shotI = (r.shotI + 1) % C.shots.length; shot = C.shots[r.shotI]; }

    const sp = Math.hypot(b.vx, b.vy, b.vz), spf = Math.min(1, sp / C.speedRef);
    const ease = damp(C.shotEase, dt);
    r.yaw += wrap(shot.yaw + C.swayYaw * Math.sin(r.time * C.swayRate) - r.yaw) * ease;
    r.yaw = wrap(r.yaw);
    r.pitch += (shot.pitch + C.swayPitch * Math.sin(r.time * C.swayRate * 0.6 + 1) - r.pitch) * ease;
    r.dist += (shot.dist + C.speedDist * spf - r.dist) * ease;
    r.fov += (C.fov + C.speedFov * spf - r.fov) * damp(2, dt);

    const f = r.focus;
    f.x += (b.x - f.x) * damp(C.follow, dt);
    f.y += (b.y - f.y) * damp(C.followY, dt);
    f.z = b.z; // 前後は直接追従（高速でも置いていかれず、原点移動でもずれない）

    const yaw = r.yaw + r.userYaw;
    const pitch = clamp(r.pitch + r.userPitch, C.pitchMin, C.pitchMax);
    const dist = r.dist * Math.exp(r.userZoom);
    const cp = Math.cos(pitch);
    const p = r.position;
    p.x = f.x + Math.sin(yaw) * cp * dist;
    p.y = f.y + Math.sin(pitch) * dist;
    p.z = f.z - Math.cos(yaw) * cp * dist;
    // 地面にめり込まない：持ち上げは即座に、戻りはゆっくり
    const need = Math.max(0, groundFn(p.x, p.z) + C.groundClear - p.y);
    r.lift = need > r.lift ? need : r.lift + (need - r.lift) * damp(3, dt);
    p.y += r.lift;

    const l = r.look;
    l.x = f.x; l.y = b.y + C.lookUp; l.z = f.z + C.lookAhead * Math.max(0, Math.cos(yaw));
  };
  return r;
}

// ドラッグ／ホイール／ピンチの入力を rig につなぐ。
export function attachCameraControls(el, rig) {
  const C = CAMERA;
  const ptrs = new Map(); // pointerId → {x, y, sx, sy}
  let pinchDist = 0;
  const two = () => { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  el.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (ptrs.size === 2) { rig.gesture = true; pinchDist = two(); }
    rig.interact();
  });
  addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2) {
      const d = two();
      if (pinchDist > 0 && d > 0) rig.zoomBy(pinchDist / d);
      pinchDist = d;
    } else if (rig.gesture) {
      rig.drag(dx, dy);
    } else if (Math.hypot(p.x - p.sx, p.y - p.sy) > C.dragThreshold) {
      rig.gesture = true; // しきい値を超えたらドラッグ開始（それまでは左右操作のタップ）
    }
  });
  const up = (e) => {
    if (!ptrs.delete(e.pointerId)) return;
    if (ptrs.size === 0) rig.gesture = false;
    else if (ptrs.size === 1) { // ピンチ終了後の指でいきなり回転しない
      rig.gesture = false; const q = [...ptrs.values()][0]; q.sx = q.x; q.sy = q.y;
    }
    rig.interact();
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    rig.zoomBy(Math.exp(e.deltaY * C.wheelZoom));
  }, { passive: false });
}
