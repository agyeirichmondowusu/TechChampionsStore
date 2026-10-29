// 3D models of the Champ Core trainer board (Uno, ESP32 and Pico W editions), the Champ Drive robot base
// and the line-follower mat. All units are millimetres. Each assembly group carries userData.explode
// ({ stage, off }) so the product page can pull the robot apart and rebuild it as the visitor scrolls.
import * as THREE from 'three'

let maxAniso = 4
export function setAnisotropy(n) { maxAniso = n }

// ---------- data ----------
export const VARIANTS = {
  uno: {
    tag: 'U', label: 'Uno', edition: 'UNO EDITION', mask: '#0c47b0', trace: '#1d61d4',
    sub: 'The brain that most school syllabuses already teach.',
    specs: [['Microcontroller', 'ATmega328P'], ['Core', '8-bit AVR, 16 MHz'], ['Memory', '32 KB flash · 2 KB RAM'], ['Logic level', '5 V'], ['Wireless', 'None'], ['Code in', 'Arduino C++ or blocks'], ['Best for', 'First lessons, ages 9 and up']],
    pins: { btnA: 'D4', btnB: 'A3', buzz: 'D11', pot: 'A0', ldr: 'A1', mic: 'A2', ir: 'D12', rgb: 'D7', sonar: 'D8', s1: 'D9', s2: 'D10', i2c: 'A4 / A5', dig: 'D13', ana: 'A6', uart: 'D0 / D1' },
  },
  esp32: {
    tag: 'E', label: 'ESP32', edition: 'ESP32 EDITION', mask: '#16181c', trace: '#24272d',
    sub: 'Wi-Fi and Bluetooth for app-controlled robots and IoT projects.',
    specs: [['Microcontroller', 'ESP32-WROOM-32'], ['Core', 'Dual-core 32-bit, 240 MHz'], ['Memory', '4 MB flash · 520 KB RAM'], ['Logic level', '3.3 V, ports level-shifted'], ['Wireless', 'Wi-Fi + Bluetooth'], ['Code in', 'Arduino C++, MicroPython or blocks'], ['Best for', 'IoT and phone control, SHS to tertiary']],
    pins: { btnA: 'IO27', btnB: 'IO26', buzz: 'IO25', pot: 'IO36', ldr: 'IO39', mic: 'IO34', ir: 'IO35', rgb: 'IO4', sonar: 'IO5', s1: 'IO18', s2: 'IO19', i2c: 'IO21 / IO22', dig: 'IO23', ana: 'IO33', uart: 'IO16 / IO17' },
  },
  pico: {
    tag: 'P', label: 'Pico W', edition: 'PICO W EDITION', mask: '#13693a', trace: '#1c7d47',
    sub: 'The low-cost way into Python, with Wi-Fi built in.',
    specs: [['Microcontroller', 'RP2040 on Raspberry Pi Pico W'], ['Core', 'Dual-core Cortex-M0+, 133 MHz'], ['Memory', '2 MB flash · 264 KB RAM'], ['Logic level', '3.3 V, ports level-shifted'], ['Wireless', 'Wi-Fi + Bluetooth LE'], ['Code in', 'MicroPython, Arduino C++ or blocks'], ['Best for', 'Python learners, JHS to tertiary']],
    pins: { btnA: 'GP14', btnB: 'GP15', buzz: 'GP16', pot: 'GP26', ldr: 'GP27', mic: 'GP28', ir: 'GP17', rgb: 'GP18', sonar: 'GP19', s1: 'GP20', s2: 'GP21', i2c: 'GP4 / GP5', dig: 'GP22', ana: 'GP28*', uart: 'GP0 / GP1' },
  },
};
export const PIN_ROWS = [['Button A', 'btnA'], ['Button B', 'btnB'], ['Buzzer', 'buzz'], ['Potentiometer', 'pot'], ['Light sensor', 'ldr'], ['Microphone', 'mic'], ['IR receiver', 'ir'], ['RGB pixels', 'rgb'], ['Ultrasonic', 'sonar'], ['Servo 1', 's1'], ['Servo 2', 's2'], ['I2C bus (OLED, motion, climate)', 'i2c']];

