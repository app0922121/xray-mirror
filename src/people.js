// Sorts the faces, bodies and hands found in a frame into people, and keeps
// each person on the same skeleton from one frame to the next.

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Crowd {
  constructor(n) {
    this.n = n;
    this.prev = Array.from({ length: n }, () => ({ face: -1, pose: -1, hands: [-1, -1] }));
    this.out = Array.from({ length: n }, () => ({ W: 1, H: 1, face: null, hands: [], pose: null }));
    this.count = 0;
  }

  assign(fr) {
    const n = this.n;
    let C = [];
    for (const p of fr.poses) if (p.vis[11] > 0.5 && p.vis[12] > 0.5) C.push({ pose: p, face: null, hands: [] });

    // ---- a face belongs to the body whose nose sits inside it
    const centre = fr.faces.map((f) => {
      const a = f.pts[234], b = f.pts[454];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: d2(a, b) };
    });
    let pairs = [];
    fr.faces.forEach((f, i) => C.forEach((c, j) => {
      const d = d2(c.pose.pts[0], centre[i]) / centre[i].w;
      if (d < 0.8) pairs.push([d, i, j]);
    }));
    pairs.sort((a, b) => a[0] - b[0]);
    const fUsed = new Set();
    for (const [, i, j] of pairs) { if (fUsed.has(i) || C[j].face) continue; C[j].face = fr.faces[i]; C[j].fc = centre[i]; fUsed.add(i); }
    fr.faces.forEach((f, i) => { if (!fUsed.has(i)) C.push({ pose: null, face: f, fc: centre[i], hands: [] }); });

    // ---- a hand belongs to the nearest wrist; failing that, to a nearby face
    pairs = [];
    fr.hands.forEach((h, i) => C.forEach((c, j) => {
      const w = h.pts[0];
      if (c.pose) {
        const P = c.pose.pts, d = Math.min(d2(w, P[15]), d2(w, P[16])) / d2(P[11], P[12]);
        if (d < 1.0) pairs.push([d, i, j]);
      } else {
        const d = d2(w, c.fc) / c.fc.w;
        if (d < 4) pairs.push([1.0 + d * 0.25, i, j]);
      }
    }));
    pairs.sort((a, b) => a[0] - b[0]);
    const hUsed = new Set();
    for (const [, i, j] of pairs) { if (hUsed.has(i) || C[j].hands.length >= 2) continue; C[j].hands.push(fr.hands[i]); hUsed.add(i); }
    // hands with nobody attached still get their own bones
    let lone = null;
    fr.hands.forEach((h, i) => {
      if (hUsed.has(i)) return;
      if (!lone || lone.hands.length >= 2) { lone = { pose: null, face: null, hands: [] }; C.push(lone); }
      lone.hands.push(h);
    });

    const rank = (c) => (c.pose ? 2 : 0) + (c.face ? 1 : 0);
    C.sort((a, b) => rank(b) - rank(a));
    C = C.slice(0, n);

    // ---- keep everyone on the skeleton they had last frame
    const body = new Array(C.length).fill(-1), taken = new Array(n).fill(false);
    const score = [];
    C.forEach((c, i) => this.prev.forEach((p, b) => {
      let s = 0;
      if (c.face && c.face.slot === p.face) s += 4;
      if (c.pose && c.pose.slot === p.pose) s += 4;
      for (const h of c.hands) if (p.hands.includes(h.slot)) s += 1;
      if (s > 0) score.push([s, i, b]);
    }));
    score.sort((a, b) => b[0] - a[0]);
    for (const [, i, b] of score) { if (body[i] >= 0 || taken[b]) continue; body[i] = b; taken[b] = true; }
    C.forEach((c, i) => { if (body[i] < 0) { const b = taken.indexOf(false); if (b >= 0) { body[i] = b; taken[b] = true; } } });

    for (const o of this.out) { o.W = fr.W; o.H = fr.H; o.face = null; o.pose = null; o.hands = []; }
    this.count = 0;
    C.forEach((c, i) => {
      const b = body[i]; if (b < 0) return;
      const o = this.out[b], p = this.prev[b];
      o.face = c.face; o.pose = c.pose;
      // each hand stays on the same set of hand bones
      const rigs = [-1, -1], pend = [];
      for (const h of c.hands) {
        const k = p.hands.indexOf(h.slot);
        if (k >= 0 && rigs[k] < 0) { rigs[k] = h.slot; o.hands.push({ pts: h.pts, label: h.label, rig: k }); } else pend.push(h);
      }
      for (const h of pend) { const k = rigs[0] < 0 ? 0 : 1; rigs[k] = h.slot; o.hands.push({ pts: h.pts, label: h.label, rig: k }); }
      p.face = c.face ? c.face.slot : -1; p.pose = c.pose ? c.pose.slot : -1; p.hands = rigs;
      this.count++;
    });
    return this.out;
  }
}
