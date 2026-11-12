// Signed-distance-field modelling kit + surface-nets mesher.
// Every bone and organ in this project is defined as a distance function in
// plain JS and turned into a triangle mesh at load time. No model files.

export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

export function sphere(x, y, z, cx, cy, cz, r) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

export function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  if (k0 < 1e-5) return -Math.min(rx, ry, rz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return (k0 * (k0 - 1)) / k1;
}

// Capsule with a different radius at each end.
export function capsule(x, y, z, ax, ay, az, bx, by, bz, r1, r2 = r1) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
}

export function rbox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// Rounded cylinder, axis along Y.
export function cylY(x, y, z, cx, cy, cz, r, h, round = 0) {
  const dx = x - cx, dz = z - cz;
  const a = Math.sqrt(dx * dx + dz * dz) - r + round;
  const b = Math.abs(y - cy) - h + round;
  const oa = Math.max(a, 0), ob = Math.max(b, 0);
  return Math.min(Math.max(a, b), 0) + Math.sqrt(oa * oa + ob * ob) - round;
}

// Torus lying in the XZ plane (axis Y).
export function torusY(x, y, z, cx, cy, cz, R, r) {
  const dx = x - cx, dz = z - cz;
  const q = Math.sqrt(dx * dx + dz * dz) - R;
  const dy = y - cy;
  return Math.sqrt(q * q + dy * dy) - r;
}

// Torus with arbitrary unit axis (nx,ny,nz).
export function torusN(x, y, z, cx, cy, cz, nx, ny, nz, R, r) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  const h = dx * nx + dy * ny + dz * nz;
  const px = dx - nx * h, py = dy - ny * h, pz = dz - nz * h;
  const q = Math.sqrt(px * px + py * py + pz * pz) - R;
  return Math.sqrt(q * q + h * h) - r;
}

// Distance from a 2D point to a polyline given as flat [x0,y0,x1,y1,...].
export function polyline2(px, py, pts) {
  let best = 1e9;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const bax = bx - ax, bay = by - ay, pax = px - ax, pay = py - ay;
    let h = (pax * bax + pay * bay) / (bax * bax + bay * bay);
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = pax - bax * h, dy = pay - bay * h;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Unsigned distance to a 3D triangle (after Inigo Quilez).
export function triangle(px, py, pz, a, b, c) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const cbx = c[0] - b[0], cby = c[1] - b[1], cbz = c[2] - b[2];
  const acx = a[0] - c[0], acy = a[1] - c[1], acz = a[2] - c[2];
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const pbx = px - b[0], pby = py - b[1], pbz = pz - b[2];
  const pcx = px - c[0], pcy = py - c[1], pcz = pz - c[2];
  const nx = bay * acz - baz * acy, ny = baz * acx - bax * acz, nz = bax * acy - bay * acx;
  const s1 = (bay * nz - baz * ny) * pax + (baz * nx - bax * nz) * pay + (bax * ny - bay * nx) * paz;
  const s2 = (cby * nz - cbz * ny) * pbx + (cbz * nx - cbx * nz) * pby + (cbx * ny - cby * nx) * pbz;
  const s3 = (acy * nz - acz * ny) * pcx + (acz * nx - acx * nz) * pcy + (acx * ny - acy * nx) * pcz;
  const sg = (Math.sign(s1) + Math.sign(s2) + Math.sign(s3));
  if (Math.abs(sg) < 2) {
    const e = (ex, ey, ez, qx, qy, qz) => {
      let h = (ex * qx + ey * qy + ez * qz) / (ex * ex + ey * ey + ez * ez);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const dx = ex * h - qx, dy = ey * h - qy, dz = ez * h - qz;
      return dx * dx + dy * dy + dz * dz;
    };
    return Math.sqrt(Math.min(
      e(bax, bay, baz, pax, pay, paz),
      e(cbx, cby, cbz, pbx, pby, pbz),
      e(acx, acy, acz, pcx, pcy, pcz)));
  }
  const d = nx * pax + ny * pay + nz * paz;
  return Math.sqrt((d * d) / (nx * nx + ny * ny + nz * nz));
}

/**
 * Mesh an SDF with naive surface nets.
 * Returns { position, normal, index } typed arrays.
 * A coarse block pre-pass skips empty space so even 1M-cell grids stay fast.
 */