// ---------- helpers ----------
const PX = 20; // texture pixels per millimetre
function canvas(wmm, dmm, s = PX) {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(wmm * s)); c.height = Math.max(8, Math.round(dmm * s));
  return { c, g: c.getContext('2d'), s };
}
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; }
function std(color, o = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0 }, o)); }
const MAT = {
  epoxy: std('#17181b', { roughness: 0.45 }),
  plasticBlack: std('#222429', { roughness: 0.6 }),
  plasticWhite: std('#f2efe6', { roughness: 0.55 }),
  plasticRed: std('#c8202b', { roughness: 0.45 }),
  steel: std('#d2d6dc', { metalness: 1, roughness: 0.28 }),
  tin: std('#c3c8ce', { metalness: 0.9, roughness: 0.35 }),
  gold: std('#d8ac56', { metalness: 1, roughness: 0.3 }),
  brass: std('#c9a24a', { metalness: 1, roughness: 0.38 }),
  ceramicTan: std('#c7a67a', { roughness: 0.7 }),
  rubber: std('#1c1d20', { roughness: 0.92, side: THREE.DoubleSide }),
  feet: std('#2a2b2e', { roughness: 0.95 }),
  abs: std('#e3e7ee', { roughness: 0.5 }),
  absDark: std('#3a4152', { roughness: 0.55 }),
  brand: std('#1e74ff', { roughness: 0.42 }),
  hole: std('#050505', { roughness: 1 }),
};
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
// box with its bottom face resting at y
function box(parent, w, h, d, mat, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y + h / 2, z); }
function cyl(parent, r, h, mat, x, y, z, seg = 32, r2) { return mesh(new THREE.CylinderGeometry(r2 == null ? r : r2, r, h, seg), mat, parent, x, y + h / 2, z); }
function group(parent, x = 0, y = 0, z = 0, pick) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  if (pick) g.userData.pick = pick;
  if (parent) parent.add(g);
  return g;
}
function roundedShape(w, d, r, holes = []) {
  const s = new THREE.Shape(), x0 = -w / 2, y0 = -d / 2;
  const rr = Array.isArray(r) ? r : [r, r, r, r]; // [backLeft, backRight, frontRight, frontLeft] in world terms
  // shape y = -world z, so "back" (world -z) is shape +y
  s.moveTo(x0 + rr[3], y0);
  s.lineTo(x0 + w - rr[2], y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr[2]);
  s.lineTo(x0 + w, y0 + d - rr[1]); s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - rr[1], y0 + d);
  s.lineTo(x0 + rr[0], y0 + d); s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - rr[0]);
  s.lineTo(x0, y0 + rr[3]); s.quadraticCurveTo(x0, y0, x0 + rr[3], y0);
  for (const h of holes) { const p = new THREE.Path(); p.absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true); s.holes.push(p); }
  return s;
}
function chipTop(lines, wmm, dmm, bg = '#17181b', fg = 'rgba(200,204,212,.78)', dot = true) {
  const { c, g, s } = canvas(wmm, dmm, 40);
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length, fs = Math.min(dmm / (n + 1.2), wmm / Math.max(...lines.map(l => l.length)) * 1.45) * s;
  g.font = `600 ${fs}px "JetBrains Mono", monospace`;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height * (i + 1) / (n + 1)));
  if (dot) { g.beginPath(); g.arc(s * 0.9, s * 0.9, s * 0.35, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.55)'; g.fill(); }
  return tex(c);
}
function boxTop(parent, w, h, d, side, topMap, x, y, z, topOpts = {}) {
  const top = new THREE.MeshStandardMaterial(Object.assign({ map: topMap, roughness: side.roughness, metalness: side.metalness }, topOpts));
  return mesh(new THREE.BoxGeometry(w, h, d), [side, side, top, side, side, side], parent, x, y + h / 2, z);
}
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// glow sprite for lit LEDs
const glowTex = (() => {
  const { c, g } = canvas(4, 4, 32);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function glow(parent, color, size, x, y, z) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  sp.scale.set(size, size, 1); sp.position.set(x, y, z); sp.renderOrder = 5;
  parent.add(sp); return sp;
}

// ---------- shared small parts ----------
function passive(parent, x, y, z, rot = 0, kind = 'cap') {
  const g = group(parent, x, y, z); g.rotation.y = rot;
  const body = kind === 'res' ? MAT.epoxy : MAT.ceramicTan;
  box(g, 1.0, 0.5, 0.8, body, 0, 0, 0);
  box(g, 0.3, 0.52, 0.82, MAT.tin, -0.65, 0, 0);
  box(g, 0.3, 0.52, 0.82, MAT.tin, 0.65, 0, 0);
  return g;
}
function qfp(parent, size, h, pinsPerSide, lines, x, y, z, rot = 0, legs = true) {
  const g = group(parent, x, y, z); g.rotation.y = rot;
  boxTop(g, size, h, size, MAT.epoxy, chipTop(lines, size, size), 0, legs ? 0.15 : 0, 0);
  if (legs) {
    const pitch = (size - 1.4) / (pinsPerSide - 1), pg = new THREE.BoxGeometry(1.0, 0.18, 0.3);
    for (let i = 0; i < pinsPerSide; i++) {
      const o = -size / 2 + 0.7 + i * pitch;
      for (const [px, pz, ry] of [[size / 2 + 0.4, o, 0], [-size / 2 - 0.4, o, 0], [o, size / 2 + 0.4, Math.PI / 2], [o, -size / 2 - 0.4, Math.PI / 2]]) {
        const m = mesh(pg, MAT.tin, g, px, 0.09, pz); m.rotation.y = ry; m.castShadow = false;
      }
    }
  }
  return g;
}
function soic(parent, len, wid, h, pins, lines, x, y, z, rot = 0) {
  const g = group(parent, x, y, z); g.rotation.y = rot;
  boxTop(g, len, h, wid, MAT.epoxy, chipTop(lines, len, wid), 0, 0.15, 0);
  const pitch = (len - 1) / (pins / 2 - 1), pg = new THREE.BoxGeometry(0.4, 0.2, 1.1);
  for (let i = 0; i < pins / 2; i++) {
    const px = -len / 2 + 0.5 + i * pitch;
    mesh(pg, MAT.tin, g, px, 0.1, wid / 2 + 0.45).castShadow = false;
    mesh(pg, MAT.tin, g, px, 0.1, -wid / 2 - 0.45).castShadow = false;
  }
  return g;
}
function sot223(parent, x, y, z, rot = 0) {
  const g = group(parent, x, y, z); g.rotation.y = rot;
  boxTop(g, 6.5, 1.6, 3.5, MAT.epoxy, chipTop(['1117', '3.3'], 6.5, 3.5), 0, 0.1, 0);
  box(g, 3.0, 0.2, 1.6, MAT.tin, 0, 0, -2.6);
  for (const px of [-2.3, 0, 2.3]) box(g, 0.7, 0.2, 1.6, MAT.tin, px, 0, 2.6);
  return g;
}
function smdLed(parent, color, x, y, z) {
  const m = std('#f6f3ea', { emissive: new THREE.Color(color), emissiveIntensity: 0, roughness: 0.3 });
  box(parent, 1.6, 0.6, 0.8, m, x, y, z);
  const gl = glow(parent, color, 5, x, y + 0.9, z);
  return { set(v) { m.emissiveIntensity = v * 2.2; gl.material.opacity = v * 0.85; } };
}
function usbC(parent, x, y, z, rot = 0) {
  const g = group(parent, x, y, z); g.rotation.y = rot;
  const shell = mesh(new THREE.BoxGeometry(7.4, 3.2, 8.9), MAT.steel, g, 0, 1.6, 0);
  box(g, 0.2, 2.2, 6.6, MAT.hole, 3.65, 0.5, 0);
  return g;
}
function microUsb(parent, x, y, z, rot = 0) {
  const g = group(parent, x, y, z); g.rotation.y = rot;
  box(g, 5.6, 2.6, 7.6, MAT.steel, 0, 0, 0);
  box(g, 0.2, 1.6, 6.0, MAT.hole, 2.75, 0.5, 0);
  return g;
}
function tact(parent, x, y, z, capColor = '#1b1b1b') {
  const g = group(parent, x, y, z);
  box(g, 3.6, 1.4, 4.4, MAT.steel, 0, 0, 0);
  box(g, 1.6, 0.7, 2.4, std(capColor), 0, 1.4, 0);
  return g;
}
function femaleHeader(parent, n, rows, x, y, z, axis = 'x') {
  const L = n * 2.54, W = rows * 2.54, h = 8.5;
  const g = group(parent, x, y, z); if (axis === 'z') g.rotation.y = Math.PI / 2;
  box(g, L, h, W, MAT.plasticBlack, 0, 0, 0);
  const hg = new THREE.BoxGeometry(1.0, 0.05, 1.0);
  for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
    const m = mesh(hg, MAT.hole, g, -L / 2 + 1.27 + i * 2.54, h + 0.01, -W / 2 + 1.27 + r * 2.54); m.castShadow = false;
  }
  return g;
}
function maleHeader(parent, n, rows, x, y, z, axis = 'x', pinMat = MAT.gold) {
  const L = n * 2.54, W = rows * 2.54;
  const g = group(parent, x, y, z); if (axis === 'z') g.rotation.y = Math.PI / 2;
  box(g, L, 2.5, W, MAT.plasticBlack, 0, 0, 0);
  const pg = new THREE.BoxGeometry(0.64, 6, 0.64);
  for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) mesh(pg, pinMat, g, -L / 2 + 1.27 + i * 2.54, 3, -W / 2 + 1.27 + r * 2.54);
  return g;
}

// ---------- board silkscreen ----------
function drawPcb(W, D, mask, trace, silk, seed, extra) {
  const { c, g, s } = canvas(W, D);
  const X = x => (x + W / 2) * s, Z = z => (z + D / 2) * s;
  g.fillStyle = mask; g.fillRect(0, 0, c.width, c.height);
  // copper traces under the mask
  const R = rng(seed);
  g.strokeStyle = trace; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < Math.round(W * D / 70); i++) {
    let x = (R() - 0.5) * (W - 6), z = (R() - 0.5) * (D - 6);
    g.lineWidth = (R() < 0.2 ? 0.7 : 0.32) * s;
    g.beginPath(); g.moveTo(X(x), Z(z));
    for (let k = 0; k < 3; k++) {
      const len = 3 + R() * 14, dir = Math.floor(R() * 4);
      const d = 1.5 + R() * 3;
      if (dir === 0) { x += len; } else if (dir === 1) { z += len * 0.6; } else if (dir === 2) { x += d; z += d; } else { x -= d; z += d; }
      x = Math.max(-W / 2 + 3, Math.min(W / 2 - 3, x)); z = Math.max(-D / 2 + 3, Math.min(D / 2 - 3, z));
      g.lineTo(X(x), Z(z));
    }
    g.stroke();
    g.beginPath(); g.arc(X(x), Z(z), 0.42 * s, 0, Math.PI * 2); g.fillStyle = trace; g.fill();
    g.beginPath(); g.arc(X(x), Z(z), 0.16 * s, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.6)'; g.fill();
  }
  const api = {
    g, s, X, Z,
    rect(x, z, w, d, lw = 0.16) { g.strokeStyle = silk; g.lineWidth = lw * s; g.strokeRect(X(x - w / 2), Z(z - d / 2), w * s, d * s); },
    fill(x, z, w, d, col) { g.fillStyle = col; g.fillRect(X(x - w / 2), Z(z - d / 2), w * s, d * s); },
    circle(x, z, r, lw = 0.16) { g.beginPath(); g.arc(X(x), Z(z), r * s, 0, Math.PI * 2); g.strokeStyle = silk; g.lineWidth = lw * s; g.stroke(); },
    pad(x, z, r, col = '#d8ac56') { g.beginPath(); g.arc(X(x), Z(z), r * s, 0, Math.PI * 2); g.fillStyle = col; g.fill(); },
    text(t, x, z, size, align = 'center', weight = 600, font = 'Montserrat', col = silk, rot = 0) {
      g.save(); g.translate(X(x), Z(z)); g.rotate(rot);
      g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle';
      g.font = `${weight} ${size * s}px "${font}", Arial, sans-serif`;
      g.fillText(t, 0, 0); g.restore();
    },
  };
  extra(api);
  return tex(c);
}
function pcbMesh(parent, W, D, r, holes, maskColor, map) {
  const shape = roundedShape(W, D, r, holes);
  const maskMat = new THREE.MeshPhysicalMaterial({ color: maskColor, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const ex = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false, curveSegments: 10 });
  ex.rotateX(-Math.PI / 2);
  mesh(ex, maskMat, parent);
  map.repeat.set(1 / W, 1 / D); map.offset.set(0.5, 0.5);
  const topGeo = new THREE.ShapeGeometry(shape, 10); topGeo.rotateX(-Math.PI / 2);
  const top = mesh(topGeo, new THREE.MeshPhysicalMaterial({ map, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.3 }), parent, 0, 1.605, 0);
  top.castShadow = false;
  return top;
}

