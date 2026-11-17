'use strict';
/* 공용 도구: 수학 헬퍼, 상수, 절차적 텍스처, 입력, 지오메트리 헬퍼 */
(function () {
  const T = THREE;
  const G = (window.G = { time: 0, opts: { mouse: false, invertY: false, bloom: true } });

  // ---------- 수학 ----------
  G.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  G.randS = (a = 1) => (Math.random() * 2 - 1) * a;
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.sstep = (a, b, x) => { const t = G.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  G.damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
  G.dampAngle = (cur, target, lambda, dt) => {
    let d = target - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + d * (1 - Math.exp(-lambda * dt));
  };
  G.randDir = out => {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return out.set(s * Math.cos(a), u, s * Math.sin(a));
  };
  // 같은 위치의 정점은 같은 값을 갖는 해시 (지오메트리 변형용)
  G.hash3 = (x, y, z, s = 0) => {
    const h = Math.sin(Math.round(x * 1000) * 0.0129898 + Math.round(y * 1000) * 0.078233 + Math.round(z * 1000) * 0.037719 + s) * 43758.5453;
    return h - Math.floor(h);
  };
  // 선분(p0→p1)과 구(c, r) 충돌
  const _ab = new T.Vector3(), _ac = new T.Vector3();
  G.segSphere = (p0, p1, c, r) => {
    _ab.subVectors(p1, p0); _ac.subVectors(c, p0);
    const len2 = _ab.lengthSq();
    const t = len2 > 0 ? G.clamp(_ac.dot(_ab) / len2, 0, 1) : 0;
    _ab.multiplyScalar(t).add(p0);
    return _ab.distanceToSquared(c) <= r * r;
  };
  // dir을 desired 쪽으로 최대 maxAngle만큼 회전 (둘 다 단위 벡터)
  const _perp = new T.Vector3();
  G.turnToward = (dir, desired, maxAngle) => {
    const dot = G.clamp(dir.dot(desired), -1, 1);
    const ang = Math.acos(dot);
    if (ang < 1e-4) return 0;
    if (dot < -0.98) { // 정반대: 옆으로 살짝 밀어 회전 시작
      _perp.set(0, 1, 0).cross(dir);
      if (_perp.lengthSq() < 1e-4) _perp.set(1, 0, 0);
      dir.addScaledVector(_perp.normalize(), 0.15).normalize();
      return ang;
    }
    const t = Math.min(1, maxAngle / ang);
    dir.lerp(desired, t).normalize();
    return ang;
  };

  // ---------- 세계 상수 ----------
  G.C = {
    PLANET_R: 120000,   // 행성 반지름
    SKY_TOP: 2600,      // 이 고도부터 하늘이 어두워지기 시작
    SPACE_ALT: 7400,    // 이 고도부터 우주
    CEILING: 13500,     // 작전 고도 한계
    SUN: new T.Vector3(0.42, 0.5, -0.76).normalize(),
  };
  G.spaceBlend = alt => G.sstep(G.C.SKY_TOP, G.C.SPACE_ALT, alt);

  // ---------- 절차적 텍스처 ----------
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.needsUpdate = true;
    return t;
  }
  function lumps(g, s, n, spread, rMin, rMax, alpha) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = Math.random() * s * spread;
      const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d * 0.85, r = s * G.rand(rMin, rMax);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
  }
  G.tex = {};
  G.makeTextures = function () {
    // 부드러운 발광 점 (불꽃·스파크)
    G.tex.glow = canvasTex(128, 128, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.22, 'rgba(255,255,255,0.6)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.14)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    // 구름 덩어리
    G.tex.puff = canvasTex(256, 256, (g, s) => lumps(g, s, 36, 0.24, 0.1, 0.24, 0.2));
    // 연기
    G.tex.smoke = canvasTex(128, 128, (g, s) => lumps(g, s, 18, 0.2, 0.14, 0.28, 0.16));
    // 레이저 볼트 (가로: 폭, 세로: 길이)
    G.tex.bolt = canvasTex(32, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.32, 'rgba(255,255,255,0.3)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(0.68, 'rgba(255,255,255,0.3)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const g2 = g.createLinearGradient(0, 0, 0, h);
      g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.22, 'rgba(0,0,0,1)');
      g2.addColorStop(0.78, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = g2; g.fillRect(0, 0, w, h);
    });
    // 가스 행성 줄무늬
    G.tex.giant = canvasTex(256, 128, (g, w, h) => {
      const cols = ['#c9a57a', '#e4cfa8', '#a8754e', '#d9b88a', '#8f5f44', '#e9d7b5', '#b98a5e', '#d2ad80'];
      let y = 0;
      while (y < h) {
        const bh = G.rand(4, 16);
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.fillRect(0, y, w, bh + 1); y += bh;
      }
      for (let i = 0; i < 260; i++) { // 띠 흐름 무늬
        g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,240,215' : '70,40,25') + ',' + G.rand(0.04, 0.12) + ')';
        g.fillRect(G.rand(w), G.rand(h), G.rand(20, 90), G.rand(1, 3));
      }
      g.fillStyle = 'rgba(170,70,40,0.55)'; // 대적점
      g.beginPath(); g.ellipse(w * 0.3, h * 0.62, 16, 8, 0, 0, 6.283); g.fill();
    });
  };

  // ---------- 지오메트리 헬퍼 ----------
  // [[x,z],...] 평면 다각형을 두께 thick의 수평 판으로
  G.flatPoly = function (pts, thick) {
    const sh = new T.Shape();
    pts.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    const g = new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
    g.translate(0, 0, -thick / 2);
    g.rotateX(Math.PI / 2);
    return g;
  };
  // 좌우 대칭 판 한 쌍을 그룹에 추가
  G.addMirrored = function (group, geo, mat, x, y, z, rotZ) {
    const r = new T.Mesh(geo, mat); r.position.set(x, y, z); r.rotation.z = rotZ || 0;
    const l = new T.Mesh(geo, mat); l.position.set(-x, y, z); l.rotation.z = -(rotZ || 0); l.scale.x = -1;
    group.add(r, l);
    return [r, l];
  };

  // ---------- 입력 ----------
  const input = (G.input = { keys: {}, pressed: {}, mouse: { x: 0, y: 0, l: false, r: false } });
  G.initInput = function () {
    const block = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
    window.addEventListener('keydown', e => {
      if (block.indexOf(e.code) >= 0) e.preventDefault();
      if (!input.keys[e.code]) input.pressed[e.code] = true;
      input.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { input.keys[e.code] = false; });
    window.addEventListener('blur', () => { input.keys = {}; input.mouse.l = input.mouse.r = false; });
    window.addEventListener('mousemove', e => {
      input.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      input.mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    });
    window.addEventListener('mousedown', e => {
      if (e.target && e.target.closest && e.target.closest('.screen')) return; // 메뉴 클릭은 무시
      if (e.button === 0) input.mouse.l = true;
      if (e.button === 2) { input.mouse.r = true; input.pressed.MouseR = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) input.mouse.l = false;
      if (e.button === 2) input.mouse.r = false;
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
  };
})();
