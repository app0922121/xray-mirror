// Render pipeline: bones -> offscreen target -> style composite with the
// camera image -> blur pyramid (bloom / tilt-shift) -> final grade.
import * as THREE from 'three';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const HEAD = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tVideo, tBones, tGlyph;
uniform vec4 uVid;
uniform vec2 uRes;
uniform float uMirror, uTime, uReal, uCell, uGlyphN, uDim;
uniform vec4 uLens;   // lens view: centre (device px from bottom-left), radius (px), amount 0..1
uniform vec3 uLensC;
vec2 src(vec2 uv){ return vec2(mix(uv.x, 1.0 - uv.x, uMirror), uv.y); }
vec3 video(vec2 s){ return texture2D(tVideo, uVid.xy + s * uVid.zw).rgb * uDim; }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 video4(vec2 s, vec2 q){ return (video(s+q) + video(s-q) + video(s+vec2(q.x,-q.y)) + video(s+vec2(-q.x,q.y))) * 0.25; }
float bayer(vec2 p){
  vec2 q = floor(mod(p, 4.0)); float i = q.x + q.y*4.0; float m = 5.0;
  if(i<1.)m=0.;else if(i<2.)m=8.;else if(i<3.)m=2.;else if(i<4.)m=10.;
  else if(i<5.)m=12.;else if(i<6.)m=4.;else if(i<7.)m=14.;else if(i<8.)m=6.;
  else if(i<9.)m=3.;else if(i<10.)m=11.;else if(i<11.)m=1.;else if(i<12.)m=9.;
  else if(i<13.)m=15.;else if(i<14.)m=7.;else if(i<15.)m=13.;
  return (m + 0.5) / 16.0;
}
// Lens view: the skeleton only inside a round lens; outside, the same style's filtered
// picture without bones, a little dimmer. A wide soft fade between them (no hard rim)
// and a hairline circle just beyond.
// p = device pixel (or the centre of this pixel-art / ASCII cell), col = styled colour with bones,
// bg = styled colour without bones, b = the bones layer here (for a faint ghost outside)
vec3 lens(vec2 p, vec3 col, vec3 bg, vec3 b){
  if(uLens.w < 0.002) return col;
  float d = length(p - uLens.xy), r = uLens.z;
  float m = 1.0 - smoothstep(r * 0.55, r * 1.06, d);
  m = m * m * (3.0 - 2.0 * m);
  vec3 outer = bg * 0.82 + uLensC * (1.0 - exp(-luma(b) * 0.8)) * 0.035;
  vec3 c = mix(outer, col, m);
  float ring = exp(-pow((d - r * 1.13) / max(1.0, uRes.y / 1000.0), 2.0));
  c += mix(vec3(0.9, 0.95, 1.0), uLensC, 0.35) * ring * 0.22;
  return mix(col, c, uLens.w);
}`;

const COMPOSITE = [
  // 0 — X-ray film
  /* glsl */`
void main(){
  vec2 s = src(vUv);
  vec3 vid = video(s);
  float L = luma(vid);
  vec2 px = 1.6 / uRes;
  float lx = luma(video(s + vec2(px.x, 0.0))) - luma(video(s - vec2(px.x, 0.0)));
  float ly = luma(video(s + vec2(0.0, px.y))) - luma(video(s - vec2(0.0, px.y)));
  float e = sqrt(lx*lx + ly*ly);
  vec3 bg = vec3(0.008, 0.02, 0.042) + vec3(0.15, 0.32, 0.5) * pow(L, 1.5) * 0.42;
  bg += vec3(0.2, 0.55, 0.85) * smoothstep(0.05, 0.35, e) * 0.26;
  float real = max(uReal, 0.38 * uLens.w);           // lens view: you still see yourself through it
  bg = mix(bg, vid, real);
  vec3 b = texture2D(tBones, s).rgb;
  vec3 film = 1.0 - exp(-b * 1.05);
  film = mix(film, b / (1.0 + luma(b)), 0.35);
  vec3 col = bg * (1.0 - mix(0.55, 0.92, real) * clamp(luma(film) * 1.4, 0.0, 1.0)) + film * mix(1.25, 0.95, real);
  gl_FragColor = vec4(lens(gl_FragCoord.xy, col, bg, b), 1.0);
}`,
  // 1 — clay toy over a pastel duotone
  /* glsl */`