// ---------- brains ----------
// Each brain is built at its own origin, PCB bottom at y = 0, long axis on x.
function brainUno(parent) {
  const W = 50, D = 26, g = group(parent, 0, 0, 0);
  const map = drawPcb(W, D, '#00838c', '#0a979f', '#f4f8f8', 11, p => {
    for (let i = 0; i < 15; i++) { const x = -17.78 + i * 2.54; p.pad(x, D / 2 - 1.6, 0.8); p.pad(x, -D / 2 + 1.6, 0.8); }
    const top = ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND', 'RST', 'RX0', 'TX1'];
    const bot = ['D13', '3V3', 'REF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST', 'GND', 'VIN'];
    top.forEach((t, i) => p.text(t, -17.78 + i * 2.54, -D / 2 + 3.6, 0.85, 'center', 600));
    bot.forEach((t, i) => p.text(t, -17.78 + i * 2.54, D / 2 - 3.6, 0.85, 'center', 600));
    p.text('CHAMP UNO', 13, -6.2, 1.7, 'center', 800);
    p.text('ATmega328P · 16 MHz', 13, 6.4, 1.0, 'center', 600);
    p.rect(4, 0, 10.5, 10.5); p.text('L', 18.5, 1.2, 0.9); p.text('ON', 18.5, 5.6, 0.9);
  });
  pcbMesh(g, W, D, 1.2, [{ x: -22.5, z: -10, r: 1.0 }, { x: 22.5, z: 10, r: 1.0 }], '#00838c', map);
  const y = 1.6;
  usbC(g, -21.6, y, 0);
  qfp(g, 7, 1.0, 8, ['ATMEGA', '328P', 'AU'], 4, y, 0, Math.PI / 4);
  soic(g, 9.9, 3.9, 1.5, 16, ['CH340C'], -9.5, y, -6.5);
  sot223(g, -10, y, 6.2);
  box(g, 3.2, 0.8, 2.5, MAT.steel, -2.8, y, 8.2);
  tact(g, 15.5, y, -6.5, '#f4f4f4');
  const L = smdLed(g, '#ffa531', 18.5, y, 3.2);
  const ON = smdLed(g, '#45ff7a', 18.5, y, 7.6); ON.set(0.9);
  const R = rng(5);
  for (const [px, pz, rot] of [[-3, -4, 0], [-3, 4, 0], [10, -2, Math.PI / 2], [10, 3, Math.PI / 2], [-15, -1, 0], [-15, 2, 0], [-5, 10.2, 0], [12, -9, 0], [6, 9.5, 0], [-17, 8, Math.PI / 2], [1, -9, 0]]) passive(g, px, y, pz, rot, R() < 0.35 ? 'res' : 'cap');
  return { g, W, D, pins: 15, blink: L };
}
function brainEsp32(parent) {
  const W = 51.5, D = 28.3, g = group(parent, 0, 0, 0);
  const map = drawPcb(W, D, '#141518', '#202227', '#e9ebef', 23, p => {
    for (let i = 0; i < 19; i++) { const x = -22.86 + i * 2.54; p.pad(x, D / 2 - 1.5, 0.8, '#cfd3d8'); p.pad(x, -D / 2 + 1.5, 0.8, '#cfd3d8'); }
    const top = ['3V3', 'GND', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23', 'GND', '', '', ''];
    const bot = ['VIN', 'GND', 'D13', 'D12', 'D14', 'D27', 'D26', 'D25', 'D33', 'D32', 'D35', 'D34', 'VN', 'VP', 'EN', '', '', '', ''];
    top.forEach((t, i) => t && p.text(t, -22.86 + i * 2.54, -D / 2 + 3.4, 0.8, 'center', 600));
    bot.forEach((t, i) => t && p.text(t, -22.86 + i * 2.54, D / 2 - 3.4, 0.8, 'center', 600));
    p.text('EN', -20, -6.6, 0.95); p.text('BOOT', -20, 6.6, 0.95);
    p.text('ESP32 DEVKIT V1', -5, 9.5, 1.15, 'center', 700);
  });
  pcbMesh(g, W, D, 0.8, [{ x: -23.5, z: -11.8, r: 1.1 }, { x: -23.5, z: 11.8, r: 1.1 }, { x: 23.5, z: -11.8, r: 1.1 }, { x: 23.5, z: 11.8, r: 1.1 }], '#141518', map);
  const y = 1.6;
  // WROOM module with antenna sticking past the board edge
  const modW = 25.5, modD = 18;
  const modMap = (() => {
    const { c, g: x, s } = canvas(modW, modD, 30);
    x.fillStyle = '#1f2533'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#d8ac56'; x.lineWidth = 0.55 * s; x.beginPath();
    let px = 19.4 * s; x.moveTo(px, 2 * s);
    for (let i = 0; i < 6; i++) { const yy = (3 + i * 2.2) * s; x.lineTo(px, yy); px = (px === 19.4 * s ? 24.4 * s : 19.4 * s); x.lineTo(px, yy); }
    x.stroke();
    return tex(c);
  })();
  const mod = group(g, 18.75, y, 0, null);
  boxTop(mod, modW, 0.8, modD, std('#1f2533'), modMap, 0, 0, 0);
  const canMap = (() => {
    const { c, g: x, s } = canvas(17.8, 15.8, 40);
    const gr = x.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, '#d9dde2'); gr.addColorStop(1, '#bfc4ca');
    x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(60,64,72,.75)'; x.textAlign = 'center';
    x.font = `700 ${1.7 * s}px "JetBrains Mono", monospace`; x.fillText('ESP32-WROOM-32', c.width / 2, 5 * s);
    x.font = `500 ${1.05 * s}px "JetBrains Mono", monospace`;
    x.fillText('802.11 b/g/n · BT 4.2', c.width / 2, 7.6 * s); x.fillText('FCC ID 2AC7Z-ESPWROOM32', c.width / 2, 9.8 * s);
    x.strokeStyle = 'rgba(60,64,72,.6)'; x.lineWidth = 0.18 * s; x.strokeRect(1.2 * s, 11.5 * s, 4 * s, 3 * s);
    return tex(c);
  })();
  boxTop(mod, 17.8, 3.1, 15.8, MAT.steel, canMap, -3.4, 0.8, 0, { metalness: 0.85, roughness: 0.32 });
  microUsb(g, -23.2, y, 0);
  qfp(g, 5, 0.9, 7, ['CP2102'], -13.5, y, -4.5, 0, false);
  sot223(g, -13, y, 6.5);
  tact(g, -20, y, -9.5); tact(g, -20, y, 9.5);
  const P = smdLed(g, '#ff3b3b', -5, y, -10); P.set(0.8);
  const L = smdLed(g, '#3b8bff', -5, y, 10.3);
  const R = rng(9);
  for (const [px, pz, rot] of [[-8, -3, 0], [-8, 2, 0], [-17, 2, Math.PI / 2], [-9, 8, 0], [-2, -6, Math.PI / 2], [-2, 6, Math.PI / 2], [1, -10, 0], [-11, -10, 0], [3, 9, 0]]) passive(g, px, y, pz, rot, R() < 0.4 ? 'res' : 'cap');
  return { g, W, D, pins: 19, blink: L };
}
function brainPico(parent) {
  const W = 51, D = 21, g = group(parent, 0, 0, 0);
  const map = drawPcb(W, D, '#0f6b34', '#1a7d43', '#f2f7f2', 37, p => {
    for (let i = 0; i < 20; i++) {
      const x = -24.13 + i * 2.54;
      for (const z of [D / 2, -D / 2]) { p.pad(x, z, 1.0); p.g.beginPath(); p.g.arc(p.X(x), p.Z(z), 0.5 * p.s, 0, Math.PI * 2); p.g.fillStyle = '#06100a'; p.g.fill(); }
    }
    const lab = ['GP0', '', '', 'GP2', '', '', '', 'GP6', '', '', '', 'GP10', '', '', '', 'GP14', '', '', '', ''];
    lab.forEach((t, i) => t && p.text(t, -24.13 + i * 2.54, D / 2 - 2.6, 0.75, 'center', 600));
    p.text('Pico W', 3.5, -5.6, 1.6, 'center', 800);
    p.text('© 2022 Raspberry Pi', -12, 6.2, 0.75, 'center', 500);
    p.text('BOOTSEL', -14.5, -5.5, 0.8, 'center', 600);
    p.text('LED', -19.5, 5.2, 0.75);
    // antenna keep-out with trace
    p.g.strokeStyle = '#d8ac56'; p.g.lineWidth = 0.45 * p.s; p.g.beginPath();
    p.g.moveTo(p.X(19.5), p.Z(-6)); p.g.lineTo(p.X(24), p.Z(-6)); p.g.lineTo(p.X(24), p.Z(6)); p.g.lineTo(p.X(21), p.Z(6)); p.g.lineTo(p.X(21), p.Z(-3)); p.g.stroke();
  });
  pcbMesh(g, W, D, 0.6, [{ x: -23.5, z: -5.7, r: 1.05 }, { x: -23.5, z: 5.7, r: 1.05 }, { x: 23.5, z: -5.7, r: 1.05 }, { x: 23.5, z: 5.7, r: 1.05 }], '#0f6b34', map);
  const y = 1.6;
  microUsb(g, -22.8, y, 0);
  qfp(g, 7, 0.9, 8, ['RP2-B2', '21/10', 'RP2040'], -1.5, y, 0.5, 0, false);
  soic(g, 5, 4, 1.3, 8, ['W25Q16'], -10.5, y, -5.2);
  const canMap = chipTop(['RP-CYW43', '439'], 10.5, 10.5, '#c9ced4', 'rgba(70,74,80,.7)', false);
  boxTop(g, 10.5, 1.5, 10.5, MAT.steel, canMap, 12.5, y, 0, { metalness: 0.85, roughness: 0.3 });
  const bs = group(g, -14.5, y, -1.6);
  box(bs, 4.2, 1.6, 3.4, MAT.plasticWhite, 0, 0, 0); cyl(bs, 1.1, 0.6, MAT.plasticWhite, 0, 1.6, 0);
  box(g, 2.5, 1.2, 2.5, std('#4a4d55', { metalness: 0.4 }), -10, y, 6);
  const L = smdLed(g, '#46ff6e', -19.5, y, 7);
  const R = rng(3);
  for (const [px, pz, rot] of [[-6, -6, 0], [-6, 6.5, 0], [5, -7, Math.PI / 2], [5, 7.2, 0], [-13, 3, Math.PI / 2], [-17, -6, 0], [7.5, 3, Math.PI / 2]]) passive(g, px, y, pz, rot, R() < 0.4 ? 'res' : 'cap');
  return { g, W, D, pins: 20, blink: L };
}

