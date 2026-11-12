// Cat and dog bones. Units are "cat centimetres": a cat is modelled at life
// size and a dog is the same skeleton with a longer muzzle, scaled up by the rig.
// Head space: origin midway between the eyes, +X = animal's left, +Y = up, +Z = toward the nose.
import { smin, smax, ellipsoid, capsule, sphere, rbox, triangle } from '../sdf.js';
import { sdfGeometry, sweep, rounded, mirrorX, merge } from '../geom.js';

export const EYE_SEP = 3.5;                       // distance between the eye centres
export const SKULL_BACK = [0, -0.5, -5.0];         // where the neck joins
// per kind: muzzle tip z, and where the nose keypoint sits relative to the eye midpoint (down, forward)
export const KIND = {
  cat: { zl: 3.6, noseDown: 1.3, noseFwd: 4.0, tailUp: -0.6, tailCurl: 0.055 },
  dog: { zl: 5.7, noseDown: 1.6, noseFwd: 6.1, tailUp: 0.55, tailCurl: 0.06 },
};

function skullSDF(zl, dog) {
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = ellipsoid(x, y, z, 0, 0.9, -2.6, 2.3, 2.0, 3.0);                          // brain case
    d = smin(d, ellipsoid(x, y, z, 0, 0.5, 0.1, 1.95, 1.25, 1.7), 0.8);               // forehead
    d = smin(d, capsule(x, y, z, 0, -0.75, 0.5, 0, -1.05, zl - 0.95, 1.5, dog ? 1.0 : 1.12), 0.7);   // muzzle
    d = smin(d, capsule(x, y, z, 0, 0.1, 0.6, 0, -0.35, zl - 0.6, 0.75, 0.5), 0.5);    // nasal bridge
    // cheek arches sweep wide of the skull
    d = smin(d, capsule(ax, y, z, 1.85, -1.15, 1.3, 3.25, -1.0, -0.6, 0.3, 0.27), 0.45);
    d = smin(d, capsule(ax, y, z, 3.25, -1.0, -0.6, 2.3, -0.45, -2.6, 0.27, 0.34), 0.45);
    d = smin(d, sphere(ax, y, z, 1.35, -1.05, -3.05, 0.8), 0.4);                       // ear capsule (bulla)
    d = smin(d, capsule(x, y, z, 0, 2.7, -2.4, 0, 1.3, -5.5, dog ? 0.32 : 0.2, 0.3), 0.6);   // crest
    // big forward-facing eye sockets
    d = smax(d, -sphere(ax, y, z, 1.75, 0.05, 0.25, 1.3), 0.22);
    d = smax(d, -ellipsoid(x, y, z, 0, -0.6, zl + 0.15, 0.6, 0.48, 0.8), 0.15);         // nose opening
    // teeth: fangs, incisors, cheek teeth
    d = Math.min(d, capsule(ax, y, z, 0.95, -1.5, zl - 0.8, 1.02, -3.05, zl - 0.62, 0.3, 0.06));
    for (let i = 0; i < 3; i++) d = Math.min(d, capsule(ax, y, z, 0.16 + i * 0.27, -1.7, zl - 0.2 - i * 0.07, 0.16 + i * 0.27, -2.25, zl - 0.15 - i * 0.07, 0.13, 0.09));
    const n = dog ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), zz = zl - 1.9 - t * (zl - 2.3), xx = 1.2 + t * 0.55, big = i === n - 2 ? 1.35 : 1;
      d = Math.min(d, capsule(ax, y, z, xx, -1.7, zz, xx, -2.3 - 0.12 * big, zz, 0.3 * big, 0.12));
    }
    return d;
  };
}

function mandibleSDF(zl, dog) {
  return (x, y, z) => {
    const ax = Math.abs(x);
    let d = capsule(ax, y, z, 2.35, -1.25, -2.5, 2.1, -2.6, -1.85, 0.36, 0.42);
    d = smin(d, capsule(ax, y, z, 2.1, -2.6, -1.85, 1.6, -2.85, 0.0, 0.42, 0.4), 0.3);
    d = smin(d, capsule(ax, y, z, 1.6, -2.85, 0.0, 0.8, -2.95, zl - 1.3, 0.4, 0.34), 0.3);
    d = smin(d, capsule(ax, y, z, 0.8, -2.95, zl - 1.3, 0.12, -2.85, zl - 0.6, 0.34, 0.3), 0.3);
    // coronoid process: the blade the jaw muscle pulls on
    d = smin(d, capsule(ax * 1.6 - 1.32, y, z, 2.15, -2.3, -1.5, 2.25, -0.25, -1.15, 0.5, 0.22) * 0.62, 0.3);
    d = Math.min(d, capsule(ax, y, z, 0.74, -2.6, zl - 1.0, 0.8, -1.2, zl - 0.9, 0.26, 0.05));       // lower fang
    const n = dog ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), zz = zl - 2.0 - t * (zl - 2.4), xx = 1.1 + t * 0.5;
      d = Math.min(d, capsule(ax, y, z, xx, -2.7, zz, xx, -2.2, zz, 0.27, 0.11));
    }
    return d;
  };
}

