// Long bones. Each is modelled for the LEFT side (lateral = +X, front = +Z),
// hanging down -Y from its proximal joint centre at the origin.
// `len` is the distance to the distal joint centre; the rig stretches Y to fit.
import { smin, smax, ellipsoid, capsule, rbox, cylY, sphere } from '../sdf.js';
import { sdfGeometry, mirrorX } from '../geom.js';

function humerus(x, y, z) {
  let d = sphere(x, y, z, -1.3, -0.5, 0, 2.35);
  d = smin(d, sphere(x, y, z, 1.35, -1.0, 0.3, 1.7), 0.8);
  d = smin(d, capsule(x, y, z, 0.2, -2.6, 0, 0, -23, 0, 1.45, 1.0), 1.0);
  d = smin(d, capsule(x, y, z, 0, -23, 0, 0, -27.2, 0, 1.0, 1.2), 0.5);
  const zs = z * 1.7;
  let fl = capsule(x, y, zs, -3.0, -28.4, 0, 2.6, -28.8, 0, 1.0, 0.9);
  fl = smin(fl, capsule(x, y, zs, 0, -25.2, 0, 0, -28.4, 0, 1.1, 1.9), 1.0);
  d = smin(d, fl * 0.6, 0.8);
  d = smin(d, capsule(x, y, z, -2.0, -30.0, 0.4, -0.3, -30.0, 0.4, 1.15, 1.0), 0.5);
  d = smin(d, sphere(x, y, z, 1.3, -29.9, 0.6, 1.05), 0.4);
  d = smax(d, -sphere(x, y, z, -0.3, -28.1, -1.6, 0.95), 0.4);
  return d;
}
function ulna(x, y, z) {
  let d = rbox(x, y, z, 0, 0.5, -1.25, 1.05, 1.75, 1.0, 0.7);
  d = smin(d, capsule(x, y, z, 0, -1.5, 0.3, 0, -2.8, 0.1, 1.1, 0.95), 0.6);
  d = smax(d, -capsule(x, y, z, -2.5, 0.2, 1.05, 2.5, 0.2, 1.05, 1.2), 0.3);
  d = smin(d, capsule(x, y, z, 0, -2.6, 0, 0, -23.4, 0, 0.92, 0.48), 0.8);
  d = smin(d, sphere(x, y, z, 0, -24.2, 0, 0.74), 0.3);
  d = smin(d, capsule(x, y, z, -0.4, -24.4, -0.2, -0.55, -25.3, -0.3, 0.32, 0.22), 0.2);
  return d;
}
function radius(x, y, z) {
  let d = cylY(x, y, z, 0, -0.6, 0, 1.12, 0.55, 0.3);
  d = smin(d, capsule(x, y, z, 0, -1, 0, 0, -3.4, 0, 0.62, 0.66), 0.4);
  d = smin(d, sphere(x, y, z, -0.5, -3.9, 0.2, 0.75), 0.4);
  d = smin(d, capsule(x, y, z, 0, -3.4, 0, 0.1, -19, 0, 0.66, 0.85), 0.6);
  // wrist end: a broad flare with a flat, slightly scooped face for the carpals
  let w = smax(ellipsoid(x, y, z, 0.15, -21.2, 0, 1.85, 2.7, 1.12), -23.05 - y, 0.3);
  w = smax(w, -sphere(x, y, z, 0.1, -24.75, 0, 1.95), 0.25);
  d = smin(d, w, 0.9);
  d = smin(d, capsule(x, y, z, 1.2, -22.6, 0, 1.55, -23.9, 0, 0.5, 0.3), 0.4);
  return d;
}
function femur(x, y, z) {
  let d = sphere(x, y, z, 0, 0, 0, 2.4);
  d = smin(d, capsule(x, y, z, 0.8, -0.6, 0, 4.4, -3.6, -0.2, 1.5, 1.75), 0.6);
  d = smin(d, ellipsoid(x, y, z, 5.9, -2.6, -0.4, 1.9, 2.6, 2.0), 0.9);
  d = smin(d, sphere(x, y, z, 3.2, -7.4, -1.0, 1.15), 0.7);
  d = smin(d, capsule(x, y, z, 4.6, -5.0, 0, 0.6, -35.5, 0.5, 1.7, 1.55), 1.2);
  d = smin(d, capsule(x, y, z, 0.6, -35.5, 0.5, 0.2, -39.6, 0, 1.6, 2.7), 1.0);
  d = smin(d, ellipsoid(x, y, z, 2.4, -41.4, -0.7, 2.15, 2.3, 3.1), 0.8);
  d = smin(d, ellipsoid(x, y, z, -2.3, -41.4, -0.7, 2.15, 2.3, 3.1), 0.8);
  d = smax(d, -capsule(x, y, z, 0, -43.4, -2.4, 0, -41.0, -3.4, 1.05), 0.5);
  return d;
}
function tibia(x, y, z) {
  let d = ellipsoid(x, y, z, 0, -1.9, -0.2, 3.9, 1.7, 2.7);
  d = smin(d, sphere(x, y, z, 0, -4.6, 1.9, 1.2), 0.8);
  d = smin(d, capsule(x, y, z, 0, -3.5, 0.3, 0, -32, 0, 1.9, 1.15), 1.4);
  d = smin(d, rbox(x, y, z, 0, -35.2, 0, 2.0, 1.3, 1.6, 0.8), 0.9);
  d = smin(d, capsule(x, y, z, -1.6, -35.5, 0, -1.9, -37.5, 0, 0.9, 0.6), 0.5);
  return d;
}
function fibula(x, y, z) {
  let d = ellipsoid(x, y, z, 3.4, -4.2, -1.0, 0.95, 1.3, 0.95);
  d = smin(d, capsule(x, y, z, 3.4, -5, -1.0, 3.2, -34, -0.4, 0.55, 0.5), 0.5);
  d = smin(d, ellipsoid(x, y, z, 3.1, -36.5, -0.3, 0.85, 1.9, 1.0), 0.5);
  return d;
}
function patella(x, y, z) {
  return smin(ellipsoid(x, y, z, 0, 0.2, 0, 2.1, 2.0, 1.0), sphere(x, y, z, 0, -1.5, 0, 0.95), 0.9);
}

