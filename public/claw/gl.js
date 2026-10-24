/* Malý vlastní 3D engine nad WebGL (bez externích knihoven).
 * Meshe (koule, kvádr, válec/kužel, rovina), osvětlení Blinn-Phong, průhlednost, textury, orbitální kamera. */
(function (global) {
  'use strict';

  // ---- matice 4×4 (po sloupcích) ------------------------------------------------------------------
  const M = {
    ident() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    chain(...ms) { return ms.reduce((a, b) => M.mul(a, b)); },
    translate(x, y, z) { const o = M.ident(); o[12] = x; o[13] = y; o[14] = z; return o; },
    scale(x, y, z) { const o = M.ident(); o[0] = x; o[5] = y; o[10] = z; return o; },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a), o = M.ident(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a), o = M.ident(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a), o = M.ident(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
    perspective(fovy, aspect, n, f) {
      const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = t / aspect; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f);
      return o;
    },
    lookAt(e, c, u) {
      let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2];
      let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
      let sx = fy * u[2] - fz * u[1], sy = fz * u[0] - fx * u[2], sz = fx * u[1] - fy * u[0];
      l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
      const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
      const o = M.ident();
      o[0] = sx; o[4] = sy; o[8] = sz;
      o[1] = ux; o[5] = uy; o[9] = uz;
      o[2] = -fx; o[6] = -fy; o[10] = -fz;
      o[12] = -(sx * e[0] + sy * e[1] + sz * e[2]);
      o[13] = -(ux * e[0] + uy * e[1] + uz * e[2]);
      o[14] = fx * e[0] + fy * e[1] + fz * e[2];
      return o;
    },
    normalMat(m) { // inverzní transpozice horní 3×3
      const a00 = m[0], a10 = m[1], a20 = m[2], a01 = m[4], a11 = m[5], a21 = m[6], a02 = m[8], a12 = m[9], a22 = m[10];
      const c00 = a11 * a22 - a12 * a21, c01 = -(a10 * a22 - a12 * a20), c02 = a10 * a21 - a11 * a20;
      const c10 = -(a01 * a22 - a02 * a21), c11 = a00 * a22 - a02 * a20, c12 = -(a00 * a21 - a01 * a20);
      const c20 = a01 * a12 - a02 * a11, c21 = -(a00 * a12 - a02 * a10), c22 = a00 * a11 - a01 * a10;
      let det = a00 * c00 + a01 * c01 + a02 * c02;
      if (Math.abs(det) < 1e-9) det = 1;
      const i = 1 / det;
      return new Float32Array([c00 * i, c10 * i, c20 * i, c01 * i, c11 * i, c21 * i, c02 * i, c12 * i, c22 * i]);
    },
  };

  // ---- geometrie ----------------------------------------------------------------------------------
  function sphereGeo(seg, rings) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const v = i / rings, th = v * Math.PI;
      for (let j = 0; j <= seg; j++) {
        const u = j / seg, ph = u * Math.PI * 2;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        pos.push(x, y, z); nor.push(x, y, z); uv.push(u, v);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return { pos, nor, uv, idx };
  }

  function boxGeo() {
    const pos = [], nor = [], uv = [], idx = [];
    const faces = [
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    ];
    for (const [n, r, u] of faces) {
      const base = pos.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push((n[0] + r[0] * a + u[0] * b) / 2, (n[1] + r[1] * a + u[1] * b) / 2, (n[2] + r[2] * a + u[2] * b) / 2);
        nor.push(n[0], n[1], n[2]); uv.push((a + 1) / 2, (b + 1) / 2);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { pos, nor, uv, idx };
  }

  /** Válec/kužel o výšce 1 (y od -0.5 do 0.5), poloměry rt (nahoře) a rb (dole). */
  function cylGeo(seg, rt, rb) {
    const pos = [], nor = [], uv = [], idx = [];
    const slope = rb - rt;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const l = Math.hypot(1, slope), nx = c / l, ny = slope / l, nz = s / l;
      pos.push(c * rt, 0.5, s * rt); nor.push(nx, ny, nz); uv.push(j / seg, 1);
      pos.push(c * rb, -0.5, s * rb); nor.push(nx, ny, nz); uv.push(j / seg, 0);
    }
    for (let j = 0; j < seg; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (const [y, r, ny] of [[0.5, rt, 1], [-0.5, rb, -1]]) {
      if (r <= 0) continue;
      const c0 = pos.length / 3;
      pos.push(0, y, 0); nor.push(0, ny, 0); uv.push(0.5, 0.5);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        pos.push(Math.cos(a) * r, y, Math.sin(a) * r); nor.push(0, ny, 0); uv.push(0.5, 0.5);
      }
      for (let j = 0; j < seg; j++) { if (ny > 0) idx.push(c0, c0 + j + 2, c0 + j + 1); else idx.push(c0, c0 + j + 1, c0 + j + 2); }
    }
    return { pos, nor, uv, idx };
  }

  function planeGeo() { // čtverec v rovině xy, normála +z
    return {
      pos: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      uv: [0, 0, 1, 0, 1, 1, 0, 1], idx: [0, 1, 2, 0, 2, 3],
    };
  }

  // ---- shadery --------------------------------------------------------------------------------------
  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec2 aUv;
