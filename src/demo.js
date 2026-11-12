// Synthetic people for demo mode: produces the same landmark frame the tracker
// would (faces, hands, poses), so one to three skeletons can perform without a camera.
import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FACE_PTS = { 234: [-7.65, -1.5, 1.0], 454: [7.65, -1.5, 1.0], 10: [0, 8.5, 7.0], 152: [0, -12, 7.2], 33: [-4.6, -0.75, 7.6], 133: [-1.9, -0.75, 8.0], 362: [1.9, -0.75, 8.0], 263: [4.6, -0.75, 7.6], 13: [0, -7.6, 8.4], 1: [0, -4, 10] };
const MCP = [[2.6, 9.2], [0.5, 9.5], [-1.5, 9.0], [-3.3, 8.0]];
const FLEN = [[4.0, 2.4, 2.2], [4.5, 2.8, 2.3], [4.2, 2.6, 2.3], [3.3, 1.9, 2.0]];
const FAN = [0.1, 0.0, -0.1, -0.24];
const THUMB = [[2.4, 1.9], [4.2, 4.2], [5.5, 6.6], [6.5, 8.6]];
const SCALE = [6.2, 4.5, 3.8];          // pixels per cm for 1, 2, 3 people

class Figure {
  constructor() {
    this.face = Array.from({ length: 478 }, () => v3());
    this.hands = [Array.from({ length: 21 }, () => v3()), Array.from({ length: 21 }, () => v3())];
    this.pose = Array.from({ length: 33 }, () => v3());
    this.vis = new Array(33).fill(0.95);
  }
}

function hand(out, wrist, u, v, n, p, curl) {
  const at = (a, b, c, o) => o.copy(wrist).addScaledVector(u, a * p).addScaledVector(v, b * p).addScaledVector(n, c * p);
  out[0].copy(wrist);
  for (let i = 0; i < 4; i++) {                       // thumb folds across the palm as the hand closes
    const c = curl[0], t = THUMB[i];
    at(t[0] - c * (i * 0.9), t[1] - c * i * 0.35, c * i * 0.7, out[1 + i]);
  }
  for (let f = 0; f < 4; f++) {
    const a0 = 5 + f * 4;
    at(MCP[f][0], MCP[f][1], 0, out[a0]);
    let ang = 0, x = MCP[f][0], y = MCP[f][1], z = 0;
    const c = curl[f + 1];
    for (let k = 0; k < 3; k++) {
      ang += c * [1.25, 1.35, 0.9][k];
      const l = FLEN[f][k];
      x += Math.sin(FAN[f]) * Math.cos(ang) * l; y += Math.cos(FAN[f]) * Math.cos(ang) * l; z += Math.sin(ang) * l;
      at(x, y, z, out[a0 + 1 + k]);
    }
  }
}
const jawOpen = (t) => { const k = (t * 0.5) % 4; return k < 1 ? Math.sin(Math.PI * k) ** 2 * 0.8 : 0; };

export class Demo {
  constructor() {
    this.W = 1280; this.H = 720;
    this.cat = Array.from({ length: 17 }, () => v3());
    this.catScore = new Float32Array(17).fill(1);
    this.figs = [new Figure(), new Figure(), new Figure()];
  }

  // a cat strolling in place in the lower right corner (17 animal keypoints)
  animal(t) {
    const p = 4.4, P = this.cat, set = (i, x, y) => P[i].set(x, y, 0);
    const bob = 0.5 * p * Math.sin(t * 5.2), gy = 44;                       // ground line
    const SMx = 1065, SMy = gy + 17 * p + bob, HMx = SMx - 23 * p, HMy = gy + 16.5 * p - bob * 0.5;
    const look = 0.5 + 0.35 * Math.sin(t * 0.7);                           // head turns toward the viewer and back
    const ex = SMx + 9.5 * p, ey = SMy + 14.5 * p + bob * 0.6, half = 1.75 * p * Math.sin(look * 1.45);
    set(0, ex + half, ey + 0.2 * p); set(1, ex - half, ey - 0.2 * p);
    set(2, ex + 4.0 * p * Math.cos(look * 1.45), ey - 1.3 * p);
    set(3, SMx + 4.5 * p, SMy + 4.5 * p);
    set(4, HMx - 4.5 * p, HMy + 8.8 * p);
    const leg = (iS, x, y, ph, front) => {
      const sw = Math.sin(t * 5.2 + ph), lift = Math.max(0, Math.cos(t * 5.2 + ph));
      set(iS, x, y);
      if (front) { set(iS + 1, x - 1.2 * p + sw * 2.2 * p, y - 8.5 * p); set(iS + 2, x + 0.6 * p + sw * 5 * p, gy + 0.8 * p + lift * 2.6 * p); }
      else { set(iS + 1, x - 3.6 * p + sw * 2.4 * p, gy + 6.8 * p + lift * 1.2 * p); set(iS + 2, x - 1.4 * p + sw * 5 * p, gy + 0.8 * p + lift * 2.6 * p); }
    };
    leg(5, SMx + 0.4 * p, SMy, 0, true); leg(8, SMx - 0.4 * p, SMy, Math.PI, true);
    leg(11, HMx + 0.4 * p, HMy, Math.PI, false); leg(14, HMx - 0.4 * p, HMy, 0, false);
    return { id: 1, slot: 0, kind: 'cat', pts: P, score: this.catScore };
  }

