import * as THREE from 'three';

// One shader, four looks. Style: 0 X-ray, 1 clay toy, 2 HD-2D pixel, 3 ASCII.
export const STYLES = ['xray', 'toy', 'pixel', 'ascii'];

const c = (hex) => new THREE.Color(hex);
// per tissue: x-ray tint + density, then [light, shade] pairs for the opaque styles
export const TISSUES = {
  bone:      { layer: 'bone',  xr: [0.78, 0.92, 1.0], dens: 1.0,  toy: ['#f6ead4', '#c9967c'], pix: ['#fff2d2', '#7a5560'], asc: '#eafff2', grain: 2.2 },
  cartilage: { layer: 'bone',  xr: [0.45, 0.8, 0.95], dens: 0.42, toy: ['#c9ecff', '#7fb4ee'], pix: ['#b9dcd6', '#5d8a96'], asc: '#9fe8ff', grain: 1.2 },
  brain:     { layer: 'organ', xr: [1.0, 0.55, 0.8],  dens: 0.5,  toy: ['#ffc6d8', '#ee86b0'], pix: ['#f2a7b8', '#a85a80'], asc: '#ff9fd0', grain: 0.9 },
  eye:       { layer: 'organ', xr: [0.7, 0.9, 1.0],   dens: 0.5,  toy: ['#ffffff', '#b9c8ee'], pix: ['#ffffff', '#8f9ac0'], asc: '#ffffff', grain: 0.5 },
  heart:     { layer: 'organ', xr: [1.0, 0.3, 0.26],  dens: 0.85, toy: ['#ff5f74', '#c22455'], pix: ['#e2504c', '#7e2440'], asc: '#ff5a5a', grain: 0.7 },
  lung:      { layer: 'organ', xr: [0.4, 0.72, 1.0],  dens: 0.3,  toy: ['#ffb7c6', '#ea7c9c'], pix: ['#e8a0a0', '#a05a70'], asc: '#ffb0c0', grain: 0.8 },
  liver:     { layer: 'organ', xr: [0.95, 0.5, 0.22], dens: 0.42, toy: ['#d36c46', '#93382b'], pix: ['#b85a3c', '#6e2c2c'], asc: '#ff9a50', grain: 0.6 },
  stomach:   { layer: 'organ', xr: [1.0, 0.72, 0.35], dens: 0.45, toy: ['#ffba82', '#e67d4e'], pix: ['#e8a868', '#a0603c'], asc: '#ffd070', grain: 0.6 },
  colon:     { layer: 'organ', xr: [0.95, 0.62, 0.5], dens: 0.36, toy: ['#f89c8c', '#cf5e62'], pix: ['#d88470', '#8c4648'], asc: '#ffa090', grain: 0.6 },
  intestine: { layer: 'organ', xr: [1.0, 0.75, 0.6],  dens: 0.3,  toy: ['#ffc9ae', '#ef9478'], pix: ['#eeb490', '#a86c58'], asc: '#ffc8a0', grain: 0.6 },
  kidney:    { layer: 'organ', xr: [0.8, 0.45, 1.0],  dens: 0.45, toy: ['#b96ad6', '#7a3aa0'], pix: ['#9a5aa8', '#5a3068'], asc: '#d090ff', grain: 0.6 },
};

