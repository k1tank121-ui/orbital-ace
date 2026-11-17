'use strict';
/* 플레이어 기체: 모델, 비행, 무장(레이저·유도 미사일), 조준 보조, 피해 처리
   좌표 규칙: 기체 전방 = 로컬 -Z, 요(yaw)가 커지면 좌선회, 피치(pitch)가 커지면 기수 상승 */
(function () {
  const T = THREE, C = G.C;
  const P = (G.player = {});
  const _e = new T.Euler(0, 0, 0, 'YXZ'), _q = new T.Quaternion();
  const _v = new T.Vector3(), _a = new T.Vector3();
  const BOLT_SPEED = 1900;

  // ---------- 기체 모델 ----------
  function buildShip() {
    const g = new T.Group();
    const mBody = new T.MeshStandardMaterial({ color: 0xc9d0da, metalness: 0.2, roughness: 0.62, flatShading: true, side: T.DoubleSide });
    const mWing = new T.MeshStandardMaterial({ color: 0x93a1b8, metalness: 0.2, roughness: 0.72, flatShading: true, side: T.DoubleSide });
    const mAcc = new T.MeshStandardMaterial({ color: 0xff7a1f, emissive: 0xff4a00, emissiveIntensity: 0.7, roughness: 0.5, side: T.DoubleSide });
    const mDark = new T.MeshStandardMaterial({ color: 0x2a303c, metalness: 0.5, roughness: 0.5, flatShading: true, side: T.DoubleSide });
    const mGlass = new T.MeshStandardMaterial({ color: 0x59c8ff, emissive: 0x0e3a66, metalness: 0.6, roughness: 0.12 });
    const add = T.AdditiveBlending;

    // 동체 (회전체)
    const prof = [[0.72, -5.7], [0.96, -4.4], [1.06, -1.4], [0.95, 2.0], [0.6, 4.6], [0.26, 6.4], [0.001, 7.4]].map(p => new T.Vector2(p[0], p[1]));
    const body = new T.Mesh(new T.LatheGeometry(prof, 10).rotateX(-Math.PI / 2), mBody);
    body.scale.set(1.25, 0.74, 1);
    g.add(body);

    // 주익 · 날개 끝 포인트 · 수평 꼬리날개 · 수직 꼬리날개
    G.addMirrored(g, G.flatPoly([[0.8, -1.8], [6.7, 3.3], [6.7, 4.7], [4.3, 4.5], [0.8, 5.0]], 0.24), mWing, 0, -0.12, 0, 0.05);
    G.addMirrored(g, G.flatPoly([[6.1, 2.78], [6.72, 3.3], [6.72, 4.72], [6.1, 4.66]], 0.3), mAcc, 0, -0.12, 0, 0.05);
    G.addMirrored(g, G.flatPoly([[0.6, 4.3], [3.0, 6.4], [3.0, 7.1], [0.6, 6.7]], 0.16), mWing, 0, 0, 0, 0);
    G.addMirrored(g, G.flatPoly([[0, 3.3], [2.7, 5.7], [2.7, 6.6], [0, 6.1]], 0.16), mWing, 0.72, 0.3, 0, 1.25);
    G.addMirrored(g, G.flatPoly([[2.2, 5.26], [2.72, 5.7], [2.72, 6.62], [2.2, 6.52]], 0.2), mAcc, 0.72, 0.3, 0, 1.25);

    // 캐노피
    const canopy = new T.Mesh(new T.SphereGeometry(1, 14, 10), mGlass);
    canopy.scale.set(0.6, 0.5, 1.9); canopy.position.set(0, 0.5, -2.7);
    g.add(canopy);

    // 엔진 · 불꽃
    P.flames = [];
    const mGlow = new T.MeshBasicMaterial({ color: new T.Color(1.6, 3.2, 5.0), fog: false });
    const mFlameO = new T.MeshBasicMaterial({ color: new T.Color(0.25, 1.1, 3.2), blending: add, transparent: true, opacity: 0.75, depthWrite: false, side: T.DoubleSide, fog: false });
    const mFlameI = new T.MeshBasicMaterial({ color: new T.Color(2.4, 3.0, 3.6), blending: add, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide, fog: false });
    const coneO = new T.ConeGeometry(0.42, 6, 10, 1, true).translate(0, 3, 0).rotateX(Math.PI / 2);
    const coneI = new T.ConeGeometry(0.22, 3.4, 8, 1, true).translate(0, 1.7, 0).rotateX(Math.PI / 2);
    [-0.56, 0.56].forEach(sx => {
      const noz = new T.Mesh(new T.CylinderGeometry(0.44, 0.52, 1.1, 10, 1, true).rotateX(Math.PI / 2), mDark);
      noz.position.set(sx, 0, 5.9); g.add(noz);
      const disc = new T.Mesh(new T.CircleGeometry(0.4, 12), mGlow); disc.position.set(sx, 0, 6.3); g.add(disc);
      const fo = new T.Mesh(coneO, mFlameO); fo.position.set(sx, 0, 6.3); fo.renderOrder = 5; g.add(fo);
      const fi = new T.Mesh(coneI, mFlameI); fi.position.set(sx, 0, 6.3); fi.renderOrder = 5; g.add(fi);
      P.flames.push(fo, fi);
    });

    // 기관포 · 날개 밑 미사일
    const gunGeo = new T.CylinderGeometry(0.14, 0.14, 2.6, 6).rotateX(Math.PI / 2);
    const mslGeo = new T.CylinderGeometry(0.16, 0.16, 2.2, 6).rotateX(Math.PI / 2);
    [-1, 1].forEach(s => {
      const gun = new T.Mesh(gunGeo, mDark); gun.position.set(s * 2.4, -0.3, -0.5); g.add(gun);
      const m1 = new T.Mesh(mslGeo, mBody); m1.position.set(s * 3.7, -0.4, 2.9); g.add(m1);
      const m2 = new T.Mesh(mslGeo, mBody); m2.position.set(s * 4.8, -0.4, 3.5); g.add(m2);
    });

    // 항법등
    const navGeo = new T.SphereGeometry(0.16, 6, 6);
    P.navL = new T.Mesh(navGeo, new T.MeshBasicMaterial({ color: new T.Color(4, 0.3, 0.3), fog: false }));
    P.navR = new T.Mesh(navGeo, new T.MeshBasicMaterial({ color: new T.Color(0.3, 4, 0.7), fog: false }));
    P.navL.position.set(-6.75, 0.22, 4.0); P.navR.position.set(6.75, 0.22, 4.0);
    g.add(P.navL, P.navR);

    // 실드 (피격 시 번쩍)
    P.shieldMesh = new T.Mesh(new T.SphereGeometry(8.6, 20, 14),
      new T.MeshBasicMaterial({ color: new T.Color(0.35, 1.5, 3.2), blending: add, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    P.shieldMesh.scale.set(1, 0.55, 1.2); P.shieldMesh.renderOrder = 6;
    g.add(P.shieldMesh);

    // 대기권 돌파 플라스마 콘
    P.plasma = new T.Mesh(new T.ConeGeometry(5.2, 20, 14, 1, true).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: new T.Color(3.6, 1.3, 0.35), blending: add, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, fog: false }));
    P.plasma.position.z = -1; P.plasma.renderOrder = 6; P.plasma.visible = false;
    g.add(P.plasma);
    return g;
  }

  P.init = function (scene) {
    P.obj = buildShip();
    scene.add(P.obj);
    P.pos = P.obj.position;
    P.vel = new T.Vector3(); P.fwd = new T.Vector3(0, 0, -1); P.right = new T.Vector3(1, 0, 0); P.up = new T.Vector3(0, 1, 0);
    P.yaw = 0;
    const Tr = G.fx.Trail;
    P.trails = [
      { t: new Tr(10, 0.3, 0.45, 1.7, 4.0, 2, 3), x: -0.56, y: 0, z: 6.6, wing: false },
      { t: new Tr(10, 0.3, 0.45, 1.7, 4.0, 2, 3), x: 0.56, y: 0, z: 6.6, wing: false },
      { t: new Tr(30, 0.22, 0.8, 0.88, 1.0, 5), x: -6.75, y: 0.22, z: 4.3, wing: true },
      { t: new Tr(30, 0.22, 0.8, 0.88, 1.0, 5), x: 6.75, y: 0.22, z: 4.3, wing: true },
    ];
    P.pos.set(0, 1300, 0);
    P.reset();
  };

  P.reset = function () {
    P.pitch = 0; P.bank = 0; P.rollExtra = 0; P.rollT = 0; P.rollDir = 0; P.rollCd = 0;
    P.speed = 205; P.hp = 100; P.shield = 100; P.boostE = 100; P.missiles = 6; P.missileT = 0;
    P.alive = true; P.invuln = 1.5; P.noHitT = 9; P.fireT = 0; P.gunSide = 1; P.mslSide = 1;
    P.sx = 0; P.sy = 0; P.boostK = 0; P.boosting = false;
    P.ascent = false; P.ascentK = 0; P.ascentDone = false; P.levelT = 0;
    P.lockCand = null; P.lockT = 0; P.locked = false; P.assist = null;
    P.hitFlash = 0; P.shieldFlash = 0; P.crashCd = 0;
    P.obj.visible = true;
    updateFrame();
    P.vel.copy(P.fwd).multiplyScalar(P.speed);
    P.trails.forEach(tr => {
      _v.set(tr.x, tr.y, tr.z).applyQuaternion(P.obj.quaternion).add(P.pos);
      tr.t.reset(_v); tr.t.mesh.visible = true;
    });
  };

  function updateFrame() {
    _e.set(P.pitch, P.yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    P.fwd.set(0, 0, -1).applyQuaternion(_q);
    P.right.set(1, 0, 0).applyQuaternion(_q);
    P.up.set(0, 1, 0).applyQuaternion(_q);
    _e.set(P.pitch, P.yaw, P.bank + P.rollExtra, 'YXZ');
    P.obj.quaternion.setFromEuler(_e);
  }

  P.startAscent = function () {
    if (P.ascent) return;
    P.ascent = true; P.ascentDone = false;
    G.audio.ascentRoar();
  };

  // ---------- 매 프레임 ----------
  // ctl: { sx, sy, fire, missile, boost, brake, rollL, rollR }
  P.update = function (dt, ctl) {
    if (!P.alive) return;

    // 조종
    let tx = ctl.sx, ty = ctl.sy;
    if (P.ascent) { tx *= 0.35; ty = G.clamp((1.05 - P.pitch) * 3, -1, 1); }
    else if (P.levelT > 0) { P.levelT -= dt; ty = G.clamp((0.05 - P.pitch) * 2.5, -1, 1); }
    if (P.pos.y > C.CEILING && P.pitch > -0.2) ty = -1;                                  // 고도 한계
    if (P.pos.y < 50 && P.pitch < 0.15) ty = Math.max(ty, G.clamp((50 - P.pos.y) / 30, 0, 1)); // 해수면 회피 보조
    P.sx = G.damp(P.sx, tx, 7, dt);
    P.sy = G.damp(P.sy, ty, 7, dt);
    P.yaw -= P.sx * 1.3 * dt;
    P.pitch = G.clamp(P.pitch + P.sy * 1.15 * dt, -1.3, 1.3);
    P.bank = G.damp(P.bank, -P.sx * 1.05, 5, dt);

    // 배럴 롤
    P.rollCd -= dt;
    if (P.rollT <= 0 && P.rollCd <= 0 && (ctl.rollL || ctl.rollR) && !P.ascent) {
      P.rollDir = ctl.rollR ? 1 : -1; P.rollT = 0.62; P.rollCd = 1.1;
      P.invuln = Math.max(P.invuln, 0.62);
      G.audio.roll();
    }
    if (P.rollT > 0) {
      P.rollT -= dt;
      const k = 1 - Math.max(0, P.rollT) / 0.62, e = k * k * (3 - 2 * k);
      P.rollExtra = P.rollT > 0 ? -P.rollDir * Math.PI * 2 * e : 0;
      P.pos.addScaledVector(P.right, P.rollDir * 170 * Math.sin(k * Math.PI) * dt);
    }

    // 속도 · 부스트
    const wantBoost = ctl.boost && P.boostE > 0 && !P.ascent;
    if (wantBoost && !P.boosting && P.boostE > 12) { P.boosting = true; G.audio.boostOn(); }
    if (!wantBoost) P.boosting = false;
    P.boostE = P.boosting ? Math.max(0, P.boostE - 24 * dt) : Math.min(100, P.boostE + 13 * dt);
    let target = P.boosting ? 440 : ctl.brake ? 115 : 205;
    target -= Math.sin(P.pitch) * 35;
    if (P.ascent) target = 1350;
    P.speed = G.damp(P.speed, target, P.ascent ? 1.2 : 2.2, dt);
    P.boostK = G.damp(P.boostK, P.boosting ? 1 : 0, 4, dt);
    P.ascentK = G.damp(P.ascentK, P.ascent ? 1 : 0, 2.5, dt);

    updateFrame();
    P.vel.copy(P.fwd).multiplyScalar(P.speed);
    P.pos.addScaledVector(P.vel, dt);

    // 해수면 · 섬 충돌
    P.crashCd -= dt;
    if (P.pos.y < 7) {
      P.pos.y = 7; P.pitch = Math.max(P.pitch, 0.3);
      crash(28, true);
    } else if (G.world.hitIsland(P.pos)) {
      P.pitch = Math.max(P.pitch, 0.55); P.pos.y += 260 * dt + 3;
      crash(34, false);
    }

    // 대기권 돌파 종료
    if (P.ascent && P.pos.y >= 7500) { P.ascent = false; P.ascentDone = true; P.levelT = 2.6; }

    // 회복
    P.invuln -= dt; P.noHitT += dt;
    if (P.noHitT > 4.5 && P.shield < 100) P.shield = Math.min(100, P.shield + 14 * dt);
    if (P.missiles < 6) { P.missileT += dt; if (P.missileT >= 4.5) { P.missileT = 0; P.missiles++; } }

    fireGuns(dt, ctl);
    fireMissile(ctl);
    updateVisuals(dt);
  };

  function crash(d, water) {
    if (P.crashCd > 0) return;
    P.crashCd = 0.8;
    const F = G.fx;
    for (let i = 0; i < 26; i++) {
      const c = water ? 0.92 : 0.45;
      F.smoke.spawn(P.pos.x + G.randS(6), P.pos.y - 4, P.pos.z + G.randS(6), G.randS(50) + P.vel.x * 0.3, G.rand(30, 130), G.randS(50) + P.vel.z * 0.3,
        c, c, water ? 1 : c * 0.9, G.rand(8, 20), G.rand(0.6, 1.4), 30, 1.5, 0.8);
    }
    P.damage(d, P.pos, true);
  }

  // ---------- 무장 ----------
  function fireGuns(dt, ctl) {
    P.fireT -= dt;
    if (!ctl.fire || P.fireT > 0 || P.ascent) return;
    P.fireT = 0.072; P.gunSide = -P.gunSide;
    _v.set(P.gunSide * 2.4, -0.3, -2.2).applyQuaternion(P.obj.quaternion).add(P.pos);
    const a = P.assist;
    if (a) { const d = _v.distanceTo(a.pos); _a.copy(a.pos).addScaledVector(a.vel, d / BOLT_SPEED); }
    else _a.copy(P.pos).addScaledVector(P.fwd, 900);
    _a.sub(_v).normalize();
    G.fx.pBolts.fire(_v, _a, BOLT_SPEED, 1.4, 12);
    G.fx.fire.spawn(_v.x, _v.y, _v.z, P.vel.x, P.vel.y, P.vel.z, 0.6, 1.4, 2.4, 4.5, 0.05, 10, 0, 1);
    G.audio.laser();
  }
  function fireMissile(ctl) {
    if (!ctl.missile || P.missiles <= 0 || P.ascent) return;
    P.mslSide = -P.mslSide;
    _v.set(P.mslSide * 3.8, -1.0, 1).applyQuaternion(P.obj.quaternion).add(P.pos);
    const t = P.lockCand;
    if (G.fx.fireMissile(_v, P.fwd, P.speed + 120, t, t ? (P.locked ? 3.4 : 1.6) : 0)) {
      P.missiles--; G.audio.missile();
    }
  }

  // 록온 후보 · 조준 보조 대상 계산
  P.updateTargeting = function (dt, targets) {
    let best = null, bestAng = 0.32, assist = null, assistBest = 1;
    if (P.alive && !P.ascent) {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.alive) continue;
        _v.subVectors(t.pos, P.pos);
        const dist = _v.length();
        if (dist > 3300 || dist < 1) continue;
        const ang = Math.acos(G.clamp(_v.dot(P.fwd) / dist, -1, 1));
        if (ang < bestAng) { best = t; bestAng = ang; }
        const lim = Math.max(0.075, (t.radius + 14) / dist);   // 가까울수록 넉넉하게
        if (dist < 2500 && ang < lim && ang / lim < assistBest) { assist = t; assistBest = ang / lim; }
      }
    }
    P.assist = assist;
    if (best !== P.lockCand) { P.lockCand = best; P.lockT = 0; P.locked = false; }
    if (best) {
      P.lockT = Math.min(1, P.lockT + dt / 0.7);
      if (P.lockT >= 1) { if (!P.locked) { P.locked = true; G.audio.locked(); } }
      else G.audio.lockTick();
    }
  };

  // ---------- 시각 요소 ----------
  function updateVisuals(dt) {
    const t = G.time, F = G.fx, cam = G.camera.position, sp = G.world.spaceK;
    const thr = 0.55 + P.boostK * 0.95 + P.ascentK * 1.7 + G.clamp((P.speed - 205) / 900, -0.2, 0.6);
    for (let i = 0; i < P.flames.length; i++) {
      const f = P.flames[i], w = 1 + P.boostK * 0.35 + P.ascentK * 0.6;
      f.scale.set(w, w, thr * (0.88 + Math.random() * 0.24));
    }
    P.navL.visible = P.navR.visible = t % 1.1 < 0.14;
    P.shieldFlash = Math.max(0, P.shieldFlash - dt * 3);
    P.hitFlash = Math.max(0, P.hitFlash - dt * 2.2);
    P.shieldMesh.material.opacity = P.shieldFlash * 0.5 + (P.invuln > 0 && P.rollT > 0 ? 0.12 : 0);
    P.plasma.visible = P.ascentK > 0.03;
    if (P.plasma.visible) {
      P.plasma.material.opacity = P.ascentK * (0.3 + Math.random() * 0.16);
      const s = 1 + Math.random() * 0.08; P.plasma.scale.set(s, s, 1 + Math.random() * 0.12);
      for (let i = 0; i < 5; i++) { // 기수에서 뒤로 흘러가는 불티
        _v.set(G.randS(4), G.randS(3), G.rand(-9, 2)).applyQuaternion(P.obj.quaternion).add(P.pos);
        F.fire.spawn(_v.x, _v.y, _v.z, P.vel.x * 0.55 + G.randS(30), P.vel.y * 0.55 + G.randS(30), P.vel.z * 0.55 + G.randS(30),
          3.4, 1.4 + Math.random(), 0.4, G.rand(3, 8), G.rand(0.2, 0.5), 0, 0, P.ascentK);
      }
    }
    // 궤적
    const eInt = 0.32 + P.boostK * 0.8 + P.ascentK * 1.2;
    const wInt = (G.clamp(Math.abs(P.sx) * 1.3 - 0.4, 0, 1) * 0.75 + P.boostK * 0.35 + (P.rollT > 0 ? 0.6 : 0)) * (1 - sp * 0.85);
    for (let i = 0; i < P.trails.length; i++) {
      const tr = P.trails[i];
      _v.set(tr.x, tr.y, tr.z).applyQuaternion(P.obj.quaternion).add(P.pos);
      tr.t.update(_v, dt, cam, tr.wing ? wInt : eInt);
    }
    // 손상 연기
    if (P.hp < 38 && Math.random() < dt * 28) {
      _v.set(G.randS(1), 0.5, 3).applyQuaternion(P.obj.quaternion).add(P.pos);
      F.smoke.spawn(_v.x, _v.y, _v.z, P.vel.x * 0.4, P.vel.y * 0.4 + 6, P.vel.z * 0.4, 0.14, 0.14, 0.15, 4, 1.1, 14, 0.8, 0.6);
      if (Math.random() < 0.3) F.fire.spawn(_v.x, _v.y, _v.z, P.vel.x * 0.5, P.vel.y * 0.5, P.vel.z * 0.5, 3, 1.3, 0.3, 5, 0.3, 6, 0, 0.9);
    }
  }

  // ---------- 피해 ----------
  P.damage = function (d, at, force) {
    if (!P.alive || G.game.state !== 'playing' || P.ascent) return;
    if (P.invuln > 0 && !force) return;
    P.noHitT = 0;
    if (P.shield > 0) {
      const s = Math.min(P.shield, d); P.shield -= s; d -= s;
      P.shieldFlash = 1; G.audio.shieldHit();
      if (at) G.fx.sparks(at, 0.6, 2.2, 4, 6, 120);
    }
    if (d > 0) {
      P.hp -= d; P.hitFlash = 1;
      G.shake(0.4); G.audio.hit();
      if (at) G.fx.sparks(at, 3, 1.6, 0.5, 8, 160);
    } else G.shake(0.14);
    if (P.hp <= 0) {
      P.hp = 0; P.alive = false; P.obj.visible = false; P.boosting = false;
      P.trails.forEach(tr => { tr.t.mesh.visible = false; });
      G.fx.explode(P.pos, 2.6, { vx: P.vel.x * 0.4, vy: P.vel.y * 0.4, vz: P.vel.z * 0.4 });
      G.game.onPlayerDeath();
    }
  };
})();
