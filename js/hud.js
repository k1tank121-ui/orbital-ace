'use strict';
/* HUD: 점수, 게이지, 조준선, 록온, 표적 표시, 레이더, 메시지, 화면 효과
   main.js가 제공해야 하는 값: G.game.{state, score, combo, goal(Vector3|null)} */
(function () {
  const H = (G.hud = {});
  const $ = id => document.getElementById(id);
  const _v = new THREE.Vector3();
  let el = {}, marks = [], arrows = [], radar = null, msgT = 0, hintT = 0, flashV = 0, lastScore = -1, lastMsl = -1;

  H.init = function () {
    ['hud', 'score', 'combo', 'phase-title', 'phase-sub', 'bossbar', 'boss-fill', 'msg', 'msg-main', 'msg-sub', 'cross', 'lock',
      'bar-shield', 'bar-hp', 'bar-boost', 'speed', 'alt', 'missiles', 'alt-ptr', 'hint', 'fx-white', 'fx-dmg', 'fx-speed', 'fx-flash'].forEach(id => (el[id] = $(id)));
    const box = $('marks');
    for (let i = 0; i < 18; i++) { const d = document.createElement('div'); d.className = 'mark'; d.innerHTML = '<span></span>'; box.appendChild(d); marks.push(d); }
    for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'arrow'; box.appendChild(d); arrows.push(d); }
    radar = $('radar').getContext('2d');
  };
  H.show = on => el.hud.classList.toggle('hidden', !on);
  H.msg = function (main, sub, dur, cls) {
    el['msg-main'].textContent = main; el['msg-sub'].textContent = sub || '';
    el.msg.className = 'on ' + (cls || ''); msgT = dur || 3;
  };
  H.hint = function (text, dur) { el.hint.textContent = text; el.hint.classList.add('on'); hintT = dur || 5; };
  H.phase = function (title, sub) { el['phase-title'].textContent = title || ''; el['phase-sub'].textContent = sub || ''; };
  H.flash = v => { flashV = Math.max(flashV, v); };
  H.bossBar = function (on, k) {
    el.bossbar.classList.toggle('hidden', !on);
    if (on) el['boss-fill'].style.transform = 'scaleX(' + G.clamp(k, 0, 1) + ')';
  };

  // 월드 좌표 → 화면 좌표. 화면 안이면 true
  function project(p, out) {
    _v.copy(p).project(G.camera);
    const w = window.innerWidth, h = window.innerHeight, behind = _v.z > 1;
    out.x = (_v.x * 0.5 + 0.5) * w; out.y = (-_v.y * 0.5 + 0.5) * h; out.behind = behind;
    return !behind && _v.x > -1 && _v.x < 1 && _v.y > -1 && _v.y < 1;
  }
  const _s = { x: 0, y: 0, behind: false };
  function edgeArrow(a, cls) { // 화면 밖 대상을 가리키는 가장자리 화살표
    const w = window.innerWidth, h = window.innerHeight, cx = w / 2, cy = h / 2;
    let dx = _s.x - cx, dy = _s.y - cy;
    if (_s.behind) { dx = -dx; dy = -dy; }
    const ang = Math.atan2(dy, dx), r = Math.min(cx, cy) * 0.82;
    a.className = 'arrow ' + (cls || '');
    a.style.display = 'block';
    a.style.transform = 'translate(' + (cx + Math.cos(ang) * r * (w / h > 1 ? 1.35 : 1)) + 'px,' + (cy + Math.sin(ang) * r) + 'px) rotate(' + (ang + Math.PI / 2) + 'rad)';
  }

  H.update = function (dt) {
    const P = G.player, game = G.game, targets = G.enemies.targets;
    const playing = game.state === 'playing';

    // 점수 · 콤보
    if (game.score !== lastScore) { lastScore = game.score; el.score.textContent = game.score.toLocaleString(); }
    el.combo.textContent = game.combo > 1 ? 'COMBO ×' + game.combo : '';

    // 게이지
    el['bar-shield'].style.transform = 'scaleX(' + P.shield / 100 + ')';
    el['bar-hp'].style.transform = 'scaleX(' + P.hp / 100 + ')';
    el['bar-hp'].parentNode.classList.toggle('low', P.hp < 35);
    el['bar-boost'].style.transform = 'scaleX(' + P.boostE / 100 + ')';
    el.speed.textContent = Math.round(P.speed * 6).toLocaleString();
    el.alt.textContent = (P.pos.y / 100).toFixed(1);
    el['alt-ptr'].style.bottom = G.clamp(P.pos.y / 14000, 0, 1) * 100 + '%';
    if (P.missiles !== lastMsl) {
      lastMsl = P.missiles;
      let s = ''; for (let i = 0; i < 6; i++) s += '<i class="' + (i < P.missiles ? '' : 'off') + '"></i>';
      el.missiles.innerHTML = s;
    }

    // 조준선
    const showAim = playing && P.alive && !P.ascent;
    el.cross.style.display = showAim ? 'block' : 'none';
    if (showAim) {
      _v.copy(P.pos).addScaledVector(P.fwd, 900); project(_v, _s);
      el.cross.style.transform = 'translate(' + _s.x + 'px,' + _s.y + 'px)';
      el.cross.classList.toggle('hot', !!P.assist);
    }

    // 표적 표시 · 화면 밖 화살표
    let mi = 0, ai = 0;
    if (playing) {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.alive) continue;
        const on = project(t.pos, _s);
        if (on && mi < marks.length) {
          const m = marks[mi++];
          m.className = 'mark' + (t.big ? ' big' : '') + (t.core ? ' core' : '');
          m.style.display = 'block';
          m.style.transform = 'translate(' + _s.x + 'px,' + _s.y + 'px)';
          m.firstChild.textContent = Math.round(t.pos.distanceTo(P.pos)) + 'm';
        } else if (!on && ai < arrows.length) edgeArrow(arrows[ai++], t.boss ? 'boss' : '');
      }
      if (game.goal && ai < arrows.length && !project(game.goal, _s)) edgeArrow(arrows[ai++], 'goal');
    }
    for (; mi < marks.length; mi++) marks[mi].style.display = 'none';
    for (; ai < arrows.length; ai++) arrows[ai].style.display = 'none';

    // 록온
    const lc = showAim ? P.lockCand : null;
    if (lc && lc.alive && project(lc.pos, _s)) {
      el.lock.style.display = 'block';
      el.lock.style.transform = 'translate(' + _s.x + 'px,' + _s.y + 'px)';
      el.lock.style.setProperty('--s', (1.7 - P.lockT * 0.7).toFixed(2));
      el.lock.classList.toggle('locked', P.locked);
    } else el.lock.style.display = 'none';

    // 레이더 (위쪽 = 기수 방향)
    const c = radar, S = 168, cx = S / 2, R = S / 2 - 4, range = 3600;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(4,16,30,0.5)'; c.beginPath(); c.arc(cx, cx, R, 0, 6.283); c.fill();
    c.strokeStyle = 'rgba(120,220,255,0.45)'; c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cx, R, 0, 6.283); c.stroke();
    c.beginPath(); c.arc(cx, cx, R / 2, 0, 6.283); c.stroke();
    c.beginPath(); c.moveTo(cx, cx - R); c.lineTo(cx, cx + R); c.moveTo(cx - R, cx); c.lineTo(cx + R, cx); c.stroke();
    const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alive) continue;
      const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z;
      let rx = (dx * cs - dz * sn) / range, rf = (-dx * sn - dz * cs) / range;
      const d = Math.hypot(rx, rf);
      if (d > 1) { rx /= d; rf /= d; }
      c.fillStyle = t.boss ? '#ffd24a' : '#ff4d5e';
      c.beginPath(); c.arc(cx + rx * R, cx - rf * R, t.big ? 4 : 2.6, 0, 6.283); c.fill();
    }
    c.fillStyle = '#6fe6ff';
    c.beginPath(); c.moveTo(cx, cx - 7); c.lineTo(cx + 5, cx + 5); c.lineTo(cx - 5, cx + 5); c.closePath(); c.fill();

    // 메시지 · 힌트 타이머
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) el.msg.className = ''; }
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) el.hint.classList.remove('on'); }

    // 화면 효과
    flashV = Math.max(0, flashV - dt * 1.6);
    el['fx-flash'].style.opacity = flashV;
    el['fx-white'].style.opacity = Math.min(0.62, G.world.cloudIn * 0.75);
    el['fx-speed'].style.opacity = Math.min(1, P.boostK * 0.7 + P.ascentK);
    el['fx-dmg'].style.opacity = Math.min(1, P.hitFlash * 0.85 + (playing && P.alive && P.hp < 30 ? 0.25 + Math.sin(G.time * 6) * 0.12 : 0));
  };
})();
