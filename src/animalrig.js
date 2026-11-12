// A cat or dog skeleton driven by 17 two-dimensional keypoints.
// With no depth data the trunk is reconstructed as a "2.5D" figure: bones are
// laid out along the keypoints in the image plane, and the body's turn toward
// or away from the camera is inferred from how foreshortened the back looks.
import * as THREE from 'three';
import { Body, aim } from './rig.js';
import { applyStyle } from './materials.js';
import { KIND, EYE_SEP, SKULL_BACK, RIBS, RIB_SLANT } from './models/quadruped.js';
import { LIMB_LEN } from './models/limbs.js';
import { HAND_LEN } from './models/hand.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TH = 0.42;                       // keypoint confidence needed to trust a joint
// trunk landmarks in trunk space (cat cm): where the low "hip" keypoints, the tail root and the pelvis sit
const HIP_Z = -23, TAIL = [0, 8.8, -27.5], PELVIS = [0, 2.9, -24.9];
const spineY = (z) => 7.7 + 0.5 * Math.sin(Math.PI * clamp((1.5 - z) / 26, 0, 1));
const basis = (obj, X, Y, Z) => obj.quaternion.setFromRotationMatrix(_m.makeBasis(X, Y, Z));

export class Quadruped extends Body {
  constructor() { super(); this.isAnimal = true; this.kind = 'cat'; this.sS = 0; this.hS2 = 0; }

  // G: geometry shared with the human skeletons, Q: cat/dog specific geometry
  buildAnimal(G, Q) {
    const R = this.root, vT = G.torso.parts.find((p) => p.key === 'T1').geo, vL = G.torso.parts.find((p) => p.key === 'L1').geo;
    this.heads = {};
    for (const k of ['cat', 'dog']) {
      const g = new THREE.Group(); R.add(g);
      this.add(g, 'a_skull', Q.skull[k], 'bone', 'head_' + k, 0.06, 0.5, 1.2);
      this.add(g, 'a_mandible', Q.mandible[k], 'bone', 'head_' + k, 0.05, 0.55, 0.6);
      this.heads[k] = g;
    }
    // the trunk is one rigid piece in "cat centimetres": origin between the shoulder joints,
    // +Z toward the head, +Y toward the back, +X to the animal's left
    const T = this.trunk = new THREE.Group(); R.add(T);
    this.neck = []; this.thor = []; this.lumb = []; this.tail = []; this.ribs = [];
    for (let i = 0; i < 7; i++) this.neck.push(this.add(R, 'a_C' + (i + 1), G.torso.vC, 'bone', 'neck', 0.05, 0.5));
    const place = (m, z, th, len) => { m.position.set(0, spineY(z), z); m.rotation.x = Math.PI / 2; m.scale.set(th, len / 2.4, th); };
    for (let i = 0; i < 13; i++) {
      const z = 0.9 - i * 1.15;
      const m = this.add(T, 'a_T' + (i + 1), vT, 'bone', 'trunk', 0.05, 0.42); place(m, z, 0.4 + 0.006 * i, 1.15);
      const r = this.add(T, 'a_rib' + (i + 1), Q.ribs[i], 'bone', 'trunk', 0.05, 0.55); r.position.set(0, spineY(z) - 0.15, z);
      this.thor.push(m); this.ribs.push(r);
    }
    for (let i = 0; i < 7; i++) { const m = this.add(T, 'a_L' + (i + 1), vL, 'bone', 'trunk', 0.05, 0.42); place(m, -14.25 - i * 1.5, 0.5, 1.5); this.lumb.push(m); }
    for (let i = 0; i < 16; i++) this.tail.push(this.add(R, 'a_Ca' + (i + 1), G.hg.mid, 'bone', 'tail', 0.03));
    this.sternum = this.add(T, 'a_sternum', Q.rod, 'cartilage', 'trunk', 0.02, 1.4);
    aim(this.sternum, v3(0, spineY(0.9) - RIBS[0][0] - 0.1, 0.9 - RIB_SLANT), v3(0, spineY(-8.3) - RIBS[8][0] - 0.1, -8.3 - RIB_SLANT), v3(1, 0, 0), false, 1, 0.42, false);
    this.pelvis = this.add(T, 'a_pelvis', Q.pelvis, 'bone', 'trunk', 0.06, 0.6, 0.4);
    this.pelvis.position.set(0, PELVIS[1], PELVIS[2]);
    this.fl = {}; this.hl = {};
    for (const S of ['L', 'R']) {
      const g = G.limbs[S], fg = 'fl_' + S, hg = 'hl_' + S;
      const paw = (grp, front) => {
        const o = { peb: [], mc: [], toe: [], claw: [] };
        for (let j = 0; j < 2; j++) o.peb.push(this.add(R, (front ? 'a_carpal_' : 'a_tarsal_') + S, G.hg.carpals[j ? 'capitate' : 'lunate'], 'bone', grp, 0.03));
        for (let j = 0; j < 4; j++) {
          o.mc.push(this.add(R, (front ? 'a_metacarpal_' : 'a_metatarsal_') + S, G.hg.meta, 'bone', grp, 0.03));
          o.toe.push(this.add(R, (front ? 'a_ftoe_' : 'a_htoe_') + S, G.hg.prox, 'bone', grp, 0.03));
          o.claw.push(this.add(R, 'a_claw_' + S, G.hg.dist, 'bone', grp, 0.03));
        }
        return o;
      };
      this.fl[S] = {
        scapula: this.add(R, 'a_scapula_' + S, Q.scapula, 'bone', fg, 0.004, 0.6, 0.5),
        humerus: this.add(R, 'a_humerus_' + S, g.humerus, 'bone', fg, 0.1, 0.75),
        radius: this.add(R, 'a_radius_' + S, g.radius, 'bone', fg, 0.08, 0.8),
        ulna: this.add(R, 'a_ulna_' + S, g.ulna, 'bone', fg, 0.08, 0.8),
        ...paw(fg, true),
      };
      this.hl[S] = {
        femur: this.add(R, 'a_femur_' + S, g.femur, 'bone', hg, 0.12, 0.7),
        tibia: this.add(R, 'a_tibia_' + S, g.tibia, 'bone', hg, 0.1, 0.7),
        fibula: this.add(R, 'a_fibula_' + S, g.fibula, 'bone', hg, 0.1, 0.8),
        ...paw(hg, false),
      };
    }
    this.setStyle(this.style);
  }