  frame(time, n = 1) {
    const W = this.W, H = this.H, p = SCALE[n - 1], k = p / 6.2;
    const out = { W, H, faces: [], hands: [], poses: [] };
    for (let i = 0; i < n; i++) {
      const F = this.figs[i], t = time + i * 1.9;
      const cx = (W * (i + 0.5)) / n;
      const eyeY = H - 27.6 * p;
      const yaw = 0.32 * Math.sin(t * 0.5), roll = 0.1 * Math.sin(t * 0.8 + 1), pitch = 0.08 * Math.sin(t * 0.63);
      const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw * 1.5, roll, 'YXZ'));
      const headC = v3(cx + 26 * k * Math.sin(t * 0.5), eyeY, 0);
      const jaw = jawOpen(t);
      for (const key in FACE_PTS) {
        const a = FACE_PTS[key];
        F.face[key].set(a[0], a[1], a[2]).multiplyScalar(p);
        if (+key === 152) F.face[key].y -= jaw * 2.2 * p;
        F.face[key].applyQuaternion(hq).add(headC);
      }
      // torso + legs
      const mid = v3(cx, eyeY - 25 * p, 0);
      const ty = yaw * 0.6;
      const X = v3(Math.cos(ty), 0.03 * Math.sin(t * 0.9), -Math.sin(ty));
      const P = F.pose, down = (a, d, o, dx = 0) => o.copy(a).add(v3(dx, -d * p, 0));
      P[0].copy(F.face[1]);
      P[11].copy(mid).addScaledVector(X, 17.5 * p); P[12].copy(mid).addScaledVector(X, -17.5 * p);
      down(mid, 50, P[23]).addScaledVector(X, 9 * p); down(mid, 50, P[24]).addScaledVector(X, -9 * p);
      const sway = 2.5 * p * Math.sin(t * 0.9);
      down(P[23], 43, P[25], sway + 1.5 * p); down(P[24], 43, P[26], sway - 1.5 * p);
      down(P[25], 37, P[27], -sway * 0.6); down(P[26], 37, P[28], -sway * 0.6);
      for (let s = 0; s < 2; s++) {
        const sg = s === 0 ? 1 : -1, an = P[27 + s];
        P[29 + s].copy(an).add(v3(0, -4.5 * p, -5 * p));
        P[31 + s].copy(an).add(v3(sg * 2.5 * p, -6.5 * p, 14 * p));
      }
      for (const j of [25, 26, 27, 28, 29, 30, 31, 32]) F.vis[j] = P[j].y > 4 ? 0.95 : 0.1;
      // hands: the subject's left hand is on the image right (raw, unmirrored)
      for (let s = 0; s < 2; s++) {
        const sg = s === 0 ? 1 : -1;
        const ph = t * 1.3 + s * 2.1;
        const wrist = v3(cx + sg * (232 + 22 * Math.sin(ph * 0.7)) * k, mid.y + (-33 + 46 * Math.sin(ph * 0.9 + s)) * k, 60);
        const wave = sg * (-0.28 + 0.3 * Math.sin(ph * 1.4));
        const tilt = 0.35 * Math.sin(ph * 0.6);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * 0.6, sg * tilt, wave));
        const u = v3(-sg, 0, 0).applyQuaternion(q), v = v3(0, 1, 0).applyQuaternion(q);
        const nn = v3(0, 0, 1).applyQuaternion(q);       // palm side, toward the camera
        const curl = [0, 1, 2, 3, 4].map((f) => Math.max(0, Math.sin(t * 1.7 + s * 1.6 - f * 0.55)) ** 2 * (s === 0 ? 0.95 : 0.6));
        hand(F.hands[s], wrist, u, v, nn, p * 1.05, curl);
        out.hands.push({ pts: F.hands[s], label: s === 0 ? 'L' : 'R', slot: i * 2 + s });
        // elbow by two-bone IK in the image plane
        const sh = P[11 + s];
        const d = Math.min(sh.distanceTo(wrist), 54.5 * p), a = 30 * p, b = 25 * p;
        const ca = (a * a + d * d - b * b) / (2 * a * d);
        const along = v3().subVectors(wrist, sh).normalize();
        const perp = v3(along.y * sg, -along.x * sg, 0);
        P[13 + s].copy(sh).addScaledVector(along, a * ca).addScaledVector(perp, a * Math.sqrt(Math.max(0, 1 - ca * ca))).add(v3(0, 0, -30));
        P[15 + s].copy(wrist);
      }
      out.faces.push({ pts: F.face, jaw, slot: i });
      out.poses.push({ pts: P, world: null, vis: F.vis, slot: i });
    }
    return out;
  }
}