function pelvisSDF(x, y, z) {
  const ax = Math.abs(x);
  let d = capsule(ax, y, z, 2.3, 0.2, 0.3, 2.5, 3.4, 4.6, 0.55, 0.42);                  // ilium
  d = smin(d, ellipsoid(ax, y, z, 2.55, 3.9, 5.0, 0.5, 1.0, 1.3), 0.4);
  d = smin(d, capsule(ax, y, z, 2.3, 0.1, -0.3, 2.45, 0.9, -4.0, 0.5, 0.45), 0.4);       // ischium
  d = smin(d, sphere(ax, y, z, 2.5, 1.0, -4.3, 0.7), 0.4);
  d = smin(d, capsule(ax, y, z, 2.2, -0.3, 0.2, 0.2, -1.6, -0.8, 0.4, 0.38), 0.4);       // pubis
  d = smin(d, capsule(ax, y, z, 0.2, -1.6, -0.8, 2.2, 0.4, -3.6, 0.36, 0.4), 0.4);
  d = smin(d, sphere(ax, y, z, 2.35, 0, 0, 0.95), 0.4);
  d = smax(d, -sphere(ax, y, z, 3.0, 0, 0, 0.62), 0.2);                                  // hip socket
  d = smin(d, rbox(x, y, z, 0, 4.4, 2.6, 1.9, 0.7, 1.7, 0.5), 0.6);                       // sacrum
  d = smin(d, capsule(x, y, z, 0, 4.6, 1.0, 0, 5.6, -2.2, 0.75, 0.45), 0.5);
  return d;
}

// shoulder blade: joint at the origin, blade fanning up to y = 1
function scapulaSDF(x, y, z) {
  let d = triangle(x, y, z, [0, 0.04, 0], [-0.36, 1, 0], [0.42, 0.95, 0]) - 0.03;
  d = smin(d, capsule(x, y, z, 0.02, 0.06, 0.05, 0.05, 0.96, 0.06, 0.04, 0.035), 0.05);
  d = smin(d, sphere(x, y, z, 0, 0.03, 0, 0.085), 0.06);
  return d;
}

// rib table: [depth below the spine, half-width]
export const RIBS = [[8.6, 1.9], [10.2, 2.5], [11.3, 3.0], [12.0, 3.3], [12.4, 3.6], [12.6, 3.8], [12.6, 3.9], [12.4, 3.9], [12.0, 3.8], [10.4, 3.6], [8.6, 3.3], [6.8, 2.9], [5.0, 2.4]];
export const RIB_SLANT = 1.7;

export function buildQuadruped() {
  const Q = { skull: {}, mandible: {}, ribs: [] };
  for (const k of ['cat', 'dog']) {
    const zl = KIND[k].zl, dog = k === 'dog';
    Q.skull[k] = sdfGeometry(skullSDF(zl, dog), [-3.9, -3.5, -6.1], [3.9, 3.5, zl + 1.2], 0.095, { aoDist: 0.9 });
    Q.mandible[k] = sdfGeometry(mandibleSDF(zl, dog), [-3.1, -3.6, -3.2], [3.1, 0.4, zl + 0.2], 0.085, { aoDist: 0.6 });
  }
  RIBS.forEach(([D, w], i) => {
    const endX = i < 9 ? 0.35 : w * 0.7, sl = RIB_SLANT;
    const left = sweep([[0.45, -0.35, 0], [w * 0.78, -0.18 * D, -0.25 * sl], [w, -0.5 * D, -0.55 * sl], [w * 0.82, -0.82 * D, -0.85 * sl], [endX, -D, -sl]],
      rounded(() => [0.22, 0.3], 0.05), { segments: 26, radial: 8, up: [0, 0, 1] });
    Q.ribs.push(merge([left, mirrorX(left)]));
  });
  Q.pelvis = sdfGeometry(pelvisSDF, [-3.9, -2.7, -5.5], [3.9, 6.4, 6.9], 0.14, { aoDist: 0.8 });
  Q.scapula = sdfGeometry(scapulaSDF, [-0.5, -0.14, -0.1], [0.56, 1.1, 0.16], 0.012, { aoDist: 0.06 });
  Q.rod = sweep([[0, 0, 0], [0, 0.5, 0], [0, 1, 0]], rounded(0.5, 0.25), { segments: 10, radial: 8 });
  return Q;
}
