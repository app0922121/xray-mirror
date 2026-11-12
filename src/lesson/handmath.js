// Reading a tracked hand (joint angles, straight / curled fingers) and
// building a synthetic one (for the no-camera demo and the wrist close-up).
import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = v3(), _b = v3();
const ang = (a, b) => (a.angleTo(b) * 180) / Math.PI;

// P: 21 hand landmarks. Fills `out.ang[finger * 3 + joint]` (flexion in degrees; for the thumb
// joint 0 is the carpometacarpal joint, measured against the index metacarpal), plus
// `ext[f]` (tip distance / knuckle distance from the wrist), `thumb`, `pinch` and `palm`.
export function analyse(P, out) {
  const A = out.ang;
  const palm = out.palm = P[9].distanceTo(P[0]) || 1;
  A[0] = ang(_a.subVectors(P[2], P[1]), _b.subVectors(P[5], P[0]));
  A[1] = ang(_a.subVectors(P[2], P[1]), _b.subVectors(P[3], P[2]));
  A[2] = ang(_a.subVectors(P[3], P[2]), _b.subVectors(P[4], P[3]));
  for (let f = 1; f < 5; f++) {
    const a = 1 + f * 4;
    A[f * 3] = ang(_a.subVectors(P[a], P[0]), _b.subVectors(P[a + 1], P[a]));
    A[f * 3 + 1] = ang(_a.subVectors(P[a + 1], P[a]), _b.subVectors(P[a + 2], P[a + 1]));
    A[f * 3 + 2] = ang(_a.subVectors(P[a + 2], P[a + 1]), _b.subVectors(P[a + 3], P[a + 2]));
    out.ext[f] = P[a + 3].distanceTo(P[0]) / (P[a].distanceTo(P[0]) || 1);
  }
  out.thumb = P[4].distanceTo(P[9]) / palm;         // far from the middle knuckle = sticking out
  out.pinch = P[4].distanceTo(P[8]) / palm;
  return out;
}
export const newReading = () => ({ ang: new Float32Array(15), ext: [0, 0, 0, 0, 0], thumb: 0, pinch: 9, palm: 1 });

// 1 = straight, 0 = curled, 0.5 = in between
export function fingerState(r, f) {
  if (f === 0) return r.thumb > 0.72 ? 1 : r.thumb < 0.58 ? 0 : 0.5;
  // by how far the three joints are bent in total (a relaxed straight finger still bends 50-70 degrees)
  const A = r.ang, pip = A[f * 3 + 1], total = A[f * 3] + pip + A[f * 3 + 2];
  if (total < 105 && pip < 45 && r.ext[f] > 1.3) return 1;
  if (total > 150 || pip > 65 || r.ext[f] < 1.1) return 0;
  return 0.5;
}
export function matches(r, pose) {
  for (let f = 0; f < 5; f++) if (pose.need[f] != null && fingerState(r, f) !== pose.need[f]) return false;
  if (pose.pinch && r.pinch > 0.34) return false;
  return true;
}
export const isOpen = (r) => [1, 2, 3, 4].every((f) => fingerState(r, f) === 1);

// ---------------------------------------------------------------- synthetic hand
// hand space (cm): u toward the thumb, v toward the fingertips, n out of the palm
const MCP = [[2.6, 9.2], [0.5, 9.5], [-1.5, 9.0], [-3.3, 8.0]];
const FLEN = [[4.0, 2.4, 2.2], [4.5, 2.8, 2.3], [4.2, 2.6, 2.3], [3.3, 1.9, 2.0]];
const FAN = [0.1, 0.0, -0.1, -0.24];
const T0 = [2.4, 1.9], TLEN = [3.6, 3.0, 2.5];
const TE1 = v3(0.8, 0.6, 0).normalize(), TE2 = v3(-0.72, 0.42, 0.55);
TE2.addScaledVector(TE1, -TE2.dot(TE1)).normalize();