const VERT = /* glsl */`
uniform float uInflate;
uniform vec4 uSphere;
attribute float ao;
varying vec3 vN; varying vec3 vL; varying float vDepth; varying float vAO;
void main(){
  vL = position; vAO = ao;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position + normal * uInflate, 1.0);
  // how near this point is within its own bone: +1 nearest the viewer, -1 farthest
  float zc = (modelViewMatrix * vec4(uSphere.xyz, 1.0)).z;
  vDepth = (mv.z - zc) / (uSphere.w * length(modelViewMatrix[2].xyz));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision highp float;
uniform int uStyle;
uniform vec3 uColA, uColB;
uniform float uDensity, uAlpha, uHi, uGrain, uTime, uFront, uEye, uLit;
uniform vec4 uHiS, uTint;
varying vec3 vN; varying vec3 vL; varying float vDepth; varying float vAO;

float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float bayer(vec2 p){
  vec2 q = floor(mod(p, 4.0));
  float i = q.x + q.y*4.0;
  float m = 0.0;
  if(i<1.)m=0.;else if(i<2.)m=8.;else if(i<3.)m=2.;else if(i<4.)m=10.;
  else if(i<5.)m=12.;else if(i<6.)m=4.;else if(i<7.)m=14.;else if(i<8.)m=6.;
  else if(i<9.)m=3.;else if(i<10.)m=11.;else if(i<11.)m=1.;else if(i<12.)m=9.;
  else if(i<13.)m=15.;else if(i<14.)m=7.;else if(i<15.)m=13.;else m=5.;
  return (m+0.5)/16.0;
}
void main(){
  vec3 n = normalize(vN);
  if(!gl_FrontFacing) n = -n;
  float hi = uHi;
  if(uHiS.w > 0.0) hi *= 1.0 - smoothstep(uHiS.w*0.55, uHiS.w, distance(vL, uHiS.xyz));
  float pulse = 0.75 + 0.25*sin(uTime*6.0);
  vec3 col;
  if(uStyle == 0){
    // X-ray: more material is crossed at grazing angles, so edges glow
    float edge = pow(1.0 - abs(n.z), 1.7);
    float tr = noise(vL*uGrain)*0.6 + noise(vL*uGrain*2.9)*0.4;
    // faint relief on surfaces that face the viewer, fading with depth, so cavities read as dark
    float front = gl_FrontFacing ? pow(max(n.z, 0.0), 1.4) * smoothstep(-0.3, 0.9, vDepth) * vAO * vAO : 0.0;
    float I = uDensity * ((0.04 + 1.0*edge) * (0.68 + 0.64*tr) + uFront * front * (0.8 + 0.4*tr));
    // lessons: bones not yet "developed" stay faint; a tint marks the ones being talked about
    I *= mix(0.2, 1.0, max(uLit, uTint.a * 0.7));
    col = mix(uColA, uTint.rgb, uTint.a) * I * (1.0 + 0.45*uTint.a) + vec3(1.0,0.78,0.3) * hi * pulse * (0.22 + 0.9*edge);
    gl_FragColor = vec4(col * uAlpha, 1.0);
    return;
  }
  if(uAlpha < 0.999 && bayer(gl_FragCoord.xy) > uAlpha) discard;
  if(uStyle == 1){
    // glossy clay / vinyl toy
    vec3 L = normalize(vec3(-0.5, 0.7, 0.55));
    float wrap = smoothstep(-0.35, 0.9, dot(n, L));
    col = mix(uColB, uColA, wrap);
    float fres = pow(1.0 - max(n.z, 0.0), 2.2);
    col *= mix(1.0, 0.7, fres);                          // soft contact darkening toward silhouettes
    col = mix(uColB * 0.42, col, smoothstep(0.0, 1.0, vAO));  // baked cavity shadow
    vec3 hv = normalize(L + vec3(0.0,0.0,1.0));
    float nh = max(dot(n, hv), 0.0);
    col += vec3(1.0) * (smoothstep(0.955, 0.99, nh)*0.38 + pow(nh, 14.0)*0.08);
    float rim = pow(1.0 - max(n.z, 0.0), 3.0) * smoothstep(-0.2, 0.7, dot(n, normalize(vec3(0.75,-0.3,0.2))));
    col += vec3(0.62,0.74,1.0) * rim * 0.38;
    col += uColA * 0.06 * max(-n.y, 0.0);
    col = mix(col, vec3(1.0,0.85,0.25), hi*0.5*pulse);
  } else if(uStyle == 2){
    // banded sprite shading
    vec3 L = normalize(vec3(-0.55, 0.62, 0.5));
    float l = (dot(n, L)*0.5 + 0.5) * mix(0.35, 1.0, vAO);
    float band = l > 0.76 ? 1.0 : (l > 0.52 ? 0.74 : (l > 0.3 ? 0.46 : 0.22));
    col = mix(uColB*0.5, uColA, band);
    if(l > 0.94) col = mix(col, vec3(1.0), 0.55);
    col = mix(col, vec3(1.0,0.92,0.4), hi*0.6);
  } else {
    float l = (dot(n, normalize(vec3(-0.4,0.6,0.7)))*0.5 + 0.5) * mix(0.3, 1.0, vAO);
    col = uColA * (0.3 + 0.7*l*l) + vec3(1.0,0.9,0.5)*hi*0.5;
  }
  col = mix(col, uTint.rgb * (0.4 + 0.75*dot(col, vec3(0.3,0.59,0.11))), uTint.a * 0.85);
  float dark = 1.0 - max(uLit, uTint.a * 0.7);
  col = mix(col, mix(vec3(dot(col, vec3(0.3,0.59,0.11))), col, 0.3) * (uStyle == 3 ? 0.3 : 0.45), dark);
  if(uEye > 0.5){
    // iris + pupil painted on the front of the eyeball
    float zz = vL.z / 1.2;
    vec3 iris = uStyle == 3 ? vec3(0.4, 1.0, 0.9) : vec3(0.24, 0.5, 0.78);
    col = mix(col, iris * (0.75 + 0.25 * zz), smoothstep(0.70, 0.74, zz));
    col = mix(col, vec3(0.04, 0.03, 0.06), smoothstep(0.895, 0.92, zz));
    if(uStyle == 1) col += vec3(1.0) * smoothstep(0.03, 0.0, distance(vL.xy, vec2(-0.3, 0.32)) - 0.1) * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeMaterial(tissueKey) {
  const t = TISSUES[tissueKey];
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uStyle: { value: 0 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() },
      uDensity: { value: t.dens }, uAlpha: { value: 1 }, uHi: { value: 0 }, uHiS: { value: new THREE.Vector4(0, 0, 0, -1) },
      uGrain: { value: t.grain }, uTime: { value: 0 }, uInflate: { value: 0 }, uFront: { value: 0.14 }, uEye: { value: tissueKey === 'eye' ? 1 : 0 }, uLit: { value: 1 }, uTint: { value: new THREE.Vector4(0.3, 1, 0.85, 0) }, uSphere: { value: new THREE.Vector4(0, 0, 0, 1) },
    },
  });
  m.userData.tissue = t;
  return m;
}

export function applyStyle(m, style, inflate = 0) {
  const t = m.userData.tissue, u = m.uniforms;
  u.uStyle.value = style;
  if (style === 0) {
    u.uColA.value.setRGB(t.xr[0], t.xr[1], t.xr[2]);
    m.transparent = true; m.depthTest = false; m.depthWrite = false; m.side = THREE.DoubleSide;
    m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor;
    u.uInflate.value = 0;
  } else {
    const pair = style === 1 ? t.toy : t.pix;
    if (style === 3) { u.uColA.value.copy(c(t.asc)); u.uColB.value.copy(c(t.asc)); }
    else { u.uColA.value.copy(c(pair[0])); u.uColB.value.copy(c(pair[1])); }
    m.transparent = false; m.depthTest = true; m.depthWrite = true; m.side = THREE.FrontSide;
    m.blending = THREE.NoBlending;
    u.uInflate.value = style === 1 ? inflate : 0;
  }
  m.needsUpdate = true;
}
