'use strict';
/* 터치 조작 (휴대폰·태블릿)
   왼쪽 화면 드래그 = 가상 스틱(조종), 오른쪽 버튼 = 사격·미사일·부스트·배럴 롤, 위쪽 = 일시정지·음소거.
   터치 화면 기기에서 자동으로 켜지고, 주소 뒤에 ?touch=1 을 붙이면 PC에서도 켤 수 있다(마우스로 시험 가능).
   main.js가 G.touchCtl.{enabled, sx, sy, fire, boost}를 읽고, 탭 동작은 G.input.pressed로 전달한다. */
(function () {
  const TC = (G.touchCtl = { enabled: false, sx: 0, sy: 0, fire: false, boost: false, autoFiring: false });
  const $ = id => document.getElementById(id);
  const R = 62;          // 스틱이 움직이는 반경(px)
  const DEAD = 0.1;      // 가운데 무감각 구간
  const TAP = { missile: 'TouchMissile', rollL: 'TouchRollL', rollR: 'TouchRollR' };   // 한 번 누르는 버튼
  const param = new URLSearchParams(location.search).get('touch');
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  let el = null, stick = null, shown = false, portraitOk = false;
  let holds = {};        // 누르고 있는 버튼 → 손가락 번호
  const last = {};       // 화면 갱신을 줄이기 위한 직전 값

  function curve(v) {    // 무감각 구간 + 가운데가 부드러운 응답 곡선
    const a = Math.abs(v);
    if (a < DEAD) return 0;
    return Math.sign(v) * Math.pow(Math.min(1, (a - DEAD) / (1 - DEAD)), 1.3);
  }

  TC.init = function () {
    el = {
      root: $('touch'), zone: $('t-zone'), stick: $('t-stick'), knob: $('t-knob'),
      fire: $('tb-fire'), msl: $('tb-msl'), mslN: $('tb-msl-n'), boost: $('tb-boost'),
      pause: $('tb-pause'), mute: $('tb-mute'), rotate: $('rotate'),
    };
    el.zone.addEventListener('pointerdown', zoneDown);
    el.zone.addEventListener('pointermove', zoneMove);
    el.zone.addEventListener('pointerup', zoneUp);
    el.zone.addEventListener('pointercancel', zoneUp);
    el.root.querySelectorAll('[data-k]').forEach(b => {
      b.addEventListener('pointerdown', btnDown);
      b.addEventListener('pointerup', btnUp);
      b.addEventListener('pointercancel', btnUp);
    });
    el.pause.addEventListener('pointerdown', e => { e.preventDefault(); G.setPause(true); });
    el.mute.addEventListener('pointerdown', e => {
      e.preventDefault();
      G.hud.hint(G.audio.toggleMute() ? '음소거' : '소리 켜짐', 1.4);
    });
    $('btn-portrait').addEventListener('click', () => { portraitOk = true; checkOrient(); });

    // 터치 뒤에 따라오는 가짜 마우스 이벤트를 걸러내기 위해 마지막 터치 시각을 기록
    const mark = e => { if (e.pointerType === 'touch') { G.input.lastTouch = performance.now(); if (param !== '0') TC.enable(); } };
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('pointerup', mark, true);
    // 화면 확대·당겨서 새로고침 같은 브라우저 기본 동작 막기 (메뉴 화면 스크롤은 허용)
    document.addEventListener('touchmove', e => { if (!(e.target.closest && e.target.closest('.screen'))) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
    window.addEventListener('resize', checkOrient);
    window.addEventListener('orientationchange', () => setTimeout(checkOrient, 250));

    if (param === '1' || (param !== '0' && coarse)) TC.enable();
  };

  TC.enable = function () {
    if (TC.enabled || !el) return;
    TC.enabled = true;
    document.body.classList.add('touch');
    $('pause-text').textContent = '계속하기를 누르면 이어서 플레이합니다.';
    checkOrient();
  };

  // 출격할 때: 휴대폰이면 전체 화면 + 가로 고정을 시도 (지원하지 않는 브라우저는 그냥 넘어감)
  TC.onStart = function () {
    if (!coarse) return;
    const d = document.documentElement, rq = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!rq || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = rq.call(d, { navigationUI: 'hide' });
      const lock = () => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); };
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    } catch (_) { /* 전체 화면 미지원 */ }
  };

  // ---------- 가상 스틱 ----------
  function zoneDown(e) {
    if (stick || G.game.state !== 'playing') return;
    e.preventDefault();
    try { el.zone.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 등 */ }
    const x = G.clamp(e.clientX, R + 10, innerWidth - R - 10), y = G.clamp(e.clientY, R + 10, innerHeight - R - 10);
    stick = { id: e.pointerId, ox: x, oy: y };
    el.stick.classList.add('on');
    el.stick.style.left = x + 'px'; el.stick.style.top = y + 'px'; el.stick.style.bottom = 'auto';
    zoneMove(e);
  }
  function zoneMove(e) {
    if (!stick || e.pointerId !== stick.id) return;
    e.preventDefault();
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { // 손가락이 반경 밖으로 나가면 스틱 중심이 따라온다
      const k = (len - R) / len;
      stick.ox += dx * k; stick.oy += dy * k; dx -= dx * k; dy -= dy * k;
      el.stick.style.left = stick.ox + 'px'; el.stick.style.top = stick.oy + 'px';
    }
    el.knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    TC.sx = curve(dx / R);
    TC.sy = curve(-dy / R);   // 위로 밀면 기수 상승 (W 키와 같음)
  }
  function zoneUp(e) { if (stick && e.pointerId === stick.id) releaseStick(); }
  function releaseStick() {
    stick = null; TC.sx = TC.sy = 0;
    el.stick.classList.remove('on');
    el.stick.style.left = el.stick.style.top = el.stick.style.bottom = '';
    el.knob.style.transform = '';
  }

  // ---------- 버튼 ----------
  function btnDown(e) {
    const b = e.currentTarget, k = b.dataset.k;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 등 */ }
    b.classList.add('on');
    if (TAP[k]) G.input.pressed[TAP[k]] = true;
    else { holds[k] = e.pointerId; TC[k] = true; }
  }
  function btnUp(e) {
    const b = e.currentTarget, k = b.dataset.k;
    b.classList.remove('on');
    if (!TAP[k] && holds[k] === e.pointerId) { holds[k] = null; TC[k] = false; }
  }
  function releaseAll() {
    if (stick) releaseStick();
    holds = {}; TC.fire = TC.boost = false; TC.autoFiring = false;
    el.root.querySelectorAll('.tb.on').forEach(b => b.classList.remove('on'));
  }

  // ---------- 가로 화면 안내 ----------
  function checkOrient() {
    if (!el) return;
    const show = TC.enabled && !portraitOk && innerHeight > innerWidth;
    el.rotate.classList.toggle('hidden', !show);
    if (show && G.game && G.game.state === 'playing') G.setPause(true);
  }

  // ---------- 매 프레임 ----------
  function set(key, v, fn) { if (last[key] !== v) { last[key] = v; fn(v); } }
  TC.update = function () {
    if (!TC.enabled) return;
    const playing = G.game.state === 'playing';
    if (playing !== shown) {
      shown = playing;
      el.root.classList.toggle('hidden', !playing);
      if (!playing) releaseAll();
    }
    if (!playing) return;
    const P = G.player;
    set('msl', P.missiles, v => { el.mslN.textContent = v; el.msl.classList.toggle('empty', v <= 0); });
    set('lock', P.locked && P.missiles > 0, v => el.msl.classList.toggle('locked', v));
    set('boost', Math.round(P.boostE), v => el.boost.style.setProperty('--e', (v / 100).toFixed(2)));
    set('auto', TC.autoFiring, v => el.fire.classList.toggle('auto', v));
    set('mute', G.audio.muted, v => el.mute.classList.toggle('off', v));
  };
})();