// out: 21 Vector3; q: 15 joint angles in radians (finger * 3 + joint)
export function synthHand(out, wrist, u, v, n, p, q) {
  const at = (a, b, c, o) => o.copy(wrist).addScaledVector(u, a * p).addScaledVector(v, b * p).addScaledVector(n, c * p);
  out[0].copy(wrist);
  let x = T0[0], y = T0[1], z = 0, th = 0;
  at(x, y, z, out[1]);
  for (let k = 0; k < 3; k++) {                      // thumb swings across the palm
    th += q[k];
    const c = Math.cos(th), s = Math.sin(th), l = TLEN[k];
    x += (TE1.x * c + TE2.x * s) * l; y += (TE1.y * c + TE2.y * s) * l; z += (TE1.z * c + TE2.z * s) * l;
    at(x, y, z, out[2 + k]);
  }
  for (let f = 0; f < 4; f++) {
    const a0 = 5 + f * 4;
    at(MCP[f][0], MCP[f][1], 0, out[a0]);
    let a = 0; x = MCP[f][0]; y = MCP[f][1]; z = 0;
    for (let k = 0; k < 3; k++) {
      a += q[(f + 1) * 3 + k];
      const l = FLEN[f][k];
      x += Math.sin(FAN[f]) * Math.cos(a) * l; y += Math.cos(FAN[f]) * Math.cos(a) * l; z += Math.sin(a) * l;
      at(x, y, z, out[a0 + 1 + k]);
    }
  }
}

const CURL = [1.25, 1.5, 1.0], TCURL = [0.55, 0.75, 0.9];
// joint angles for "finger f curled by c (0..1)"
export function setCurl(q, f, c) {
  const K = f === 0 ? TCURL : CURL;
  for (let k = 0; k < 3; k++) q[f * 3 + k] = K[k] * c;
}

// The no-camera demo: a hand that performs whatever the lesson is asking for.
export class DemoHand {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.pts = Array.from({ length: 21 }, () => v3());
    this.q = new Float32Array(15); this.goal = new Float32Array(15);
    this.t = 0;
  }
  // want: { kind: 'open' | 'wiggle' | 'pose', pose, t } — t = seconds since this request began
  frame(time, dt, want) {
    const g = this.goal; g.fill(0);
    if (want.kind === 'wiggle') {
      // one finger after another, then the thumb, then a fist
      const T = want.t % 11.5, seg = Math.floor(T / 1.5), ph = (T % 1.5) / 1.5;
      const c = Math.sin(Math.PI * Math.min(1, ph * 1.15)) ** 2;
      if (seg < 4) setCurl(g, seg + 1, c);
      else if (seg === 4) setCurl(g, 0, c);
      else if (seg < 7) for (let f = 0; f < 5; f++) setCurl(g, f, Math.sin((Math.PI * (T - 7.5)) / 3) ** 2 * 0.95);
    } else if (want.kind === 'pose' && want.t > 1.1) {
      const P = want.pose;
      for (let f = 0; f < 5; f++) setCurl(g, f, P.need[f] === 0 ? 1 : 0);
      if (P.id === 'victory' || P.id === 'fist') setCurl(g, 0, 1);
      if (P.pinch) { g[0] = 0.5; g[1] = 0.55; g[2] = 0.5; g[3] = 0.75; g[4] = 0.95; g[5] = 0.6; }
    }
    const k = Math.min(1, dt * 7);
    for (let i = 0; i < 15; i++) this.q[i] += (g[i] - this.q[i]) * k;
    const p = this.H / 46;                                   // pixels per cm
    const sway = want.kind === 'open' ? 0.4 : 1;
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1 * Math.sin(time * 0.7) * sway, 0.22 * Math.sin(time * 0.5) * sway, 0.1 * Math.sin(time * 0.9) * sway));
    const wrist = v3(this.W * 0.5 + 16 * Math.sin(time * 0.6) * sway, this.H * 0.3 + 10 * Math.sin(time * 0.8) * sway, 0);
    synthHand(this.pts, wrist, v3(1, 0, 0).applyQuaternion(rot), v3(0, 1, 0).applyQuaternion(rot), v3(0, 0, 1).applyQuaternion(rot), p, this.q);
    return { pts: this.pts, label: 'R', slot: 0 };
  }
}