// ---------- Champ Core carrier ----------
const PORT_COL = { I2C: '#3b82f6', DIG: '#f4c430', ANA: '#22b573', UART: '#a35ee8' };
export function buildCore(vkey) {
  const V = VARIANTS[vkey], P = V.pins;
  const root = new THREE.Group();
  const W = 100, D = 80, y = 1.6;
  const live = {};
  const tag = (g, name, desc, pin) => { g.userData.pick = { name, desc, pin }; return g; };

  // brain + socket (double-row female headers: inner row holds the brain, outer row is breakout)
  const bx = -16, bz = -1;
  const brainFn = vkey === 'uno' ? brainUno : vkey === 'esp32' ? brainEsp32 : brainPico;
  const brainHolder = group(root, bx, 0, bz);
  const brainInfo = brainFn(brainHolder);
  const B = brainInfo, hz = B.D / 2 - 1.27 - (vkey === 'pico' ? 0.4 : 0);
  const sock = tag(group(root, 0, 0, 0), 'Brain socket', 'Double-row headers: the inner row holds the brain, the outer row breaks every pin out for jumper wires.');
  const hx = bx + (vkey === 'esp32' ? -2.5 : 0);
  femaleHeader(sock, B.pins, 2, hx, y, bz + hz + 1.27);
  femaleHeader(sock, B.pins, 2, hx, y, bz - hz - 1.27);
  // male header spacers under the brain
  box(sock, B.pins * 2.54, 2.5, 2.54, MAT.plasticBlack, hx, y + 8.5, bz + hz);
  box(sock, B.pins * 2.54, 2.5, 2.54, MAT.plasticBlack, hx, y + 8.5, bz - hz);
  B.g.position.y = y + 8.5 + 2.5;
  const brainName = vkey === 'uno' ? 'Champ Uno brain' : vkey === 'esp32' ? 'ESP32 DevKit brain' : 'Raspberry Pi Pico W brain';
  const brainDesc = vkey === 'uno' ? 'A compact Uno-compatible board (ATmega328P, USB-C). Pull it out and it still works as a normal Arduino.' : vkey === 'esp32' ? 'A standard 38-pin ESP32 DevKit with Wi-Fi and Bluetooth, bought off the shelf.' : 'A stock Raspberry Pi Pico W with soldered headers. Runs MicroPython or Arduino.';
  tag(brainHolder, brainName, brainDesc);
  live.blink = B.blink;

  // OLED
  const oled = tag(group(root, 33, y, -26), '0.96" OLED display', '128 × 64 pixels for text, graphs, menus and games.', P.i2c + ' (I2C)');
  box(oled, 28, 3.2, 21, MAT.plasticBlack, 0, 0, 0);
  box(oled, 26.7, 1.2, 19.3, std('#0b0c0e', { roughness: 0.2, metalness: 0.2 }), 0, 3.2, 0);
  const oc = document.createElement('canvas'); oc.width = 256; oc.height = 128;
  const oledTex = new THREE.CanvasTexture(oc); oledTex.colorSpace = THREE.SRGBColorSpace; oledTex.magFilter = THREE.NearestFilter; oledTex.minFilter = THREE.LinearFilter;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(21.7, 10.9), new THREE.MeshBasicMaterial({ map: oledTex, toneMapped: false }));
  scr.rotation.x = -Math.PI / 2; scr.position.set(0, 4.43, -1.5); oled.add(scr);
  box(oled, 12, 0.3, 2.6, std('#c9a24a', { metalness: 0.6, roughness: 0.4 }), 0, 4.4, 8.4);
  live.oled = { c: oc, t: oledTex };

  // RGB pixels (WS2812B 5050)
  const rgb = tag(group(root, 0, y, 0), '4 RGB pixels (WS2812B)', 'Any colour from one data pin. Great for arrays and loops.', P.rgb);
  live.rgb = [];
  for (let i = 0; i < 4; i++) {
    const x = 21 + i * 7.6, z = -9;
    box(rgb, 5, 1.6, 5, std('#f5f3ee', { roughness: 0.4 }), x, y, z);
    const lm = std('#ffffff', { emissive: new THREE.Color('#ff0000'), emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.92 });
    cyl(rgb, 2.0, 0.25, lm, x, y + 1.6, z);
    live.rgb.push({ m: lm, gl: glow(rgb, '#ffffff', 11, x, y + 3.2, z) });
  }

  // traffic-light LEDs (5 mm)
  const tl = tag(group(root, 0, y, 0), 'Traffic-light LEDs', 'Red, yellow and green for the classic first sketch. Driven by the I/O expander.', 'Expander P0–P2');
  live.tl = [];
  [['#ff2a2a', '#7a1010'], ['#ffc21a', '#7a5a08'], ['#30ff6a', '#0f6a2a']].forEach(([on, base], i) => {
    const x = 21 + i * 7.2, z = 3;
    const m = new THREE.MeshPhysicalMaterial({ color: base, emissive: new THREE.Color(on), emissiveIntensity: 0, roughness: 0.12, transparent: true, opacity: 0.88, clearcoat: 1 });
    cyl(tl, 2.9, 1.0, m, x, y, z);
    cyl(tl, 2.5, 4.6, m, x, y + 1.0, z);
    const dome = mesh(new THREE.SphereGeometry(2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, tl, x, y + 5.6, z);
    live.tl.push({ m, gl: glow(tl, on, 16, x, y + 6.5, z) });
  });

  // buzzer
  const bz2 = tag(group(root, 44, y, 4), 'Passive buzzer', 'Plays notes with tone(): alarms, music and Morse code.', P.buzz);
  cyl(bz2, 6, 7.5, std('#16171a', { roughness: 0.7 }), 0, 0, 0, 40);
  cyl(bz2, 1.0, 0.1, MAT.hole, 0, 7.5, 0);

  // potentiometer
  const pot = tag(group(root, 42, y, 31), 'Potentiometer', 'Turn it to read 0–1023 with analogRead(), then map() it to anything.', P.pot);
  box(pot, 10, 5, 10, std('#1e3f8a'), 0, 0, 0);
  cyl(pot, 3.5, 2, MAT.brass, 0, 5, 0);
  const knob = new THREE.Group(); knob.position.set(0, 7, 0); pot.add(knob);
  const kg = new THREE.CylinderGeometry(5.6, 6, 7, 30); kg.translate(0, 3.5, 0);
  mesh(kg, std('#2b2f38', { roughness: 0.5 }), knob);
  box(knob, 0.9, 0.3, 4.6, std('#ffffff'), 0, 7, 2.2);
  live.knob = knob;

  // LDR
  const ldr = tag(group(root, 21, y, 17), 'Light sensor (LDR)', 'Its resistance falls as light rises. Teaches voltage dividers and thresholds.', P.ldr);
  const ldrMap = (() => {
    const { c, g, s } = canvas(5, 5, 60);
    g.fillStyle = '#c86f2e'; g.beginPath(); g.arc(c.width / 2, c.height / 2, c.width / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2412'; g.lineWidth = 0.32 * s; g.beginPath();
    for (let i = 0; i < 7; i++) { const yy = (0.9 + i * 0.53) * s; g.moveTo(1 * s, yy); g.lineTo(4 * s, yy); }
    g.stroke(); return tex(c);
  })();
  for (const lx of [-1.6, 1.6]) box(ldr, 0.4, 4, 0.4, MAT.tin, lx, 0, 0);
  const ldrM = [MAT.ceramicTan, new THREE.MeshPhysicalMaterial({ map: ldrMap, clearcoat: 1, roughness: 0.3 }), MAT.ceramicTan];
  mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 32), ldrM, ldr, 0, 4.8, 0);

  // microphone
  const mic = tag(group(root, 29.5, y, 17), 'Microphone with amplifier', 'Measures sound level. Students build clap switches and noise meters.', P.mic);
  cyl(mic, 3.0, 3.4, MAT.steel, 0, 0, 0);
  cyl(mic, 2.6, 0.1, std('#111', { roughness: 1 }), 0, 3.4, 0);
  qfp(root, 3, 0.8, 4, ['9814'], 36, y, 17.5, 0, false);

  // IR receiver
  const ir = tag(group(root, 21, y, 29), 'IR receiver + remote', 'Decode any TV-style remote to drive the robot or pick menu items.', P.ir);
  for (const lx of [-2.54, 0, 2.54]) box(ir, 0.45, 3, 0.45, MAT.tin, lx, 0, 0);
  box(ir, 6, 7, 4, std('#141416', { roughness: 0.3 }), 0, 3, 0);
  const domeG = new THREE.SphereGeometry(2.1, 24, 12, 0, Math.PI);
  mesh(domeG, std('#141416', { roughness: 0.15 }), ir, 0, 6.5, 2);

  // climate and motion sensors
  const aht = tag(group(root, 28.5, y, 28), 'Temperature + humidity (AHT20)', 'Reads °C and % humidity over I2C. Used for weather-station lessons.', P.i2c + ' (I2C)');
  qfp(aht, 3, 1, 3, ['AHT'], 0, 0, 0, 0, false);
  const mpu = tag(group(root, 34.5, y, 28), '6-axis motion sensor (MPU-6050)', 'Senses tilt and acceleration: self-balancing, crash detection, gesture games.', P.i2c + ' (I2C)');
  qfp(mpu, 4, 0.9, 6, ['MPU', '6050'], 0, 0, 0, 0, false);

  // buttons
  const btn = (x, label, col, pin) => {
    const g = tag(group(root, x, y, 29), 'Button ' + label, 'A 12 mm push button wired with a pull-up, ready for digitalRead().', pin);
    box(g, 12, 3.5, 12, MAT.steel, 0, 0, 0);
    box(g, 11, 0.3, 11, std('#1b1c20'), 0, 3.5, 0);
    for (const [px, pz] of [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]]) cyl(g, 0.6, 0.3, std('#1b1c20'), px, 3.6, pz, 12);
    cyl(g, 4.7, 4, std(col, { roughness: 0.6, envMapIntensity: 0.5 }), 0, 3.8, 0, 36);
  };
  btn(-40, 'A', '#0b55e6', P.btnA);
  btn(-25, 'B', '#e0263a', P.btnB);

  // DIP switches
  const dip = tag(group(root, -4, y, 29), 'Connect / disconnect switches', 'Unplug any onboard part from its pin so advanced students can wire their own circuits.');
  box(dip, 20.3, 4, 9.6, MAT.plasticRed, 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const x = -8.89 + i * 2.54;
    box(dip, 1.3, 0.2, 5, std('#5a0d12'), x, 4, 0);
    box(dip, 1.2, 1.2, 1.8, MAT.plasticWhite, x, 4, -1.4 + (i === 7 ? 2.8 : 0));
  }

  // servo headers and sonar header
  const srv = tag(group(root, 0, y, 0), 'Servo headers S1 and S2', 'Plug standard servos in directly. S1 turns the sonar head on the robot.', P.s1 + ' / ' + P.s2);
  maleHeader(srv, 3, 1, 10.5, y, 26, 'z');
  maleHeader(srv, 3, 1, 14.5, y, 26, 'z');
  const son = tag(group(root, 0, y, 0), 'Ultrasonic port', 'Takes the HC-SR04 distance sensor in one-pin mode.', P.sonar);
  maleHeader(son, 4, 1, 12.5, y, 35.5, 'x');

  // JST-PH ports along the back edge plus one on the right edge
  const ports = [['I2C', 'I2C-1', P.i2c], ['I2C', 'I2C-2', P.i2c], ['DIG', 'DIG', P.dig], ['DIG', 'SONAR', P.sonar], ['ANA', 'ANA', P.ana], ['UART', 'UART', P.uart]];
  const portPos = [[-42, -35.5, 0], [-30, -35.5, 0], [-18, -35.5, 0], [-6, -35.5, 0], [6, -35.5, 0], [46.5, 16, -Math.PI / 2]];
  ports.forEach(([type, label, pin], i) => {
    const [px, pz, ry] = portPos[i];
    const g = tag(group(root, px, y, pz), label + ' port', `A keyed 4-pin JST-PH socket for ${type === 'I2C' ? 'I2C modules' : type === 'ANA' ? 'analog sensors' : type === 'UART' ? 'serial devices such as GPS' : 'digital modules'}. Colour-coded so plugs only go where they belong.`, pin);
    g.rotation.y = ry;
    box(g, 9.9, 4.5, 6.0, std('#efe7d2', { roughness: 0.5 }), 0, 0, 0);
    box(g, 8.4, 3.0, 0.2, MAT.hole, 0, 0.8, -3.0);
    for (let k = 0; k < 4; k++) box(g, 0.5, 0.5, 2, MAT.tin, -3 + k * 2, 1.6, -1.6);
  });

  // support chips
  const sup = tag(group(root, 0, y, 0), 'Driver and protection chips', 'TB6612FNG motor driver (2 × 1.2 A), PCF8574 I/O expander, TXB0108 level shifter, fuse and reverse-polarity diode.');
  soic(sup, 7.8, 5.3, 1.2, 24, ['TB6612', 'FNG'], 4, y, -24);
  soic(sup, 9.9, 3.9, 1.5, 16, ['PCF8574'], -9, y, -24);
  soic(sup, 6.5, 4.4, 1.1, 20, ['TXB0108'], -22, y, -24);
  box(sup, 3.2, 1.0, 1.6, std('#e8c34a'), -32, y, -24);
  box(sup, 4.3, 2.2, 2.6, std('#1c1d20'), -38, y, -24);
  box(sup, 0.6, 2.25, 2.6, std('#b9bec4'), -39.7, y, -24);
  const sw = tag(group(root, -46.5, y, -24), 'Power switch', 'Switches between USB and the Drive battery.');
  box(sw, 4, 3.5, 8.5, MAT.steel, 0, 0, 0);
  box(sw, 2.5, 2.4, 2.6, MAT.plasticBlack, -2.8, 0.6, -1.4);
  const pwr = smdLed(root, '#45ff7a', -42.5, y, -18.5); pwr.set(0.9);
  // passives in the gaps
  const R = rng(77);
  for (const [px, pz, rot] of [[-14, -18.5, 0], [-10, -18.5, 0], [-28, -18.5, 0], [2, -18.5, 0], [10, -24, Math.PI / 2], [10, -20, Math.PI / 2], [16, -30, 0], [16, -16, 0], [17, -3, Math.PI / 2], [17, 8, Math.PI / 2], [26, 10, 0], [33, 10, 0], [40, 12, 0], [26, 22.5, 0], [33, 22.5, 0], [-12, 22.5, 0], [-33, 22.5, 0], [5, 21.5, Math.PI / 2], [40, -12, 0], [47, -6, Math.PI / 2], [-46, 10, Math.PI / 2], [-46, -6, Math.PI / 2], [-34, 37.5, 0], [-18, 37.5, 0]]) passive(root, px, y, pz, rot, R() < 0.4 ? 'res' : 'cap');

  // underside: drive connector and desk feet
  const conn = tag(group(root, 0, 0, 0), 'Drive connector (2 × 8, keyed)', 'One plug carries motor power, battery, wheel encoders and I2C to the Drive base.');
  box(conn, 21, 6, 8.6, MAT.plasticBlack, 0, -6, 6);
  box(conn, 4, 6.1, 1.0, MAT.plasticBlack, 0, -6.05, 10.8);
  live.feet = group(root, 0, 0, 0);
  for (const [fx, fz] of [[-38, -28], [38, -28], [-38, 28], [38, 28]]) cyl(live.feet, 4, 2, MAT.feet, fx, -2, fz);

  // mounting holes (shared with the Drive standoffs)
  const holes = [[-45, -35], [45, -35], [-45, 35], [45, 35]].map(([x, z]) => ({ x, z, r: 1.6 }));
  for (const h of holes) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 3.0, 32), MAT.gold);
    ring.rotation.x = -Math.PI / 2; ring.position.set(h.x, y + 0.012, h.z); ring.receiveShadow = true; root.add(ring);
  }

  // silkscreen
  const silk = '#f4f6fb';
  const map = drawPcb(W, D, V.mask, V.trace, silk, 101, p => {
    p.rect(bx, bz, B.W + 2, B.D + 6.5, 0.2);
    p.text('BRAIN', bx - B.W / 2 - 1.5, bz, 1.4, 'center', 800, 'Montserrat', silk, -Math.PI / 2);
    p.rect(33, -26, 29, 22); p.text('OLED · ' + P.i2c, 33, -14.2, 1.3);
    p.rect(32.4, -9, 30, 7); p.text('RGB ' + P.rgb, 32.4, -4.6, 1.15);
    p.text('R', 21, 7.6, 1.2); p.text('Y', 28.2, 7.6, 1.2); p.text('G', 35.4, 7.6, 1.2);
    p.circle(44, 4, 6.6); p.text('+', 44, -3.6, 1.5); p.text('BUZ ' + P.buzz, 44, 12.4, 1.15);
    p.rect(42, 31, 11, 11); p.text('POT ' + P.pot, 42, 24.6, 1.15);
    p.text('LDR ' + P.ldr, 21, 12.4, 1.0); p.text('MIC ' + P.mic, 29.5, 12.4, 1.0);
    p.text('IR ' + P.ir, 21, 34.5, 1.0); p.text('AHT20', 28.5, 31.6, 0.9); p.text('IMU', 34.5, 31.6, 0.9);
    for (const [x, l, pin] of [[-40, 'A', P.btnA], [-25, 'B', P.btnB]]) { p.rect(x, 29, 13, 13); p.text(l, x, 20.4, 2.4, 'center', 800); p.text(pin, x, 37.6, 1.2); }
    p.text('ON', -14.8, 23.2, 1.0, 'left', 700);
    ['BTN', 'BUZ', 'POT', 'LDR', 'MIC', 'IR', 'RGB', 'LED'].forEach((t, i) => p.text(t, -12.9 + i * 2.54, 35.6, 0.68, 'center', 700));
    p.text('S1', 10.5, 21.6, 1.1, 'center', 700); p.text('S2', 14.5, 21.6, 1.1, 'center', 700);
    p.text('SONAR ' + P.sonar, 12.5, 39.0, 0.9, 'center', 700);
    ports.forEach(([type, label, pin], i) => {
      const [px, pz, ry] = portPos[i];
      if (ry) { p.fill(px - 0.2, pz, 7.2, 11.6, PORT_COL[type]); p.text(label, px - 6, pz, 1.1, 'center', 800, 'Montserrat', silk, -Math.PI / 2); return; }
      p.fill(px, pz - 0.2, 11.6, 7.2, PORT_COL[type]);
      p.text(label, px, pz + 5.2, 1.15, 'center', 800); p.text(pin, px, pz + 7.0, 0.9, 'center', 600, 'JetBrains Mono');
    });
    p.text('CHAMP CORE ' + V.tag, -14, 19.4, 2.0, 'center', 800);
    p.text(V.edition + ' · TechChampions · rev 1.0', 35, 38.4, 0.95, 'center', 600);
    p.text('PWR', -42.5, -15.6, 0.9); p.text('USB / BATT', -46, -30.2, 0.85, 'left');
    p.text('TB6612', 4, -20, 0.9); p.text('5V ⇄ 3V3', -22, -20.2, 0.9);
    for (const h of holes) { p.pad(h.x, h.z, 3.0); }
  });
  pcbMesh(root, W, D, 3.5, holes, V.mask, map);
  explodeCoreParts(root);
  return { root, live };
}

