// Builds every bone/organ mesh and drives them from tracked landmarks.
// Scene space = video pixels, y up, +z toward the viewer, orthographic.
import * as THREE from 'three';
import { makeMaterial, applyStyle } from './materials.js';
import { buildSkull, TMJ, SKULL_BASE } from './models/skull.js';
import { buildTorso, SHOULDER_X } from './models/torso.js';
import { buildLimbs, LIMB_LEN } from './models/limbs.js';
import { buildHand, HAND_LEN } from './models/hand.js';
import { buildOrgans, HEART_C } from './models/organs.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _x = v3(), _y = v3(), _z = v3(), _a = v3(), _b = v3(), _c = v3(), _d = v3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const FACE_W = 15.3;                  // model width between face landmarks 234 / 454
const EYE_REF = v3(0, -0.75, 8.2);     // model point matched to the midpoint of the eyes
const tick = () => new Promise((r) => setTimeout(r, 0));

// orient + stretch a mesh so its local Y axis runs from `from` to `to`
export function aim(mesh, from, to, hint, useZ, modelLen, thick, down) {
  _y.subVectors(to, from);
  const len = _y.length();
  if (len < 1e-4) return;
  _y.multiplyScalar(1 / len);
  if (down) _y.negate();
  if (useZ) { _x.crossVectors(_y, hint); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); _x.normalize(); }
  else { _x.copy(hint).addScaledVector(_y, -hint.dot(_y)); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); _x.normalize(); }
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m);
  mesh.position.copy(from);
  mesh.scale.set(thick, len / modelLen, thick);
}

const CARPAL_POS = {
  scaphoid: [1.5, 1.0, 0], lunate: [0.15, 0.72, 0], triquetrum: [-1.1, 1.08, 0], pisiform: [-1.62, 0.78, -0.8],
  trapezium: [2.05, 2.1, -0.1], trapezoid: [1.05, 2.5, 0.1], capitate: [0.0, 2.2, 0.1], hamate: [-1.15, 2.35, 0],
};
const META_BASE = [null, [1.2, 3.3], [0.1, 3.5], [-0.85, 3.4], [-1.7, 3.15]];
const FINGER_THICK = [1.18, 1.0, 1.05, 0.96, 0.84];

export class Body {
  constructor() {
    this.root = new THREE.Group();
    this.parts = [];
    this.layers = { bone: 1, organ: 1 };
    this.style = 0;
    this.groups = {};
    this.hinge = { L: v3(-1, 0, 0), R: v3(-1, 0, 0) };
    this.kneeHinge = { L: v3(1, 0, 0), R: v3(1, 0, 0) };
    this.pp = Array.from({ length: 33 }, () => v3());
    this.hp = Array.from({ length: 21 }, () => v3());
    this.stats = { tris: 0, meshes: 0 };
  }

  grp(name) {
    if (!this.groups[name]) this.groups[name] = { alpha: 0, target: 0 };
    return this.groups[name];
  }

  add(parent, key, geo, tissue, groupName, inflate = 0.12, dens = 1, front = 0.14) {
    const mat = makeMaterial(tissue);
    mat.uniforms.uDensity.value *= dens;
    mat.uniforms.uFront.value = front;
    const bs = geo.boundingSphere;
    mat.uniforms.uSphere.value.set(bs.center.x, bs.center.y, bs.center.z, bs.radius);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { key, baseKey: key, layer: mat.userData.tissue.layer, g: this.grp(groupName), inflate, body: this };
    mesh.frustumCulled = false;
    parent.add(mesh);
    this.parts.push(mesh);
    this.stats.tris += geo.index.count / 3; this.stats.meshes++;
    return mesh;
  }

