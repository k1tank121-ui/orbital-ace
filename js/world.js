'use strict';
/* 세계: 하늘 돔, 행성(바다), 구름, 별, 가스 행성, 섬, 소행성.
   하나의 연속된 공간에서 고도에 따라 하늘 → 성층권 → 우주로 자연스럽게 바뀐다. */
(function () {
  const T = THREE, C = G.C, R = C.PLANET_R;
  const W = (G.world = { spaceK: 0, cloudIn: 0, islands: [], asteroids: [], clusters: [] });

  const CL = 6500;                 // 구름 반복 영역 반폭
  const IL = 9000;                 // 섬 반복 영역 반폭
  const AL = 4200;                 // 소행성 반복 영역 반폭
  const A_MIN = 7900, A_MAX = 12000; // 소행성대 고도
  const N_AST = 320;

  const _q = new T.Quaternion(), _m = new T.Matrix4(), _s = new T.Vector3(), _p = new T.Vector3();
  const wrap = (d, L) => ((((d + L) % (2 * L)) + 2 * L) % (2 * L)) - L;

  const NOISE2 = `
    float hash(vec2 p){ p = mod(p, 289.0); vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
  `;
  const NOISE3 = `
    float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash3(i), hash3(i+vec3(1.0,0.0,0.0)), f.x), mix(hash3(i+vec3(0.0,1.0,0.0)), hash3(i+vec3(1.0,1.0,0.0)), f.x), f.y),
                 mix(mix(hash3(i+vec3(0.0,0.0,1.0)), hash3(i+vec3(1.0,0.0,1.0)), f.x), mix(hash3(i+vec3(0.0,1.0,1.0)), hash3(i+vec3(1.0,1.0,1.0)), f.x), f.y), f.z); }
    float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise3(p); p = p*2.02 + 3.7; a *= 0.5; } return v; }
  `;

  W.init = function (scene) {
    W.sun = new T.DirectionalLight(0xfff3df, 0.85);
    W.sun.position.copy(C.SUN).multiplyScalar(1000);
    scene.add(W.sun);
    W.hemi = new T.HemisphereLight(0xc4dcff, 0x3a566e, 0.5);
    scene.add(W.hemi);
    scene.fog = new T.FogExp2(0x9eccf5, 0.00014);
    buildSky(scene); buildPlanet(scene); buildStars(scene); buildGiant(scene);
    buildClouds(scene); buildIslands(scene); buildAsteroids(scene);
  };

  // ---------- 하늘 돔 ----------
  function buildSky(scene) {
    const mat = new T.ShaderMaterial({
      uniforms: { uSpace: { value: 0 }, uHorizon: { value: 0 }, uSun: { value: C.SUN }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uSpace; uniform float uHorizon; uniform float uTime; uniform vec3 uSun;
        varying vec3 vDir;
        ${NOISE3}
        void main(){
          vec3 d = normalize(vDir);
          float e = d.y - uHorizon;                 // 행성 가장자리 위로의 높이
          float sd = max(dot(d, uSun), 0.0);
          float t = pow(clamp(1.0 - e, 0.0, 1.0), 5.0);
          vec3 col = mix(vec3(0.07, 0.27, 0.70), vec3(0.62, 0.80, 0.96), t);
          col += vec3(1.0, 0.72, 0.42) * pow(sd, 10.0) * 0.2;
          if (uSpace > 0.001) {
            vec3 sp = vec3(0.004, 0.006, 0.018);
            float n1 = fbm3(d * 2.2 + vec3(0.0, 0.0, uTime * 0.004));
            float n2 = fbm3(d * 4.5 + 9.7);
            sp += vec3(0.42, 0.10, 0.62) * smoothstep(0.48, 0.85, n1) * 0.55;   // 보랏빛 성운
            sp += vec3(0.05, 0.38, 0.55) * smoothstep(0.52, 0.90, n2) * 0.40;   // 청록빛 성운
            float ee = max(e, 0.0);
            sp += vec3(0.22, 0.52, 1.0) * exp(-ee * 13.0) * 1.15;               // 대기층의 푸른 빛
            sp += vec3(0.80, 0.90, 1.0) * exp(-ee * 60.0) * 0.5;
            col = mix(col, sp, uSpace);
          }
          float disk = smoothstep(0.99930, 0.99975, dot(d, uSun));
          col += vec3(1.0, 0.95, 0.82) * (disk * 4.0 + pow(sd, 350.0) * 1.2 + pow(sd, 30.0) * 0.2);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: T.BackSide, depthTest: false, depthWrite: false,
    });
    const sky = (W.sky = new T.Mesh(new T.SphereGeometry(900, 32, 20), mat));
    sky.frustumCulled = false; sky.renderOrder = -1000;
    scene.add(sky);
  }

  // ---------- 행성 (바다 + 고고도에서 보이는 구름층) ----------
  function buildPlanet(scene) {
    const mat = new T.ShaderMaterial({
      uniforms: {
        uCam: { value: new T.Vector3() }, uCenter: { value: new T.Vector3() }, uSun: { value: C.SUN },
        uTime: { value: 0 }, uSpace: { value: 0 }, uCloud: { value: 0 },
      },
      vertexShader: `varying vec3 vW;
        void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uCam; uniform vec3 uCenter; uniform vec3 uSun;
        uniform float uTime; uniform float uSpace; uniform float uCloud;
        varying vec3 vW;
        ${NOISE2}
        void main(){
          vec2 p = vW.xz;
          vec3 toCam = uCam - vW;
          float dist = length(toCam);
          vec3 v = toCam / dist;
          vec3 N0 = normalize(vW - uCenter);
          // 바다색: 큰 스케일의 얕은 여울
          float sh = fbm(p * 0.00011);
          vec3 base = mix(vec3(0.012, 0.10, 0.29), vec3(0.05, 0.40, 0.50), smoothstep(0.50, 0.76, sh));
          // 파도 (가까운 곳만)
          float wf = exp(-dist * 0.0007);
          vec2 q = p * 0.025; float t = uTime;
          vec2 grad = 0.50 * vec2( 1.0,  0.6) * cos(dot(vec2( 1.0,  0.6), q) + t * 1.1)
                    + 0.40 * vec2(-0.7,  1.3) * cos(dot(vec2(-0.7,  1.3), q) + t * 1.4)
                    + 0.25 * vec2( 2.3, -1.1) * cos(dot(vec2( 2.3, -1.1), q) + t * 2.0)
                    + 0.20 * vec2(-1.9, -2.6) * cos(dot(vec2(-1.9, -2.6), q) + t * 2.6);
          float rip = noise(p * 0.11 + t * 0.7) - 0.5;
          vec3 n = normalize(N0 + vec3(-(grad.x * 0.20 + rip * 0.30), 0.0, -(grad.y * 0.20 - rip * 0.30)) * wf);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
          vec3 skyc = mix(vec3(0.30, 0.55, 0.92), vec3(0.70, 0.84, 0.97), fres);
          vec3 col = mix(base, skyc, 0.08 + fres * 0.72 * (1.0 - uSpace * 0.6));
          float diff = max(dot(N0, uSun), 0.0);
          col *= 0.38 + 0.78 * diff;
          vec3 h = normalize(v + uSun);
          float nh = max(dot(n, h), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(nh, 220.0) * 2.4 * wf + pow(nh, 36.0) * 0.22);
          // 고고도에서 내려다보는 구름층
          if (uCloud > 0.001) {
            float c = fbm(p * 0.00007 + vec2(t * 0.0015, 0.0)) * 0.75 + fbm(p * 0.00036 + 5.2) * 0.40;
            float cm = smoothstep(0.50, 0.78, c);
            col = mix(col, vec3(0.90, 0.92, 0.95) * (0.42 + 0.62 * diff), cm * uCloud);
          }
          // 대기 산란
          float haze = 1.0 - exp(-dist * mix(1.0 / 7000.0, 1.0 / 38000.0, uSpace));
          vec3 hazeCol = mix(vec3(0.62, 0.80, 0.96), vec3(0.30, 0.56, 1.0), uSpace);
          col = mix(col, hazeCol, haze * mix(1.0, 0.85, uSpace));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    // 플레이어 바로 아래를 꼭짓점으로 하는 구면 캡 (지평선 너머는 필요 없음)
    const geo = new T.SphereGeometry(R, 96, 80, 0, Math.PI * 2, 0, 0.62);
    const planet = (W.planet = new T.Mesh(geo, mat));
    planet.frustumCulled = false; planet.renderOrder = -500;
    scene.add(planet);
  }

  // ---------- 별 ----------
  function buildStars(scene) {
    const n = 3400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new T.Vector3();
    for (let i = 0; i < n; i++) {
      G.randDir(v); if (v.y < -0.45) v.y = -v.y;
      v.multiplyScalar(140000);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const b = Math.pow(Math.random(), 2.4) * 0.85 + 0.2, tint = Math.random();
      col[i * 3] = b * (tint < 0.2 ? 1.0 : 0.82); col[i * 3 + 1] = b * 0.88; col[i * 3 + 2] = b * (tint > 0.8 ? 0.7 : 1.0);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const mat = new T.PointsMaterial({ size: 2.1, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    mat.color.setRGB(1.9, 1.9, 1.9);
    const stars = (W.stars = new T.Points(geo, mat));
    stars.frustumCulled = false; stars.renderOrder = -900; stars.visible = false;
    scene.add(stars);
  }

  // ---------- 가스 행성과 달 (우주 배경) ----------
  function buildGiant(scene) {
    const g = (W.giant = new T.Group());
    const body = new T.Mesh(
      new T.SphereGeometry(13000, 48, 32),
      new T.MeshLambertMaterial({ map: G.tex.giant, emissive: 0x1a120c, transparent: true, opacity: 0, fog: false, depthWrite: false })
    );
    const ring = new T.Mesh(
      new T.RingGeometry(17500, 30000, 96, 1),
      new T.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uOpacity; varying vec2 vP;
          void main(){
            float r = (length(vP) - 17500.0) / 12500.0;
            float a = smoothstep(0.0, 0.04, r) * smoothstep(1.0, 0.92, r);
            a *= (0.55 + 0.45 * sin(r * 46.0)) * (0.6 + 0.4 * sin(r * 13.0 + 1.0));
            gl_FragColor = vec4(vec3(0.86, 0.76, 0.62), a * 0.75 * uOpacity);
          }`,
        transparent: true, depthWrite: false, side: T.DoubleSide,
      })
    );
    ring.rotation.x = Math.PI / 2 - 0.32; ring.rotation.y = 0.25;
    const moon = new T.Mesh(
      new T.SphereGeometry(2600, 24, 16),
      new T.MeshLambertMaterial({ color: 0xb9b4ad, emissive: 0x0c0c10, transparent: true, opacity: 0, fog: false, depthWrite: false })
    );
    moon.position.set(52000, 9000, 24000);
    g.add(body, ring, moon);
    g.traverse(o => { o.renderOrder = -800; o.frustumCulled = false; });
    g.visible = false;
    W.giantBody = body; W.giantRing = ring; W.moon = moon;
    W.giantDir = new T.Vector3(-0.56, 0.4, -0.73).normalize();
    scene.add(g);
  }

  // ---------- 구름 (인스턴스 빌보드, 플레이어 주변으로 무한 반복) ----------
  function buildClouds(scene) {
    const NC = 96, PER = 9, N = NC * PER;
    const iPos = new Float32Array(N * 3), iScale = new Float32Array(N), iSeed = new Float32Array(N), iShade = new Float32Array(N);
    let k = 0;
    for (let c = 0; c < NC; c++) {
      const cx = G.randS(CL), cz = G.randS(CL), cy = G.rand(520, 2300), size = G.rand(380, 820);
      W.clusters.push({ x: cx, y: cy + size * 0.12, z: cz, size: size * 1.15 });
      for (let j = 0; j < PER; j++, k++) {
        const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * size;
        const hy = G.rand(0, size * 0.34) * (1 - d / size * 0.7);
        iPos[k * 3] = cx + Math.cos(a) * d; iPos[k * 3 + 1] = cy + hy; iPos[k * 3 + 2] = cz + Math.sin(a) * d;
        iScale[k] = size * G.rand(0.7, 1.25);
        iSeed[k] = Math.random();
        iShade[k] = G.clamp(0.25 + (hy / (size * 0.34)) * 0.75, 0, 1);
      }
    }
    const base = new T.PlaneGeometry(1, 1);
    const geo = new T.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.setAttribute('iPos', new T.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iScale', new T.InstancedBufferAttribute(iScale, 1));
    geo.setAttribute('iSeed', new T.InstancedBufferAttribute(iSeed, 1));
    geo.setAttribute('iShade', new T.InstancedBufferAttribute(iShade, 1));
    geo.instanceCount = N;
    const mat = new T.ShaderMaterial({
      uniforms: { uTex: { value: G.tex.puff }, uCam: { value: new T.Vector3() }, uL: { value: CL }, uR: { value: R }, uOpacity: { value: 1 } },
      vertexShader: `
        attribute vec3 iPos; attribute float iScale; attribute float iSeed; attribute float iShade;
        uniform vec3 uCam; uniform float uL; uniform float uR;
        varying vec2 vUv; varying float vFade; varying float vShade; varying float vHaze;
        void main(){
          vec3 rel;
          rel.xz = mod(iPos.xz - uCam.xz + uL, 2.0 * uL) - uL;
          float d2 = dot(rel.xz, rel.xz);
          rel.y = iPos.y - uCam.y - d2 / (2.0 * uR);            // 행성 곡률
          vec4 mv = vec4(mat3(viewMatrix) * rel, 1.0);
          float a = iSeed * 6.2832; vec2 r = vec2(cos(a), sin(a));
          vec2 pp = vec2(position.x * r.x - position.y * r.y, position.x * r.y + position.y * r.x);
          mv.xy += pp * iScale;
          gl_Position = projectionMatrix * mv;
          float dist = length(mv.xyz);
          vFade = smoothstep(uL, uL * 0.72, sqrt(d2)) * smoothstep(30.0, 300.0, dist);
          vUv = uv;
          vShade = clamp(iShade * 0.62 + (pp.y + 0.5) * 0.45, 0.0, 1.0);
          vHaze = 1.0 - exp(-dist / 9000.0);
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform float uOpacity;
        varying vec2 vUv; varying float vFade; varying float vShade; varying float vHaze;
        void main(){
          float a = texture2D(uTex, vUv).a * vFade * uOpacity;
          if (a < 0.004) discard;
          vec3 col = mix(vec3(0.55, 0.63, 0.76), vec3(0.93, 0.93, 0.91), vShade);
          col = mix(col, vec3(0.66, 0.82, 0.96), vHaze * 0.8);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false,
    });
    const clouds = (W.clouds = new T.Mesh(geo, mat));
    clouds.frustumCulled = false; clouds.renderOrder = 1;
    scene.add(clouds);
  }

  // ---------- 섬 ----------
  function islandGeo(seed) {
    const g = new T.ConeGeometry(1, 1, 11, 6);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h1 = G.hash3(x, y, z, seed), h2 = G.hash3(z, x, y, seed + 3.1);
      if (Math.hypot(x, z) > 1e-4) {
        const k = (0.6 + 0.85 * Math.pow(1 - y, 1.5)) * (1 + (h1 - 0.5) * 0.55);
        x *= k; z *= k;
      }
      const y0 = y;
      if (y > 0.01 && y < 0.99) y += (h2 - 0.5) * 0.13;
      p.setXYZ(i, x, y, z);
      let r, gg, b;
      if (y0 < 0.06) { r = 0.80; gg = 0.74; b = 0.55; }                    // 모래
      else if (y0 < 0.5) { r = 0.20 + h1 * 0.08; gg = 0.44 + h2 * 0.1; b = 0.19; } // 숲
      else if (y0 < 0.8) { r = 0.43; gg = 0.41; b = 0.39; }                // 바위
      else { r = 0.92; gg = 0.94; b = 0.97; }                              // 눈
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  function buildIslands(scene) {
    const mat = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    const geos = [islandGeo(1.0), islandGeo(8.3), islandGeo(15.6)];
    for (let i = 0; i < 34; i++) {
      const r = G.rand(260, 900), h = r * G.rand(0.4, 1.0);
      const m = new T.Mesh(geos[i % 3], mat);
      m.scale.set(r, h, r); m.rotation.y = G.rand(6.283);
      scene.add(m);
      W.islands.push({ mesh: m, x: G.randS(IL), z: G.randS(IL), r: r * 1.45, h });
    }
  }
  // 섬과 부딪혔는지 (원뿔 근사)
  W.hitIsland = function (pos) {
    if (pos.y > 1000) return null;
    for (let i = 0; i < W.islands.length; i++) {
      const s = W.islands[i], mp = s.mesh.position;
      const d = Math.hypot(pos.x - mp.x, pos.z - mp.z);
      if (d < s.r && pos.y - mp.y < s.h * Math.pow(1 - d / s.r, 1.25) * 0.92) return s;
    }
    return null;
  };

  // ---------- 소행성대 ----------
  function placeAst(a, cam, edge) {
    if (edge) { // 시야 가장자리에 재배치
      const ang = Math.random() * 6.283, d = AL * G.rand(0.85, 0.98);
      a.pos.set(cam.x + Math.cos(ang) * d, G.rand(A_MIN, A_MAX), cam.z + Math.sin(ang) * d);
    } else {
      a.pos.set(cam.x + G.randS(AL), G.rand(A_MIN, A_MAX), cam.z + G.randS(AL));
    }
    const s = 12 + Math.pow(Math.random(), 2.6) * 150;
    a.s = s; a.sx = G.rand(0.75, 1.3); a.sy = G.rand(0.65, 1.1); a.sz = G.rand(0.75, 1.3);
    a.r = s * 0.88; a.hp = s * 1.6; a.ang = G.rand(6.283); a.spin = G.randS(0.5) * (30 / (s + 20));
    G.randDir(a.axis);
  }
  function buildAsteroids(scene) {
    const g = new T.IcosahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (G.hash3(x, y, z, 4.2) - 0.5) * 0.6;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    const mat = new T.MeshStandardMaterial({ color: 0x8d8278, roughness: 1, metalness: 0, flatShading: true, fog: false });
    const mesh = (W.astMesh = new T.InstancedMesh(g, mat, N_AST));
    mesh.frustumCulled = false; mesh.visible = false;
    scene.add(mesh);
    const origin = new T.Vector3();
    for (let i = 0; i < N_AST; i++) {
      const a = { pos: new T.Vector3(), axis: new T.Vector3(), k: 1 };
      placeAst(a, origin, false);
      W.asteroids.push(a);
    }
  }
  // 선분에 맞는 소행성 찾기
  W.rayAsteroid = function (p0, p1, pad) {
    if (!W.astMesh.visible) return null;
    const list = W.asteroids;
    for (let i = 0; i < list.length; i++) {
      const a = list[i], rr = a.r + pad + 110;
      const dx = a.pos.x - p1.x, dy = a.pos.y - p1.y, dz = a.pos.z - p1.z;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr || dz > rr || dz < -rr) continue;
      if (G.segSphere(p0, p1, a.pos, a.r * a.k + pad)) return a;
    }
    return null;
  };
  W.damageAsteroid = function (a, dmg) {
    a.hp -= dmg;
    if (a.hp > 0) return false;
    G.fx.rockBurst(a.pos, a.s);
    placeAst(a, G.camera.position, true);
    return true;
  };

  // ---------- 매 프레임 갱신 ----------
  W.update = function (dt, cam, time) {
    const alt = Math.max(cam.y, 1);
    const k = (W.spaceK = G.spaceBlend(alt));

    // 하늘
    W.sky.position.copy(cam);
    const su = W.sky.material.uniforms, cr = R / (R + alt);
    su.uSpace.value = k; su.uTime.value = time;
    su.uHorizon.value = -Math.sqrt(Math.max(0, 1 - cr * cr));

    // 행성
    W.planet.position.set(cam.x, -R, cam.z);
    const pu = W.planet.material.uniforms;
    pu.uCam.value.copy(cam); pu.uCenter.value.copy(W.planet.position);
    pu.uTime.value = time; pu.uSpace.value = k; pu.uCloud.value = G.sstep(2400, 5200, alt);

    // 안개·조명
    const fog = G.scene.fog;
    fog.density = 0.00014 * (1 - k);
    fog.color.setRGB(G.lerp(0.62, 0.02, k), G.lerp(0.80, 0.03, k), G.lerp(0.96, 0.07, k));
    W.hemi.intensity = G.lerp(0.5, 0.36, k);
    W.hemi.color.setRGB(G.lerp(0.77, 0.45, k), G.lerp(0.86, 0.6, k), 1);
    W.hemi.groundColor.setRGB(G.lerp(0.23, 0.1, k), G.lerp(0.34, 0.2, k), G.lerp(0.43, 0.5, k));
    W.sun.intensity = G.lerp(0.85, 0.9, k);

    // 별·가스 행성
    W.stars.visible = W.giant.visible = k > 0.01;
    if (k > 0.01) {
      W.stars.position.copy(cam);
      W.stars.material.opacity = k;
      W.giant.position.copy(cam).addScaledVector(W.giantDir, 108000);
      W.giantBody.rotation.y += dt * 0.01;
      W.giantBody.material.opacity = k; W.moon.material.opacity = k;
      W.giantRing.material.uniforms.uOpacity.value = k;
    }

    // 구름
    const co = 1 - G.sstep(3200, 5400, alt);
    W.clouds.visible = co > 0.01;
    if (W.clouds.visible) {
      const cu = W.clouds.material.uniforms;
      cu.uCam.value.copy(cam); cu.uOpacity.value = co;
    }
    // 구름 속에 들어갔는지 (화면 화이트아웃용)
    let cin = 0;
    if (alt < 3300) {
      for (let i = 0; i < W.clusters.length; i++) {
        const c = W.clusters[i];
        const dx = wrap(c.x - cam.x, CL), dz = wrap(c.z - cam.z, CL), dy = (c.y - cam.y) * 2.4;
        const d2 = (dx * dx + dy * dy + dz * dz) / (c.size * c.size);
        if (d2 < 1) cin = Math.max(cin, 1 - Math.sqrt(d2));
      }
    }
    W.cloudIn = G.damp(W.cloudIn, cin, 5, dt);

    // 섬
    const showIsl = alt < 7000;
    for (let i = 0; i < W.islands.length; i++) {
      const s = W.islands[i];
      s.mesh.visible = showIsl;
      if (!showIsl) continue;
      const dx = wrap(s.x - cam.x, IL), dz = wrap(s.z - cam.z, IL);
      s.mesh.position.set(cam.x + dx, -8 - (dx * dx + dz * dz) / (2 * R), cam.z + dz);
    }

    // 소행성
    const showAst = alt > 5200;
    W.astMesh.visible = showAst;
    if (showAst) {
      const list = W.asteroids;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        let dx = a.pos.x - cam.x, dz = a.pos.z - cam.z;
        if (dx > AL) { a.pos.x -= 2 * AL; dx -= 2 * AL; } else if (dx < -AL) { a.pos.x += 2 * AL; dx += 2 * AL; }
        if (dz > AL) { a.pos.z -= 2 * AL; dz -= 2 * AL; } else if (dz < -AL) { a.pos.z += 2 * AL; dz += 2 * AL; }
        a.k = G.sstep(AL, AL * 0.82, Math.max(Math.abs(dx), Math.abs(dz)));  // 가장자리에서 서서히 나타남
        a.ang += a.spin * dt;
        _q.setFromAxisAngle(a.axis, a.ang);
        _s.set(a.s * a.sx * a.k, a.s * a.sy * a.k, a.s * a.sz * a.k);
        _m.compose(a.pos, _q, _s);
        W.astMesh.setMatrixAt(i, _m);
      }
      W.astMesh.instanceMatrix.needsUpdate = true;
    }
  };
})();