// Foot, left. Origin = ankle joint, +Z toward the toes, sole at y ~ -7.
function tarsals(x, y, z) {
  let d = ellipsoid(x, y, z, 0.3, -5.0, -2.9, 1.9, 2.0, 3.5);        // heel bone
  d = smin(d, ellipsoid(x, y, z, 0, -2.2, 0.5, 2.0, 1.6, 2.6), 0.5);  // talus
  d = smin(d, ellipsoid(x, y, z, -1.0, -3.6, 3.9, 1.7, 1.3, 1.3), 0.35);
  d = smin(d, ellipsoid(x, y, z, 1.6, -4.6, 3.6, 1.5, 1.2, 1.9), 0.35);
  for (let i = 0; i < 3; i++) d = smin(d, ellipsoid(x, y, z, -2.2 + i * 1.3, -4.1 - i * 0.2, 5.6, 0.62, 0.8, 0.9), 0.15);
  return d;
}
const mtBase = (i) => [-2.4 + 1.25 * i, -4.5 - 0.3 * i, 6.5];
const mtHead = (i) => [-3.0 + 1.6 * i, -6.2, 13.2 - 0.85 * i];
function metatarsals(x, y, z) {
  let d = 1e9;
  for (let i = 0; i < 5; i++) {
    const a = mtBase(i), b = mtHead(i), r = i === 0 ? 0.8 : 0.55;
    let m = capsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r * 0.8, r * 0.7);
    m = smin(m, sphere(x, y, z, a[0], a[1], a[2] + 0.3, r * 1.15), 0.4);
    m = smin(m, sphere(x, y, z, b[0], b[1], b[2] - 0.2, r * 1.1), 0.4);
    d = Math.min(d, m);
  }
  return d;
}
function toes(x, y, z) {
  let d = 1e9;
  for (let i = 0; i < 5; i++) {
    const h = mtHead(i);
    const lens = i === 0 ? [2.9, 2.4] : [2.0 - i * 0.12, 1.1 - i * 0.05, 0.9];
    const r = i === 0 ? 0.62 : 0.42;
    let zz = h[2] + 0.5, yy = h[1];
    for (let k = 0; k < lens.length; k++) {
      const l = lens[k], y2 = yy - 0.12;
      let m = capsule(x, y, z, h[0], yy, zz + 0.25, h[0], y2, zz + l - 0.2, r * 0.75, r * 0.6);
      m = smin(m, sphere(x, y, z, h[0], yy, zz + 0.25, r), 0.3);
      d = Math.min(d, m);
      zz += l + 0.12; yy = y2;
    }
  }
  return d;
}

export const LIMB_LEN = { humerus: 30, ulna: 24.6, radius: 23.6, femur: 43, tibia: 37, fibula: 37 };

export function buildLimbs(report) {
  report('四肢长骨');
  const L = {
    humerus: sdfGeometry(humerus, [-4.6, -32, -3.2], [4.4, 2.6, 3.2], 0.24),
    ulna: sdfGeometry(ulna, [-3, -26.2, -3], [3, 3, 2.6], 0.2),
    radius: sdfGeometry(radius, [-2.4, -24.8, -2], [2.6, 0.8, 2], 0.2),
    femur: sdfGeometry(femur, [-5.4, -44.8, -4.8], [8.6, 3.2, 3.6], 0.3),
    tibia: sdfGeometry(tibia, [-4.8, -39, -3.8], [4.8, 0.6, 4], 0.3),
    fibula: sdfGeometry(fibula, [1.6, -39.2, -2.8], [5.2, -2, 1.6], 0.2),
    patella: sdfGeometry(patella, [-2.8, -3.2, -1.8], [2.8, 2.9, 1.8], 0.18),
    tarsals: sdfGeometry(tarsals, [-4, -7.8, -7.2], [4, 0.2, 7.4], 0.22),
    metatarsals: sdfGeometry(metatarsals, [-4.6, -7.8, 4.8], [5.6, -2.8, 14.8], 0.2),
    toes: sdfGeometry(toes, [-4.4, -7.8, 9.2], [5.2, -5, 20], 0.18),
  };
  const R = {};
  for (const k in L) R[k] = mirrorX(L[k]);
  return { L, R };
}
