// 分裂：本体が「ぽんっ」と増え、小さい子が付いて転がる。遅れて離れすぎたらフェード、寿命が来て近ければ合流。Three.js 非依存。
import { SPLIT as P, SIM } from './config.js';
import { normalAt, localHeight } from './physics.js';
import { collideBody } from './obstacles.js';

export const kidRadius = () => SIM.RADIUS * P.SCALE;
// 本体を含めた「生きている」数（フェード中は数えない＝静かに数が戻る）
export function aliveCount(sim) { let n = 1; for (const k of sim.kids) if (k.state !== 'fade') n++; return n; }

export function initSplit(sim, rng) {
  sim.kids = []; sim.splitRng = rng; sim.splitT = P.FIRST_MIN + rng() * (P.FIRST_MAX - P.FIRST_MIN);
  sim.splits = 0; sim.merges = 0; sim.fades = 0; sim.peakTotal = 1; sim.kidSeq = 0;
}

function spawnKid(sim) {
  const rng = sim.splitRng, side = rng() < 0.5 ? -1 : 1, r = kidRadius();
  const kid = {
    id: sim.kidSeq++, state: 'roll', t: 0, age: 0, life: P.LIFE_MIN + rng() * (P.LIFE_MAX - P.LIFE_MIN),
    x: sim.x + side * 0.4, y: sim.y + 0.3, z: sim.z + 0.2,
    vx: sim.vx + side * P.POP_SIDE * (0.6 + rng() * 0.8), vy: sim.vy + P.POP_UP * (0.8 + rng() * 0.5), vz: sim.vz + (rng() - 0.3) * 1.5,
    grounded: false, fx: (rng() * 2 - 1) * P.FOLLOW_SIDE, fz: P.FOLLOW_BACK_MIN + rng() * (P.FOLLOW_BACK_MAX - P.FOLLOW_BACK_MIN), r,
  };
  sim.kids.push(kid);
}

// 分裂の判定（固定ステップごとに呼ぶ）
export function maybeSplit(sim, dt) {
  sim.splitT -= dt;
  if (sim.splitT > 0) return;
  const rng = sim.splitRng;
  sim.splitT = P.INTERVAL_MIN + rng() * (P.INTERVAL_MAX - P.INTERVAL_MIN);
  const want = rng() < P.TRIPLE_CHANCE ? 2 : 1;
  const room = P.MAX_TOTAL - aliveCount(sim), n = Math.min(want, room, P.MAX_KIDS - sim.kids.length);
  if (n <= 0) return;
  for (let i = 0; i < n; i++) spawnKid(sim);
  sim.splits++;
  sim.peakTotal = Math.max(sim.peakTotal, aliveCount(sim));
}

function stepKid(sim, k, dt) {
  const g = SIM.GRAVITY;
  k.t += dt; k.age += dt;
  if (k.state === 'merge') {            // 本体へ吸い込まれる
    const f = 1 - Math.exp(-14 * dt);
    k.x += (sim.x - k.x) * f; k.y += (sim.y - k.y) * f; k.z += (sim.z - k.z) * f;
    k.vx = sim.vx; k.vy = sim.vy; k.vz = sim.vz;
    return;
  }
  if (k.grounded) {
    const n = normalAt(sim, k.x, k.z);
    const gnDot = -g * n.y;
    k.vx += (0 - gnDot * n.x) * SIM.ROLL_FACTOR * dt;
    k.vy += (-g - gnDot * n.y) * SIM.ROLL_FACTOR * dt;
    k.vz += (0 - gnDot * n.z) * SIM.ROLL_FACTOR * dt;
    if (k.state === 'roll') {           // 本体の少し後ろ・横へ向かう引力（フェード中は引かない）
      let ax = (sim.x + k.fx - k.x) * P.PULL, az = (sim.z - k.fz - k.z) * P.PULL;
      const m = Math.hypot(ax, az);
      if (m > P.PULL_MAX) { ax *= P.PULL_MAX / m; az *= P.PULL_MAX / m; }
      k.vx += ax * dt; k.vz += az * dt;
    }
    const d = Math.max(0, 1 - (P.DRAG + SIM.ROLL_RESIST) * dt);
    k.vx *= d; k.vy *= d; k.vz *= d;
    const vn = k.vx * n.x + k.vy * n.y + k.vz * n.z;
    k.vx -= vn * n.x; k.vy -= vn * n.y; k.vz -= vn * n.z;
  } else {
    k.vy -= g * dt;
  }
  const sp = Math.sqrt(k.vx * k.vx + k.vy * k.vy + k.vz * k.vz);
  if (sp > P.MAX_SPEED) { const f = P.MAX_SPEED / sp; k.vx *= f; k.vy *= f; k.vz *= f; }
  k.x += k.vx * dt; k.y += k.vy * dt; k.z += k.vz * dt;
  if (collideBody(sim, k, k.r) > 0.8) k.grounded = false;
  const gy = localHeight(sim, k.x, k.z) + k.r;
  if (k.grounded) {
    if (k.y > gy + 0.05 && k.vy > 0) k.grounded = false; // 坂の変わり目で浮いた
    else k.y = gy;
  }
  if (!k.grounded && k.y <= gy) {       // 着地
    k.y = gy; k.grounded = true;
    const n = normalAt(sim, k.x, k.z), vn = k.vx * n.x + k.vy * n.y + k.vz * n.z;
    if (vn < 0) { k.vx -= vn * n.x; k.vy -= vn * n.y; k.vz -= vn * n.z; }
  }
}

// 子たちを1ステップ進め、フェード・合流・除去を処理する
export function stepKids(sim, dt) {
  maybeSplit(sim, dt);
  const kids = sim.kids;
  for (let i = kids.length - 1; i >= 0; i--) {
    const k = kids[i];
    stepKid(sim, k, dt);
    if (k.state === 'roll') {
      const dist = Math.hypot(k.x - sim.x, k.y - sim.y, k.z - sim.z);
      if (dist > P.LOST_DIST) { k.state = 'fade'; k.t = 0; sim.fades++; }          // 置いていかれた → 静かにフェード
      else if (k.age > k.life && dist < P.MERGE_DIST) { k.state = 'merge'; k.t = 0; } // 寿命＋近い → 合流
      else if (k.age > k.life + 12) { k.state = 'fade'; k.t = 0; sim.fades++; }       // いつまでも近づけない子も消える
    }
    if (k.state === 'merge' && k.t >= P.MERGE_TIME) { sim.merges++; kids.splice(i, 1); }
    else if (k.state === 'fade' && k.t >= P.FADE_TIME) kids.splice(i, 1);
  }
}
