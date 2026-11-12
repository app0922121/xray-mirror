// MediaPipe face + hands + pose for up to 3 people, converted to scene space
// and de-jittered. Each detection keeps a stable slot from frame to frame.
//
// The pose model only ever reports the most prominent person, so bodies are
// tracked one person at a time: each person gets their own crop of the frame
// and their own pose model. Crops are seeded from faces; a spare model also
// scans the rest of the frame for people whose face is not visible.
import * as THREE from 'three';
import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

export const MAX_PEOPLE = 3;
const CROP = 384;                   // side of the square each body is cropped into

// One-euro filter over a block of 3D points: smooth when still, snappy when moving.
export class PointFilter {
  constructor(n, minCut = 1.6, beta = 0.018, zScale = 0.35) {
    this.n = n; this.minCut = minCut; this.beta = beta; this.zScale = zScale;
    this.x = new Float32Array(n * 3); this.dx = new Float32Array(n * 3);
    this.out = Array.from({ length: n }, () => new THREE.Vector3());
    this.t = -1;
  }
  reset() { this.t = -1; }
  push(get, t) {
    const dt = this.t < 0 ? 0 : Math.max(1e-3, (t - this.t) / 1000);
    const first = this.t < 0 || dt > 0.4;
    this.t = t;
    const al = (cut) => { const r = 2 * Math.PI * cut * dt; return r / (r + 1); };
    const ad = first ? 1 : al(1.0);
    const p = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      get(i, p);
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k, v = p[k];
        if (first) { this.x[j] = v; this.dx[j] = 0; continue; }
        const d = (v - this.x[j]) / dt;
        this.dx[j] += (d - this.dx[j]) * ad;
        const zs = k === 2 ? this.zScale : 1;
        const a = al(this.minCut * zs + this.beta * zs * Math.abs(this.dx[j]));
        this.x[j] += (v - this.x[j]) * a;
      }
      this.out[i].set(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2]);
    }
    return this.out;
  }
}

// Keeps each detected thing on the same slot between frames (nearest-first matching).
class Slots {
  constructor(n, onReset) { this.n = n; this.pos = new Array(n).fill(null); this.onReset = onReset; }
  match(pts, W) {
    const n = this.n, res = new Array(pts.length).fill(-1), used = new Array(n).fill(false);
    const pairs = [];
    pts.forEach((p, i) => { for (let k = 0; k < n; k++) if (this.pos[k]) pairs.push([Math.hypot(p[0] - this.pos[k][0], p[1] - this.pos[k][1]), i, k]); });
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [d, i, k] of pairs) {
      if (d > W * 0.22) break;
      if (res[i] >= 0 || used[k]) continue;
      res[i] = k; used[k] = true;
    }
    pts.forEach((p, i) => {
      if (res[i] >= 0) return;
      let k = -1;
      for (let j = 0; j < n; j++) if (!used[j] && !this.pos[j]) { k = j; break; }
      if (k < 0) for (let j = 0; j < n; j++) if (!used[j]) { k = j; break; }
      if (k >= 0) { res[i] = k; used[k] = true; this.onReset(k); }
    });
    this.pos.fill(null);
    pts.forEach((p, i) => { if (res[i] >= 0) this.pos[res[i]] = p; });
    return res;
  }
}