  setStyle(style) {
    this.style = style;
    for (const m of this.parts) applyStyle(m.material, style, m.userData.inflate);
  }

  update(a, time, dt) {
    const G = this.groups;
    for (const k in G) G[k].target = 0;
    if (a) this.drive(a, time);
    const kf = 1 - Math.exp(-dt * 12);
    for (const k in G) { const g = G[k]; g.alpha += (g.target - g.alpha) * kf; }
    for (const m of this.parts) {
      const al = m.userData.g.alpha * this.layers[m.userData.layer];
      m.visible = al > 0.02;
      const u = m.material.uniforms;
      u.uAlpha.value = al; u.uTime.value = time;
      u.uHi.value += ((m.userData.hiT || 0) - u.uHi.value) * Math.min(1, dt * 14);
    }
  }

  drive(a, time) {
    const G = this.groups, P = a.pts, sc = a.score, ok = (i) => sc[i] > TH;
    const kind = this.kind = a.kind, K = KIND[kind];
    const v = (i) => v3(P[i].x, P[i].y, 0);
    const pair = (l, r) => (ok(l) && ok(r) ? v(l).add(v(r)).multiplyScalar(0.5) : ok(l) ? v(l) : ok(r) ? v(r) : null);
    const SM = pair(5, 8), HM = pair(11, 14);
    const headSeen = ok(0) && ok(1) && ok(2);
    const Ln = Math.hypot(K.noseDown, K.noseFwd);
    // the head gives a second opinion on how big the animal is on screen
    let sh0 = 0;
    if (headSeen) sh0 = Math.max(Math.hypot(P[0].x - P[1].x, P[0].y - P[1].y) / EYE_SEP, Math.hypot(P[2].x - (P[0].x + P[1].x) / 2, P[2].y - (P[0].y + P[1].y) / 2) / Ln);
    let s = 0, F3 = null, U3 = null, L3 = null, W = null;
    const LW = (x, y, z, o = v3()) => o.copy(SM).addScaledVector(L3, x * s).addScaledVector(U3, y * s).addScaledVector(F3, z * s);

    // ------------------------------------------------ trunk
    if (SM && HM) {
      // Two body vectors are known in the model and seen in the image: shoulders->hips (along the
      // spine) and hips->tail root (mostly toward the back). Under orthographic projection that is
      // enough to solve for the body's 3D orientation and its scale.
      const ax = (SM.x - HM.x) / -HIP_Z, ay = (SM.y - HM.y) / -HIP_Z;            // forward axis, px per cm
      let bx = 0, by = 0;
      const haveT = sc[4] > 0.5;                                                 // the tail root is often hidden: only trust a clear one
      if (haveT) {
        const k = -TAIL[2] / -HIP_Z;
        bx = (P[4].x - SM.x + k * (SM.x - HM.x)) / TAIL[1]; by = (P[4].y - SM.y + k * (SM.y - HM.y)) / TAIL[1];   // dorsal axis
      }
      const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, cr = ax * by - ay * bx, A = cr * cr, B = a2 + b2;
      const q = A > 1e-9 ? (B - Math.sqrt(Math.max(0, B * B - 4 * A))) / (2 * A) : 1 / Math.max(a2, b2, 1e-9);
      s = 1 / Math.sqrt(Math.max(q, 1e-9));
      s = Math.max(s, Math.sqrt(a2), haveT ? Math.sqrt(b2) * 0.999 : 0);
      if (sh0) s = clamp(s, 0.8 * sh0, 1.45 * sh0);
      s = this.sS = this.sS ? this.sS + (s - this.sS) * 0.25 : s;
      const facing = headSeen ? 1 : -1;                                          // a visible face means the front is toward us
      const f = v3(ax / s, ay / s, 0); if (f.lengthSq() > 1) f.normalize(); f.z = facing * Math.sqrt(Math.max(0, 1 - f.x * f.x - f.y * f.y));
      const u = v3();
      if (haveT) {
        u.set(bx / s, by / s, 0); if (u.lengthSq() > 1) u.normalize();
        const uz = Math.sqrt(Math.max(0, 1 - u.x * u.x - u.y * u.y)), d = f.x * u.x + f.y * u.y;
        u.z = Math.abs(f.z) > 0.05 ? -Math.sign(d * f.z || 1) * uz : uz;
      } else u.set(0, 1, 0);
      // seen nearly head-on, the keypoints say little about which way the back points: assume it is up
      const head = clamp((0.6 - Math.hypot(f.x, f.y)) / 0.3, 0, 1);
      if (head > 0) u.lerp(v3(0, 1, 0), head);
      u.addScaledVector(f, -u.dot(f));
      if (u.lengthSq() < 1e-4) u.set(0, 1, 0).addScaledVector(f, -f.y);
      u.normalize();
      // steady the orientation over time
      if (this.F) { f.lerp(this.F, 0.6).normalize(); u.lerp(this.U, 0.6); u.addScaledVector(f, -u.dot(f)).normalize(); }
      this.F = f.clone(); this.U = u.clone();
      F3 = f; U3 = u; L3 = v3().crossVectors(U3, F3).normalize();
      this.size = s;
      // head-on with the rump hidden, the body's direction is a guess: show the front half only
      const blind = !haveT && head > 0.5;
      if (!blind) { G.trunk.target = 1; G.tail.target = 1; }
      basis(this.trunk, L3, U3, F3);
      this.trunk.position.copy(SM);
      this.trunk.scale.setScalar(s);
      W = LW(0, spineY(1.6), 1.6);

      // ground directions for paws and the tail: "up" is the screen's up
      const up = v3(0, 1, 0);
      const Fh = v3().copy(F3).addScaledVector(up, -F3.y); if (Fh.lengthSq() < 0.04) Fh.set(0, 0, facing); Fh.normalize();

      // tail: a chain that sways on its own
      const tp = LW(0, 8.2, -27.3), back = v3().copy(F3).negate(), dir = v3(), nx = v3();
      const wag = kind === 'dog' ? 0.28 * Math.sin(time * 7) : 0.16 * Math.sin(time * 1.5);
      for (let i = 0; i < 16; i++) {
        const be = K.tailUp + i * K.tailCurl + wag * Math.sin(i * 0.35 + 0.6) + 0.1 * Math.sin(time * 1.3 - i * 0.4);
        dir.copy(back).multiplyScalar(Math.cos(be)).addScaledVector(U3, Math.sin(be));
        const len = 1.45 * s * (1 - 0.028 * i);
        nx.copy(tp).addScaledVector(dir, len);
        aim(this.tail[i], tp, nx, L3, false, HAND_LEN.mid, 0.85 * s * (1 - 0.045 * i), false);
        tp.copy(nx);
      }

      // legs
      const pawHint = v3().copy(L3).negate();
      const paw = (A, C, Pw, hind) => {
        const Bt = v3().copy(Pw).addScaledVector(up, 0.55 * s).addScaledVector(Fh, -0.9 * s);
        A.peb[0].position.copy(C).addScaledVector(Fh, 0.3 * s);
        A.peb[1].position.copy(C).addScaledVector(Fh, hind ? -0.75 * s : -0.3 * s).addScaledVector(up, hind ? 0.5 * s : 0);
        A.peb[0].scale.setScalar(0.42 * s); A.peb[1].scale.setScalar((hind ? 0.55 : 0.4) * s);
        for (let j = 0; j < 4; j++) {
          const off = (j - 1.5) * 0.5 * s, fan = 1 - (Math.abs(j - 1.5) / 1.5) * 0.4;
          const a0 = v3().copy(C).addScaledVector(L3, off * 0.6).addScaledVector(up, -0.25 * s);
          const b0 = v3().copy(Bt).addScaledVector(L3, off).addScaledVector(Fh, 0.5 * s * (fan - 1));
          aim(A.mc[j], a0, b0, pawHint, false, HAND_LEN.meta, (hind ? 0.44 : 0.4) * s, false);
          const tip = v3().copy(Pw).addScaledVector(Fh, 1.3 * s * fan).addScaledVector(L3, off * 1.2).addScaledVector(up, -0.15 * s);
          aim(A.toe[j], b0, tip, pawHint, false, HAND_LEN.prox, 0.44 * s, false);
          aim(A.claw[j], tip, v3().copy(tip).addScaledVector(Fh, 0.75 * s).addScaledVector(up, -0.4 * s), pawHint, false, HAND_LEN.dist, 0.4 * s, false);
        }
      };
      const f2 = v3(F3.x, F3.y, 0), inPlane = f2.length() > 0.3;
      for (const [S, iS, iE, iP] of [['L', 5, 6, 7], ['R', 8, 9, 10]]) {
        if (!(ok(iS) && ok(iE) && ok(iP))) continue;
        G['fl_' + S].target = 1;
        const sg = S === 'L' ? 1 : -1, z = LW(sg * 2.6, 0, 0).z, A = this.fl[S];
        const Sh = v(iS).setZ(z), El = v(iE).setZ(z), Pw = v(iP).setZ(z);
        // shoulder blade hangs from beside the withers down to the shoulder joint
        const top = LW(sg * 1.0, 6.9, -1.7);
        aim(A.scapula, Sh, top, F3, false, 1, Sh.distanceTo(top), false);
        A.scapula.scale.x *= 0.62;
        aim(A.humerus, Sh, El, L3, false, LIMB_LEN.humerus, Math.max(Sh.distanceTo(El) / 30, 0.34 * s) * 1.15, true);
        const fore = v3().subVectors(Pw, El), fl = fore.length();
        const C = v3().copy(El).addScaledVector(fore, 0.74).addScaledVector(Fh, 0.035 * fl);
        const th = Math.max(El.distanceTo(C) / 23.6, 0.3 * s) * 1.1;
        aim(A.radius, v3().copy(El).addScaledVector(Fh, 0.28 * s), v3().copy(C).addScaledVector(Fh, 0.22 * s), L3, false, LIMB_LEN.radius, th, true);
        aim(A.ulna, v3().copy(El).addScaledVector(Fh, -0.3 * s), v3().copy(C).addScaledVector(Fh, -0.25 * s), L3, false, LIMB_LEN.ulna, th, true);
        paw(A, C, Pw, false);
      }
      for (const [S, iK, iP] of [['L', 12, 13], ['R', 15, 16]]) {
        if (blind || !(ok(iK) && ok(iP))) continue;
        G['hl_' + S].target = 1;
        const sg = S === 'L' ? 1 : -1, z = LW(sg * 2.5, 0, HIP_Z).z, B = this.hl[S];
        // true hip joint comes from the pelvis; the "knee" keypoint is really the hock (heel),
        // and the real knee is solved for, bending forward
        const H = LW(sg * 2.35, PELVIS[1], PELVIS[2]), Kn = v(iK).setZ(z), Pw = v(iP).setZ(z);
        const d = Math.max(H.distanceTo(Kn), 1), tot = Math.max(d * 1.03, Math.min(22.5 * s, d * 1.42)), la = tot * 0.49, lb = tot * 0.51;
        const dirK = v3().subVectors(Kn, H).multiplyScalar(1 / d);
        const ca = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
        const fw = inPlane ? f2 : Fh;
        const perp = v3().copy(fw).addScaledVector(dirK, -fw.dot(dirK));
        if (perp.lengthSq() < 1e-4) perp.set(-dirK.y, dirK.x, 0);
        perp.normalize();
        const St = v3().copy(H).addScaledVector(dirK, la * ca).addScaledVector(perp, la * Math.sqrt(1 - ca * ca));
        aim(B.femur, H, St, L3, false, LIMB_LEN.femur, Math.max(la / 43, 0.25 * s) * 1.3, true);
        aim(B.tibia, St, Kn, L3, false, LIMB_LEN.tibia, Math.max(lb / 37, 0.27 * s) * 1.2, true);
        B.fibula.position.copy(B.tibia.position); B.fibula.quaternion.copy(B.tibia.quaternion); B.fibula.scale.copy(B.tibia.scale);
        paw(B, Kn, Pw, true);
      }
    } else { this.F = null; }

    // ------------------------------------------------ head
    if (headSeen) {
      const eL = v(0), eR = v(1), no = v(2);
      const mid = v3().addVectors(eL, eR).multiplyScalar(0.5), ev = v3().subVectors(eL, eR), nv2 = v3().subVectors(no, mid);
      let sh = sh0;
      if (s) sh = clamp(sh, 0.75 * s, 1.5 * s);
      sh = this.hS2 = this.hS2 ? this.hS2 + (sh - this.hS2) * 0.3 : sh;
      if (!this.size) this.size = sh;
      // the eye-to-nose line gives the muzzle direction (always toward the viewer when the face is visible)
      let ax = nv2.x / (sh * Ln), ay = nv2.y / (sh * Ln), l2 = ax * ax + ay * ay;
      if (l2 > 1) { const k = 1 / Math.sqrt(l2); ax *= k; ay *= k; l2 = 1; }
      const A = v3(ax, ay, Math.sqrt(1 - l2));
      // the eye line gives the left-right axis; its depth sign is whichever keeps it square to the muzzle
      let xx = ev.x / (sh * EYE_SEP), xy = ev.y / (sh * EYE_SEP); l2 = xx * xx + xy * xy;
      if (l2 > 1) { const k = 1 / Math.sqrt(l2); xx *= k; xy *= k; l2 = 1; }
      const zx = Math.sqrt(1 - l2), dp = xx * A.x + xy * A.y;
      let sign = Math.abs(dp + zx * A.z) < Math.abs(dp - zx * A.z) ? 1 : -1;
      if (zx * A.z < 0.08) sign = nv2.x < 0 ? 1 : -1;
      const X3 = v3(xx, xy, sign * zx).normalize();
      A.addScaledVector(X3, -A.dot(X3)).normalize();
      const U = v3().crossVectors(A, X3);
      const ph = Math.atan2(K.noseDown, K.noseFwd), c = Math.cos(ph), sn = Math.sin(ph);
      const Y3 = v3().copy(U).multiplyScalar(c).addScaledVector(A, -sn), Z3 = v3().copy(A).multiplyScalar(c).addScaledVector(U, sn);
      const head = this.heads[kind];
      basis(head, X3, Y3, Z3);
      head.scale.setScalar(sh);
      head.position.set(mid.x, mid.y, W ? W.z + 6 * sh * Math.max(0, Z3.z) + 2 * sh : 2 * sh);
      G['head_' + kind].target = 1;
      // neck: skull -> withers, bowed up over the throat keypoint
      if (W) {
        G.neck.target = 1;
        const base = v3().fromArray(SKULL_BACK).multiplyScalar(sh).applyQuaternion(head.quaternion).add(head.position);
        const ctrl = v3().addVectors(base, W).multiplyScalar(0.5);
        if (ok(3)) ctrl.lerp(v(3).setZ(ctrl.z).addScaledVector(U3, 2.6 * s), 0.6);
        const bz = (t, o) => o.set(0, 0, 0).addScaledVector(base, (1 - t) * (1 - t)).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(W, t * t);
        const pA = v3(), pB = v3(), nv = v3(), Xn = v3(), Zn = v3();
        for (let i = 0; i < 7; i++) {
          bz(i / 7, pA); bz((i + 1) / 7, pB);
          const tg = v3().subVectors(pA, pB); const seg = tg.length(); tg.normalize();
          nv.copy(U3).addScaledVector(tg, -U3.dot(tg)); if (nv.lengthSq() < 1e-4) nv.set(-tg.y, tg.x, 0); nv.normalize();
          const m = this.neck[i];
          Zn.copy(nv).negate(); Xn.crossVectors(tg, Zn);
          basis(m, Xn, tg, Zn);
          m.position.addVectors(pA, pB).multiplyScalar(0.5);
          const th = s * (0.34 + 0.01 * i);
          m.scale.set(th, seg / 2.5, th);
        }
      }
    }
  }