// ---------- Champ Drive base ----------
export function buildDrive() {
  const root = new THREE.Group();
  const live = { wheels: [] };
  const tag = (g, name, desc, pin) => { g.userData.pick = { name, desc, pin }; return g; };
  const PY = 40, PT = 3; // plate bottom, thickness
  const holes = [];
  for (let x = -55; x <= 55; x += 10) for (let z = -75; z <= 75; z += 10) {
    if (Math.abs(x) < 15 && z > -5 && z < 25) continue; // connector cut-out region
    if (Math.abs(z) > 70 && Math.abs(x) > 35) continue;
    holes.push({ x, z, r: 1.6 });
  }
  const shape = roundedShape(130, 160, [16, 16, 44, 44], holes);
  const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: PT, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2, curveSegments: 6 });
  plateGeo.rotateX(-Math.PI / 2);
  const plate = tag(group(root), 'Chassis with M3 accessory grid', 'Holes on a 10 mm grid take add-on parts, grippers and 3D-printed mounts.');
  mesh(plateGeo, MAT.abs, plate, 0, PY, 0);

  // LEGO-compatible stud plate at the back
  const lego = tag(group(root, 0, PY + PT, -58), 'LEGO-compatible stud plate', 'Build bodies, arms and sensor towers straight onto the robot with bricks students already have.');
  box(lego, 64, 3.2, 24, MAT.brand, 0, 0, 0);
  const studG = new THREE.CylinderGeometry(2.4, 2.4, 1.7, 20);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) mesh(studG, MAT.brand, lego, -28 + i * 8, 3.2 + 0.85, -8 + j * 8);

  // standoffs + mating connector
  const so = tag(group(root), 'Brass standoffs', 'The Core drops onto four 12 mm standoffs and the keyed connector. No tools.');
  for (const [x, z] of [[-45, -25], [45, -25], [-45, 45], [45, 45]]) {
    const m = mesh(new THREE.CylinderGeometry(2.8, 2.8, 12, 6), MAT.brass, so, x, PY + PT + 6, z);
  }
  box(so, 23, 6, 10, std('#2a2c31'), 0, PY + PT, 16);

  // motors + wheels
  for (const s of [-1, 1]) {
    const mg = tag(group(root, 0, 0, 10), 'N20 encoder motor', '150 rpm metal-gear motor with a magnetic encoder, so students can measure distance and turn exact angles.', s < 0 ? 'Encoder L, PWM L' : 'Encoder R, PWM R');
    box(mg, 9, 10, 12, std('#c9cdd3', { metalness: 0.8, roughness: 0.35 }), s * 62.5, 27.5, 0);
    const can = mesh(new THREE.CylinderGeometry(6, 6, 15, 28), std('#b8bdc4', { metalness: 0.9, roughness: 0.3 }), mg, s * 50.5, 32.5, 0); can.rotation.z = Math.PI / 2;
    const enc = mesh(new THREE.CylinderGeometry(6, 6, 1.6, 28), std('#0f5a2e'), mg, s * 42.2, 32.5, 0); enc.rotation.z = Math.PI / 2;
    const mag = mesh(new THREE.CylinderGeometry(3.4, 3.4, 2, 20), std('#111'), mg, s * 40.6, 32.5, 0); mag.rotation.z = Math.PI / 2;
    box(mg, 30, 2, 16, MAT.absDark, s * 51, 38.4, 0);
    box(mg, 2, 10, 16, MAT.absDark, s * 37, 29.4, 0);
    const shaft = mesh(new THREE.CylinderGeometry(1.5, 1.5, 6, 12), MAT.steel, mg, s * 69, 32.5, 0); shaft.rotation.z = Math.PI / 2;

    const wg = tag(group(root, s * 83, 32.5, 10), '65 mm wheel', 'Grippy rubber tyre on a press-fit hub.');
    const spin = new THREE.Group(); wg.add(spin);
    wg.userData.explode = { stage: 1, off: [s * 150, 0, 0] };
    const tyreG = new THREE.Group(); spin.add(tyreG);
    tyreG.userData.explode = { stage: 0.7, off: [s * 60, 0, 0] };
    const prof = [];
    const Rr = 32.5, Ri = 24, Wt = 26;
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + Math.PI * i / 12; prof.push(new THREE.Vector2(Ri + (Rr - Ri) * 0.15 + Math.cos(a) * (Rr - Ri) * 0.85 + (Rr - Ri) * 0.0, Math.sin(a) * Wt / 2)); }
    prof.unshift(new THREE.Vector2(Ri, -Wt / 2)); prof.push(new THREE.Vector2(Ri, Wt / 2));
    const tyre = new THREE.LatheGeometry(prof, 64); tyre.rotateZ(Math.PI / 2);
    mesh(tyre, MAT.rubber, tyreG);
    // tread blocks
    const tread = new THREE.BoxGeometry(Wt * 0.86, 1.2, 3);
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; const t = mesh(tread, MAT.rubber, tyreG, 0, Math.cos(a) * (Rr - 0.2), Math.sin(a) * (Rr - 0.2)); t.rotation.x = a; t.castShadow = false; }
    const hub = mesh(new THREE.CylinderGeometry(Ri, Ri, Wt - 6, 48), MAT.brand, spin); hub.rotation.z = Math.PI / 2;
    const cap = mesh(new THREE.CylinderGeometry(7, 7, Wt - 2, 32), std('#f2f4f8', { roughness: 0.35 }), spin); cap.rotation.z = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const sp = mesh(new THREE.BoxGeometry(Wt - 4, 3.5, 15), std('#f2f4f8', { roughness: 0.35 }), spin, 0, Math.cos(a) * 14, Math.sin(a) * 14);
      sp.rotation.x = a - Math.PI / 2;
    }
    live.wheels.push({ spin, side: s });
  }

  // caster
  const cas = tag(group(root, 0, 0, -72), 'Ball caster', 'A steel ball at the back lets the robot pivot on the spot.');
  cyl(cas, 9, PY - 8, MAT.absDark, 0, 8, 0, 28, 7);
  mesh(new THREE.SphereGeometry(6.2, 28, 18), MAT.steel, cas, 0, 6.2, 0);

  // battery under the plate
  const bat = tag(group(root, 0, 0, -42), '2 × 18650 battery pack', 'Removable, fused 7.4 V cells with USB-C charging. The OLED shows the charge level.');
  box(bat, 80, 1.6, 42, std('#18191c'), 0, 19.5, 0);
  for (const ex of [-40, 40]) box(bat, 1.6, 20, 42, std('#18191c'), ex, 19.5, 0);
  for (const cz of [-9.5, 9.5]) {
    const cell = mesh(new THREE.CylinderGeometry(9, 9, 65, 32), std('#2d7fe0', { roughness: 0.35, metalness: 0.1 }), bat, 0, 30.2, cz); cell.rotation.z = Math.PI / 2;
    const tip = mesh(new THREE.CylinderGeometry(3, 3, 1.6, 16), MAT.steel, bat, 33.2, 30.2, cz); tip.rotation.z = Math.PI / 2;
    const band = mesh(new THREE.CylinderGeometry(9.05, 9.05, 6, 32), std('#f2f4f8'), bat, -18, 30.2, cz); band.rotation.z = Math.PI / 2;
  }
  const chg = tag(group(root, -30, 0, -80), 'Charging port and power switch', 'Charge from any USB-C phone charger while the cells stay in the robot.');
  box(chg, 22, 1.2, 12, std('#0f5a2e'), 0, 33, 6);
  usbC(chg, 0, 34.2, 0.5, -Math.PI / 2);
  box(chg, 6, 3.5, 4, MAT.plasticBlack, 16, 36, 1.5);

  // front: line sensor + bumper
  const ls = tag(group(root, 0, 0, 70), '3-channel line sensor', 'Infrared pairs under the nose see black tape. Read over I2C.', 'I2C');
  box(ls, 4, 30, 4, MAT.absDark, -22, 9.5, 0); box(ls, 4, 30, 4, MAT.absDark, 22, 9.5, 0);
  const lsb = box(ls, 52, 1.6, 12, std('#121316'), 0, 8, 0);
  for (const x of [-14, 0, 14]) { cyl(ls, 2.5, 3.2, std('#1a1a1f'), x - 2.8, 4.8, 0, 16); cyl(ls, 2.5, 3.2, std('#3f63d9', { roughness: 0.2 }), x + 2.8, 4.8, 0, 16); }
  const bump = tag(group(root, 0, 0, 0), 'Bumper with micro-switches', 'Feels a wall it hits. Two switches tell left from right.');
  const arc = new THREE.TorusGeometry(74, 2.6, 10, 60, Math.PI * 0.62); arc.rotateX(Math.PI / 2); arc.rotateY(-Math.PI * 0.19);
  mesh(arc, MAT.brand, bump, 0, 26, 8);
  for (const s of [-1, 1]) {
    const a = Math.PI * 0.31;
    box(bump, 12.8, 6, 5.8, std('#1b1c20'), s * Math.sin(a) * 66, 23, 8 + Math.cos(a) * 66);
  }

  // servo + ultrasonic head
  const servo = tag(group(root, 0, PY + PT, 64), 'Servo 1 (SG90)', 'Turns the ultrasonic sensor so the robot can look left and right.', 'S1');
  const blueTr = new THREE.MeshPhysicalMaterial({ color: '#2a5bd7', roughness: 0.25, transparent: true, opacity: 0.82, clearcoat: 1 });
  box(servo, 22.5, 22.7, 11.8, blueTr, 0, 0, 0);
  box(servo, 32.3, 2.5, 11.8, blueTr, 0, 16, 0);
  cyl(servo, 5.8, 4, blueTr, 5.4, 22.7, 0, 24);
  cyl(servo, 2.4, 3, std('#f2f2f2'), 5.4, 26.7, 0, 16);
  const head = tag(group(root, 5.4, PY + PT + 29.7, 64), 'Ultrasonic distance sensor (HC-SR04)', 'Measures 2–400 cm by timing an echo. Pairs with the servo for a scanning radar.', 'Sonar port');
  box(head, 30, 1.6, 6, MAT.plasticWhite, 0, 0, 0);
  box(head, 4, 18, 2, MAT.plasticWhite, 0, 0, 1.5);
  const sonarMap = (() => {
    const { c, g, s } = canvas(45, 20, 20);
    g.fillStyle = '#1c4fb8'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#f2f5fb'; g.textAlign = 'center'; g.font = `700 ${1.8 * s}px Montserrat, Arial`; g.fillText('HC-SR04', c.width / 2, 2.6 * s);
    g.font = `600 ${1.2 * s}px Montserrat, Arial`; g.fillText('T', 9.5 * s, 18.6 * s); g.fillText('R', 35.5 * s, 18.6 * s);
    return tex(c);
  })();
  const sb = new THREE.Mesh(new THREE.BoxGeometry(45, 20, 1.6), [std('#1c4fb8'), std('#1c4fb8'), std('#1c4fb8'), std('#1c4fb8'), new THREE.MeshPhysicalMaterial({ map: sonarMap, roughness: 0.4, clearcoat: 0.6 }), std('#1c4fb8')]);
  sb.position.set(0, 13, 3.4); sb.castShadow = true; head.add(sb);
  const meshTex = (() => {
    const { c, g } = canvas(4, 4, 32);
    g.fillStyle = '#3d4047'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#6b7079'; g.lineWidth = 2;
    for (let i = 0; i < 128; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
  })();
  for (const x of [-13, 13]) {
    const tr = mesh(new THREE.CylinderGeometry(8, 8, 12, 36, 1, true), MAT.steel, head, x, 13, 10.2); tr.rotation.x = Math.PI / 2;
    const face = mesh(new THREE.CircleGeometry(7.7, 36), std('#ffffff', { map: meshTex, roughness: 0.8 }), head, x, 13, 16.15);
  }
  box(head, 10.5, 3.5, 4.4, MAT.steel, 0, 20.6, 4.2);
  live.head = head;
  explodeDriveParts(root);
  return { root, live };
}