export class Tracker {
  async init(report, people = MAX_PEOPLE) {
    this.people = people;
    report('加载视觉模型');
    const fileset = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
    const base = (name) => ({ modelAssetPath: `./models/${name}.task`, delegate: 'GPU' });
    this.face = await FaceLandmarker.createFromOptions(fileset, { baseOptions: base('face_landmarker'), runningMode: 'VIDEO', numFaces: people, outputFaceBlendshapes: true });
    report('加载手部模型');
    this.hand = await HandLandmarker.createFromOptions(fileset, { baseOptions: base('hand_landmarker'), runningMode: 'VIDEO', numHands: people * 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    report('加载姿态模型');
    this.fileset = fileset;
    this.poseOpts = { baseOptions: base('pose_landmarker_full'), runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
    this.poseInst = [await PoseLandmarker.createFromOptions(fileset, this.poseOpts)];
    const N = MAX_PEOPLE;
    this.bodies = Array.from({ length: N }, (_, k) => ({ k, active: false, roi: null, face: -1, miss: 0, cool: 0, out: null }));
    this.faceCool = new Array(N).fill(0);
    this.crop = document.createElement('canvas'); this.crop.width = this.crop.height = CROP;
    this.cctx = this.crop.getContext('2d');
    this.rr = 0;
    this.ensurePose(people);
    this.fFace = Array.from({ length: N }, () => new PointFilter(478, 2.2, 0.02, 0.4));
    this.fHand = Array.from({ length: N * 2 }, () => new PointFilter(21, 2.0, 0.03, 0.4));
    this.fPose = Array.from({ length: N }, () => new PointFilter(33, 1.3, 0.015, 0.25));
    this.fWorld = Array.from({ length: N }, () => new PointFilter(33, 1.0, 7.0, 0.6));
    this.jaw = new Array(N).fill(0);
    this.sFace = new Slots(N, (k) => { this.fFace[k].reset(); this.jaw[k] = 0; });
    this.sHand = new Slots(N * 2, (k) => this.fHand[k].reset());
    this.lastT = 0; this.tick = 0; this.busy = false;
    this.cost = { face: 6, hand: 8, pose: 10 }; this.heavy = false;
    this.frame = { W: 1, H: 1, faces: [], hands: [], poses: [] };
  }

  // change how many people to look for (1..3) while running
  async setPeople(n) {
    if (n === this.people) return;
    this.people = n; this.busy = true;
    try {
      await Promise.all([this.face.setOptions({ numFaces: n }), this.hand.setOptions({ numHands: n * 2 })]);
    } finally { this.busy = false; }
    for (const b of this.bodies) if (b.k >= n) { b.active = false; b.out = null; }
    this.ensurePose(n);
  }

  // extra pose models load in the background the first time more people are wanted
  ensurePose(n) {
    this.poseLoading = (this.poseLoading || Promise.resolve()).then(async () => {
      while (this.poseInst.length < n) this.poseInst.push(await PoseLandmarker.createFromOptions(this.fileset, this.poseOpts));
    }).catch((e) => console.warn('pose model', e));
  }

  // src: <video> or <img>; t: ms timestamp (must increase)
  detect(src, W, H, t) {
    const fr = this.frame;
    if (this.busy) return fr;
    if (t <= this.lastT) t = this.lastT + 1;
    this.lastT = t; this.tick++;
    fr.W = W; fr.H = H;
    const sx = (lm) => lm.x * W, sy = (lm) => (1 - lm.y) * H, sz = (lm) => -lm.z * W;
    const time = (key, fn) => { const t0 = performance.now(); fn(); this.cost[key] += (performance.now() - t0 - this.cost[key]) * 0.1; };
    // when three trackers no longer fit in a frame, hands and pose take turns
    const total = this.cost.face + this.cost.hand + this.cost.pose * Math.max(1, this.bodies.filter((b) => b.active).length);
    this.heavy = this.heavy ? total > 36 : total > 46;

    // lessons about the hand need nothing else: skip the face and body models
    if (this.handsOnly) { fr.faces = []; fr.poses = []; for (const b of this.bodies) { b.active = false; b.out = null; } }
    else time('face', () => {
      const rf = this.face.detectForVideo(src, t);
      const L = rf.faceLandmarks || [];
      const n = Math.min(L.length, this.people);
      const keys = []; for (let i = 0; i < n; i++) keys.push([sx(L[i][1]), sy(L[i][1])]);
      const slots = this.sFace.match(keys, W);
      fr.faces = [];
      for (let i = 0; i < n; i++) {
        const k = slots[i]; if (k < 0) continue;
        const Li = L[i];
        const pts = this.fFace[k].push((j, p) => { p[0] = sx(Li[j]); p[1] = sy(Li[j]); p[2] = sz(Li[j]); }, t);
        let jaw = 0;
        const bs = rf.faceBlendshapes && rf.faceBlendshapes[i];
        if (bs) { const c = bs.categories.find((c) => c.categoryName === 'jawOpen'); if (c) jaw = c.score; }
        this.jaw[k] += (jaw - this.jaw[k]) * 0.5;
        fr.faces.push({ pts, jaw: this.jaw[k], slot: k });
      }
    });

    if (this.handsOnly || !this.heavy || this.tick % 2 === 0) time('hand', () => {
      const rh = this.hand.detectForVideo(src, t);
      const L = rh.landmarks || [];
      const n = Math.min(L.length, this.people * 2);
      const keys = []; for (let i = 0; i < n; i++) keys.push([sx(L[i][0]), sy(L[i][0])]);
      const slots = this.sHand.match(keys, W);
      fr.hands = [];
      for (let i = 0; i < n; i++) {
        const k = slots[i]; if (k < 0) continue;
        const Li = L[i];
        // MediaPipe assumes a mirrored selfie image; our frames are raw, so swap.
        const raw = rh.handedness?.[i]?.[0]?.categoryName || 'Left';
        const pts = this.fHand[k].push((j, p) => { p[0] = sx(Li[j]); p[1] = sy(Li[j]); p[2] = sz(Li[j]); }, t);
        fr.hands.push({ pts, label: raw === 'Left' ? 'R' : 'L', slot: k });
      }
    });

    if (!this.handsOnly) this.poseStep(src, W, H, t, fr);
    return fr;
  }

  // ---------------------------------------------------------------- bodies
  poseStep(src, W, H, t, fr) {
    const B = this.bodies, n = Math.min(this.people, this.poseInst.length);
    const fc = (f) => { const a = f.pts[234], b = f.pts[454]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: Math.hypot(a.x - b.x, a.y - b.y) }; };
    const clampRoi = (r) => {
      r.x0 = Math.max(0, r.x0); r.x1 = Math.min(W, r.x1); r.y0 = Math.max(0, r.y0); r.y1 = Math.min(H, r.y1);
      if (r.x1 - r.x0 < 48) { const c = Math.min(W - 24, Math.max(24, (r.x0 + r.x1) / 2)); r.x0 = c - 24; r.x1 = c + 24; }
      if (r.y1 - r.y0 < 48) { const c = Math.min(H - 24, Math.max(24, (r.y0 + r.y1) / 2)); r.y0 = c - 24; r.y1 = c + 24; }
      return r;
    };
    const roiFromFace = (c) => clampRoi({ x0: c.x - 3.6 * c.w, x1: c.x + 3.6 * c.w, y0: c.y - 9 * c.w, y1: c.y + 1.8 * c.w });
    const roiFromPose = (P, vis) => {
      const sx = (P[11].x + P[12].x) / 2, sy = (P[11].y + P[12].y) / 2;
      const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y);
      const tl = Math.hypot(sx - (P[23].x + P[24].x) / 2, sy - (P[23].y + P[24].y) / 2);
      const s0 = Math.max(sw, tl * 0.62, 24);
      const r = { x0: sx - 2.3 * s0, x1: sx + 2.3 * s0, y0: sy - 2.6 * s0, y1: Math.max(P[0].y, sy) + 1.3 * s0 };
      for (const j of [13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32]) {
        if (vis[j] < 0.5) continue;
        r.x0 = Math.min(r.x0, P[j].x - 0.5 * s0); r.x1 = Math.max(r.x1, P[j].x + 0.5 * s0);
        r.y0 = Math.min(r.y0, P[j].y - 0.6 * s0); r.y1 = Math.max(r.y1, P[j].y + 0.5 * s0);
      }
      return clampRoi(r);
    };
    // head-and-torso columns of everyone except `self`, to black out of a crop so the
    // pose model cannot lock onto a neighbour; never crosses the midline toward `ownX`
    const others = (self, ownX) => {
      const cols = [];
      for (const f of fr.faces) if (!self || f.slot !== self.face) { const c = fc(f); cols.push({ x: c.x, w: c.w * 1.7, top: c.y + 1.5 * c.w }); }
      for (const o of B) if (o !== self && o.active && o.face < 0 && o.out) {
        const P = o.out.pts, sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y);
        cols.push({ x: (P[11].x + P[12].x) / 2, w: sw * 0.8, top: P[0].y + 0.6 * sw });
      }
      const rects = [];
      for (const o of cols) {
        let x0 = o.x - o.w, x1 = o.x + o.w;
        if (ownX != null) { const mid = (o.x + ownX) / 2; if (o.x > ownX) x0 = Math.max(x0, mid); else x1 = Math.min(x1, mid); }
        if (x1 > x0) rects.push({ x0, x1, y0: 0, y1: o.top });
      }
      return rects;
    };
    const start = (b, roi, face) => { b.active = true; b.roi = roi; b.face = face; b.miss = 0; b.out = null; this.fPose[b.k].reset(); this.fWorld[b.k].reset(); };
    const stop = (b) => { if (b.face >= 0) this.faceCool[b.face] = this.tick + 45; b.active = false; b.out = null; b.cool = this.tick + 20; };

    // 1. every visible face should own a body slot
    for (const b of B) if (b.active && (b.k >= n || (b.face >= 0 && !fr.faces.some((f) => f.slot === b.face)))) { if (b.k >= n) stop(b); else b.face = -1; }
    for (const f of fr.faces) {
      if (B.some((b) => b.active && b.face === f.slot)) continue;
      const c = fc(f);
      const own = B.find((b) => b.active && b.face < 0 && b.out && Math.hypot(b.out.pts[0].x - c.x, b.out.pts[0].y - c.y) < 0.8 * c.w);
      if (own) { own.face = f.slot; continue; }
      if (this.faceCool[f.slot] > this.tick) continue;
      const free = B.find((b) => !b.active && b.k < n);
      if (free) start(free, roiFromFace(c), f.slot);
    }

    // 2. run each person's own pose model on their crop (taking turns when the frame budget is tight)
    const act = B.filter((b) => b.active);
    let run = act;
    if (this.heavy && act.length > 1) { this.rr = (this.rr + 1) % act.length; run = [act[this.rr]]; }
    for (const b of run) {
      const t0 = performance.now();
      const face = b.face >= 0 ? fr.faces.find((f) => f.slot === b.face) : null;
      const c = face ? fc(face) : null;
      if (c && b.miss > 0) b.roi = roiFromFace(c);
      const ownX = c ? c.x : b.out ? (b.out.pts[11].x + b.out.pts[12].x) / 2 : (b.roi.x0 + b.roi.x1) / 2;
      const m = this.runCrop(this.poseInst[b.k], src, H, b.roi, t, others(b, ownX));
      let ok = !!m && m.L[11].visibility > 0.5 && m.L[12].visibility > 0.5;
      // the crop may contain a neighbour: the nose must belong to this person's face
      if (ok && c && Math.hypot(m.X(m.L[0]) - c.x, m.Y(m.L[0]) - c.y) > 0.9 * c.w) ok = false;
      if (ok) {
        const L = m.L;
        const pts = this.fPose[b.k].push((j, p) => { p[0] = m.X(L[j]); p[1] = m.Y(L[j]); p[2] = m.Z(L[j]); }, t);
        // metric 3D joints (metres); far more trustworthy for depth than the image-space z
        const world = m.Wl ? this.fWorld[b.k].push((j, p) => { p[0] = m.Wl[j].x; p[1] = -m.Wl[j].y; p[2] = -m.Wl[j].z; }, t) : null;
        const vis = L.map((l) => l.visibility ?? 1);
        b.out = { pts, world, vis, slot: b.k }; b.miss = 0;
        const target = roiFromPose(pts, vis);
        for (const key of ['x0', 'x1', 'y0', 'y1']) b.roi[key] += (target[key] - b.roi[key]) * 0.25;
      } else {
        b.miss++;
        if (b.miss >= 3) b.out = null;
        if (b.miss >= 12) stop(b);
      }
      this.cost.pose += (performance.now() - t0 - this.cost.pose) * 0.1;
    }

    // 3. two slots must never follow the same person
    for (const a of B) for (const b of B) {
      if (a.k >= b.k || !a.active || !b.active || !a.out || !b.out) continue;
      const P = a.out.pts, Q = b.out.pts;
      const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y);
      if (Math.hypot((P[11].x + P[12].x - Q[11].x - Q[12].x) / 2, (P[11].y + P[12].y - Q[11].y - Q[12].y) / 2) < 0.5 * sw) stop(a.face < 0 ? a : b);
    }

