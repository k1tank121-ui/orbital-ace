# ORBITAL ACE · 오비탈 에이스 — 하늘에서 우주까지

적 편대를 격파하고 대기권을 돌파해, 궤도 위의 모선을 파괴하는 3D 비행 슈팅 게임입니다. 브라우저에서 바로 플레이할 수 있습니다.

## ▶ 바로 플레이

**https://k1tank121-ui.github.io/orbital-ace/**

PC 브라우저(Chrome · Edge 권장)와 키보드 · 마우스로 플레이하세요. 휴대폰 터치 조작은 지원하지 않습니다.

## 조작법

| 동작 | 키 |
|---|---|
| 기체 조향 | W A S D 또는 방향키 (옵션: 마우스 조향) |
| 기관포 사격 | Space · J · 마우스 왼쪽 |
| 유도 미사일 | F · K · 마우스 오른쪽 |
| 부스트 | Shift |
| 감속 | X |
| 배럴 롤 | Q / E |
| 일시정지 | P 또는 Esc |
| 음소거 | M |
| 광원 효과 켜기/끄기 | B |

## 로컬에서 실행

```bash
python -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 구성

```
index.html   게임 화면
css/         스타일
js/          게임 로직 (월드, 플레이어, 적, 효과, HUD, 사운드)
lib/         three.js와 후처리(블룸) 모듈
```

three.js © 2010-2021 Three.js Authors, MIT License