void main(){
  vec2 s = src(vUv);
  vec3 vid = video(s);
  float L = luma(vid);
  vec3 duo = mix(vec3(0.34, 0.29, 0.60), vec3(1.0, 0.85, 0.78), smoothstep(0.03, 0.95, L));
  vec3 bg = mix(duo, mix(vec3(L), vid, 1.25), 0.36) * 0.88;
  bg = mix(bg, vid, uReal);
  vec3 bg0 = bg;
  vec2 px = 1.0 / uRes; float sh = 0.0;
  vec2 off = vec2(mix(-10.0, 10.0, uMirror), 13.0) * (uRes.y / 900.0);
  for(int i = 0; i < 14; i++){
    float a = float(i) * 2.39996, r = sqrt((float(i) + 0.5) / 14.0);
    sh += texture2D(tBones, s + (vec2(cos(a), sin(a)) * r * 15.0 * (uRes.y / 900.0) + off) * px).a;
  }
  sh /= 14.0;
  bg = mix(bg, bg * vec3(0.5, 0.42, 0.72), sh * 0.75);
  vec4 b = texture2D(tBones, s);
  gl_FragColor = vec4(lens(gl_FragCoord.xy, bg * (1.0 - b.a) + b.rgb, bg0, b.rgb), 1.0);
}`,
  // 2 — HD-2D pixel art
  /* glsl */`
void main(){
  vec2 g = floor(gl_FragCoord.xy / uCell);
  vec2 cs = uCell / uRes;
  vec2 s = src((g + 0.5) * cs);
  vec3 vid = video4(s, cs * 0.25);
  float L = luma(vid);
  vec3 gr = mix(vec3(L), vid, 0.82);
  gr = gr * vec3(1.08, 0.98, 0.84) + vec3(0.0, 0.02, 0.075) * (1.0 - L);
  gr = pow(max(gr, 0.0), vec3(1.15)) * 0.66;
  gr = mix(gr, vid, uReal);
  float d = bayer(g) - 0.5;
  vec3 col = floor(gr * 7.0 + 0.5 + d * 0.9) / 7.0, bg = col;
  vec4 b = texture2D(tBones, s);
  float an = max(max(texture2D(tBones, s + vec2(cs.x, 0.0)).a, texture2D(tBones, s - vec2(cs.x, 0.0)).a),
                 max(texture2D(tBones, s + vec2(0.0, cs.y)).a, texture2D(tBones, s - vec2(0.0, cs.y)).a));
  if(b.a > 0.5){ col = floor((b.rgb / b.a) * 10.0 + 0.5 + d * 0.5) / 10.0; }
  else if(an > 0.5){ col = vec3(0.12, 0.06, 0.15); }
  gl_FragColor = vec4(lens((g + 0.5) * uCell, col, bg, b.rgb), 1.0);
}`,
  // 3 — ASCII terminal
  /* glsl */`