    // 4. now and then a spare model scans the rest of the frame for someone whose face is hidden
    if (this.tick % (act.length ? 10 : 3) === 0) {
      const free = B.find((b) => !b.active && b.k < n && b.cool < this.tick);
      if (free) {
        const m = this.runCrop(this.poseInst[free.k], src, H, { x0: 0, x1: W, y0: 0, y1: H }, t, others(null, null));
        if (m && m.L[11].visibility > 0.65 && m.L[12].visibility > 0.65 && m.L[0].visibility > 0.5) {
          const P = m.L.map((l) => ({ x: m.X(l), y: m.Y(l) }));
          start(free, roiFromPose(P, m.L.map((l) => l.visibility ?? 1)), -1);
        }
      }
    }
    fr.poses = B.filter((b) => b.active && b.out).map((b) => b.out);
  }

  // Draw a region of the frame (scene coords, y up) into the square crop canvas and run a pose model on it.
  // `mask`: rectangles (scene coords) blacked out so the model looks at the right person.
  runCrop(inst, src, H, r, t, mask) {
    const S = CROP, cx = this.cctx;
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0, sc = S / Math.max(rw, rh);
    const dw = rw * sc, dh = rh * sc, dx = (S - dw) / 2, dy = (S - dh) / 2;
    cx.fillStyle = '#000'; cx.fillRect(0, 0, S, S);
    cx.drawImage(src, r.x0, H - r.y1, rw, rh, dx, dy, dw, dh);
    if (mask) for (const q of mask) cx.fillRect(dx + (q.x0 - r.x0) * sc, dy + (r.y1 - q.y1) * sc, (q.x1 - q.x0) * sc, (q.y1 - q.y0) * sc);
    const res = inst.detectForVideo(this.crop, t);
    const L = res.landmarks && res.landmarks[0];
    if (!L) return null;
    const k = 1 / sc;
    return {
      L, Wl: res.worldLandmarks && res.worldLandmarks[0],
      X: (lm) => r.x0 + (lm.x * S - dx) * k, Y: (lm) => r.y1 - (lm.y * S - dy) * k, Z: (lm) => -lm.z * S * k,
    };
  }
}