  // `src`: an already-built Body to share geometry with (extra people cost no modelling time)
  async build(report, src) {
    const say = async (t) => { if (!src) { report(t); await tick(); } };
    const G = this.geos = src ? src.geos : {};
    // ---------- head ----------
    await say('颅骨');
    const sk = G.sk || (G.sk = buildSkull(() => {}));
    this.head = new THREE.Group(); this.root.add(this.head);
    this.cranium = this.add(this.head, 'cranium', sk.cranium, 'bone', 'head', 0.1, 0.4, 1.35);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, TMJ[1], TMJ[2]); this.head.add(this.jaw);
    this.mandible = this.add(this.jaw, 'mandible', sk.mandible, 'bone', 'head', 0.1, 0.5, 0.55);
    // X-ray only: invisible depth-only copies of the skull, so bones that sit behind it
    // (the neck) do not glow straight through the face
    const occ = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.occluders = [new THREE.Mesh(sk.cranium, occ), new THREE.Mesh(sk.mandible, occ)];
    this.head.add(this.occluders[0]); this.jaw.add(this.occluders[1]);
    for (const o of this.occluders) { o.renderOrder = -10; o.frustumCulled = false; o.visible = false; }
    this.brain = this.add(this.head, 'brain', sk.brain, 'brain', 'head', 0.05, 0.22, 0.0);
    for (const s of [1, -1]) {
      const e = this.add(this.head, s > 0 ? 'eye_L' : 'eye_R', sk.eye, 'eye', 'head', 0.02, 0.1, 0.0);
      e.position.set(3.25 * s, -0.75, 6.6);
    }
    // ---------- torso ----------
    this.torso = new THREE.Group(); this.root.add(this.torso);
    const torso = G.torso || (G.torso = buildTorso(() => {}));
    await say('脊柱与肋骨');
    for (const p of torso.parts) {
      const k = p.key;
      const dn = k === 'pelvis' ? 0.45 : /^[TL]\d/.test(k) ? 0.5 : k.startsWith('scapula') ? 0.45 : k === 'sternum' ? 0.45 : 0.85;
      const m = this.add(this.torso, k, p.geo, p.tissue, 'torso', 0.16, dn, k === 'pelvis' ? 0.5 : 0.14);
      if (p.xf) { m.position.fromArray(p.xf.p); m.rotation.set(p.xf.r[0], p.xf.r[1], p.xf.r[2]); m.scale.fromArray(p.xf.s); }
    }
    await say('心脏、肺与内脏');
    const org = G.org || (G.org = buildOrgans(() => {}));
    this.organ = {};
    for (const p of org.parts) this.organ[p.key] = this.add(this.torso, p.key, p.geo, p.tissue, 'torso', 0.1);
    // neck
    this.neck = [];
    for (let i = 0; i < 7; i++) this.neck.push(this.add(this.root, 'C' + (i + 1), torso.vC, 'bone', 'neck', 0.1, 0.36));
    // ---------- limbs ----------
    await say('四肢长骨');
    const limbs = G.limbs || (G.limbs = buildLimbs(() => {}));
    this.arm = {}; this.leg = {};
    for (const S of ['L', 'R']) {
      const g = limbs[S];
      this.arm[S] = {
        humerus: this.add(this.root, 'humerus_' + S, g.humerus, 'bone', 'armU_' + S, 0.2, 0.7),
        radius: this.add(this.root, 'radius_' + S, g.radius, 'bone', 'armF_' + S, 0.14, 0.8),
        ulna: this.add(this.root, 'ulna_' + S, g.ulna, 'bone', 'armF_' + S, 0.14, 0.8),
      };
      this.leg[S] = {
        femur: this.add(this.root, 'femur_' + S, g.femur, 'bone', 'legU_' + S, 0.25, 0.6),
        patella: this.add(this.root, 'patella_' + S, g.patella, 'bone', 'legU_' + S, 0.2, 0.6),
        tibia: this.add(this.root, 'tibia_' + S, g.tibia, 'bone', 'legD_' + S, 0.22, 0.65),
        fibula: this.add(this.root, 'fibula_' + S, g.fibula, 'bone', 'legD_' + S, 0.2, 0.8),
        foot: new THREE.Group(),
      };
      this.root.add(this.leg[S].foot);
      for (const k of ['tarsals', 'metatarsals', 'toes']) this.add(this.leg[S].foot, k + '_' + S, g[k], 'bone', 'foot_' + S, 0.15, 0.7);
    }
    // ---------- hands ----------
    await say('手骨 27 × 2');
    const hg = G.hg || (G.hg = buildHand(() => {}));
    this.hands = [];
    for (let h = 0; h < 2; h++) {
      const gname = 'hand' + h;
      const H = { g: this.grp(gname), side: h ? 'R' : 'L', bones: {}, carpals: {}, hs: 0, stub: {} };
      for (let i = 0; i < 5; i++) {
        H.bones['meta_' + i] = this.add(this.root, 'meta_' + i, hg.meta, 'bone', gname, 0.06);
        H.bones['prox_' + i] = this.add(this.root, 'prox_' + i, hg.prox, 'bone', gname, 0.06);
        if (i > 0) H.bones['mid_' + i] = this.add(this.root, 'mid_' + i, hg.mid, 'bone', gname, 0.06);
        H.bones['dist_' + i] = this.add(this.root, 'dist_' + i, hg.dist, 'bone', gname, 0.06);
      }
      for (const k in hg.carpals) H.carpals[k] = this.add(this.root, 'carpal_' + k, hg.carpals[k], 'bone', gname, 0.05);
      // forearm stubs used when the body is not tracked
      H.stub.radius = this.add(this.root, 'radius', limbs.L.radius, 'bone', gname + 'stub', 0.14, 0.8);
      H.stub.ulna = this.add(this.root, 'ulna', limbs.L.ulna, 'bone', gname + 'stub', 0.14, 0.8);
      this.hands.push(H);
    }
    this.setStyle(this.style);
  }

  setStyle(style) {
    this.style = style;
    for (const m of this.parts) applyStyle(m.material, style, m.userData.inflate);
    if (style === 0) for (const m of this.neck) m.material.depthTest = true;
  }

  // ------------------------------------------------------------------
  update(f, time, dt) {
    const G = this.groups;
    for (const k in G) G[k].target = 0;
    const W = f.W;
    let s = 0, torsoOK = false;
    const pp = this.pp;
    const tX = _a.set(1, 0, 0);
    let vis = null;

    // ---------------- torso ----------------
    if (f.pose) {
      const P = f.pose.pts; vis = f.pose.vis;
      const Wd = f.pose.world;
      if (Wd) {
        // depth from the metric skeleton, scaled to pixels by comparing torso edges
        let num = 0, den = 0;
        for (const [a, b] of [[11, 12], [23, 24], [11, 23], [12, 24]]) {
          num += Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y);
          den += Math.hypot(Wd[a].x - Wd[b].x, Wd[a].y - Wd[b].y);
        }
        const ppm = num / Math.max(den, 1e-4), zc = (Wd[11].z + Wd[12].z) / 2;
        for (let i = 0; i < 33; i++) pp[i].set(P[i].x, P[i].y, (Wd[i].z - zc) * ppm);
      } else {
        const zc = (P[11].z + P[12].z) / 2;
        for (let i = 0; i < 33; i++) pp[i].set(P[i].x, P[i].y, P[i].z - zc);
      }
      // sanity: a real torso is about 2.3 face-widths across; reject wild pose guesses
      let sane = vis[11] > 0.5 && vis[12] > 0.5;
      if (sane && f.face) {
        const fw = f.face.pts[454].distanceTo(f.face.pts[234]) / FACE_W;
        const r = pp[11].distanceTo(pp[12]) / (2 * SHOULDER_X) / fw;
        if (r < 0.5 || r > 1.8) sane = false;
      }
      if (sane) {
        torsoOK = true;
        const X = v3().subVectors(pp[11], pp[12]);
        const sw = X.length(); X.normalize();
        const mid = v3().addVectors(pp[11], pp[12]).multiplyScalar(0.5);
        const hipMid = v3().addVectors(pp[23], pp[24]).multiplyScalar(0.5);
        const Y = v3().subVectors(mid, hipMid);
        const tl = Y.length(); Y.normalize();
        const hw = sstep(0.25, 0.7, Math.min(vis[23], vis[24]));
        Y.lerp(_b.set(0, 1, 0), 0.65 * (1 - hw)).normalize();
        Y.addScaledVector(X, -Y.dot(X)).normalize();
        const Z = v3().crossVectors(X, Y);
        s = sw / (2 * SHOULDER_X);
        const sy = 1 + (clamp(tl / 50 / s, 0.85, 1.25) - 1) * hw;
        this.torso.position.copy(mid);
        this.torso.quaternion.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
        this.torso.scale.set(s, s * sy, s);
        this.tX = X; this.tY = Y; this.tZ = Z; this.tS = s; this.tSy = sy;
        G.torso.target = 1;
        tX.copy(X);
        // organs breathe and beat
        const bt = (time * 1.15) % 1;
        const b = (bt < 0.22 ? Math.pow(Math.sin(Math.PI * bt / 0.22), 2) : 0) + (bt > 0.3 && bt < 0.48 ? 0.6 * Math.pow(Math.sin(Math.PI * (bt - 0.3) / 0.18), 2) : 0);
        const k = 1 + 0.075 * b, hm = this.organ.heart;
        hm.scale.setScalar(k); hm.position.set(HEART_C[0] * (1 - k), HEART_C[1] * (1 - k), HEART_C[2] * (1 - k));
        const br = 0.5 + 0.5 * Math.sin(time * 1.5);
        for (const [key, cx] of [['lung_L', 7], ['lung_R', -7]]) {
          const kx = 1 + 0.05 * br, ky = 1 + 0.03 * br, lm = this.organ[key];
          lm.scale.set(kx, ky, kx); lm.position.set(cx * (1 - kx), -4 * (1 - ky), -1 * (1 - kx));
        }
      }
    }
    this.scale = s;
    this.size = s;            // apparent size (px per cm), used to order overlapping people

    // ---------------- head ----------------
    let sH = 0;
    if (f.face) {
      const F = f.face.pts;
      const hX = v3().subVectors(F[454], F[234]);
      const fw = hX.length(); hX.normalize();
      const hY = v3().subVectors(F[10], F[152]);
      hY.addScaledVector(hX, -hY.dot(hX)).normalize();
      const hZ = v3().crossVectors(hX, hY);
      sH = fw / FACE_W;
      const eye = v3().add(F[33]).add(F[133]).add(F[362]).add(F[263]).multiplyScalar(0.25);
      this.head.quaternion.setFromRotationMatrix(_m.makeBasis(hX, hY, hZ));
      // faces differ in length: fit the vertical scale so the teeth land on the mouth
      const sY = clamp(_b.subVectors(eye, F[13]).dot(hY) / 6.85, sH * 0.82, sH * 1.18);
      this.head.scale.set(sH, sY, sH);
      _b.set(EYE_REF.x * sH, EYE_REF.y * sY, EYE_REF.z * sH).applyQuaternion(this.head.quaternion);
      this.head.position.copy(eye).sub(_b);
      this.head.position.z = torsoOK ? 3 * s : 0;
      this.jaw.rotation.x = clamp(f.face.jaw, 0, 1) * 0.5;
      G.head.target = 1; G.neck.target = 1;
      this.hS = sH;
      if (!this.size) this.size = sH;
      // ---- cervical spine: skull base -> top of the thoracic spine
      const base = v3(SKULL_BASE[0] * sH, SKULL_BASE[1] * sY, SKULL_BASE[2] * sH).applyQuaternion(this.head.quaternion).add(this.head.position);
      const end = v3();
      let nX = hX;
      if (torsoOK) {
        // in this skeleton's own space (not world space: each person's skeleton is offset in depth)
        this.torso.updateMatrix(); end.set(0, 5.6, -4.5).applyMatrix4(this.torso.matrix);
        nX = v3().addVectors(hX, this.tX).normalize();
      } else end.copy(base).addScaledVector(hY, -11.5 * sH).addScaledVector(hZ, -1.0 * sH);
      const ctrl = v3().addVectors(base, end).multiplyScalar(0.5).addScaledVector(hZ, 1.3 * sH);
      const bez = (t, o) => o.set(0, 0, 0).addScaledVector(base, (1 - t) * (1 - t)).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(end, t * t);
      for (let i = 0; i < 7; i++) {
        bez(i / 7, _c); bez((i + 1) / 7, _d);
        const m = this.neck[i];
        const seg = _c.distanceTo(_d);
        aim(m, _d, _c, nX, false, 1, 1, false);
        m.position.addVectors(_c, _d).multiplyScalar(0.5);
        const sc = sH * (0.6 + 0.035 * i);
        m.scale.set(sc, seg / 2.5, sc);
      }
    }

    // ---------------- match hands to arms ----------------
    const hands = f.hands || [];
    const assign = [null, null];      // per incoming hand: 'L' | 'R'
    if (torsoOK) {
      const cand = [];
      hands.forEach((h, i) => {
        for (const [S, wi] of [['L', 15], ['R', 16]]) {
          const d = Math.hypot(h.pts[0].x - pp[wi].x, h.pts[0].y - pp[wi].y);
          cand.push({ i, S, d });
        }
      });
      cand.sort((a, b) => a.d - b.d);
      const used = {};
      for (const c of cand) {
        if (assign[c.i] || used[c.S]) continue;
        if (c.d < s * 2 * SHOULDER_X * 1.2) { assign[c.i] = c.S; used[c.S] = true; }
      }
    }
    const wristOf = { L: null, R: null };
    const uOf = { L: null, R: null };
    const hsOf = { L: 0, R: 0 };

    // ---------------- hands ----------------
    hands.forEach((h, i) => {
      if (i > 1) return;
      const H = this.hands[h.rig ?? i];
      const side = assign[i] || h.label || H.side;
      H.side = side;
      H.g.target = 1;
      const zBase = torsoOK ? 26 * s : 0.12 * W;
      const P = this.hp;
      const dz = zBase - h.pts[0].z;
      for (let k = 0; k < 21; k++) P[k].set(h.pts[k].x, h.pts[k].y, h.pts[k].z + dz);
      const O = P[0];
      const v = v3().subVectors(P[9], O); const palm = v.length(); v.normalize();
      const u = v3().subVectors(P[5], P[17]); const pw = u.length();
      u.addScaledVector(v, -u.dot(v)).normalize();
      const n = v3().crossVectors(u, v);
      const dorsal = side === 'R' ? n.clone().negate() : n;
      const xh = side === 'R' ? u.clone().negate() : u;
      const hsNow = palm / 9.5;
      H.hs = H.hs ? H.hs + (hsNow - H.hs) * 0.35 : hsNow;
      const hs = H.hs;
      const ws = clamp(pw / 6.1, hs * 0.55, hs * 1.25);
      const at = (cu, cv, cn, o) => o.copy(O).addScaledVector(u, cu * ws).addScaledVector(v, cv * hs).addScaledVector(dorsal, cn * hs);
      const B = H.bones;
      const setKey = (m) => { m.userData.key = m.userData.baseKey + '_' + side; };
      // fingers
      for (let fi = 1; fi < 5; fi++) {
        const a = 1 + fi * 4, th = hs * FINGER_THICK[fi];
        at(META_BASE[fi][0], META_BASE[fi][1], 0.15, _c);
        aim(B['meta_' + fi], _c, P[a], xh, false, HAND_LEN.meta, th, false);
        aim(B['prox_' + fi], P[a], P[a + 1], xh, false, HAND_LEN.prox, th, false);
        aim(B['mid_' + fi], P[a + 1], P[a + 2], xh, false, HAND_LEN.mid, th, false);
        _d.subVectors(P[a + 3], P[a + 2]).multiplyScalar(0.84).add(P[a + 2]);
        aim(B['dist_' + fi], P[a + 2], _d, xh, false, HAND_LEN.dist, th, false);
      }
      // thumb: its "back" faces half outward
      const dT = v3().copy(dorsal).multiplyScalar(0.55).addScaledVector(u, 0.85).normalize();
      const tt = hs * FINGER_THICK[0];
      aim(B.meta_0, P[1], P[2], dT, true, HAND_LEN.meta, tt, false);
      aim(B.prox_0, P[2], P[3], dT, true, HAND_LEN.prox, tt * 0.95, false);
      _d.subVectors(P[4], P[3]).multiplyScalar(0.86).add(P[3]);
      aim(B.dist_0, P[3], _d, dT, true, HAND_LEN.dist, tt * 1.15, false);
      for (const k in B) setKey(B[k]);
      // carpals
      _m.makeBasis(xh, v, _z.crossVectors(xh, v));
      for (const k in H.carpals) {
        const m = H.carpals[k], c = CARPAL_POS[k];
        at(c[0], c[1], c[2], m.position);
        if (k === 'trapezium') { at(0.3, 1.7, 0, _c); m.position.copy(P[1]).lerp(_c, 0.3); }
        m.quaternion.setFromRotationMatrix(_m);
        m.scale.setScalar(hs);
        setKey(m);
      }
      wristOf[side] = O.clone(); uOf[side] = u.clone(); hsOf[side] = hs;
      if (!this.size) this.size = hs;
      // lone hand: draw forearm stubs heading off-screen
      if (!assign[i]) {
        this.grp('hand' + (h.rig ?? i) + 'stub').target = 1;
        const elbow = at(0, -25, 0, v3());
        const lat = v3().copy(xh).multiplyScalar(side === 'R' ? -1 : 1);     // toward the thumb
        const rg = side === 'R' ? this.armGeo('R') : this.armGeo('L');
        if (H.stub.radius.geometry !== rg.radius) { H.stub.radius.geometry = rg.radius; H.stub.ulna.geometry = rg.ulna; }
        this.forearm(H.stub, elbow, O, lat, u, xh, hs, hs, side);
        H.stub.radius.userData.key = 'radius_' + side; H.stub.ulna.userData.key = 'ulna_' + side;
      }
    });

    // ---------------- arms ----------------
    if (torsoOK) {
      for (const [S, o] of [['L', 0], ['R', 1]]) {
        const sh = pp[11 + o], el = pp[13 + o], wrP = pp[15 + o];
        const A = this.arm[S];
        const wr = wristOf[S] || wrP;
        const up = v3().subVectors(el, sh).normalize();
        const fo = v3().subVectors(wr, el).normalize();
        const h = v3().crossVectors(up, fo);
        const w = h.length();
        const H = this.hinge[S];
        if (!this.hingeInit) H.copy(tX).negate();
        if (w > 0.12) { h.normalize(); if (h.dot(H) < -0.3 && w < 0.4) h.negate(); H.lerp(h, Math.min(1, w * 0.5)).normalize(); }
        const xAx = v3().copy(H).negate();
        if (vis[11 + o] > 0.45 && vis[13 + o] > 0.3) {
          this.grp('armU_' + S).target = 1;
          aim(A.humerus, sh, el, xAx, false, LIMB_LEN.humerus, s, true);
        }
        if (vis[13 + o] > 0.3 && (vis[15 + o] > 0.3 || wristOf[S])) {
          this.grp('armF_' + S).target = 1;
          const lat = v3().copy(H).multiplyScalar(S === 'L' ? -1 : 1);
          let uW = uOf[S];
          if (!uW) {
            uW = v3().subVectors(pp[21 + o], pp[17 + o]);
            uW.addScaledVector(fo, -uW.dot(fo));
            if (uW.lengthSq() < 1e-4 || vis[21 + o] < 0.3) uW.copy(lat); else uW.normalize();
          }
          const hs = hsOf[S] || s;
          this.forearm(A, el, wr, lat, uW, xAx, s, hs, S);
        }
      }
      this.hingeInit = true;

      // ---------------- legs ----------------
      for (const [S, o] of [['L', 0], ['R', 1]]) {
        const hip = pp[23 + o], kn = pp[25 + o], an = pp[27 + o], heel = pp[29 + o], toe = pp[31 + o];
        const Lg = this.leg[S];
        const th = v3().subVectors(kn, hip).normalize(), shn = v3().subVectors(an, kn).normalize();
        const h = v3().crossVectors(th, shn), w = h.length();
        const KH = this.kneeHinge[S];
        if (w > 0.15) { h.normalize(); if (h.dot(tX) < 0) h.negate(); KH.lerp(h, Math.min(1, w * 0.5)).normalize(); } else KH.lerp(tX, 0.05).normalize();
        if (vis[23 + o] > 0.5 && vis[25 + o] > 0.5) {
          this.grp('legU_' + S).target = 1;
          aim(Lg.femur, hip, kn, KH, false, LIMB_LEN.femur, s, true);
          _z.crossVectors(KH, _b.copy(th).negate()).normalize();
          Lg.patella.position.copy(kn).addScaledVector(_z, 3.6 * s).addScaledVector(th, -1.2 * s);
          Lg.patella.quaternion.copy(Lg.femur.quaternion); Lg.patella.scale.setScalar(s);
        }
        if (vis[25 + o] > 0.5 && vis[27 + o] > 0.5) {
          this.grp('legD_' + S).target = 1;
          aim(Lg.tibia, kn, an, KH, false, LIMB_LEN.tibia, s, true);
          Lg.fibula.position.copy(Lg.tibia.position); Lg.fibula.quaternion.copy(Lg.tibia.quaternion); Lg.fibula.scale.copy(Lg.tibia.scale);
        }
        if (vis[27 + o] > 0.5 && vis[29 + o] > 0.5 && vis[31 + o] > 0.5) {
          this.grp('foot_' + S).target = 1;
          const fwd = v3().subVectors(toe, heel); const fl = fwd.length(); fwd.normalize();
          const upv = v3().subVectors(an, heel); upv.addScaledVector(fwd, -upv.dot(fwd)).normalize();
          const xv = v3().crossVectors(upv, fwd);
          Lg.foot.quaternion.setFromRotationMatrix(_m.makeBasis(xv, upv, fwd));
          Lg.foot.position.copy(an);
          Lg.foot.scale.setScalar(clamp(fl / 22, s * 0.7, s * 1.3));
        }
      }
    }

    // ---------------- fades ----------------
    const kf = 1 - Math.exp(-dt * 12);
    for (const k in G) { const g = G[k]; g.alpha += (g.target - g.alpha) * kf; }
    const hide = this.style === 0 && G.head.alpha > 0.5 && this.layers.bone > 0.5;
    for (const o of this.occluders) o.visible = hide;
    for (const m of this.parts) {
      const a = m.userData.g.alpha * this.layers[m.userData.layer];
      m.visible = a > 0.02;
      const u = m.material.uniforms;
      u.uAlpha.value = a; u.uTime.value = time;
      // lesson state: lit (developed), tint, a decaying flash, and "hot" (under the cursor)
      const d = m.userData;
      if (d.flash) { d.flash *= Math.exp(-dt * 2.6); if (d.flash < 0.02) d.flash = 0; }
      const ht = Math.max(d.hiT || 0, d.flash || 0, d.hot || 0);
      u.uHi.value += (ht - u.uHi.value) * Math.min(1, dt * 14);
      u.uLit.value += ((d.lit ?? 1) - u.uLit.value) * Math.min(1, dt * 7);
      u.uTint.value.w += ((d.tint || 0) - u.uTint.value.w) * Math.min(1, dt * 8);
      if (d.tintC) u.uTint.value.set(d.tintC[0], d.tintC[1], d.tintC[2], u.uTint.value.w);
    }
  }

  armGeo(S) { return { radius: this.arm[S].radius.geometry, ulna: this.arm[S].ulna.geometry }; }

  // radius + ulna: parallel when the palm faces forward, crossed when it turns over
  forearm(A, el, wr, lat, uW, xAx, sE, sW, S) {
    const rP = v3().copy(el).addScaledVector(lat, 1.25 * sE);
    const uP = v3().copy(el).addScaledVector(lat, -0.75 * sE);
    const rD = v3().copy(wr).addScaledVector(uW, 0.85 * sW).addScaledVector(_b.subVectors(el, wr).normalize(), 0.5 * sW);
    const uD = v3().copy(wr).addScaledVector(uW, -1.4 * sW).addScaledVector(_b, 0.5 * sW);
    const th = (sE + sW) / 2;
    const rx = v3().copy(uW).multiplyScalar(S === 'L' ? 1 : -1);
    aim(A.radius, rP, rD, rx, false, LIMB_LEN.radius, th, true);
    aim(A.ulna, uP, uD, xAx, false, LIMB_LEN.ulna, th, true);
  }
}
