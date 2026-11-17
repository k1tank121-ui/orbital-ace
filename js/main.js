'use strict';
/* 메인: 렌더러 · 블룸, 추적 카메라, 게임 루프, 충돌 판정, 임무 진행 */
(function () {
  if (!window.THREE) return;
  const T = THREE;
  const $ = id => document.getElementById(id);
  const game = (G.game = { state: 'title', score: 0, combo: 0, comboT: 0, kills: 0, playTime: 0, goal: null, timeScale: 1, tsTarget: 1, deadT: 0, winT: 0, alarmT: 0 });
  const cam = (G.cam = { yaw: 0, pitch: 0, roll: 0, trauma: 0, orbit: 0.9, deathVel: new T.Vector3(), deathLook: new T.Vector3() });
  const ctl = { sx: 0, sy: 0, fire: false, missile: false, boost: false, brake: false, rollL: false, rollR: false };
  const _v = new T.Vector3(), _goal = new T.Vector3(), _e = new T.Euler(0, 0, 0, 'YXZ');
  let last = 0;

  G.shake = a => { if (a > 0) cam.trauma = Math.min(1, cam.trauma + a); };

  // ---------- 초기화 ----------
  function init() {
    G.makeTextures();
    const renderer = (G.renderer = new T.WebGLRenderer({ canvas: $('game'), antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    G.scene = new T.Scene();
    G.camera = new T.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1.5, 180000);
    setupComposer();
    G.world.init(G.scene); G.fx.init(G.scene); G.player.init(G.scene); G.hud.init();
    G.initInput();
    bindUI();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') setPause(true); });
    cam.yaw = G.player.yaw;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // 밝은 부분이 빛나 보이게 하는 블룸 (HDR 버퍼가 가능하면 사용)
  function setupComposer() {
    const r = G.renderer;
    G.composer = null;
    if (!T.EffectComposer || !T.UnrealBloomPass || !T.RenderPass) return;
    try {
      const size = r.getDrawingBufferSize(new T.Vector2());
      const hdr = r.capabilities.isWebGL2 && !!r.extensions.get('EXT_color_buffer_float');
      const rt = new T.WebGLRenderTarget(size.x, size.y, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: hdr ? T.HalfFloatType : T.UnsignedByteType });
      const comp = new T.EffectComposer(r, rt);
      comp.addPass(new T.RenderPass(G.scene, G.camera));
      G.bloom = new T.UnrealBloomPass(new T.Vector2(size.x, size.y), hdr ? 0.85 : 0.55, 0.55, hdr ? 0.92 : 0.82);
      comp.addPass(G.bloom);
      G.composer = comp; G.hdr = hdr;
    } catch (err) { console.warn('블룸을 사용할 수 없어 기본 렌더링으로 전환합니다.', err); G.composer = null; }
  }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight, pr = G.renderer.getPixelRatio();
    G.renderer.setSize(w, h);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
    if (G.composer) G.composer.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }
  function render() {
    if (G.composer && G.opts.bloom) G.composer.render();
    else G.renderer.render(G.scene, G.camera);
  }

  // ---------- 메뉴 ----------
  function bindUI() {
    const on = (id, fn) => $(id).addEventListener('click', e => { e.currentTarget.blur(); fn(); });
    on('btn-start', () => startGame(true));
    on('btn-resume', () => setPause(false));
    on('btn-retry', () => startGame(false));
    on('btn-restart', () => startGame(true));
    on('btn-again', () => startGame(true));
    $('opt-mouse').addEventListener('change', e => { G.opts.mouse = e.target.checked; });
    $('opt-invert').addEventListener('change', e => { G.opts.invertY = e.target.checked; });
  }
  function showScreen(id) { ['title', 'pause', 'over', 'win'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }

  // fromStart: 처음부터 / false: 마지막 구간부터 재도전
  function startGame(fromStart) {
    const P = G.player;
    G.audio.init(); G.audio.resume(); G.audio.ui();
    G.enemies.clear(); G.fx.clearAll(); G.hud.bossBar(false);
    const idx = fromStart ? 0 : mission.checkpoint;
    if (fromStart) { game.score = 0; game.kills = 0; game.playTime = 0; }
    else game.score = mission.cpScore;
    game.combo = 0; game.comboT = 0; game.timeScale = game.tsTarget = 1; game.winT = 0; game.goal = null;
    if (game.state !== 'title') P.pos.y = PHASES[idx].zone === 'space' ? 7650 : 1300;
    P.reset();
    cam.yaw = P.yaw; cam.pitch = 0; cam.roll = 0; cam.trauma = 0;
    game.state = 'playing';
    showScreen(null); G.hud.show(true);
    mission.start(idx);
    if (fromStart) G.hud.hint('Space 사격 · F 유도 미사일 · Shift 부스트 · Q / E 배럴 롤', 9);
  }
  function setPause(on) {
    if (on && game.state !== 'playing') return;
    if (!on && game.state !== 'paused') return;
    game.state = on ? 'paused' : 'playing';
    showScreen(on ? 'pause' : null);
    if (on) G.audio.suspend(); else { G.audio.resume(); last = performance.now(); }
  }

  // ---------- 조작 ----------
  function readControls() {
    const k = G.input.keys, p = G.input.pressed, m = G.input.mouse;
    let sx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let sy = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    if (G.opts.mouse && sx === 0 && sy === 0) { // 화면 중앙에서 마우스가 벗어난 만큼 조향
      const dz = v => (Math.abs(v) < 0.06 ? 0 : G.clamp((v - Math.sign(v) * 0.06) * 2.4, -1, 1));
      sx = dz(m.x); sy = dz(m.y);
    }
    if (G.opts.invertY) sy = -sy;
    ctl.sx = sx; ctl.sy = sy;
    ctl.fire = !!(k.Space || k.KeyJ || m.l);
    ctl.missile = !!(p.KeyF || p.KeyK || p.MouseR);
    ctl.boost = !!(k.ShiftLeft || k.ShiftRight);
    ctl.brake = !!k.KeyX;
    ctl.rollL = !!p.KeyQ; ctl.rollR = !!p.KeyE;
  }
  function autoControls() { // 타이틀 · 승리 화면의 자동 비행
    const P = G.player, want = game.state === 'victory' ? game.holdAlt : 1350;
    ctl.sx = Math.sin(G.time * 0.21) * 0.28;
    ctl.sy = G.clamp((want - P.pos.y) * 0.004 - P.pitch * 2.2, -1, 1);
    ctl.fire = ctl.missile = ctl.boost = ctl.brake = ctl.rollL = ctl.rollR = false;
  }

  // ---------- 카메라 ----------
  function updateCamera(dt) {
    const P = G.player, c = G.camera;
    if (game.state === 'title' || game.state === 'victory') {
      cam.orbit += dt * 0.2;
      _v.set(Math.cos(cam.orbit) * 44, 8 + Math.sin(cam.orbit * 0.6) * 7, Math.sin(cam.orbit) * 44);
      c.position.copy(P.pos).add(_v);
      c.lookAt(P.pos);
      if (game.state === 'title') c.rotateY(0.2);   // 타이틀 문구를 피해 기체를 오른쪽에
      c.fov = G.damp(c.fov, 50, 3, dt);
    } else if (game.state === 'dead') {
      c.position.addScaledVector(cam.deathVel, dt);
      cam.deathVel.multiplyScalar(Math.exp(-1.2 * dt));
      c.lookAt(cam.deathLook);
    } else {
      // 기체 뒤를 약간 늦게 따라가는 추적 카메라: 선회하면 기체가 화면 안에서 기울며 움직인다
      cam.yaw = G.dampAngle(cam.yaw, P.yaw, 5.5, dt);
      cam.pitch = G.damp(cam.pitch, P.pitch, 5.5, dt);
      cam.roll = G.damp(cam.roll, P.bank * 0.38, 4, dt);
      _e.set(cam.pitch - 0.05, cam.yaw, cam.roll, 'YXZ');
      c.quaternion.setFromEuler(_e);
      _v.set(0, 7.5 - P.ascentK * 2, 31 + P.boostK * 7 - P.ascentK * 5).applyQuaternion(c.quaternion);
      c.position.copy(P.pos).add(_v);
      c.fov = G.damp(c.fov, 62 + P.boostK * 15 + P.ascentK * 26, 4, dt);
    }
    if (cam.trauma > 0) { // 화면 흔들림
      const s = cam.trauma * cam.trauma;
      c.position.x += G.randS(s * 2.4); c.position.y += G.randS(s * 2.4); c.position.z += G.randS(s * 2.4);
      c.rotateZ(G.randS(s * 0.035));
      cam.trauma = Math.max(0, cam.trauma - dt * 1.5);
    }
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  // ---------- 충돌 판정 ----------
  function collide() {
    const P = G.player, F = G.fx, W = G.world, En = G.enemies, targets = En.targets, pb = F.pBolts, eb = F.eBolts;
    // 아군 볼트 → 적 · 소행성 · 모선 선체 · 섬
    for (let i = pb.n - 1; i >= 0; i--) {
      pb.seg(i);
      let done = false;
      for (let k = 0; k < targets.length; k++) {
        const t = targets[k];
        if (t.alive && G.segSphere(pb.p0, pb.p1, t.pos, t.radius + 4)) { t.hit(pb.dmg[i], pb.p1, false); done = true; break; }
      }
      if (!done) {
        const a = W.rayAsteroid(pb.p0, pb.p1, 2);
        if (a) {
          if (W.damageAsteroid(a, pb.dmg[i])) game.addScore(10); else F.sparks(pb.p1, 2.4, 1.8, 1.0, 4, 120);
          done = true;
        }
      }
      if (!done && En.boss && En.boss.insideHull(pb.p1, 0)) { F.sparks(pb.p1, 2.5, 1.6, 0.8, 4, 140); done = true; }
      if (!done && W.hitIsland(pb.p1)) { F.sparks(pb.p1, 2.2, 1.8, 1.2, 4, 120); done = true; }
      if (done) pb.kill(i);
    }
    // 적 볼트 → 플레이어 · 소행성
    for (let i = eb.n - 1; i >= 0; i--) {
      eb.seg(i);
      if (P.alive && P.invuln <= 0 && !P.ascent && G.segSphere(eb.p0, eb.p1, P.pos, 6.5)) { P.damage(eb.dmg[i], eb.p1, false); eb.kill(i); continue; }
      if (W.rayAsteroid(eb.p0, eb.p1, 0)) { F.sparks(eb.p1, 2.4, 1.2, 0.6, 3, 100); eb.kill(i); }
    }
    if (!P.alive || P.ascent) return;
    // 적기와 충돌
    for (let i = 0; i < En.list.length; i++) {
      const e = En.list[i], rr = e.radius + 5;
      if (e.alive && P.crashCd <= 0 && e.pos.distanceToSquared(P.pos) < rr * rr) {
        P.crashCd = 0.8;
        e.hit(e.big ? 80 : 200, P.pos, true);
        P.damage(e.big ? 35 : 25, P.pos, true);
      }
    }
    // 소행성과 충돌
    if (W.astMesh.visible) {
      for (let i = 0; i < W.asteroids.length; i++) {
        const a = W.asteroids[i];
        if (a.k < 0.3) continue;
        const rr = a.r * a.k + 5;
        if (a.pos.distanceToSquared(P.pos) >= rr * rr) continue;
        if (P.crashCd <= 0) { P.crashCd = 0.8; P.damage(26, P.pos, true); }
        if (a.s < 45) W.damageAsteroid(a, 1e9);
        else { _v.subVectors(P.pos, a.pos).normalize(); P.pos.copy(a.pos).addScaledVector(_v, rr + 2); }
      }
    }
  }

  // ---------- 점수 · 사건 ----------
  game.addScore = n => { game.score += n; };
  game.onKill = function (score) {
    game.kills++;
    game.combo = Math.min(9, game.combo + 1); game.comboT = 4.5;
    game.score += score * game.combo;
  };
  game.onPlayerDeath = function () {
    const P = G.player, c = G.camera;
    game.state = 'dead'; game.deadT = 0; game.goal = null;
    cam.deathLook.copy(P.pos);
    cam.deathVel.subVectors(c.position, P.pos).normalize().multiplyScalar(30);
    G.hud.flash(0.6);
  };
  game.onCoreExposed = function () {
    G.hud.msg('방어막 소멸 — 코어 노출!', '모선 아래쪽의 코어를 공격하라', 3.8, 'warn');
    G.hud.phase('모선 격파', '노출된 코어를 파괴하라');
    G.audio.fanfare();
  };
  game.onBossDying = function () {
    G.hud.msg('코어 붕괴!', '', 3.2, 'warn');
    game.tsTarget = 0.4;   // 슬로 모션
    G.enemies.list.slice().forEach(e => e.die());
    G.fx.eBolts.clear();
  };
  game.onBossDead = function () {
    game.score += 5000; game.kills++;
    G.hud.flash(1); G.hud.bossBar(false);
    G.shake(1);
    game.tsTarget = 1; game.winT = 4;
    G.hud.msg('적 모선 격파!', '', 3.5);
    G.hud.phase('', '');
    G.audio.fanfare();
  };
  function showWin() {
    game.state = 'victory'; game.holdAlt = G.player.pos.y;
    G.hud.show(false); G.audio.setMood('title');
    $('win-score').textContent = game.score.toLocaleString();
    $('win-kills').textContent = game.kills;
    const s = Math.round(game.playTime);
    $('win-time').textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    $('win-rank').textContent = game.score >= 22000 ? 'S' : game.score >= 16000 ? 'A' : game.score >= 11000 ? 'B' : 'C';
    showScreen('win');
  }
  function showOver() {
    const ph = PHASES[mission.checkpoint];
    $('over-info').textContent = '점수 ' + game.score.toLocaleString() + ' · 구간: ' + ph.title;
    showScreen('over');
  }

  // ---------- 임무 ----------
  const PHASES = [
    { kind: 'wave', zone: 'sky', title: '1차 요격전', sub: '적 전투기 편대가 접근 중', spawn: { fighter: 4 } },
    { kind: 'wave', zone: 'sky', title: '2차 요격전', sub: '건쉽을 포함한 증원 편대', spawn: { fighter: 5, gunship: 1 } },
    { kind: 'wave', zone: 'sky', title: '3차 요격전', sub: '적 주력 편대', spawn: { fighter: 6, gunship: 2 } },
    { kind: 'ascent', zone: 'sky', title: '대기권 돌파' },
    { kind: 'wave', zone: 'space', title: '궤도 방어선', sub: '드론 편대가 소행성대에 매복해 있다', spawn: { drone: 8 } },
    { kind: 'wave', zone: 'space', title: '소행성대 격전', sub: '적 정예 부대', spawn: { drone: 6, fighter: 4, gunship: 1 } },
    { kind: 'boss', zone: 'space', title: '모선 격파' },
  ];
  const mission = (G.mission = { idx: 0, st: 'intro', t: 0, checkpoint: 0, cpScore: 0, PHASES });

  mission.start = function (idx) {
    const ph = PHASES[idx], hud = G.hud;
    mission.idx = idx; mission.st = 'intro'; mission.t = 0;
    mission.checkpoint = idx; mission.cpScore = game.score;
    game.goal = null;
    if (ph.kind === 'wave') {
      hud.msg(ph.title, ph.sub, 3.2); hud.phase(ph.title, '');
      G.audio.setMood(ph.zone === 'space' ? 'space' : 'sky');
    } else if (ph.kind === 'ascent') {
      hud.msg('대기권을 돌파하라', '기수를 올려 상승 — 고도 20km에서 오버부스트 점화', 5, 'warn');
      hud.phase('대기권 돌파', '우주로 상승하라');
      hud.hint('W 또는 ↑ 키를 눌러 상승', 8);
      G.audio.setMood('sky');
    } else {
      hud.msg('경고 — 적 모선 접근', '포탑 4기를 파괴하면 코어가 노출된다', 4.5, 'danger');
      hud.phase('모선 격파', '포탑을 먼저 파괴하라');
      G.audio.setMood('boss'); G.audio.alarm();
    }
  };

  function flatFwd(out, off) { const a = G.player.yaw + (off || 0); return out.set(-Math.sin(a), 0, -Math.cos(a)); }
  function spawnWave(spec) {
    const P = G.player;
    for (const type in spec) {
      for (let n = 0; n < spec[type]; n++) {
        flatFwd(_v, G.randS(0.85)).multiplyScalar(G.rand(1900, 2800)).add(P.pos);
        _v.y = Math.max(260, P.pos.y + G.randS(450));
        G.enemies.spawn(type, _v);
      }
    }
  }

  mission.update = function (dt) {
    const ph = PHASES[mission.idx], P = G.player, En = G.enemies, hud = G.hud;
    mission.t += dt;
    if (ph.kind === 'wave') {
      if (mission.st === 'intro') {
        if (mission.t > 2.2) { spawnWave(ph.spawn); mission.st = 'active'; }
      } else if (mission.st === 'active') {
        hud.phase(ph.title, '남은 적 ' + En.count());
        if (En.count() === 0) {
          mission.st = 'outro'; mission.t = 0;
          P.hp = Math.min(100, P.hp + 30);
          game.addScore(300);
          hud.msg('편대 격파!', '기체 수리 +30 · 보너스 +300', 2.6); hud.phase(ph.title, '');
          G.audio.fanfare();
        }
      } else if (mission.t > 3.2) mission.start(mission.idx + 1);
    } else if (ph.kind === 'ascent') {
      if (mission.st === 'intro') {
        game.goal = flatFwd(_goal).multiplyScalar(1500).add(P.pos); _goal.y = P.pos.y + 3000;   // 위쪽을 가리키는 목표 화살표
        if (P.pos.y > 6500) { mission.st = 'outro'; mission.t = 0; game.goal = null; arrive(); }
        else if (P.pos.y > 2000 && P.pitch > 0.25) {
          P.startAscent(); mission.st = 'active'; game.goal = null;
          G.fx.eBolts.clear();
          hud.msg('오버부스트 점화!', '대기권 돌파 중', 3.2, 'warn');
        }
      } else if (mission.st === 'active') {
        cam.trauma = Math.max(cam.trauma, 0.3);
        if (P.ascentDone) { mission.st = 'outro'; mission.t = 0; arrive(); }
      } else if (mission.t > 3.6) mission.start(mission.idx + 1);
    } else {
      if (mission.st === 'intro') {
        if (mission.t > 3) {
          flatFwd(_v).multiplyScalar(3400).add(P.pos); _v.y = 7650;
          En.spawnBoss(_v, P.yaw + Math.PI / 2);
          mission.st = 'active';
        }
      } else if (En.boss) hud.bossBar(true, En.boss.hp / En.boss.maxHp);
    }
  };
  function arrive() {
    G.hud.msg('우주 진입', '궤도 고도 도달 — 소행성에 주의', 3.6);
    G.hud.flash(0.45);
    G.audio.setMood('space');
  }

  // ---------- 한 프레임 ----------
  function step(dt) {
    const P = G.player, F = G.fx, En = G.enemies, c = G.camera;
    if (game.state === 'playing') {
      readControls();
      P.update(dt, ctl);
      game.playTime += dt;
      En.update(dt);
      P.updateTargeting(dt, En.targets);
      F.pBolts.update(dt); F.eBolts.update(dt);
      collide();
      F.updateMissiles(dt, En.targets);
      if (game.state === 'playing') mission.update(dt);
      if (game.comboT > 0) { game.comboT -= dt; if (game.comboT <= 0) game.combo = 0; }
      game.alarmT -= dt;
      if (P.alive && P.hp < 30 && game.alarmT <= 0) { game.alarmT = 1.4; G.audio.alarm(); }
      if (game.winT > 0) { game.winT -= dt; if (game.winT <= 0) showWin(); }
    } else {
      if (game.state !== 'dead') { autoControls(); P.update(dt, ctl); }
      En.update(dt);
      F.pBolts.update(dt); F.eBolts.update(dt);
      F.updateMissiles(dt, En.targets);
      if (game.state === 'dead') {
        const before = game.deadT; game.deadT += dt;
        if (before < 2.4 && game.deadT >= 2.4) showOver();
      }
    }
    updateCamera(dt);
    G.world.update(dt, c.position, G.time);
    F.pBolts.sync(); F.eBolts.sync();
    const sp = G.world.spaceK;
    const streak = game.state === 'dead' ? 0 : G.clamp((P.speed - 150) / 500, 0, 0.5) + P.boostK * 0.2 + P.ascentK * 0.3 + G.world.cloudIn * 0.3;
    F.updateStreaks(c.position, P.vel, streak, G.lerp(1, 0.7, sp), G.lerp(1, 0.85, sp), 1);
    F.update(dt, c);
    G.hud.update(dt);
    G.audio.setEngine(G.clamp((P.speed - 100) / 380, 0, 1.6), P.alive);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const p = G.input.pressed;
    if (p.KeyP || p.Escape) setPause(game.state === 'playing');
    if (p.KeyM) G.hud.hint(G.audio.toggleMute() ? '음소거' : '소리 켜짐', 1.6);
    if (p.KeyB) { G.opts.bloom = !G.opts.bloom; G.hud.hint(G.opts.bloom ? '광원 효과 켜짐' : '광원 효과 꺼짐', 1.6); }
    if (p.Enter && game.state === 'title') startGame(true);
    if (game.state !== 'paused') {
      game.timeScale = G.damp(game.timeScale, game.tsTarget, 3, dt);
      dt *= game.timeScale;
      G.time += dt;
      step(dt);
    }
    render();
    G.input.pressed = {};
  }

  // 점검용 도구 (콘솔에서 사용): 특정 구간으로 건너뛰기
  G.debug = {
    skip(idx) {
      G.enemies.clear(); G.fx.clearAll(); G.hud.bossBar(false);
      G.player.pos.y = PHASES[idx].zone === 'space' ? 7650 : 1300;
      G.player.reset(); cam.yaw = G.player.yaw; cam.pitch = 0;
      mission.start(idx);
    },
  };

  init();
})();