  // call-out labels (see labels.js)
  labelDefs(A) {
    const zh = this.kind === 'dog' ? '狗' : '猫';
    for (const k of ['cat', 'dog']) A(this.heads[k].children[0], 'a_skull', [1.8, 2.4, -1.5], '颅骨', 'Skull', 1);
    A(this.neck[3], 'a_C4', [0, 0, 0], '颈椎 ×7', 'Cervical spine', 3);
    A(this.thor[6], 'a_T7', [0, 0, -2], '胸椎 ×13', 'Thoracic spine', 4);
    A(this.ribs[6], 'a_rib7', [3.6, -7, -1], '肋骨 13 对', 'Ribs', 2);
    A(this.lumb[3], 'a_L4', [0, 0, -2], '腰椎 ×7', 'Lumbar spine', 5);
    A(this.pelvis, 'a_pelvis', [0, 4.5, 2.5], '骨盆', 'Pelvis', 4);
    A(this.tail[7], 'a_Ca8', [0, 1, 0], '尾椎', 'Tail vertebrae', 3);
    for (const S of ['L', 'R']) {
      A(this.fl[S].scapula, 'a_scapula_' + S, [0, 0.6, 0], '肩胛骨', 'Scapula', 4);
      A(this.fl[S].humerus, 'a_humerus_' + S, [0, -15, 0], '肱骨', 'Humerus', 5);
      A(this.fl[S].peb[0], 'a_carpal_' + S, [0, 0, 0], '腕关节（手腕）', 'Carpus', 3);
      A(this.hl[S].femur, 'a_femur_' + S, [2, -22, 0], '股骨', 'Femur', 5);
      A(this.hl[S].peb[1], 'a_tarsal_' + S, [0, 0, 0], '跗关节（脚后跟）', 'Hock', 2);
    }
    return zh;
  }
}