export function meshSDF(f, bmin, bmax, cell, opts = {}) {
  const block = opts.block ?? 4;
  const safety = opts.safety ?? 1.5;
  const nx = Math.ceil((bmax[0] - bmin[0]) / cell) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / cell) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / cell) + 1;
  const nxy = nx * ny;
  const g = new Float32Array(nxy * nz);
  const ox = bmin[0], oy = bmin[1], oz = bmin[2];

  const thr = ((block - 1) / 2) * cell * 1.7321 * safety + cell;
  for (let k0 = 0; k0 < nz; k0 += block) {
    const k1 = Math.min(k0 + block, nz);
    for (let j0 = 0; j0 < ny; j0 += block) {
      const j1 = Math.min(j0 + block, ny);
      for (let i0 = 0; i0 < nx; i0 += block) {
        const i1 = Math.min(i0 + block, nx);
        const d = f(ox + (i0 + (block - 1) / 2) * cell, oy + (j0 + (block - 1) / 2) * cell, oz + (k0 + (block - 1) / 2) * cell);
        const far = Math.abs(d) > thr;
        for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) {
          let p = i0 + nx * j + nxy * k;
          for (let i = i0; i < i1; i++, p++) {
            g[p] = far ? d : f(ox + i * cell, oy + j * cell, oz + k * cell);
          }
        }
      }
    }
  }

  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1, cnxy = cnx * cny;
  const vmap = new Int32Array(cnxy * cnz).fill(-1);
  const pos = [];
  const co = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const edges = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const v = new Float32Array(8);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) {
    let base = nx * j + nxy * k;
    for (let i = 0; i < cnx; i++, base++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { v[c] = g[base + co[c]]; if (v[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < 24; e += 2) {
        const a = edges[e], b = edges[e + 1];
        const va = v[a], vb = v[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        const ax = a & 1, ay = (a >> 1) & 1, az = (a >> 2) & 1;
        const bx = b & 1, by = (b >> 1) & 1, bz = (b >> 2) & 1;
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; n++;
      }
      vmap[i + cnx * j + cnxy * k] = pos.length / 3;
      pos.push(ox + (i + sx / n) * cell, oy + (j + sy / n) * cell, oz + (k + sz / n) * cell);
    }
  }

  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  const cv = (i, j, k) => vmap[i + cnx * j + cnxy * k];
  for (let k = 1; k < cnz; k++) for (let j = 1; j < cny; j++) for (let i = 1; i < cnx; i++) {
    const p = i + nx * j + nxy * k;
    const d0 = g[p];
    const in0 = d0 < 0;
    if (in0 !== (g[p + 1] < 0)) quad(cv(i, j, k), cv(i, j - 1, k), cv(i, j - 1, k - 1), cv(i, j, k - 1), !in0);
    if (in0 !== (g[p + nx] < 0)) quad(cv(i, j, k), cv(i, j, k - 1), cv(i - 1, j, k - 1), cv(i - 1, j, k), !in0);
    if (in0 !== (g[p + nxy] < 0)) quad(cv(i, j, k), cv(i - 1, j, k), cv(i - 1, j - 1, k), cv(i, j - 1, k), !in0);
  }

  // Snap vertices onto the true surface and take analytic-ish normals.
  const nv = pos.length / 3;
  const position = new Float32Array(pos);
  const normal = new Float32Array(nv * 3);
  const ao = new Float32Array(nv);
  const aoDist = opts.aoDist ?? cell * 6;
  const e = cell * 0.45;
  for (let i = 0; i < nv; i++) {
    let x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    let gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    let d = f(x, y, z);
    d = d > cell ? cell : d < -cell ? -cell : d;
    position[i * 3] = x - gx * d; position[i * 3 + 1] = y - gy * d; position[i * 3 + 2] = z - gz * d;
    normal[i * 3] = gx; normal[i * 3 + 1] = gy; normal[i * 3 + 2] = gz;
    // ambient occlusion straight from the field: in a hollow, the surface is
    // closer than the distance we stepped away from it
    x = position[i * 3]; y = position[i * 3 + 1]; z = position[i * 3 + 2];
    let occ = 0;
    for (let k = 1; k <= 4; k++) {
      const h = (aoDist * k) / 4;
      occ += Math.max(0, h - f(x + gx * h, y + gy * h, z + gz * h)) / h * (1.2 - k * 0.2);
    }
    ao[i] = 1 - Math.min(1, occ / 2.8 * 1.5);
  }
  return { position, normal, ao, index: new Uint32Array(idx) };
}
