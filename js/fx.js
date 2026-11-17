'use strict';
/* 시각 효과: 파티클, 레이저 볼트, 미사일, 폭발, 충격파 링, 궤적(트레일), 속도선 */
(function () {
  const T = THREE;
  const F = (G.fx = { missiles: [], rings: [] });
  const _v = new T.Vector3(), _q = new T.Quaternion(), _m = new T.Matrix4();
  const _one = new T.Vector3(1, 1, 1), _z = new T.Vector3(0, 0, 1), _zn = new T.Vector3(0, 0, -1);

  // ---------- 파티클 시스템 ----------
  class Particles {
    constructor(max, tex, blending, fadeIn) {
      this.max = max; this.cur = 0; this.fadeIn = fadeIn;
      this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
      this.size = new Float32Array(max); this.alpha = new Float32Array(max);
      this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
      this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', (this.aPos = new T.BufferAttribute(this.pos, 3)));
      geo.setAttribute('aColor', (this.aCol = new T.BufferAttribute(this.col, 3)));
      geo.setAttribute('aSize', (this.aSize = new T.BufferAttribute(this.size, 1)));
      geo.setAttribute('aAlpha', (this.aAlpha = new T.BufferAttribute(this.alpha, 1)));
      [this.aPos, this.aCol, this.aSize, this.aAlpha].forEach(a => a.setUsage(T.DynamicDrawUsage));
      this.mat = new T.ShaderMaterial({
        uniforms: { uTex: { value: tex }, uScale: { value: 500 } },
        vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
          uniform float uScale; varying vec3 vC; varying float vA;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = min(aSize * uScale / max(-mv.z, 0.5), 760.0);
            vC = aColor; vA = aAlpha;
          }`,
        fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
          void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
        blending, transparent: true, depthWrite: false,
      });
      this.points = new T.Points(geo, this.mat);
      this.points.frustumCulled = false;
    }
    spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grow, drag, alpha) {
      const i = this.cur; this.cur = (i + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
      this.size[i] = size; this.life[i] = this.maxLife[i] = life;
      this.grow[i] = grow; this.drag[i] = drag; this.a0[i] = alpha;
      this.alpha[i] = this.fadeIn ? 0 : alpha;
    }
    update(dt) {
      const { pos, vel, size, alpha, life, maxLife, grow, drag, a0, max, fadeIn } = this;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { size[i] = 0; alpha[i] = 0; continue; }
        const i3 = i * 3, d = Math.max(0, 1 - drag[i] * dt);
        vel[i3] *= d; vel[i3 + 1] *= d; vel[i3 + 2] *= d;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        size[i] = Math.max(0, size[i] + grow[i] * dt);
        const k = life[i] / maxLife[i];
        alpha[i] = fadeIn ? a0[i] * k * Math.min(1, (1 - k) * 7) : a0[i] * k;
      }
      this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aCol.needsUpdate = true;
    }
  }

  // ---------- 레이저 볼트 풀 (인스턴스 메시 + 머리 발광점) ----------
  class Bolts {
    constructor(scene, max, color, halfW, len, headSize) {
      this.max = max; this.n = 0;
      this.pos = new Float32Array(max * 3); this.prev = new Float32Array(max * 3); this.dir = new Float32Array(max * 3);
      this.spd = new Float32Array(max); this.life = new Float32Array(max); this.dmg = new Float32Array(max);
      const w = halfW, l = len / 2, geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute([
        -w, 0, -l, w, 0, -l, w, 0, l, -w, 0, l,
        0, -w, -l, 0, w, -l, 0, w, l, 0, -w, l], 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      const mat = new T.MeshBasicMaterial({ map: G.tex.bolt, color, blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false });
      this.mesh = new T.InstancedMesh(geo, mat, max);
      this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
      scene.add(this.mesh);
      // 정면에서도 보이도록 머리에 발광점
      this.headGeo = new T.BufferGeometry();
      this.headAttr = new T.BufferAttribute(new Float32Array(max * 3), 3);
      this.headAttr.setUsage(T.DynamicDrawUsage);
      this.headGeo.setAttribute('position', this.headAttr);
      this.headGeo.setDrawRange(0, 0);
      this.heads = new T.Points(this.headGeo, new T.PointsMaterial({ map: G.tex.glow, color, size: headSize, sizeAttenuation: true, blending: T.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      this.heads.frustumCulled = false; this.heads.renderOrder = 6;
      scene.add(this.heads);
      this.p0 = new T.Vector3(); this.p1 = new T.Vector3(); // 충돌 검사용 임시 벡터
    }
    fire(p, d, speed, life, dmg) {
      if (this.n >= this.max) return;
      const i = this.n++, i3 = i * 3;
      this.pos[i3] = this.prev[i3] = p.x; this.pos[i3 + 1] = this.prev[i3 + 1] = p.y; this.pos[i3 + 2] = this.prev[i3 + 2] = p.z;
      this.dir[i3] = d.x; this.dir[i3 + 1] = d.y; this.dir[i3 + 2] = d.z;
      this.spd[i] = speed; this.life[i] = life; this.dmg[i] = dmg;
    }
    kill(i) {
      const l = --this.n;
      if (i === l) return;
      const i3 = i * 3, l3 = l * 3;
      for (let k = 0; k < 3; k++) { this.pos[i3 + k] = this.pos[l3 + k]; this.prev[i3 + k] = this.prev[l3 + k]; this.dir[i3 + k] = this.dir[l3 + k]; }
      this.spd[i] = this.spd[l]; this.life[i] = this.life[l]; this.dmg[i] = this.dmg[l];
    }
    seg(i) { // i번 볼트의 이번 프레임 이동 구간을 p0→p1에 담는다
      const i3 = i * 3;
      this.p0.set(this.prev[i3], this.prev[i3 + 1], this.prev[i3 + 2]);
      this.p1.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
    }
    update(dt) {
      for (let i = this.n - 1; i >= 0; i--) {
        const i3 = i * 3, s = this.spd[i] * dt;
        this.prev[i3] = this.pos[i3]; this.prev[i3 + 1] = this.pos[i3 + 1]; this.prev[i3 + 2] = this.pos[i3 + 2];
        this.pos[i3] += this.dir[i3] * s; this.pos[i3 + 1] += this.dir[i3 + 1] * s; this.pos[i3 + 2] += this.dir[i3 + 2] * s;
        this.life[i] -= dt;
        if (this.life[i] <= 0 || this.pos[i3 + 1] < 0) this.kill(i);
      }
    }
    sync() {
      const h = this.headAttr.array;
      for (let i = 0; i < this.n; i++) {
        const i3 = i * 3;
        _v.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
        this.p0.set(this.dir[i3], this.dir[i3 + 1], this.dir[i3 + 2]);
        _q.setFromUnitVectors(_z, this.p0);
        _m.compose(_v, _q, _one);
        this.mesh.setMatrixAt(i, _m);
        h[i3] = _v.x; h[i3 + 1] = _v.y; h[i3 + 2] = _v.z;
      }
      this.mesh.count = this.n;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.headGeo.setDrawRange(0, this.n);
      this.headAttr.needsUpdate = true;
    }
    clear() { this.n = 0; this.sync(); }
  }

  // ---------- 궤적 리본 ----------
  let trailMat = null;
  class Trail {
    constructor(n, width, r, g, b, step, pow) {
      this.n = n; this.width = width; this.r = r; this.g = g; this.b = b; this.seg = step || 4;   // 점 사이 거리 (길이 = seg × n, 프레임 속도와 무관)
      this.pow = pow || 2;   // 꼬리 쪽으로 사라지는 속도
      this.pts = new Float32Array(n * 3);
      const geo = new T.BufferGeometry();
      this.posAttr = new T.BufferAttribute(new Float32Array(n * 6), 3);
      this.colAttr = new T.BufferAttribute(new Float32Array(n * 6), 3);
      this.posAttr.setUsage(T.DynamicDrawUsage); this.colAttr.setUsage(T.DynamicDrawUsage);
      geo.setAttribute('position', this.posAttr); geo.setAttribute('color', this.colAttr);
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      if (!trailMat) trailMat = new T.MeshBasicMaterial({ vertexColors: true, blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false });
      this.mesh = new T.Mesh(geo, trailMat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
      F.scene.add(this.mesh);
    }
    reset(p) {
      for (let i = 0; i < this.n; i++) { this.pts[i * 3] = p.x; this.pts[i * 3 + 1] = p.y; this.pts[i * 3 + 2] = p.z; }
    }
    update(head, dt, cam, intensity) {
      const p = this.pts, n = this.n;
      const lx = p[3], ly = p[4], lz = p[5], ddx = head.x - lx, ddy = head.y - ly, ddz = head.z - lz;
      const dd = Math.hypot(ddx, ddy, ddz);
      if (dd > this.seg * n * 2) { this.reset(head); }   // 순간이동한 경우
      else {
        const steps = Math.min(n - 2, Math.floor(dd / this.seg));
        if (steps > 0) { // 이동한 거리만큼 일정 간격으로 점을 채운다
          p.copyWithin(3 * (steps + 1), 3, (n - steps) * 3);
          for (let j = 1; j <= steps; j++) {
            const t = (this.seg * (steps - j + 1)) / dd;
            p[j * 3] = lx + ddx * t; p[j * 3 + 1] = ly + ddy * t; p[j * 3 + 2] = lz + ddz * t;
          }
        }
      }
      p[0] = head.x; p[1] = head.y; p[2] = head.z;
      const pos = this.posAttr.array, col = this.colAttr.array;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3, a = (i > 0 ? i - 1 : 0) * 3, b = (i < n - 1 ? i + 1 : n - 1) * 3;
        const dx = p[a] - p[b], dy = p[a + 1] - p[b + 1], dz = p[a + 2] - p[b + 2];
        const tx = cam.x - p[i3], ty = cam.y - p[i3 + 1], tz = cam.z - p[i3 + 2];
        let cx = dy * tz - dz * ty, cy = dz * tx - dx * tz, cz = dx * ty - dy * tx;
        const len = Math.hypot(cx, cy, cz), k = 1 - i / (n - 1);
        const w = len > 1e-6 ? (this.width * (0.3 + 0.7 * k)) / len : 0;
        cx *= w; cy *= w; cz *= w;
        const i6 = i * 6;
        pos[i6] = p[i3] + cx; pos[i6 + 1] = p[i3 + 1] + cy; pos[i6 + 2] = p[i3 + 2] + cz;
        pos[i6 + 3] = p[i3] - cx; pos[i6 + 4] = p[i3 + 1] - cy; pos[i6 + 5] = p[i3 + 2] - cz;
        // 카메라 바로 옆을 지나는 구간은 지워서 화면을 가리지 않게 한다
        const near = G.clamp((Math.hypot(tx, ty, tz) - 8) / 14, 0, 1);
        const c = Math.pow(k, this.pow) * intensity * near;
        col[i6] = col[i6 + 3] = this.r * c; col[i6 + 1] = col[i6 + 4] = this.g * c; col[i6 + 2] = col[i6 + 5] = this.b * c;
      }
      this.posAttr.needsUpdate = true; this.colAttr.needsUpdate = true;
    }
    dispose() { F.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
  }
  F.Trail = Trail;

  // ---------- 초기화 ----------
  F.init = function (scene) {
    F.scene = scene;
    F.smoke = new Particles(1400, G.tex.smoke, T.NormalBlending, true);
    F.smoke.points.renderOrder = 4; scene.add(F.smoke.points);
    F.fire = new Particles(3600, G.tex.glow, T.AdditiveBlending, false);
    F.fire.points.renderOrder = 8; scene.add(F.fire.points);

    F.pBolts = new Bolts(scene, 140, new T.Color(0.45, 2.0, 4.2), 1.4, 38, 6);
    F.eBolts = new Bolts(scene, 240, new T.Color(4.2, 0.85, 0.2), 1.7, 26, 9);

    // 충격파 링
    const ringGeo = new T.RingGeometry(0.86, 1, 48);
    for (let i = 0; i < 10; i++) {
      const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xffffff, blending: T.AdditiveBlending, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false }));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 7;
      scene.add(m);
      F.rings.push({ mesh: m, t: 1, dur: 0.5, max: 100 });
    }

    // 폭발 섬광 조명
    F.light = new T.PointLight(0xffb060, 0, 2800, 1.4);
    scene.add(F.light);

    // 미사일
    const mBody = new T.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.5, metalness: 0.3 });
    const mRed = new T.MeshStandardMaterial({ color: 0xff5530, emissive: 0x802000, roughness: 0.5 });
    for (let i = 0; i < 12; i++) {
      const g = new T.Group();
      g.add(new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 3.8, 8).rotateX(Math.PI / 2), mBody));
      const nose = new T.Mesh(new T.ConeGeometry(0.34, 1.2, 8).rotateX(-Math.PI / 2), mRed); nose.position.z = -2.5; g.add(nose);
      const f1 = new T.Mesh(new T.BoxGeometry(1.7, 0.08, 0.9), mRed); f1.position.z = 1.5; g.add(f1);
      const f2 = new T.Mesh(new T.BoxGeometry(0.08, 1.7, 0.9), mRed); f2.position.z = 1.5; g.add(f2);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: G.tex.glow, color: new T.Color(4, 2.2, 0.8), blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      glow.scale.set(9, 9, 1); glow.position.z = 2.6; g.add(glow);
      g.scale.setScalar(1.6); g.visible = false;
      scene.add(g);
      F.missiles.push({ mesh: g, pos: g.position, prev: new T.Vector3(), dir: new T.Vector3(0, 0, -1), speed: 0, life: 0, arm: 0, turn: 3, target: null, alive: false });
    }

    // 속도선
    const N = 170, B = 240;
    F.stN = N; F.stB = B; F.stBase = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) F.stBase[i] = G.randS(B);
    const sg = new T.BufferGeometry();
    F.stAttr = new T.BufferAttribute(new Float32Array(N * 6), 3);
    F.stAttr.setUsage(T.DynamicDrawUsage);
    sg.setAttribute('position', F.stAttr);
    F.streaks = new T.LineSegments(sg, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    F.streaks.frustumCulled = false; F.streaks.renderOrder = 7;
    scene.add(F.streaks);
  };

  // ---------- 미사일 ----------
  F.fireMissile = function (pos, dir, speed, target, turn) {
    let m = null;
    for (let i = 0; i < F.missiles.length; i++) if (!F.missiles[i].alive) { m = F.missiles[i]; break; }
    if (!m) return false;
    m.alive = true; m.pos.copy(pos); m.prev.copy(pos); m.dir.copy(dir);
    m.speed = speed; m.target = target; m.turn = turn; m.life = 5.5; m.arm = 0.18;
    m.mesh.visible = true;
    return true;
  };
  function killMissile(m) { m.alive = false; m.mesh.visible = false; m.target = null; }
  F.updateMissiles = function (dt, targets) {
    for (let i = 0; i < F.missiles.length; i++) {
      const m = F.missiles[i];
      if (!m.alive) continue;
      m.life -= dt; m.arm -= dt;
      m.speed = Math.min(1350, m.speed + 1000 * dt);
      const t = m.target;
      if (t && t.alive && m.arm <= 0) {
        const d = m.pos.distanceTo(t.pos);
        _v.copy(t.pos).addScaledVector(t.vel, Math.min(1, d / m.speed)).sub(m.pos).normalize();
        G.turnToward(m.dir, _v, m.turn * dt);
      }
      m.prev.copy(m.pos);
      m.pos.addScaledVector(m.dir, m.speed * dt);
      m.mesh.quaternion.setFromUnitVectors(_zn, m.dir);
      // 연기와 불꽃
      const p = m.prev;
      F.smoke.spawn(p.x, p.y, p.z, G.randS(5), G.randS(5), G.randS(5), 0.78, 0.78, 0.8, 5, 0.9, 16, 1, 0.5);
      F.fire.spawn(p.x, p.y, p.z, -m.dir.x * 60, -m.dir.y * 60, -m.dir.z * 60, 3.2, 1.6, 0.5, 7, 0.16, -20, 0, 1);
      // 충돌
      let hit = null;
      for (let k = 0; k < targets.length; k++) {
        const x = targets[k];
        if (x.alive && G.segSphere(m.prev, m.pos, x.pos, x.radius + 9)) { hit = x; break; }
      }
      if (hit) { F.explode(m.pos, 1.5); hit.hit(120, m.pos, true); killMissile(m); continue; }
      const ast = G.world.rayAsteroid(m.prev, m.pos, 3);
      if (ast) { if (!G.world.damageAsteroid(ast, 220)) F.explode(m.pos, 1.2); else G.game.addScore(10); killMissile(m); continue; }
      const boss = G.enemies.boss;
      if (boss && boss.insideHull(m.pos, 4)) { F.explode(m.pos, 1.3); killMissile(m); continue; }
      if (m.life <= 0 || m.pos.y < 2) { F.explode(m.pos, 1.0); killMissile(m); }
    }
  };
  F.clearMissiles = () => F.missiles.forEach(killMissile);

  // ---------- 폭발 ----------
  F.ring = function (p, max, r, g, b, dur) {
    let best = F.rings[0];
    for (let i = 0; i < F.rings.length; i++) if (F.rings[i].t > best.t) best = F.rings[i];
    best.t = 0; best.max = max; best.dur = dur || 0.55;
    best.mesh.position.copy(p); best.mesh.material.color.setRGB(r, g, b); best.mesh.visible = true;
  };
  // size: 1(소형기)~8(모선). opt: {vx,vy,vz 관성 속도, quiet 소리 생략}
  F.explode = function (p, size, opt) {
    const bx = opt ? opt.vx || 0 : 0, by = opt ? opt.vy || 0 : 0, bz = opt ? opt.vz || 0 : 0;
    const sq = Math.sqrt(size), sp = G.world.spaceK;
    F.fire.spawn(p.x, p.y, p.z, 0, 0, 0, 3.2, 2.6, 1.8, 46 * sq, 0.16, 520 * sq, 0, 1); // 섬광
    const n = Math.min(170, (26 * size) | 0);
    for (let i = 0; i < n; i++) {
      G.randDir(_v);
      const s = G.rand(18, 130) * sq, hot = Math.random();
      const r = hot > 0.55 ? 3.0 : hot > 0.2 ? 2.6 : 1.5, g = hot > 0.55 ? 2.3 : hot > 0.2 ? 1.0 : 0.3, b = hot > 0.55 ? 1.1 : hot > 0.2 ? 0.25 : 0.08;
      F.fire.spawn(p.x + _v.x * size * 3, p.y + _v.y * size * 3, p.z + _v.z * size * 3,
        _v.x * s + bx, _v.y * s + by, _v.z * s + bz, r, g, b,
        G.rand(8, 22) * Math.pow(size, 0.7), G.rand(0.35, 1.0) * Math.pow(size, 0.3), 12 * sq, 2.2, 0.9);
    }
    const ns = Math.min(100, (16 * size) | 0);
    for (let i = 0; i < ns; i++) { // 스파크
      G.randDir(_v);
      const s = G.rand(150, 520) * sq;
      F.fire.spawn(p.x, p.y, p.z, _v.x * s + bx, _v.y * s + by, _v.z * s + bz, 3.2, 2.2, 0.8, G.rand(2.5, 5) * sq, G.rand(0.5, 1.3), -2, 1.3, 1);
    }
    const nk = Math.min(40, (7 * size * (1 - sp * 0.65)) | 0);
    for (let i = 0; i < nk; i++) { // 연기
      G.randDir(_v);
      const s = G.rand(8, 60) * sq, c = G.rand(0.1, 0.3);
      F.smoke.spawn(p.x + _v.x * size * 4, p.y + _v.y * size * 4, p.z + _v.z * size * 4,
        _v.x * s + bx * 0.5, _v.y * s + by * 0.5 + 8, _v.z * s + bz * 0.5, c, c, c * 1.05,
        G.rand(18, 40) * Math.pow(size, 0.6), G.rand(1.4, 3.0), 26 * sq, 1.5, 0.6);
    }
    F.ring(p, 70 * size, 3, 2, 1, 0.45 + size * 0.06);
    // 섬광 조명
    const li = Math.min(9, 2.4 * size);
    if (li > F.light.intensity) { F.light.position.copy(p); F.light.intensity = li; F.light.distance = 1200 + size * 500; }
    const dist = p.distanceTo(G.camera.position);
    G.shake(G.clamp(0.22 * size * (1 - dist / (900 + size * 600)), 0, 0.9));
    if (!(opt && opt.quiet)) G.audio.explosion(size, G.clamp(1.25 - dist / (1500 + size * 800), 0, 1));
  };
  // 소행성 파괴
  F.rockBurst = function (p, s) {
    const n = Math.min(40, 8 + ((s / 5) | 0));
    for (let i = 0; i < n; i++) {
      G.randDir(_v);
      const sp = G.rand(15, 90), c = G.rand(0.25, 0.42);
      F.smoke.spawn(p.x + _v.x * s * 0.5, p.y + _v.y * s * 0.5, p.z + _v.z * s * 0.5, _v.x * sp, _v.y * sp, _v.z * sp, c, c * 0.93, c * 0.85, G.rand(0.25, 0.6) * s + 6, G.rand(1.0, 2.2), s * 0.5, 1.2, 0.75);
    }
    for (let i = 0; i < n; i++) {
      G.randDir(_v);
      const sp = G.rand(80, 300);
      F.fire.spawn(p.x, p.y, p.z, _v.x * sp, _v.y * sp, _v.z * sp, 2.4, 1.6, 0.8, G.rand(2, 5), G.rand(0.4, 1.0), 0, 1, 1);
    }
    F.ring(p, s * 2.2, 1.6, 1.3, 1.0, 0.4);
    const dist = p.distanceTo(G.camera.position);
    G.shake(G.clamp(0.006 * s * (1 - dist / 900), 0, 0.5));
    G.audio.explosion(s / 45, G.clamp(1.1 - dist / 2000, 0, 1));
  };
  // 피격 스파크
  F.sparks = function (p, r, g, b, n, speed) {
    for (let i = 0; i < n; i++) {
      G.randDir(_v);
      const s = G.rand(0.3, 1) * speed;
      F.fire.spawn(p.x, p.y, p.z, _v.x * s, _v.y * s, _v.z * s, r, g, b, G.rand(2, 4.5), G.rand(0.15, 0.45), 0, 2, 1);
    }
    F.fire.spawn(p.x, p.y, p.z, 0, 0, 0, r, g, b, 12, 0.1, 60, 0, 0.9);
  };

  // ---------- 속도선 ----------
  F.updateStreaks = function (cam, vel, intensity, r, g, b) {
    const st = F.streaks;
    st.visible = intensity > 0.02;
    if (!st.visible) return;
    st.material.opacity = Math.min(0.7, intensity);
    st.material.color.setRGB(r, g, b);
    const B = F.stB, B2 = B * 2, base = F.stBase, pos = F.stAttr.array;
    const lx = vel.x * 0.045, ly = vel.y * 0.045, lz = vel.z * 0.045;
    for (let i = 0; i < F.stN; i++) {
      const i3 = i * 3, i6 = i * 6;
      const x = cam.x + ((((base[i3] - cam.x + B) % B2) + B2) % B2) - B;
      const y = cam.y + ((((base[i3 + 1] - cam.y + B) % B2) + B2) % B2) - B;
      const z = cam.z + ((((base[i3 + 2] - cam.z + B) % B2) + B2) % B2) - B;
      pos[i6] = x; pos[i6 + 1] = y; pos[i6 + 2] = z;
      pos[i6 + 3] = x - lx; pos[i6 + 4] = y - ly; pos[i6 + 5] = z - lz;
    }
    F.stAttr.needsUpdate = true;
  };

  // ---------- 매 프레임 ----------
  F.update = function (dt, camera) {
    F.fire.update(dt); F.smoke.update(dt);
    const h = G.renderer.getDrawingBufferSize(_sz).y;
    const sc = (h * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    F.fire.mat.uniforms.uScale.value = sc; F.smoke.mat.uniforms.uScale.value = sc;
    for (let i = 0; i < F.rings.length; i++) {
      const r = F.rings[i];
      if (r.t >= 1) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) { r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - r.t, 3);
      r.mesh.scale.setScalar(Math.max(0.01, r.max * e));
      r.mesh.material.opacity = (1 - r.t) * 0.85;
      r.mesh.quaternion.copy(camera.quaternion);
    }
    F.light.intensity *= Math.exp(-7 * dt);
    if (F.light.intensity < 0.02) F.light.intensity = 0;
  };
  const _sz = new T.Vector2();

  F.clearAll = function () {
    F.pBolts.clear(); F.eBolts.clear(); F.clearMissiles();
  };
})();