uniform mat4 uVP; uniform mat4 uModel; uniform mat3 uNM;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vN = uNM * aNor; vUv = aUv;
  gl_Position = uVP * w;
}`;
  const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
uniform vec3 uCol; uniform vec3 uEmis; uniform vec3 uCam;
uniform float uAlpha; uniform float uShine; uniform float uSpec; uniform float uRim; uniform float uUnlit; uniform float uPat; uniform float uUseTex;
uniform vec3 uL1; uniform vec3 uL2; uniform vec3 uSky; uniform vec3 uGround;
uniform sampler2D uTex;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (!gl_FrontFacing) N = -N;
  vec4 t = vec4(1.0);
  if (uUseTex > 0.5) t = texture2D(uTex, vUv);
  vec3 base = uCol * t.rgb;
  if (uPat > 0.5) {
    float c = mod(floor(vW.x * 0.75) + floor(vW.z * 0.75), 2.0);
    base *= 0.78 + 0.22 * c;
  }
  vec3 col;
  if (uUnlit > 0.5) {
    col = base + uEmis;
  } else {
    float h = N.y * 0.5 + 0.5;
    vec3 amb = mix(uGround, uSky, h);
    float d1 = max(dot(N, uL1), 0.0);
    float d2 = max(dot(N, uL2), 0.0);
    vec3 H = normalize(uL1 + V);
    float sp = pow(max(dot(N, H), 0.0), uShine) * uSpec;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4) * uRim;
    col = base * (amb + d1 * vec3(1.0, 0.96, 0.88) * 0.78 + d2 * vec3(0.55, 0.65, 1.0) * 0.38)
        + vec3(sp) + rim * vec3(0.85, 0.92, 1.0) + uEmis;
  }
  float a = uAlpha * t.a;
  gl_FragColor = vec4(col, a);
}`;

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL není k dispozici');
      this.gl = gl; this.canvas = canvas;
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(p, 0, 'aPos'); gl.bindAttribLocation(p, 1, 'aNor'); gl.bindAttribLocation(p, 2, 'aUv');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(p));
      gl.useProgram(p); this.prog = p;
      this.u = {};
      for (const n of ['uVP', 'uModel', 'uNM', 'uCol', 'uEmis', 'uCam', 'uAlpha', 'uShine', 'uSpec', 'uRim', 'uUnlit', 'uPat', 'uUseTex', 'uL1', 'uL2', 'uSky', 'uGround', 'uTex']) this.u[n] = gl.getUniformLocation(p, n);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.meshes = {};
      this.add('sphere', sphereGeo(22, 16)); this.add('box', boxGeo()); this.add('plane', planeGeo());
      this.add('cyl', cylGeo(20, 0.5, 0.5)); this.add('cone', cylGeo(20, 0.0, 0.5)); this.add('cylhi', cylGeo(36, 0.5, 0.5));
      this.setLights();
      this.vp = M.ident();
      this.blend = false; this.depthW = true;
    }

    add(name, g) {
      const gl = this.gl;
      const mk = (data, target, Arr) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, new Arr(data), gl.STATIC_DRAW); return b; };
      this.meshes[name] = {
        pos: mk(g.pos, gl.ARRAY_BUFFER, Float32Array), nor: mk(g.nor, gl.ARRAY_BUFFER, Float32Array), uv: mk(g.uv, gl.ARRAY_BUFFER, Float32Array),
        idx: mk(g.idx, gl.ELEMENT_ARRAY_BUFFER, Uint16Array), n: g.idx.length,
      };
    }

    texture(canvas) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      return t;
    }

    updateTexture(tex, canvas) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    setLights() {
      const gl = this.gl, u = this.u;
      const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
      gl.uniform3fv(u.uL1, n([0.35, 0.9, 0.55]));
      gl.uniform3fv(u.uL2, n([-0.7, 0.35, -0.45]));
      gl.uniform3fv(u.uSky, [0.62, 0.6, 0.72]);
      gl.uniform3fv(u.uGround, [0.3, 0.24, 0.32]);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      this.gl.viewport(0, 0, w, h);
      return w / h;
    }

    begin(eye, target, fov, aspect, clear) {
      const gl = this.gl;
      this.eye = eye;
      this.vp = M.mul(M.perspective(fov, aspect, 0.5, 80), M.lookAt(eye, target, [0, 1, 0]));
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.u.uVP, false, this.vp);
      gl.uniform3fv(this.u.uCam, eye);
      gl.clearColor(clear[0], clear[1], clear[2], 1);
      gl.depthMask(true); this.depthW = true;
      gl.disable(gl.BLEND); this.blend = false;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    /** Vykreslí mesh s modelovou maticí m. Volby: color, alpha, emis, shine, spec, rim, unlit, pat, tex, noDepth, cull. */
    draw(name, m, o = {}) {
      const gl = this.gl, u = this.u, me = this.meshes[name];
      const col = o.color || [1, 1, 1];
      gl.uniformMatrix4fv(u.uModel, false, m);
      gl.uniformMatrix3fv(u.uNM, false, M.normalMat(m));
      gl.uniform3fv(u.uCol, col);
      gl.uniform3fv(u.uEmis, o.emis || [0, 0, 0]);
      const alpha = o.alpha == null ? 1 : o.alpha;
      gl.uniform1f(u.uAlpha, alpha);
      gl.uniform1f(u.uShine, o.shine || 24);
      gl.uniform1f(u.uSpec, o.spec == null ? 0.18 : o.spec);
      gl.uniform1f(u.uRim, o.rim || 0);
      gl.uniform1f(u.uUnlit, o.unlit ? 1 : 0);
      gl.uniform1f(u.uPat, o.pat ? 1 : 0);
      if (o.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.uniform1i(u.uTex, 0); gl.uniform1f(u.uUseTex, 1); } else gl.uniform1f(u.uUseTex, 0);
      const wantBlend = alpha < 1 || !!o.tex && !!o.blend || !!o.blend;
      if (wantBlend !== this.blend) { this.blend = wantBlend; wantBlend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND); }
      const dw = !o.noDepth;
      if (dw !== this.depthW) { this.depthW = dw; gl.depthMask(dw); }
      if (o.noCull) gl.disable(gl.CULL_FACE);
      gl.bindBuffer(gl.ARRAY_BUFFER, me.pos); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, me.nor); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, me.uv); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, me.idx);
      gl.drawElements(gl.TRIANGLES, me.n, gl.UNSIGNED_SHORT, 0);
      if (o.noCull) gl.enable(gl.CULL_FACE);
    }
  }

  global.MiniGL = { M, Renderer };
})(window);