// ---------- line-follower mat ----------
const PATH_R = 330;
export function pathAt(t) { return new THREE.Vector3(PATH_R * Math.sin(t), 0, PATH_R * 0.62 * Math.sin(t) * Math.cos(t) * 1.6); }
export function buildMat() {
  const Wm = 980, Dm = 640;
  const { c, g, s } = canvas(Wm, Dm, 2);
  g.fillStyle = '#f7f8fb'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#e1e6ef'; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  g.strokeStyle = '#111317'; g.lineWidth = 19 * s; g.lineJoin = 'round'; g.beginPath();
  for (let i = 0; i <= 400; i++) { const p = pathAt(i / 400 * Math.PI * 2); const X = (p.x + Wm / 2) * s, Y = (p.z + Dm / 2) * s; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
  g.closePath(); g.stroke();
  g.fillStyle = '#1e74ff'; g.font = `800 ${26 * s}px Montserrat, Arial`; g.textAlign = 'left'; g.fillText('CHAMP TRACK 1', 24 * s, 46 * s);
  g.fillStyle = '#6a7690'; g.font = `600 ${14 * s}px Poppins, Arial`; g.fillText('Figure-eight line course · 19 mm tape', 24 * s, 70 * s);
  const m = new THREE.Mesh(new THREE.BoxGeometry(Wm, 1, Dm), [std('#e8ebf1'), std('#e8ebf1'), std('#ffffff', { map: tex(c), roughness: 0.85 }), std('#e8ebf1'), std('#e8ebf1'), std('#e8ebf1')]);
  m.position.y = -0.5; m.receiveShadow = true;
  return m;
}


// ---------- OLED drawing ----------
export function drawOled(o, now, variant, mode, driving) {
  const g = o.c.getContext('2d'), V = VARIANTS[variant];
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#ffd23a'; g.font = '700 17px "JetBrains Mono", monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
  g.fillText('CHAMP CORE ' + V.tag, 6, 4);
  g.textAlign = 'right'; g.fillText(mode === 'robot' ? '7.6V' : 'USB', 250, 4);
  g.fillStyle = '#7fd8ff'; g.textAlign = 'left'; g.font = '700 16px "JetBrains Mono", monospace';
  const t = now / 1000;
  if (mode === 'robot' && driving) {
    const dist = Math.round(38 + 22 * Math.sin(t * 1.3));
    g.fillText('LINE FOLLOW  ON', 6, 34);
    g.fillText('DIST  ' + String(dist).padStart(3) + ' cm', 6, 56);
    const pos = Math.sin(t * 2.2);
    g.fillText('L  ' + (pos < -0.33 ? '#' : '.') + ' ' + (Math.abs(pos) <= 0.33 ? '#' : '.') + ' ' + (pos > 0.33 ? '#' : '.') + '  R', 6, 78);
    g.fillText('SPEED ' + Math.round(62 + 10 * Math.cos(t)) + '%', 6, 100);
  } else if (mode === 'robot') {
    g.fillText('DRIVE BASE  OK', 6, 34); g.fillText('ENC L 0  R 0', 6, 56); g.fillText('PRESS A TO GO', 6, 78);
    g.fillRect(6, 104, 180, 12); g.fillStyle = '#000'; g.fillRect(8, 106, 176, 8); g.fillStyle = '#7fd8ff'; g.fillRect(8, 106, 150, 8);
  } else {
    g.fillText('TEMP  27.4 C', 6, 32); g.fillText('HUM   61 %', 6, 52);
    g.fillText('LIGHT', 6, 74);
    const lv = 0.55 + 0.35 * Math.sin(t * 0.9);
    g.strokeStyle = '#7fd8ff'; g.lineWidth = 2; g.strokeRect(70, 76, 150, 12); g.fillRect(73, 79, 144 * lv, 6);
    g.beginPath();
    for (let x = 0; x < 244; x += 2) { const y = 112 + Math.sin(x * 0.09 + t * 4) * 6 * Math.sin(x * 0.013 + t); x ? g.lineTo(6 + x, y) : g.moveTo(6, y); }
    g.stroke();
  }
  o.t.needsUpdate = true;
}

// ---------- exploded view ----------
// Stage numbers match the sections on the product page: 1 drive train, 2 underside, 3 board parts,
// 4 brain, 5 Core and sensor head onto the base. Offsets are in each group's parent space.
const CORE_FIXED = new Set(['Brain socket', 'Drive connector (2 × 8, keyed)'])
function explodeCoreParts(root) {
  const R = rng(4242)
  for (const g of root.children) {
    const pick = g.userData.pick
    if (!pick || CORE_FIXED.has(pick.name)) continue
    if (/brain/i.test(pick.name)) { g.userData.explode = { stage: 4, off: [0, 75, 0] }; continue }
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
    const out = new THREE.Vector3(c.x, 0, c.z).multiplyScalar(0.35)
    g.userData.explode = { stage: 3, off: [out.x, 32 + R() * 26, out.z] }
  }
}
const DRIVE_PLAN = {
  'LEGO-compatible stud plate': { stage: 2, off: [0, 50, -25] },
  'Brass standoffs': { stage: 2, off: [0, 38, 0] },
  'Ball caster': { stage: 2, off: [0, -32, -30] },
  '2 × 18650 battery pack': { stage: 2, off: [0, -38, -10] },
  'Charging port and power switch': { stage: 2, off: [0, -10, -50] },
  '3-channel line sensor': { stage: 2, off: [0, -22, 50] },
  'Bumper with micro-switches': { stage: 2, off: [0, 0, 55] },
  'Servo 1 (SG90)': { stage: 5, off: [0, 60, 30] },
  'Ultrasonic distance sensor (HC-SR04)': { stage: 5, off: [0, 105, 40] },
}
function explodeDriveParts(root) {
  for (const g of root.children) {
    const pick = g.userData.pick
    if (!pick) continue
    if (DRIVE_PLAN[pick.name]) g.userData.explode = DRIVE_PLAN[pick.name]
    else if (pick.name === 'N20 encoder motor') {
      const side = Math.sign(new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()).x)
      g.userData.explode = { stage: 1, off: [side * 75, -4, 0] }
    }
  }
}
