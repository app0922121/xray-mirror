// The 27 bones of the hand. Finger bones grow along +Y from their base joint
// (y = 0) to their head (y = len); +Z is the back of the hand, X is side to side.
import { smin, smax, ellipsoid, capsule, sphere, rbox } from '../sdf.js';
import { sdfGeometry } from '../geom.js';

export const HAND_LEN = { meta: 6.4, prox: 4.4, mid: 2.6, dist: 1.9 };

function metacarpal(x, y, z) {
  const bow = 0.18 * Math.sin(Math.PI * Math.min(1, Math.max(0, y / 6.4)));
  const zz = z - bow;
  let d = ellipsoid(x, y, zz, 0, 0.55, 0, 0.82, 0.62, 0.8);
  d = smin(d, capsule(x, y, zz, 0, 0.8, 0, 0, 5.3, 0, 0.5, 0.42), 0.55);
  d = smin(d, ellipsoid(x, y, zz, 0, 5.75, -0.05, 0.7, 0.68, 0.72), 0.45);
  return d;
}
function proximal(x, y, z) {
  const zs = z * 1.15;
  let d = ellipsoid(x, y, zs, 0, 0.42, 0, 0.84, 0.46, 0.72);
  d = smax(d, -sphere(x, y, zs, 0, -0.55, 0, 0.62), 0.2);
  d = smin(d, capsule(x, y, zs, 0, 0.7, 0, 0, 3.6, 0, 0.5, 0.38), 0.5);
  const ax = Math.abs(x);
  d = smin(d, sphere(ax, y, zs, 0.3, 4.02, -0.04, 0.36), 0.28);
  return d * 0.87;
}
function middle(x, y, z) {
  const zs = z * 1.15, ax = Math.abs(x);
  let d = ellipsoid(x, y, zs, 0, 0.36, 0, 0.72, 0.4, 0.62);
  d = smax(d, -sphere(ax, y, zs, 0.28, -0.3, 0, 0.36), 0.15);
  d = smin(d, capsule(x, y, zs, 0, 0.6, 0, 0, 2.0, 0, 0.42, 0.33), 0.45);
  d = smin(d, sphere(ax, y, zs, 0.26, 2.28, -0.03, 0.3), 0.24);
  return d * 0.87;
}
function distal(x, y, z) {
  const zs = z * 1.2, ax = Math.abs(x);
  let d = ellipsoid(x, y, zs, 0, 0.32, 0, 0.66, 0.36, 0.52);
  d = smax(d, -sphere(ax, y, zs, 0.25, -0.3, 0, 0.33), 0.15);
  d = smin(d, capsule(x, y, zs, 0, 0.5, 0, 0, 1.3, 0, 0.34, 0.2), 0.4);
  d = smin(d, ellipsoid(x, y, zs, 0, 1.56, 0, 0.44, 0.3, 0.26), 0.25);
  return d * 0.83;
}

// carpals. Local axes: x toward the thumb, y toward the fingers, z toward the back of the hand.
const CARPAL_SDF = {
  // boat-shaped, lying at a slant, with a waist and a bump (tubercle) on the palm side
  scaphoid(x, y, z) {
    let d = capsule(x, y, z, -0.38, -0.42, 0.05, 0.42, 0.5, -0.1, 0.5, 0.42);
    d = smin(d, sphere(x, y, z, 0.5, 0.62, -0.38, 0.33), 0.25);
    return smax(d, -sphere(x, y, z, -0.98, 0.72, 0, 0.62), 0.22);
  },
  // a crescent moon cupping the head of the capitate
  lunate(x, y, z) {
    const d = ellipsoid(x, y, z, 0, -0.05, 0, 0.64, 0.6, 0.64);
    return smax(d, -sphere(x, y, z, 0, 0.82, 0, 0.6), 0.16);
  },
  // a small pyramid, apex toward the little-finger side
  triquetrum(x, y, z) {
    let d = ellipsoid(x, y, z, 0.08, 0.05, 0, 0.5, 0.55, 0.5);
    return smin(d, sphere(x, y, z, -0.34, -0.3, 0, 0.3), 0.3);
  },
  pisiform: (x, y, z) => ellipsoid(x, y, z, 0, 0, 0, 0.36, 0.42, 0.34),
  // blocky, with a saddle-shaped groove facing the thumb's metacarpal
  trapezium(x, y, z) {
    let d = rbox(x, y, z, 0, 0, 0, 0.56, 0.5, 0.5, 0.3);
    d = smin(d, sphere(x, y, z, -0.2, 0.1, -0.5, 0.3), 0.25);
    return smax(d, -capsule(x, y, z, 0.62, 0.78, -1, 0.62, 0.78, 1, 0.42, 0.42), 0.14);
  },
  // the smallest of the far row, wedged in
  trapezoid(x, y, z) {
    const k = 0.82 + 0.34 * z;
    return rbox(x / k, y, z, 0, 0, 0, 0.44, 0.42, 0.44, 0.24) * 0.8;
  },
  // the biggest: a round head below, a neck, then a square body
  capitate(x, y, z) {
    let d = sphere(x, y, z, 0, -0.62, 0, 0.56);
    d = smin(d, capsule(x, y, z, 0, -0.3, 0, 0, 0.1, 0, 0.42, 0.5), 0.25);
    return smin(d, rbox(x, y, z, 0, 0.52, 0, 0.56, 0.5, 0.58, 0.28), 0.3);
  },
  // a wedge with a hook sticking out of the palm side
  hamate(x, y, z) {
    let d = rbox(x, y, z, 0, 0, 0.05, 0.55, 0.6, 0.5, 0.3);
    d = smin(d, capsule(x, y, z, -0.1, 0.2, -0.3, -0.05, 0.38, -0.92, 0.26, 0.2), 0.2);
    return smin(d, sphere(x, y, z, 0.12, 0.44, -1.02, 0.2), 0.14);
  },
};

export function buildHand(report) {
  report('手骨 ×27');
  const out = {
    meta: sdfGeometry(metacarpal, [-1.1, -0.3, -1.1], [1.1, 6.7, 1.2], 0.11),
    prox: sdfGeometry(proximal, [-1.05, -0.2, -0.9], [1.05, 4.6, 0.9], 0.095),
    mid: sdfGeometry(middle, [-0.95, -0.2, -0.8], [0.95, 2.8, 0.8], 0.082),
    dist: sdfGeometry(distal, [-0.85, -0.2, -0.7], [0.85, 2.05, 0.7], 0.07),
    carpals: {},
  };
  for (const k in CARPAL_SDF) out.carpals[k] = sdfGeometry(CARPAL_SDF[k], [-1.3, -1.45, -1.5], [1.3, 1.45, 1.2], 0.075);
  return out;
}
