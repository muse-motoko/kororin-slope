// ポストエフェクト：シーンを一度バッファに描き、ブルーム（明るい所のにじみ）→ チルトシフト → ヴィネットを重ねて画面に出す。
// Three.js 本体だけで書いた自前実装（vendor に addons は無いため）。使えない環境では enabled にならず、通常描画に戻る。
import * as THREE from '../vendor/three.module.min.js';
import { POST } from './config.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT = `
varying vec2 vUv; uniform sampler2D tex; uniform float threshold, knee;
void main(){
  vec3 c = texture2D(tex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - threshold + knee) / (2.0 * knee), 0.0, 1.0);
  gl_FragColor = vec4(c * (k * k * (3.0 - 2.0 * k)) * step(threshold - knee, l), 1.0);
}`;

const BLUR = `
varying vec2 vUv; uniform sampler2D tex; uniform vec2 dir;
void main(){
  vec3 s = texture2D(tex, vUv).rgb * 0.227027;
  s += (texture2D(tex, vUv + dir * 1.3846).rgb + texture2D(tex, vUv - dir * 1.3846).rgb) * 0.316216;
  s += (texture2D(tex, vUv + dir * 3.2308).rgb + texture2D(tex, vUv - dir * 3.2308).rgb) * 0.070270;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMPOSITE = `
varying vec2 vUv; uniform sampler2D scene, bloom; uniform vec2 px;
uniform float bloomI, focusY, band, tilt, vig, vigSoft, useBloom, useTilt, useVig;
void main(){
  vec3 c = texture2D(scene, vUv).rgb;
  if (useTilt > 0.5) {
    float r = smoothstep(0.0, 0.45, max(0.0, abs(vUv.y - focusY) - band)) * tilt;
    if (r > 0.05) {
      vec3 s = c; float w = 1.0;
      for (int i = 1; i <= 12; i++) {
        float a = float(i) * 2.399963, d = sqrt(float(i) / 12.0) * r;
        s += texture2D(scene, vUv + vec2(cos(a), sin(a)) * d * px).rgb; w += 1.0;
      }
      c = s / w;
    }
  }
  if (useBloom > 0.5) c += texture2D(bloom, vUv).rgb * bloomI;
  if (useVig > 0.5) {
    vec2 q = (vUv - 0.5) * vec2(1.0, 0.9);
    c *= 1.0 - vig * smoothstep(vigSoft * 0.5, vigSoft + 0.35, length(q) * 1.4142);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function createPost(renderer) {
  let ok = true, rtScene = null, rtA = null, rtB = null;
  const quad = new THREE.Mesh(new THREE.BufferGeometry(), null);
  quad.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  quad.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  quad.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fs = new THREE.Scene();
  fs.add(quad);
  const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const bright = mk(BRIGHT, { tex: { value: null }, threshold: { value: POST.bloomThreshold }, knee: { value: POST.bloomKnee } });
  const blur = mk(BLUR, { tex: { value: null }, dir: { value: new THREE.Vector2() } });
  const comp = mk(COMPOSITE, {
    scene: { value: null }, bloom: { value: null }, px: { value: new THREE.Vector2() },
    bloomI: { value: POST.bloomIntensity }, focusY: { value: 1 - POST.tiltFocusY }, band: { value: POST.tiltBand }, tilt: { value: POST.tiltStrength },
    vig: { value: POST.vignette }, vigSoft: { value: POST.vignetteSoft }, useBloom: { value: 1 }, useTilt: { value: 1 }, useVig: { value: 1 },
  });
  const u = comp.uniforms;
  const draw = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fs, cam); };

  function dispose() { [rtScene, rtA, rtB].forEach((t) => t && t.dispose()); rtScene = rtA = rtB = null; }
  // w, h は描画バッファのピクセル数
  function setSize(w, h) {
    dispose();
    try {
      const opt = { type: THREE.HalfFloatType, depthBuffer: true, samples: 4, colorSpace: THREE.LinearSRGBColorSpace };
      rtScene = new THREE.WebGLRenderTarget(w, h, opt);
      const bw = Math.max(2, Math.round(w * POST.bloomScale)), bh = Math.max(2, Math.round(h * POST.bloomScale));
      const o2 = { type: THREE.HalfFloatType, depthBuffer: false, colorSpace: THREE.LinearSRGBColorSpace };
      rtA = new THREE.WebGLRenderTarget(bw, bh, o2); rtB = new THREE.WebGLRenderTarget(bw, bh, o2);
      u.px.value.set(1 / w, 1 / h);
    } catch (e) { ok = false; dispose(); }
  }

  // 3つのエフェクトは個別にも切れる（cfg の bloom / tilt / vignette）
  function render(scene, camera, cfg) {
    if (!ok || !rtScene) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
    u.useBloom.value = cfg.bloom ? 1 : 0; u.useTilt.value = cfg.tilt ? 1 : 0; u.useVig.value = cfg.vignette ? 1 : 0;
    if (cfg.bloom) {
      bright.uniforms.tex.value = rtScene.texture; draw(bright, rtA);
      const bw = rtA.width, bh = rtA.height;
      blur.uniforms.tex.value = rtA.texture; blur.uniforms.dir.value.set(POST.bloomRadius / bw, 0); draw(blur, rtB);
      blur.uniforms.tex.value = rtB.texture; blur.uniforms.dir.value.set(0, POST.bloomRadius / bh); draw(blur, rtA);
      u.bloom.value = rtA.texture;
    }
    u.scene.value = rtScene.texture;
    draw(comp, null);
  }
  return { setSize, render, dispose, get ok() { return ok; } };
}