void main(){
  vec2 cell = vec2(uCell, uCell * 2.0);
  vec2 g = floor(gl_FragCoord.xy / cell);
  vec2 f = fract(gl_FragCoord.xy / cell);
  vec2 cs = cell / uRes;
  vec2 s = src((g + 0.5) * cs);
  vec3 vid = video4(s, cs * 0.25);
  float Lv = luma(vid);
  vec4 b = (texture2D(tBones, s) + texture2D(tBones, s + cs*0.25) + texture2D(tBones, s - cs*0.25)) / 3.0;
  float lumV = pow(Lv, 1.25) * mix(0.42, 0.9, uReal);
  vec3 tintV = mix(mix(vec3(0.04, 0.36, 0.26), vec3(0.14, 0.62, 0.5), Lv), vid * 1.2, uReal);
  float lum = lumV; vec3 tint = tintV;
  if(b.a > 0.3){
    vec3 bc = b.rgb / max(b.a, 0.01);
    lum = 0.4 + 0.6 * clamp(luma(bc), 0.0, 1.0);
    tint = mix(vec3(0.8, 1.0, 0.88), bc, 0.7) * 1.45;
  }
  float idx = floor(lum * (uGlyphN - 1.0) + 0.5);
  float gl = texture2D(tGlyph, vec2((idx + f.x) / uGlyphN, f.y)).r;
  vec3 col = tint * gl + vec3(0.0, 0.012, 0.009), bg = col;
  if(uLens.w > 0.002){
    float glV = texture2D(tGlyph, vec2((floor(lumV * (uGlyphN - 1.0) + 0.5) + f.x) / uGlyphN, f.y)).r;
    bg = tintV * glV + vec3(0.0, 0.012, 0.009);
  }
  gl_FragColor = vec4(lens((g + 0.5) * cell, col, bg, b.rgb), 1.0);
}`,
];

const DOWN = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main(){
  vec4 c = texture2D(tSrc, vUv) * 4.0;
  c += texture2D(tSrc, vUv + uTexel) + texture2D(tSrc, vUv - uTexel);
  c += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)) + texture2D(tSrc, vUv + vec2(-uTexel.x, uTexel.y));
  gl_FragColor = c / 8.0;
}`;
const UP = /* glsl */`
precision highp float; varying vec2 vUv; uniform sampler2D tSrc, tAdd; uniform vec2 uTexel;
void main(){
  vec4 c = texture2D(tSrc, vUv + vec2(-uTexel.x*2.0, 0.0)) + texture2D(tSrc, vUv + vec2(uTexel.x*2.0, 0.0));
  c += texture2D(tSrc, vUv + vec2(0.0, -uTexel.y*2.0)) + texture2D(tSrc, vUv + vec2(0.0, uTexel.y*2.0));
  c += (texture2D(tSrc, vUv + uTexel) + texture2D(tSrc, vUv - uTexel) + texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)) + texture2D(tSrc, vUv + vec2(-uTexel.x, uTexel.y))) * 2.0;
  gl_FragColor = c / 12.0 + texture2D(tAdd, vUv);
}`;

