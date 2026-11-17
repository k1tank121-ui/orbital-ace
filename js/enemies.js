'use strict';
/* 적: 전투기 · 드론 · 건쉽 · 모선(보스). 모델, AI, 피격 처리
   모든 표적은 { pos, vel, radius, alive, hit(dmg, at, heavy) } 형태를 갖는다. */
(function () {
  const T = THREE;
  const E = (G.enemies = { list: [], boss: null, targets: [] });
  const _v = new T.Vector3(), _a = new T.Vector3(), _r = new T.Vector3(), _m = new T.Matrix4(), _q = new T.Quaternion();
  const _up = new T.Vector3(0, 1, 0), _zAxis = new T.Vector3(0, 0, 1), _zero = new T.Vector3();
  let M = null;

  function mats() {
    if (M) return M;
    const add = T.AdditiveBlending;
    M = {
      hull: new T.MeshStandardMaterial({ color: 0x4c5362, metalness: 0.45, roughness: 0.5, flatShading: true, side: T.DoubleSide }),
      dark: new T.MeshStandardMaterial({ color: 0x23262e, metalness: 0.5, roughness: 0.55, flatShading: true, side: T.DoubleSide }),
      red: new T.MeshStandardMaterial({ color: 0xa01822, emissive: 0xff1a2a, emissiveIntensity: 0.9, roughness: 0.5, side: T.DoubleSide }),
      bossHull: new T.MeshStandardMaterial({ color: 0x626a7c, metalness: 0.3, roughness: 0.6, flatShading: true, side: T.DoubleSide }),
      bossWing: new T.MeshStandardMaterial({ color: 0x444b5a, metalness: 0.35, roughness: 0.6, flatShading: true, side: T.DoubleSide }),
      lamp: new T.MeshBasicMaterial({ color: new T.Color(2.6, 2.2, 1.3), fog: false }),
      glowR: new T.MeshBasicMaterial({ color: new T.Color(4.2, 0.6, 0.25), fog: false }),
      glowO: new T.MeshBasicMaterial({ color: new T.Color(4.0, 1.6, 0.3), fog: false }),
      glowM: new T.MeshBasicMaterial({ color: new T.Color(4.0, 0.4, 2.2), fog: false }),
      core: new T.MeshBasicMaterial({ color: new T.Color(4.5, 1.0, 0.5), fog: false }),
      shield: new T.MeshBasicMaterial({ color: new T.Color(0.3, 1.4, 3.0), blending: add, transparent: true, opacity: 0.28, depthWrite: false, fog: false }),
      beam: new T.MeshBasicMaterial({ color: new T.Color(4.5, 0.5, 0.3), blending: add, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide, fog: false }),
    };
    return M;
  }

  // ---------- 모델 ----------
  function buildFighter() {
    const m = mats(), g = new T.Group();
    const body = new T.Mesh(new T.ConeGeometry(1.15, 9.5, 4).rotateX(-Math.PI / 2), m.hull); body.scale.set(1.4, 0.62, 1); g.add(body);
    G.addMirrored(g, G.flatPoly([[0.6, 1.4], [5.6, -1.4], [5.9, -0.3], [0.6, 3.9]], 0.2), m.dark, 0, 0, 0, -0.08);
    G.addMirrored(g, G.flatPoly([[5.2, -1.2], [5.6, -1.4], [5.9, -0.3], [5.4, 0.1]], 0.26), m.red, 0, 0, 0, -0.08);
    const fin = new T.Mesh(G.flatPoly([[0, 1.6], [2.2, 3.4], [2.2, 4.3], [0, 4.2]], 0.16), m.dark); fin.rotation.z = Math.PI / 2; g.add(fin);
    const eye = new T.Mesh(new T.SphereGeometry(0.42, 8, 6), m.glowR); eye.position.set(0, 0.45, -1.4); eye.scale.z = 2; g.add(eye);
    const eng = new T.Mesh(new T.SphereGeometry(0.7, 8, 6), m.glowR); eng.position.set(0, 0, 4.7); g.add(eng);
    g.scale.setScalar(2.1);
    return g;
  }
  function buildDrone() {
    const m = mats(), g = new T.Group();
    const core = new T.Mesh(new T.OctahedronGeometry(2.2), m.hull); core.scale.set(1, 0.8, 1.7); g.add(core);
    const finGeo = G.flatPoly([[0.7, -1.2], [4.6, 1.4], [4.6, 2.3], [0.7, 2.6]], 0.2);
    for (let i = 0; i < 3; i++) { const f = new T.Mesh(finGeo, i ? m.dark : m.red); f.rotation.z = Math.PI / 2 + (i * Math.PI * 2) / 3; g.add(f); }
    const eye = new T.Mesh(new T.SphereGeometry(0.8, 8, 6), m.glowM); eye.position.z = -2.9; g.add(eye);
    const eng = new T.Mesh(new T.SphereGeometry(0.75, 8, 6), m.glowM); eng.position.z = 3.6; g.add(eng);
    g.scale.setScalar(1.7);
    return g;
  }
  function buildGunship() {
    const m = mats(), g = new T.Group();
    g.add(new T.Mesh(new T.BoxGeometry(14, 9, 42), m.hull));
    const nose = new T.Mesh(new T.CylinderGeometry(3, 7.6, 16, 6).rotateX(-Math.PI / 2), m.dark); nose.position.z = -29; g.add(nose);
    G.addMirrored(g, G.flatPoly([[6, -8], [34, 4], [34, 12], [6, 14]], 1.2), m.dark, 0, 1, 0, 0.06);
    const strip = new T.Mesh(new T.BoxGeometry(14.4, 1.0, 30), m.red); strip.position.y = 1.5; g.add(strip);
    const podGeo = new T.CylinderGeometry(3, 3.4, 13, 8).rotateX(Math.PI / 2), discGeo = new T.CircleGeometry(2.7, 10);
    [[-13, 4], [13, 4], [-24, 5.5], [24, 5.5]].forEach(p => {
      const pod = new T.Mesh(podGeo, m.hull); pod.position.set(p[0], p[1], 8); g.add(pod);
      const d = new T.Mesh(discGeo, m.glowO); d.position.set(p[0], p[1], 14.6); g.add(d);
    });
    const tur = new T.Mesh(new T.SphereGeometry(4.2, 10, 8), m.red); tur.position.set(0, -6, -6); g.add(tur);
    return g;
  }

  const TYPES = {
    fighter: { build: buildFighter, hp: 45, speed: 215, turn: 1.5, radius: 15, score: 100, fire: [1.4, 2.5], burst: 3, dmg: 9, exp: 1.7, trail: 0.45 },
    drone:   { build: buildDrone,   hp: 26, speed: 250, turn: 2.2, radius: 12, score: 80,  fire: [1.2, 2.2], burst: 2, dmg: 8, exp: 1.2, trail: 0.35 },
    gunship: { build: buildGunship, hp: 280, speed: 170, turn: 0.7, radius: 32, score: 400, fire: [1.6, 2.4], burst: 4, dmg: 12, exp: 3.4, trail: 0 },
  };

  function shootAt(from, speed, dmg, spread) {
    const P = G.player;
    if (!P.alive || P.ascent) return;
    const d = from.distanceTo(P.pos);
    _a.copy(P.pos).addScaledVector(P.vel, (d / speed) * 0.85).sub(from).normalize();
    _a.x += G.randS(spread); _a.y += G.randS(spread); _a.z += G.randS(spread); _a.normalize();
    G.fx.eBolts.fire(from, _a, speed, 4.5, dmg);
    G.audio.enemyLaser(G.clamp(1.2 - d / 1800, 0.15, 1));
  }

  // ---------- 일반 적기 ----------
  class Enemy {
    constructor(type, pos) {
      const D = (this.D = TYPES[type]);
      this.type = type; this.big = type === 'gunship';
      this.mesh = D.build(); this.mesh.position.copy(pos); G.scene.add(this.mesh);
      this.pos = this.mesh.position; this.vel = new T.Vector3(); this.tgt = new T.Vector3();
      this.dir = new T.Vector3().subVectors(G.player.pos, pos).normalize();
      this.hp = D.hp; this.radius = D.radius; this.alive = true; this.speed = D.speed;
      this.state = this.big ? 'cruise' : 'approach'; this.stateT = 9;
      this.side = Math.random() < 0.5 ? -1 : 1; this.vsign = Math.random() < 0.5 ? -1 : 1;
      this.ahead = G.rand(650, 1300); this.sideDist = G.rand(150, 600); this.dy = G.randS(220); this.phase = G.rand(6.283);
      this.fireT = G.rand(1.5, 3.5); this.burst = 0; this.burstT = 0; this.roll = 0; this.smokeT = 0;
      this.trail = D.trail ? new G.fx.Trail(22, D.trail, 3.6, 0.5, 0.2, 6) : null;
      if (this.trail) this.trail.reset(pos);
    }
    setState(s, t) { this.state = s; this.stateT = t; if (s === 'reposition') { this.side = -this.side; this.ahead = G.rand(650, 1300); } }
    update(dt) {
      const P = G.player, D = this.D, tgt = this.tgt;
      const dist = this.pos.distanceTo(P.pos);
      let spd = D.speed;
      this.stateT -= dt;
      switch (this.state) {
        case 'approach': // 요격: 사격하며 접근
          tgt.copy(P.pos).addScaledVector(P.vel, Math.min(dist / 700, 1.5));
          spd = D.speed * 1.1;
          if (dist < 260) this.setState('pass', G.rand(1.0, 1.6));
          else if (this.stateT <= 0) this.setState('reposition', 6);
          break;
        case 'pass': // 그대로 스쳐 지나감
          tgt.copy(this.pos).addScaledVector(this.dir, 500); tgt.y += this.vsign * 120;
          if (this.stateT <= 0) this.setState('reposition', 7);
          break;
        case 'reposition': // 플레이어를 앞질러 전방으로
          tgt.copy(P.pos).addScaledVector(P.fwd, this.ahead).addScaledVector(P.right, this.side * this.sideDist); tgt.y += this.dy;
          spd = Math.max(D.speed, P.speed * 1.35 + 60);
          if (this.pos.distanceTo(tgt) < 300 || this.stateT <= 0) this.setState('weave', G.rand(4, 8));
          break;
        case 'weave': // 전방에서 지그재그 (플레이어의 사격 기회)
          this.phase += dt * 1.6;
          tgt.copy(P.pos).addScaledVector(P.fwd, this.ahead + 300).addScaledVector(P.right, this.side * this.sideDist * 0.5 + Math.sin(this.phase) * 260);
          tgt.y += this.dy + Math.cos(this.phase * 0.7) * 120;
          spd = P.speed * 0.9;
          if (this.stateT <= 0 || dist < 200) this.setState('break', 1.6);
          break;
        case 'break': // 급선회 이탈 후 다시 요격
          tgt.copy(this.pos).addScaledVector(P.right, this.side * 800).addScaledVector(P.fwd, -300); tgt.y += 400 * this.vsign;
          spd = D.speed * 1.2;
          if (this.stateT <= 0) this.setState('approach', 9);
          break;
        case 'cruise': // 건쉽: 전방에서 나란히 비행하며 포탑 사격
          tgt.copy(P.pos).addScaledVector(P.fwd, 800 + this.ahead * 0.3).addScaledVector(P.right, this.side * (300 + this.sideDist)); tgt.y += this.dy;
          spd = dist > 1600 ? P.speed * 1.3 + 40 : P.speed * 0.96;
          break;
      }
      if (dist > 4200) spd = Math.max(spd, P.speed * 1.5 + 80);   // 너무 멀어지면 따라붙기
      tgt.y = Math.max(tgt.y, 140);
      if (this.pos.y < 90) tgt.y = this.pos.y + 400;

      // 선회 · 이동
      _a.subVectors(tgt, this.pos).normalize();
      _r.crossVectors(this.dir, _up).normalize();
      const turnAmt = _a.dot(_r);
      G.turnToward(this.dir, _a, D.turn * dt);
      this.speed = G.damp(this.speed, spd, 1.6, dt);
      this.vel.copy(this.dir).multiplyScalar(this.speed);
      this.pos.addScaledVector(this.vel, dt);
      this.roll = G.damp(this.roll, G.clamp(-turnAmt * 1.6, -1.2, 1.2) * (this.big ? 0.25 : 1), 4, dt);
      _v.copy(this.pos).add(this.dir);
      _m.lookAt(this.pos, _v, _up);
      this.mesh.quaternion.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(_zAxis, this.roll));

      // 사격
      this.fireT -= dt;
      const aligned = this.big || (this.state === 'approach' && this.dir.dot(_a.subVectors(P.pos, this.pos).normalize()) > 0.965);
      if (this.fireT <= 0 && aligned && dist < (this.big ? 1700 : 1400) && dist > 150) {
        this.fireT = G.rand(D.fire[0], D.fire[1]); this.burst = D.burst; this.burstT = 0;
      }
      if (this.burst > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstT = 0.13; this.burst--;
          _v.copy(this.pos).addScaledVector(this.dir, this.big ? 0 : this.radius); if (this.big) _v.y -= 8;
          shootAt(_v, this.big ? 640 : 720, D.dmg, 0.027);
        }
      }

      // 궤적 · 손상 연기
      if (this.trail) { _v.copy(this.pos).addScaledVector(this.dir, -this.radius * 0.6); this.trail.update(_v, dt, G.camera.position, 0.8); }
      if (this.hp < D.hp * 0.45) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) {
          this.smokeT = 0.05;
          G.fx.smoke.spawn(this.pos.x, this.pos.y, this.pos.z, this.vel.x * 0.3, this.vel.y * 0.3 + 5, this.vel.z * 0.3, 0.12, 0.12, 0.13, this.big ? 12 : 5, 1.2, 16, 0.8, 0.55);
        }
      }
    }
    hit(dmg, at, heavy) {
      if (!this.alive) return;
      this.hp -= dmg;
      G.fx.sparks(at || this.pos, 3.2, 1.8, 0.6, heavy ? 12 : 5, 170);
      G.audio.enemyHit();
      if (this.hp <= 0) this.die();
    }
    die() {
      this.alive = false;
      G.fx.explode(this.pos, this.D.exp, { vx: this.vel.x * 0.5, vy: this.vel.y * 0.5, vz: this.vel.z * 0.5 });
      this.remove();
      G.game.onKill(this.D.score, this.pos);
    }
    remove() {
      this.alive = false;
      G.scene.remove(this.mesh);
      if (this.trail) { this.trail.dispose(); this.trail = null; }
    }
  }

  // ---------- 모선 (보스) ----------
  class Boss {
    constructor(pos, yaw) {
      const m = mats(), g = (this.mesh = new T.Group());
      const hull = new T.Mesh(new T.CylinderGeometry(34, 62, 640, 6).rotateX(-Math.PI / 2), m.bossHull); hull.scale.y = 0.62; g.add(hull);
      const lampGeo = new T.BoxGeometry(5, 1.6, 9);   // 선체 위·아래의 창문 불빛
      for (let z = -250; z <= 270; z += 40) {
        const r = 34 + ((z + 320) / 640) * 28;
        [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(s => { const l = new T.Mesh(lampGeo, m.lamp); l.position.set(s[0] * r * 0.27, s[1] * (r * 0.537 + 0.4), z); g.add(l); });
      }
      const bridge = new T.Mesh(new T.BoxGeometry(46, 44, 110), m.dark); bridge.position.set(0, 44, 150); g.add(bridge);
      G.addMirrored(g, G.flatPoly([[40, -120], [250, 120], [250, 230], [40, 250]], 10), m.bossWing, 0, -4, 0, -0.07);
      G.addMirrored(g, G.flatPoly([[236, 110], [252, 120], [252, 232], [236, 232]], 13), m.red, 0, -4, 0, -0.07);
      [[-62, 6], [62, 6]].forEach(p => { const s = new T.Mesh(new T.BoxGeometry(2.5, 5, 420), m.red); s.position.set(p[0] * 0.86, p[1], 30); g.add(s); });
      [[-34, 0], [0, 6], [34, 0]].forEach(p => {
        const e = new T.Mesh(new T.CylinderGeometry(17, 20, 44, 10).rotateX(Math.PI / 2), m.dark); e.position.set(p[0], p[1], 330); g.add(e);
        const d = new T.Mesh(new T.CircleGeometry(15, 14), m.glowO); d.position.set(p[0], p[1], 352.5); g.add(d);
      });
      g.position.copy(pos); G.scene.add(g);
      this.pos = g.position; this.yaw = yaw; this.vel = new T.Vector3(); this.alive = true; this.dying = 0;
      this.inv = new T.Matrix4();

      // 포탑 4기 + 코어
      this.parts = [];
      const mk = (x, y, z, radius, hp, core) => {
        const mesh = core ? new T.Mesh(new T.SphereGeometry(34, 16, 12), m.core) : new T.Group();
        if (!core) {
          mesh.add(new T.Mesh(new T.SphereGeometry(20, 12, 8), m.dark));
          const ring = new T.Mesh(new T.TorusGeometry(20, 2.4, 6, 16), m.glowR); ring.rotation.x = Math.PI / 2; mesh.add(ring);
        }
        mesh.position.set(x, y, z); g.add(mesh);
        const part = { boss: this, mesh, local: new T.Vector3(x, y, z), pos: new T.Vector3(), vel: this.vel, radius, hp, maxHp: hp, alive: true, big: true, core: !!core, fireT: G.rand(1, 3), burst: 0, burstT: 0 };
        part.hit = (dmg, at, heavy) => this.hitPart(part, dmg, at, heavy);
        this.parts.push(part);
        return part;
      };
      mk(0, 44, -190, 26, 260); mk(0, 72, 150, 26, 260); mk(-70, 2, -40, 26, 260); mk(70, 2, -40, 26, 260);
      this.core = mk(0, -46, 0, 40, 900, true);
      this.shield = new T.Mesh(new T.SphereGeometry(48, 18, 12), m.shield); this.shield.position.copy(this.core.local); this.shield.renderOrder = 6; g.add(this.shield);
      this.maxHp = 260 * 4 + 900;

      // 주포 빔
      this.beam = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2), m.beam);
      this.beam.visible = false; this.beam.frustumCulled = false; this.beam.renderOrder = 7; G.scene.add(this.beam);
      this.beamCd = 8; this.beamT = 0; this.beamMode = 0; this.beamDir = new T.Vector3(0, 0, -1); this.beamFrom = new T.Vector3(); this.beamTick = 0;
      this.droneT = 10;
      this.updateMatrix();
    }
    get hp() { let h = 0; for (const p of this.parts) if (p.alive) h += p.hp; return h; }
    turretsAlive() { let n = 0; for (const p of this.parts) if (p.alive && !p.core) n++; return n; }
    updateMatrix() {
      this.mesh.rotation.set(0, this.yaw, 0);
      this.mesh.updateMatrixWorld(true);
      this.inv.copy(this.mesh.matrixWorld).invert();
      for (const p of this.parts) p.pos.copy(p.local).applyMatrix4(this.mesh.matrixWorld);
    }
    insideHull(p, pad) {
      if (!this.alive) return false;
      _v.copy(p).applyMatrix4(this.inv);
      return Math.abs(_v.x) < 68 + pad && Math.abs(_v.y) < 44 + pad && Math.abs(_v.z) < 335 + pad;
    }
    hitPart(part, dmg, at, heavy) {
      if (!part.alive || this.dying > 0) return;
      if (part.core && this.turretsAlive() > 0) { // 포탑이 남아 있으면 코어는 방어막으로 보호
        G.fx.sparks(at || part.pos, 0.6, 2.2, 4, 6, 150); G.audio.shieldHit();
        return;
      }
      part.hp -= dmg;
      G.fx.sparks(at || part.pos, 3.2, 1.8, 0.6, heavy ? 14 : 6, 200); G.audio.enemyHit();
      if (part.hp > 0) return;
      part.alive = false; part.mesh.visible = false;
      G.fx.explode(part.pos, part.core ? 4 : 3);
      if (part.core) { this.dying = 3.8; G.game.onBossDying(); }
      else {
        G.game.onKill(500, part.pos);
        if (this.turretsAlive() === 0) { this.shield.visible = false; G.game.onCoreExposed(); }
      }
    }
    update(dt) {
      const P = G.player;
      if (this.dying > 0) { // 연쇄 폭발
        this.dying -= dt;
        if (Math.random() < dt * 9) {
          _v.set(G.randS(60), G.randS(40), G.randS(320)).applyMatrix4(this.mesh.matrixWorld);
          G.fx.explode(_v, G.rand(1.5, 3.2));
        }
        this.beam.visible = false;
        if (this.dying <= 0) {
          G.fx.explode(this.pos, 8);
          for (let i = 0; i < 6; i++) { _v.set(G.randS(80), G.randS(40), G.randS(300)).applyMatrix4(this.mesh.matrixWorld); G.fx.explode(_v, 4, { quiet: true }); }
          this.remove(); G.game.onBossDead();
        }
        return;
      }
      // 이동: 큰 원을 그리며 순항
      this.yaw += 0.05 * dt;
      this.vel.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(75);
      this.pos.addScaledVector(this.vel, dt);
      this.updateMatrix();
      const dist = this.pos.distanceTo(P.pos);

      // 포탑
      for (const p of this.parts) {
        if (!p.alive || p.core) continue;
        p.fireT -= dt;
        if (p.fireT <= 0 && dist < 3200) { p.fireT = G.rand(1.5, 2.6); p.burst = 2; p.burstT = 0; }
        if (p.burst > 0) { p.burstT -= dt; if (p.burstT <= 0) { p.burstT = 0.16; p.burst--; shootAt(p.pos, 820, 14, 0.026); } }
      }

      // 주포 빔: 대기 → 조준(가는 선) → 발사(굵은 빔)
      this.beamFrom.set(0, 0, -335).applyMatrix4(this.mesh.matrixWorld);
      if (this.beamMode === 0) {
        this.beamCd -= dt;
        if (this.beamCd <= 0 && dist < 4200 && P.alive) { this.beamMode = 1; this.beamT = 1.7; G.audio.beamCharge(); }
      } else if (this.beamMode === 1) {
        this.beamT -= dt;
        if (this.beamT > 0.5) this.beamDir.subVectors(P.pos, this.beamFrom).normalize();   // 발사 0.5초 전에 방향 고정
        this.setBeam(0.9 + Math.sin(G.time * 40) * 0.3, 0.22);
        if (this.beamT <= 0) { this.beamMode = 2; this.beamT = 1.25; G.audio.beamFire(); G.shake(0.5); }
      } else {
        this.beamT -= dt;
        this.setBeam(15 + Math.random() * 3, 0.85);
        this.beamTick -= dt;
        _v.subVectors(P.pos, this.beamFrom);
        const t = _v.dot(this.beamDir);
        if (t > 0 && t < 6000 && this.beamTick <= 0 && _v.addScaledVector(this.beamDir, -t).length() < 20) { this.beamTick = 0.1; P.damage(6, P.pos, false); }
        if (this.beamT <= 0) { this.beamMode = 0; this.beamCd = G.rand(9, 13); this.beam.visible = false; }
      }

      // 드론 발진
      this.droneT -= dt;
      if (this.droneT <= 0) {
        this.droneT = 14;
        if (E.list.length < 5) for (let i = 0; i < 2; i++) { _v.set(i ? 90 : -90, -30, 100).applyMatrix4(this.mesh.matrixWorld); E.spawn('drone', _v); }
      }

      // 기체와의 충돌
      if (P.alive && this.insideHull(P.pos, 6)) {
        _v.copy(P.pos).applyMatrix4(this.inv);
        P.pos.y += (_v.y >= 0 ? 1 : -1) * 300 * dt;
        if (P.crashCd <= 0) { P.crashCd = 0.8; P.damage(30, P.pos, true); }
      }
    }
    setBeam(radius, opacity) {
      const L = 6000;
      this.beam.visible = true;
      this.beam.position.copy(this.beamFrom).addScaledVector(this.beamDir, L / 2);
      this.beam.quaternion.setFromUnitVectors(_zAxis, this.beamDir);
      this.beam.scale.set(radius, radius, L);
      this.beam.material.opacity = opacity;
    }
    remove() {
      this.alive = false;
      for (const p of this.parts) p.alive = false;
      G.scene.remove(this.mesh); G.scene.remove(this.beam);
      E.boss = null;
    }
  }

  // ---------- 관리 ----------
  E.spawn = function (type, pos) { const e = new Enemy(type, pos); E.list.push(e); return e; };
  E.spawnBoss = function (pos, yaw) { E.boss = new Boss(pos, yaw); return E.boss; };
  E.update = function (dt) {
    for (let i = E.list.length - 1; i >= 0; i--) {
      const e = E.list[i];
      if (e.alive) e.update(dt);
      if (!e.alive) E.list.splice(i, 1);
    }
    if (E.boss) E.boss.update(dt);
    // 록온·충돌 검사용 표적 목록
    const t = E.targets; t.length = 0;
    for (let i = 0; i < E.list.length; i++) t.push(E.list[i]);
    if (E.boss && E.boss.dying <= 0) for (const p of E.boss.parts) if (p.alive && !(p.core && E.boss.turretsAlive() > 0)) t.push(p);
  };
  E.clear = function () {
    E.list.forEach(e => e.remove()); E.list.length = 0; E.targets.length = 0;
    if (E.boss) E.boss.remove();
  };
  E.count = () => E.list.length;
})();
