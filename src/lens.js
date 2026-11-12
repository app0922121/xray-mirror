// Lens view: a round window that shows the styled skeleton, the rest stays plain camera.
// It follows, in order: the mouse (if it just moved), an open palm, the face, its last place.
const HOLD = 0.45;                 // seconds a lost hand / face keeps the lens before it moves on

export class Lens {
  constructor(stage) {
    this.stage = stage;
    this.x = 0; this.y = 0; this.r = 0; this.a = 0;
    this.tx = 0; this.ty = 0; this.tr = 0;
    this.ready = false; this.src = '';
    this.mx = 0; this.my = 0; this.mouseT = -99;
    this.lastHand = -99; this.lastFace = -99;
    this._p = { x: 0, y: 0 }; this._q = { x: 0, y: 0 };
  }
  pointer(x, y, t) { this.mx = x; this.my = y; this.mouseT = t; }

  // CSS-pixel centre and size of a hand: palm centre, radius from the palm length
  handSpot(pts) {
    const st = this.stage, p = this._p, o = { x: 0, y: 0, r: 0 };
    for (const i of [0, 5, 9, 13, 17]) { st.project(pts[i], p); o.x += p.x / 5; o.y += p.y / 5; }
    st.project(pts[0], p); const w = { x: p.x, y: p.y };
    st.project(pts[9], p);
    o.r = Math.hypot(p.x - w.x, p.y - w.y) * 2.7;   // the fade eats the outer part, so a bit roomier
    return o;
  }
  faceSpot(pts) {
    const st = this.stage, a = st.project(pts[234], this._p), b = st.project(pts[454], this._q);
    const w = Math.hypot(a.x - b.x, a.y - b.y);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - w * 0.12, r: w * 1.25 };
  }

  update(frame, t, dt, active) {
    const st = this.stage;
    this.a += ((active ? 1 : 0) - this.a) * Math.min(1, dt * 5);
    if (!active && this.a < 0.003) { this.a = 0; st.lens.a = 0; this.ready = false; return; }
    const H = st.ch, rMin = H * 0.14, rMax = H * 0.48;
    let spot = null;
    if (t - this.mouseT < 1.6) { spot = { x: this.mx, y: this.my, r: this.tr || H * 0.24 }; this.src = 'mouse'; }
    if (!spot && frame && frame.hands.length) {
      // the hand nearest where the lens already is, so two hands don't make it jump about
      let best = null, bd = Infinity;
      for (const h of frame.hands) {
        const s = this.handSpot(h.pts), d = this.ready ? Math.hypot(s.x - this.tx, s.y - this.ty) : -s.r;
        if (d < bd) { bd = d; best = s; }
      }
      spot = best; this.lastHand = t; this.src = 'hand';
    }
    if (!spot && t - this.lastHand < HOLD) spot = { x: this.tx, y: this.ty, r: this.tr };
    if (!spot && frame && frame.faces.length) {
      let best = null, bd = Infinity;
      for (const f of frame.faces) {
        const s = this.faceSpot(f.pts), d = this.ready ? Math.hypot(s.x - this.tx, s.y - this.ty) : -s.r;
        if (d < bd) { bd = d; best = s; }
      }
      spot = best; this.lastFace = t; this.src = 'face';
    }
    if (!spot) spot = this.ready ? { x: this.tx, y: this.ty, r: this.tr } : { x: st.cw / 2, y: H * 0.45, r: H * 0.26 };
    this.tx = spot.x; this.ty = spot.y; this.tr = Math.min(rMax, Math.max(rMin, spot.r));
    if (!this.ready) { this.x = this.tx; this.y = this.ty; this.r = this.tr; this.ready = true; }
    const k = 1 - Math.exp(-dt * (this.src === 'mouse' ? 22 : 11)), kr = 1 - Math.exp(-dt * 5);
    this.x += (this.tx - this.x) * k; this.y += (this.ty - this.y) * k; this.r += (this.tr - this.r) * kr;
    // opens like an aperture
    const e = 1 - Math.pow(1 - this.a, 3);
    Object.assign(st.lens, { x: this.x, y: this.y, r: this.r * (0.35 + 0.65 * e), a: this.a });
  }

  // is a CSS point inside the lens? (always true while the lens view is off)
  contains(x, y, pad = 1) {
    const L = this.stage.lens;
    return L.a < 0.5 || Math.hypot(x - L.x, y - L.y) < L.r * pad;
  }
}