const FINAL = /* glsl */`
precision highp float; varying vec2 vUv;
uniform sampler2D tComp, tBloom, tBlur; uniform int uStyle; uniform float uTime, uFlash; uniform vec2 uRes;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec3 c = texture2D(tComp, uv).rgb;
  vec3 bl = texture2D(tBloom, uv).rgb * 0.2;
  vec2 d = uv - 0.5;
  float vig = smoothstep(0.95, 0.25, length(d * vec2(1.0, uRes.y / uRes.x) * 1.5));
  vec3 col;
  if(uStyle == 0){
    float r2 = dot(d, d);
    c.r = texture2D(tComp, uv + d * r2 * 0.014).r;
    c.b = texture2D(tComp, uv - d * r2 * 0.014).b;
    col = c + bl * 0.85;
    float sy = 1.0 - fract(uTime * 0.11);
    float bar = exp(-pow((uv.y - sy) * 30.0, 2.0));
    col += vec3(0.2, 0.6, 1.0) * bar * 0.07 + col * bar * 0.55;
    col *= 0.965 + 0.035 * sin(uv.y * uRes.y * 1.3);
    col += (hash(uv * uRes + fract(uTime) * 91.0) - 0.5) * 0.05;
    col *= mix(0.5, 1.0, vig);
  } else if(uStyle == 1){
    col = c + max(bl - 0.55, 0.0) * 0.35;
    col *= mix(0.86, 1.0, vig);
  } else if(uStyle == 2){
    float ts = smoothstep(0.2, 0.5, abs(uv.y - 0.5));
    col = mix(c, texture2D(tBlur, uv).rgb, ts * 0.9);
    col += max(bl - 0.55, 0.0) * vec3(1.0, 0.85, 0.6) * 0.55;
    float shaft = smoothstep(1.0, 0.0, uv.x * 0.9 + (1.0 - uv.y) * 0.75);
    col += vec3(1.0, 0.8, 0.48) * shaft * 0.12;
    float asp = uRes.x / uRes.y;
    for(int i = 0; i < 16; i++){
      float fi = float(i);
      vec2 p = vec2(fract(h1(fi * 1.7) + uTime * 0.012 * (0.4 + h1(fi))),
                    fract(h1(fi * 3.1) + uTime * 0.018 * (0.3 + h1(fi * 5.0)) + 0.03 * sin(uTime * 0.7 + fi)));
      float dd = length((uv - p) * vec2(asp, 1.0));
      col += vec3(1.0, 0.88, 0.6) * smoothstep(0.011, 0.0, dd) * 0.55 * (0.5 + 0.5 * sin(uTime * 1.8 + fi * 2.0));
    }
    col *= mix(0.55, 1.0, vig);
  } else {
    col = c + bl * 1.0;
    col *= 0.9 + 0.1 * sin(uv.y * uRes.y * 1.5708);
    col *= mix(0.55, 1.0, vig) * (0.975 + 0.025 * sin(uTime * 47.0));
  }
  col += uFlash * vec3(0.7, 0.9, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

function glyphAtlas() {
  const chars = " .`'-,:;_~\"^!i|/\\<>+=?l1(){}[]*tjrvcxzsfIJLTYuneoa7FC2ZES53khdbpqyAVXG4PUKgwO6HR9D0NmQB8W&M#%$@";
  const cw = 28, ch = 56;
  const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch;
  const tx = tmp.getContext('2d', { willReadFrequently: true });
  const font = `600 ${Math.round(ch * 0.78)}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
  const meas = [];
  for (const c of chars) {
    tx.fillStyle = '#000'; tx.fillRect(0, 0, cw, ch);
    tx.fillStyle = '#fff'; tx.font = font; tx.textAlign = 'center'; tx.textBaseline = 'middle';
    tx.fillText(c, cw / 2, ch / 2 + 2);
    const d = tx.getImageData(0, 0, cw, ch).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i];
    meas.push([c, sum]);
  }
  meas.sort((a, b) => a[1] - b[1]);
  // thin the ramp to evenly spaced densities
  const N = 40, pick = [];
  const max = meas[meas.length - 1][1];
  for (let i = 0; i < N; i++) {
    const target = Math.pow(i / (N - 1), 1.15) * max;
    let best = meas[0];
    for (const m of meas) if (Math.abs(m[1] - target) < Math.abs(best[1] - target)) best = m;
    pick.push(best[0]);
  }
  const cv = document.createElement('canvas'); cv.width = cw * N; cv.height = ch;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, ch);
  cx.fillStyle = '#fff'; cx.font = font; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  pick.forEach((c, i) => cx.fillText(c, i * cw + cw / 2, ch / 2 + 2));
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return { tex: t, n: N };
}

function placeholderTexture() {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
  const cx = cv.getContext('2d');
  const g = cx.createRadialGradient(160, 80, 10, 160, 90, 190);
  g.addColorStop(0, '#59606e'); g.addColorStop(0.55, '#2c313c'); g.addColorStop(1, '#14161c');
  cx.fillStyle = g; cx.fillRect(0, 0, 320, 180);
  const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.autoClear = false;
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 1, 20000);
    this.camera.position.z = 8000;
    this.W = 1280; this.H = 720;
    this.mirror = true; this.real = 0; this.style = 0; this.flash = 0;
    this.zoom = { k: 1, cx: 0, cy: 0 }; this.zoomT = null; this.dim = 1; this.dimT = 1;
    this.placeholder = placeholderTexture();
    this.videoTex = this.placeholder;
    const glyph = glyphAtlas();
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    const U = this.U = {
      tVideo: { value: this.videoTex }, tBones: { value: null }, tGlyph: { value: glyph.tex },
      uVid: { value: new THREE.Vector4(0, 0, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) },
      uMirror: { value: 1 }, uTime: { value: 0 }, uReal: { value: 0 }, uCell: { value: 4 }, uGlyphN: { value: glyph.n }, uDim: { value: 1 },
      uLens: { value: new THREE.Vector4(0, 0, 0, 0) }, uLensC: { value: new THREE.Vector3(0.44, 0.83, 1) },
    };
    this.lens = { x: 0, y: 0, r: 0, a: 0 };        // CSS pixels; a = how far the lens view is switched on
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mComp = COMPOSITE.map((f) => mk(HEAD + f, U));
    this.mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mFinal = mk(FINAL, { tComp: { value: null }, tBloom: { value: null }, tBlur: { value: null }, uStyle: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uRes: U.uRes });
    this.levels = 5;
    this.resize();
  }

  setSource(el, W, H) {
    this.W = W; this.H = H;
    if (!el) { this.videoTex = this.placeholder; }
    else {
      const t = el.tagName === 'VIDEO' ? new THREE.VideoTexture(el) : new THREE.Texture(el);
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
      this.videoTex = t;
    }
    this.U.tVideo.value = this.videoTex;
    this.fit();
  }

  resize() {
    const cw = Math.max(2, this.canvas.clientWidth || window.innerWidth), ch = Math.max(2, this.canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = cw; this.ch = ch; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cw, ch, false);
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtBones?.dispose(); this.rtComp?.dispose();
    this.rtBones = new THREE.WebGLRenderTarget(w, h, { ...opt, depthBuffer: true, samples: 4 });
    this.rtComp = new THREE.WebGLRenderTarget(w, h, opt);
    (this.down || []).forEach((t) => t.dispose()); (this.up || []).forEach((t) => t.dispose());
    this.down = []; this.up = [];
    let lw = w, lh = h;
    for (let i = 0; i < this.levels; i++) {
      lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
      this.down.push(new THREE.WebGLRenderTarget(lw, lh, opt));
      this.up.push(new THREE.WebGLRenderTarget(lw, lh, opt));
    }
    this.U.uRes.value.set(w, h);
    this.fit();
  }

  // "cover" fit of the video inside the canvas
  fit() {
    const { W, H, cw, ch } = this;
    const sc = this.contain ? Math.min(cw / W, ch / H) : Math.max(cw / W, ch / H);
    let vw = cw / sc, vh = ch / sc, ox = (W - vw) / 2, oy = (H - vh) / 2;
    if (this.debugView) {           // ?zoom=&cx=&cy= : inspect a region close up
      const z = this.debugView;
      vw /= z.k; vh /= z.k; ox = z.cx - vw / 2; oy = z.cy - vh / 2;
    }
    this.base = { ox, oy, vw, vh };
    const z = this.zoom;
    if (z.k > 1.001 && !this.debugView) {       // lesson close-up, kept inside the picture
      vw /= z.k; vh /= z.k;
      ox = Math.min(this.base.ox + this.base.vw - vw, Math.max(this.base.ox, z.cx - vw / 2));
      oy = Math.min(this.base.oy + this.base.vh - vh, Math.max(this.base.oy, z.cy - vh / 2));
    } else { z.cx = ox + vw / 2; z.cy = oy + vh / 2; }
    this.view = { ox, oy, vw, vh };
    const c = this.camera;
    c.left = ox; c.right = ox + vw; c.bottom = oy; c.top = oy + vh;
    c.updateProjectionMatrix();
    this.U.uVid.value.set(ox / W, oy / H, vw / W, vh / H);
  }

  // glide the view toward a close-up ({ k, cx, cy } in scene pixels) or back to the whole picture (null)
  setFocus(f) { this.zoomT = f; }
  tick(dt) {
    const z = this.zoom, T = this.zoomT, b = this.base;
    this.dim += (this.dimT - this.dim) * Math.min(1, dt * 3);
    this.U.uDim.value = this.dim;
    if (!T && z.k <= 1.001) { if (z.k !== 1) { z.k = 1; this.fit(); } return; }
    const a = 1 - Math.exp(-dt * 3.2);
    z.k += ((T ? T.k : 1) - z.k) * a;
    z.cx += ((T ? T.cx : b.ox + b.vw / 2) - z.cx) * a;
    z.cy += ((T ? T.cy : b.oy + b.vh / 2) - z.cy) * a;
    this.fit();
  }
  // a point of the whole (un-zoomed) picture -> CSS pixel
  projectBase(v, out) {
    const { ox, oy, vw, vh } = this.base;
    let x = ((v.x - ox) / vw) * this.cw;
    if (this.mirror) x = this.cw - x;
    out.x = x; out.y = this.ch - ((v.y - oy) / vh) * this.ch;
    return out;
  }

  // scene point -> CSS pixel on the canvas
  project(v, out) {
    const { ox, oy, vw, vh } = this.view;
    let x = ((v.x - ox) / vw) * this.cw;
    if (this.mirror) x = this.cw - x;
    out.x = x; out.y = this.ch - ((v.y - oy) / vh) * this.ch;
    return out;
  }
  // CSS pixel -> NDC for raycasting
  ndc(px, py, out) {
    let x = (px / this.cw) * 2 - 1;
    if (this.mirror) x = -x;
    out.x = x; out.y = 1 - (py / this.ch) * 2;
    return out;
  }
  pxPerUnit() { return this.cw / this.view.vw; }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene, time) {
    const r = this.renderer, U = this.U, st = this.style;
    U.uTime.value = time; U.uMirror.value = this.mirror ? 1 : 0; U.uReal.value = this.real;
    const L = this.lens, k = this.dpr;
    U.uLens.value.set(L.x * k, (this.ch - L.y) * k, L.r * k, L.a);
    const h = U.uRes.value.y;
    U.uCell.value = st === 2 ? Math.max(3, Math.round(h / 215)) : Math.max(7, Math.round(h / 118));
    // 1. bones
    r.setRenderTarget(this.rtBones);
    r.setClearColor(0x000000, 0); r.clear(true, true, true);
    r.render(scene, this.camera);
    // 2. style composite
    U.tBones.value = this.rtBones.texture;
    this.pass(this.mComp[st], this.rtComp);
    // 3. blur pyramid
    let srcT = this.rtComp;
    for (let i = 0; i < this.levels; i++) {
      this.mDown.uniforms.tSrc.value = srcT.texture;
      this.mDown.uniforms.uTexel.value.set(1 / srcT.width, 1 / srcT.height);
      this.pass(this.mDown, this.down[i]);
      srcT = this.down[i];
    }
    let prev = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.mUp.uniforms.tSrc.value = prev.texture;
      this.mUp.uniforms.tAdd.value = this.down[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      this.pass(this.mUp, this.up[i]);
      prev = this.up[i];
    }
    // 4. final grade
    const F = this.mFinal.uniforms;
    F.tComp.value = this.rtComp.texture; F.tBloom.value = this.up[0].texture; F.tBlur.value = this.down[1].texture;
    F.uStyle.value = st; F.uTime.value = time; F.uFlash.value = this.flash;
    this.pass(this.mFinal, null);
  }
}
