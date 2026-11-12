// Cats and dogs: an object detector finds them, then an animal pose model
// (RTMPose trained on AP-10K, run with ONNX Runtime) locates 17 keypoints:
// 0 L eye, 1 R eye, 2 nose, 3 neck, 4 tail root, 5-7 L shoulder/elbow/front paw,
// 8-10 R shoulder/elbow/front paw, 11-13 L hip/knee/back paw, 14-16 R hip/knee/back paw.
import { ObjectDetector } from '../vendor/mediapipe/vision_bundle.mjs';
import { PointFilter } from './tracker.js';

const IN = 256, KP = 17;
export const MAX_ANIMALS = 2;
const MEAN = [123.675, 116.28, 103.53], STD = [58.395, 57.12, 57.375];

const iou = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / (a.w * a.h + b.w * b.h - i + 1e-6);
};

export class AnimalTracker {
  async init(fileset) {
    const ort = this.ort = await import('../vendor/ort/ort.webgpu.min.mjs');
    ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    for (const ep of ['webgpu', 'wasm']) {
      try {
        this.session = await ort.InferenceSession.create('./models/animal_pose_ap10k.onnx', { executionProviders: [ep], graphOptimizationLevel: 'all' });
        this.ep = ep; break;
      } catch (e) { console.warn('animal pose backend', ep, 'unavailable:', e.message); }
    }
    if (!this.session) throw new Error('animal pose model failed to load');
    this.det = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: './models/efficientdet_lite0.tflite', delegate: 'GPU' },
      runningMode: 'VIDEO', scoreThreshold: 0.3, maxResults: 6, categoryAllowlist: ['cat', 'dog'],
    });
    this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = IN;
    this.cx = this.cv.getContext('2d', { willReadFrequently: true });
    this.buf = new Float32Array(3 * IN * IN);
    this.tracks = []; this.tick = 0; this.busy = false; this.nextId = 1; this.lastT = 0;
    this.animals = []; this.ms = 0;
  }

  // call once per camera frame; pose inference runs asynchronously and lands a frame or two later
  update(src, W, H, t) {
    this.tick++;
    if (t <= this.lastT) t = this.lastT + 1;
    this.lastT = t;
    if (this.tick % (this.tracks.length ? 5 : 3) === 1) this.detect(src, t);
    this.tracks = this.tracks.filter((tr) => this.tick - tr.seen < 50);
    if (!this.busy && this.tracks.length) {
      const tr = this.tracks.reduce((a, b) => (a.poseTick <= b.poseTick ? a : b));
      this.pose(tr, src, H);
    }
    this.animals = this.tracks.filter((tr) => tr.pts && tr.conf > 0.3).map((tr) => ({ id: tr.id, kind: tr.kind, pts: tr.pts, score: tr.score, slot: tr.slot }));
    return this.animals;
  }

  detect(src, t) {
    const res = this.det.detectForVideo(src, t);
    let dets = (res.detections || []).map((d) => ({
      x: d.boundingBox.originX, y: d.boundingBox.originY, w: d.boundingBox.width, h: d.boundingBox.height,
      kind: d.categories[0].categoryName, s: d.categories[0].score,
    })).sort((a, b) => b.s - a.s);
    // the same animal is often reported as both "cat" and "dog": keep the stronger box
    const keep = [];
    for (const d of dets) if (!keep.some((k) => iou(k, d) > 0.45)) keep.push(d);
    for (const d of keep) {
      let tr = null, best = 0.15;
      for (const c of this.tracks) { const v = iou(c.box, d); if (v > best && c.hit !== this.tick) { best = v; tr = c; } }
      if (!tr) {
        if (this.tracks.length >= MAX_ANIMALS) continue;
        const used = this.tracks.map((c) => c.slot);
        tr = { id: this.nextId++, slot: [0, 1].find((s) => !used.includes(s)), box: { ...d }, votes: { cat: 0, dog: 0 }, kind: d.kind, poseTick: -1, filter: new PointFilter(KP, 1.4, 0.02, 1), pts: null, score: new Float32Array(KP), conf: 0 };
        this.tracks.push(tr);
      } else {
        // the detector box is the anchor; keypoints refine it between detections
        for (const k of ['x', 'y', 'w', 'h']) tr.box[k] += (d[k] - tr.box[k]) * 0.6;
      }
      tr.hit = tr.seen = this.tick;
      tr.votes[d.kind] = tr.votes[d.kind] * 0.85 + d.s;
      const other = d.kind === 'cat' ? 'dog' : 'cat';
      tr.votes[other] *= 0.85;
      tr.kind = tr.votes.cat >= tr.votes.dog ? 'cat' : 'dog';
    }
  }

  async pose(tr, src, H) {
    this.busy = true; tr.poseTick = this.tick;
    const t0 = performance.now();
    try {
      const b = tr.box, size = Math.max(b.w, b.h) * 1.25, x0 = b.x + b.w / 2 - size / 2, y0 = b.y + b.h / 2 - size / 2;
      const cx = this.cx;
      cx.fillStyle = '#000'; cx.fillRect(0, 0, IN, IN);
      cx.drawImage(src, x0, y0, size, size, 0, 0, IN, IN);
      const d = cx.getImageData(0, 0, IN, IN).data, buf = this.buf, n = IN * IN;
      for (let i = 0; i < n; i++) {
        buf[i] = (d[i * 4] - MEAN[0]) / STD[0];
        buf[n + i] = (d[i * 4 + 1] - MEAN[1]) / STD[1];
        buf[2 * n + i] = (d[i * 4 + 2] - MEAN[2]) / STD[2];
      }
      const out = await this.session.run({ input: new this.ort.Tensor('float32', buf, [1, 3, IN, IN]) });
      const sx = out.simcc_x, sy = out.simcc_y, nx = sx.dims[2], ny = sy.dims[2];
      const raw = [];
      let conf = 0;
      for (let k = 0; k < KP; k++) {
        let ix = 0, mx = -1e9, iy = 0, my = -1e9;
        for (let i = 0; i < nx; i++) { const v = sx.data[k * nx + i]; if (v > mx) { mx = v; ix = i; } }
        for (let i = 0; i < ny; i++) { const v = sy.data[k * ny + i]; if (v > my) { my = v; iy = i; } }
        const s = Math.min(mx, my);
        raw.push([x0 + (ix / nx) * size, H - (y0 + (iy / ny) * size), 0]);
        tr.score[k] += (s - tr.score[k]) * (tr.pts ? 0.5 : 1);
        conf += s / KP;
      }
      tr.conf = conf;
      tr.pts = tr.filter.push((i, p) => { p[0] = raw[i][0]; p[1] = raw[i][1]; p[2] = 0; }, performance.now());
      // follow the animal between detector runs: box around the confident keypoints
      let ax = 1e9, ay = 1e9, bx = -1e9, by = -1e9, m = 0;
      for (let k = 0; k < KP; k++) if (tr.score[k] > 0.35) { const X = raw[k][0], Y = H - raw[k][1]; ax = Math.min(ax, X); bx = Math.max(bx, X); ay = Math.min(ay, Y); by = Math.max(by, Y); m++; }
      if (m >= 6) {
        const px = (bx - ax) * 0.12 + 8, py = (by - ay) * 0.12 + 8;
        const nb = { x: ax - px, y: ay - py, w: bx - ax + 2 * px, h: by - ay + 2 * py };
        for (const k of ['x', 'y', 'w', 'h']) b[k] += (nb[k] - b[k]) * 0.35;
        if (conf > 0.45) tr.seen = Math.max(tr.seen, this.tick - 25);
      }
    } catch (e) { console.warn('animal pose', e); }
    this.ms += (performance.now() - t0 - this.ms) * 0.2;
    this.busy = false;
  }
}
