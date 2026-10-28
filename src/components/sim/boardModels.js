// Procedural, to-scale 3D models of the simulator boards (millimetres, Y up, top of the PCB at y = 1.6).
// Each builder returns { group, anchors: { pinId: Vector3 }, leds: { builtin, power, tx, rx }, size: [w, d] }.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const PITCH = 2.54
const T = 1.6
const PX = 14 // texture pixels per mm

let shared
function materials() {
  if (shared) return shared
  const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  shared = {
    plastic: std('#141416', 0.55),
    plasticSoft: std('#232327', 0.7),
    white: std('#ecebe6', 0.5),
    beige: std('#d9c9a3', 0.6),
    gold: std('#d6a84e', 0.28, 1),
    tin: std('#c9ccd2', 0.32, 1),
    steel: std('#b9bec6', 0.22, 1),
    darkSteel: std('#6d727a', 0.35, 1),
    chip: std('#1c1c1f', 0.42, 0.1),
    hole: std('#020202', 1),
    resistor: std('#18181a', 0.5),
    ceramic: std('#b98d58', 0.5),
    ceramicGrey: std('#8f8a82', 0.5),
    blueTongue: std('#1f5fd1', 0.5),
    capSleeve: std('#20242c', 0.45, 0.2),
    lens: std('#f2f2ea', 0.2, 0, { transparent: true, opacity: 0.85 }),
    copper: std('#c58a52', 0.3, 1),
  }
  return shared
}

function textTexture(lines, { w = 256, h = 256, bg = null, color = '#9a9aa0', font = 'bold 34px Arial', lineGap = 1.25 } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h) }
  g.fillStyle = color
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const size = parseInt(font.match(/(\d+)px/)[1], 10)
  lines.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * lineGap))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

class Builder {
  constructor(W, D, pcbColor, { corner = 1.5, holes = [] } = {}) {
    this.W = W
    this.D = D
    this.pcbColor = new THREE.Color(pcbColor)
    this.corner = corner
    this.holes = holes
    this.group = new THREE.Group()
    this.anchors = {}
    this.leds = {}
    this.inst = new Map()
    this.m = materials()
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.round(W * PX)
    this.canvas.height = Math.round(D * PX)
    this.g = this.canvas.getContext('2d')
    this.g.fillStyle = `#${this.pcbColor.getHexString()}`
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height)
    this.silk = '#f4f4ef'
  }

  // board coordinates (x right, y up the board image, z above the PCB) -> local 3D
  pos(x, y, z = 0) { return new THREE.Vector3(x - this.W / 2, T + z, this.D / 2 - y) }
  cx(x) { return x * PX }
  cy(y) { return (this.D - y) * PX }

  add(geo, mat, x, y, z = 0, rotY = 0) {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(this.pos(x, y, z))
    mesh.rotation.y = rotY
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.group.add(mesh)
    return mesh
  }

  box(w, d, h, mat, x, y, z = 0, rotY = 0) {
    const m = this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z + h / 2, rotY)
    return m
  }

  rbox(w, d, h, r, mat, x, y, z = 0, rotY = 0) {
    return this.add(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat, x, y, z + h / 2, rotY)
  }

  cyl(r, h, mat, x, y, z = 0, seg = 24) {
    return this.add(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y, z + h / 2)
  }

  // Many small identical parts share one InstancedMesh.
  tiny(key, makeGeo, mat, x, y, z, rotY = 0) {
    let e = this.inst.get(key)
    if (!e) { e = { geo: makeGeo(), mat, list: [] }; this.inst.set(key, e) }
    const m = new THREE.Matrix4().compose(this.pos(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(1, 1, 1))
    e.list.push(m)
  }

  // ---------- silkscreen and copper drawn into the PCB texture ----------
  text(str, x, y, size, { align = 'center', rot = 0, bold = true, italic = false, color = this.silk, font = 'Arial' } = {}) {
    const g = this.g
    g.save()
    g.translate(this.cx(x), this.cy(y))
    g.rotate((-rot * Math.PI) / 180)
    g.fillStyle = color
    g.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size * PX}px ${font}`
    g.textAlign = align
    g.textBaseline = 'middle'
    g.fillText(str, 0, 0)
    g.restore()
  }
  line(pts, width = 0.25, color = this.silk) {
    const g = this.g
    g.strokeStyle = color
    g.lineWidth = width * PX
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(this.cx(x), this.cy(y)) : g.moveTo(this.cx(x), this.cy(y))))
    g.stroke()
  }
  rect(x, y, w, h, width = 0.2, color = this.silk) { this.line([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], width, color) }
  fillRect(x, y, w, h, color) { this.g.fillStyle = color; this.g.fillRect(this.cx(x), this.cy(y + h), w * PX, h * PX) }
  circle(x, y, r, color, stroke = 0) {
    const g = this.g
    g.beginPath()
    g.arc(this.cx(x), this.cy(y), r * PX, 0, Math.PI * 2)
    if (stroke) { g.strokeStyle = color; g.lineWidth = stroke * PX; g.stroke() } else { g.fillStyle = color; g.fill() }
  }
  // Copper traces under the solder mask: slightly lighter than the board.
  traces(paths, width = 0.3) {
    const c = this.pcbColor.clone().offsetHSL(0, 0.02, 0.06)
    paths.forEach((p) => this.line(p, width, `#${c.getHexString()}`))
  }
  vias(points) {
    points.forEach(([x, y]) => {
      this.circle(x, y, 0.38, '#c9a35a')
      this.circle(x, y, 0.16, '#3a2a12')
    })
  }
  // A random but tidy-looking trace field inside a rectangle, for realism.
  traceField(x, y, w, h, n, seed = 1) {
    let s = seed
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const paths = []
    const vias = []
    for (let i = 0; i < n; i++) {
      const x0 = x + rnd() * w
      const y0 = y + rnd() * h
      const horizontal = rnd() > 0.5
      const len = 3 + rnd() * Math.min(w, h) * 0.6
      const x1 = horizontal ? Math.min(x + w, x0 + len) : x0
      const y1 = horizontal ? y0 : Math.min(y + h, y0 + len)
      const dx = (rnd() - 0.5) * 4
      paths.push([[x0, y0], [x1, y1], [x1 + dx, y1 + (horizontal ? Math.abs(dx) : 0)]])
      if (rnd() > 0.6) vias.push([x1 + dx, y1 + (horizontal ? Math.abs(dx) : 0)])
    }
    this.traces(paths, 0.22)
    this.vias(vias)
  }
  pad(x, y, w, h) { this.fillRect(x - w / 2, y - h / 2, w, h, '#d6b25e') }
  ringPad(x, y, r = 0.85, hole = 0.5) { this.circle(x, y, r, '#d9b664'); this.circle(x, y, hole, '#151515') }

  // ---------- parts ----------
  smdResistor(x, y, rot = 0) {
    this.tiny('res', () => new THREE.BoxGeometry(1.6, 0.45, 0.8), this.m.resistor, x, y, 0.22, rot)
    const ex = Math.cos(rot) * 0.7
    const ey = Math.sin(rot) * 0.7
    this.tiny('resEnd', () => new THREE.BoxGeometry(0.3, 0.47, 0.82), this.m.tin, x + ex, y + ey, 0.23, rot)
    this.tiny('resEnd', () => new THREE.BoxGeometry(0.3, 0.47, 0.82), this.m.tin, x - ex, y - ey, 0.23, rot)
  }
  smdCap(x, y, rot = 0, grey = false) {
    this.tiny(grey ? 'capG' : 'cap', () => new THREE.BoxGeometry(1.6, 0.8, 0.8), grey ? this.m.ceramicGrey : this.m.ceramic, x, y, 0.4, rot)
    const ex = Math.cos(rot) * 0.7
    const ey = Math.sin(rot) * 0.7
    this.tiny('capEnd', () => new THREE.BoxGeometry(0.3, 0.82, 0.82), this.m.tin, x + ex, y + ey, 0.41, rot)
    this.tiny('capEnd', () => new THREE.BoxGeometry(0.3, 0.82, 0.82), this.m.tin, x - ex, y - ey, 0.41, rot)
  }
  smdField(x, y, w, h, n, seed = 7) {
    let s = seed
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647)
    for (let i = 0; i < n; i++) {
      const px = x + rnd() * w
      const py = y + rnd() * h
      const rot = rnd() > 0.5 ? 0 : Math.PI / 2
      if (rnd() > 0.45) this.smdResistor(px, py, rot)
      else this.smdCap(px, py, rot, rnd() > 0.6)
    }
  }

  chip(w, d, h, x, y, label = [], { rot = 0, legs = 0, legSides = 4, legLen = 0.9, pitch = 0.5, color = '#9a9aa0', dot = true, z = 0 } = {}) {
    const top = textTexture(label, { w: 256, h: Math.round((256 * d) / w), bg: '#1d1d21', color, font: `bold ${Math.round(150 / Math.max(4, Math.max(...label.map((l) => l.length), 4)))}px Arial` })
    const side = this.m.chip
    const topMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, map: top })
    const mesh = this.add(new THREE.BoxGeometry(w, h, d), [side, side, topMat, side, side, side], x, y, z + h / 2 + (legs ? 0.15 : 0), rot)
    if (dot) {
      const d0 = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) * 0.06, 16), new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.9 }))
      d0.rotation.x = -Math.PI / 2
      d0.position.set(-w / 2 + Math.min(w, d) * 0.15, h / 2 + 0.01, -d / 2 + Math.min(w, d) * 0.15)
      mesh.add(d0)
    }
    if (legs) {
      const per = legSides === 4 ? legs / 4 : legs / 2
      const span = (per - 1) * pitch
      const key = `leg${pitch}${legLen}`
      const geo = () => new THREE.BoxGeometry(legLen, 0.18, pitch * 0.45)
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      const place = (lx, ly, r) => this.tiny(key, geo, this.m.tin, x + lx * c + ly * s, y - lx * s + ly * c, z + 0.1, rot + r)
      for (let i = 0; i < per; i++) {
        const o = -span / 2 + i * pitch
        place(-w / 2 - legLen / 2 + 0.1, o, 0)
        place(w / 2 + legLen / 2 - 0.1, o, 0)
        if (legSides === 4) {
          place(o, -d / 2 - legLen / 2 + 0.1, Math.PI / 2)
          place(o, d / 2 + legLen / 2 - 0.1, Math.PI / 2)
        }
      }
    }
    return mesh
  }

  // DIP chip in a socket (the Uno's ATmega328P).
  dip(n, x, y, label, rot = 0) {
    const len = (n / 2) * PITCH
    this.box(len + 1.5, 10.2, 2.6, this.m.plasticSoft, x, y, 0, rot)
    this.chip(len, 7.4, 3.2, x, y, label, { rot, z: 2.6, color: '#c8c8cc' })
    for (let i = 0; i < n / 2; i++) {
      const lx = -len / 2 + PITCH / 2 + i * PITCH
      for (const side of [-1, 1]) {
        const ly = side * 3.95
        this.tiny('dipLeg', () => new THREE.BoxGeometry(0.5, 2.2, 0.9), this.m.tin, x + lx * Math.cos(rot), y + ly - lx * Math.sin(rot), 2.7)
      }
    }
  }

  femaleHeader(ids, x0, y0, { dir = 'x', label = true, labelSide = 1, h = 8.5 } = {}) {
    const n = ids.length
    const len = n * PITCH
    const along = dir === 'x'
    const cxm = along ? x0 + (n - 1) * PITCH / 2 : x0
    const cym = along ? y0 : y0 - (n - 1) * PITCH / 2
    this.box(along ? len : PITCH, along ? PITCH : len, h, this.m.plastic, cxm, cym)
    ids.forEach((id, i) => {
      const x = along ? x0 + i * PITCH : x0
      const y = along ? y0 : y0 - i * PITCH
      this.tiny('fhole', () => new THREE.BoxGeometry(1.0, 0.05, 1.0), this.m.hole, x, y, h + 0.01)
      if (id) this.anchors[id] = this.pos(x, y, h + 0.4)
      if (label && id) this.text(id.replace(/^D/, ''), along ? x : x + labelSide * 2.4, along ? y + labelSide * 2.3 : y, 1.15, { rot: along ? 90 : 0, align: along ? (labelSide > 0 ? 'left' : 'right') : 'center' })
    })
  }

  // Header with pins pointing up (Raspberry Pi) or down (Nano/ESP32, shown as pads on top).
  maleHeader(cols, rows, x0, y0, ids, { up = true, rowStep = PITCH } = {}) {
    const len = cols * PITCH
    if (up) this.box(len, rows * rowStep, 2.5, this.m.plastic, x0 + (cols - 1) * PITCH / 2, y0 + (rows - 1) * rowStep / 2)
    else this.box(len, rows * rowStep, 2.5, this.m.plastic, x0 + (cols - 1) * PITCH / 2, y0 + (rows - 1) * rowStep / 2, -T - 2.5)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * PITCH
        const y = y0 + r * rowStep
        const id = ids?.[r]?.[c]
        if (up) {
          this.tiny('pinUp', () => new THREE.BoxGeometry(0.64, 8.4, 0.64), this.m.gold, x, y, 4.2 - 2.5)
          if (id) this.anchors[id] = this.pos(x, y, 8.6)
        } else {
          this.ringPad(x, y, 0.9, 0.45)
          this.tiny('solder', () => new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.m.tin, x, y, 0)
          this.tiny('pinDown', () => new THREE.BoxGeometry(0.64, 8.4, 0.64), this.m.gold, x, y, -T - 4.2)
          if (id) this.anchors[id] = this.pos(x, y, 0.9)
        }
      }
    }
  }

  led(x, y, color, key, rot = 0) {
    const mat = new THREE.MeshStandardMaterial({ color: '#f6f2e6', roughness: 0.25, emissive: new THREE.Color(color), emissiveIntensity: 0 })
    const m = this.box(1.6, 0.8, 0.55, mat, x, y, 0, rot)
    m.userData.glow = new THREE.Color(color)
    if (key) this.leds[key] = m
    return m
  }

  button(x, y, size = 6, capColor = '#1a1a1a') {
    this.box(size, size, 3.1, this.m.steel, x, y)
    this.cyl(size * 0.29, 1.1, new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.6 }), x, y, 3.1)
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.tiny('btnLeg', () => new THREE.BoxGeometry(0.8, 0.3, 1.2), this.m.tin, x + dx * size * 0.55, y + dy * size * 0.33, 0)
  }

  crystal(x, y, rot = 0) { this.rbox(11, 4.6, 3.6, 1.8, this.m.steel, x, y, 0, rot) }
  smdCrystal(x, y, rot = 0) { this.rbox(3.2, 2.5, 0.8, 0.2, this.m.steel, x, y, 0, rot) }

  electrolytic(x, y, r, h, sleeve = this.m.capSleeve) {
    this.cyl(r, h - 0.3, sleeve, x, y)
    this.cyl(r * 0.97, 0.3, this.m.steel, x, y, h - 0.3)
    const mark = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, 0.05, 0.25), this.m.darkSteel)
    mark.position.copy(this.pos(x, y, h + 0.03))
    this.group.add(mark)
  }

  usbB(x, y, rot = 0) {
    const shell = this.box(16, 12, 10.9, this.m.steel, x, y, 0, rot)
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.4, 8.2), this.m.hole)
    inner.position.set(-8.01, 0, 0)
    shell.add(inner)
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 5.2), this.m.white)
    tongue.position.set(-7.7, 0, 0)
    shell.add(tongue)
  }
  barrelJack(x, y) {
    const body = this.box(14, 9, 11, this.m.plastic, x, y)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.5, 24), this.m.plasticSoft)
    ring.rotation.z = Math.PI / 2
    ring.position.set(-7.05, 0.6, 0)
    body.add(ring)
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.6, 16), this.m.steel)
    pin.rotation.z = Math.PI / 2
    pin.position.set(-7.1, 0.6, 0)
    body.add(pin)
  }
  microUsb(x, y, rot = 0, w = 7.6, d = 5.6, h = 2.7) {
    const m = this.rbox(d, w, h, 0.4, this.m.steel, x, y, 0, rot)
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.3, h * 0.55, w * 0.78), this.m.hole)
    hole.position.set(-d / 2 - 0.01, 0, 0)
    m.add(hole)
    return m
  }
  usbC(x, y, rot = 0) {
    const m = this.rbox(7.4, 9, 3.2, 1.5, this.m.steel, x, y, 0, rot)
    const hole = new THREE.Mesh(new RoundedBoxGeometry(0.3, 2.3, 7.8, 2, 0.15), this.m.hole)
    hole.position.set(-3.71, 0, 0)
    m.add(hole)
    return m
  }
  usbA(x, y, tongue, rot = 0) {
    const m = this.box(17.5, 13.2, 15.6, this.m.steel, x, y, 0, rot)
    for (const yy of [-3.6, 3.6]) {
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 12.2), this.m.hole)
      hole.position.set(8.76, yy, 0)
      m.add(hole)
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 11.2), tongue)
      t.position.set(8.6, yy - 0.9, 0)
      m.add(t)
    }
    return m
  }
  rj45(x, y) {
    const m = this.box(21.5, 16, 13.6, this.m.steel, x, y)
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8.6, 11.6), this.m.hole)
    hole.position.set(10.76, -1, 0)
    m.add(hole)
    for (const [zz, c] of [[-4.6, '#ffb000'], [4.6, '#36d36c']]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 2), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 }))
      l.position.set(10.78, 5.4, zz)
      m.add(l)
    }
    return m
  }
  microHdmi(x, y) {
    const m = this.rbox(7.5, 6.6, 3.1, 0.5, this.m.steel, x, y, 0, Math.PI / 2)
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 5.4), this.m.hole)
    hole.position.set(-3.76, 0, 0)
    m.add(hole)
  }
  fpc(x, y, w, rot = 0) {
    this.box(w, 3.4, 1.3, this.m.plastic, x, y, 0, rot)
    this.box(w * 0.94, 1.4, 1.5, this.m.beige, x, y + (rot ? 0 : 0.9), 0, rot)
  }
  shield(w, d, h, x, y, label = [], rot = 0) {
    const longest = Math.max(10, ...label.map((l) => l.length))
    const tex = textTexture(label, { w: 512, h: Math.round((512 * d) / w), bg: '#d4d7dc', color: '#6f747c', font: `bold ${Math.min(44, Math.round(700 / longest))}px Arial` })
    const top = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.32, map: tex })
    const side = this.m.steel
    return this.add(new THREE.BoxGeometry(w, h, d), [side, side, top, side, side, side], x, y, h / 2, rot)
  }

  finish() {
    // PCB with rounded corners and mounting holes, textured with the drawn silkscreen.
    const { W, D, corner: r } = this
    const shape = new THREE.Shape()
    shape.moveTo(r, 0)
    shape.lineTo(W - r, 0)
    shape.quadraticCurveTo(W, 0, W, r)
    shape.lineTo(W, D - r)
    shape.quadraticCurveTo(W, D, W - r, D)
    shape.lineTo(r, D)
    shape.quadraticCurveTo(0, D, 0, D - r)
    shape.lineTo(0, r)
    shape.quadraticCurveTo(0, 0, r, 0)
    for (const [hx, hy, hr] of this.holes) {
      const p = new THREE.Path()
      p.absarc(hx, hy, hr, 0, Math.PI * 2, true)
      shape.holes.push(p)
      this.circle(hx, hy, hr + 0.9, '#d4b060')
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 24 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(-W / 2, 0, D / 2)
    const tex = new THREE.CanvasTexture(this.canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    tex.repeat.set(1 / W, 1 / D)
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 })
    const edge = new THREE.MeshStandardMaterial({ color: this.pcbColor.clone().offsetHSL(0, -0.1, -0.08), roughness: 0.7 })
    const pcb = new THREE.Mesh(geo, [face, edge])
    pcb.receiveShadow = true
    pcb.castShadow = true
    this.group.add(pcb)
    for (const { geo: g, mat, list } of this.inst.values()) {
      const im = new THREE.InstancedMesh(g, mat, list.length)
      list.forEach((m, i) => im.setMatrixAt(i, m))
      im.castShadow = true
      im.receiveShadow = true
      this.group.add(im)
    }
    return { group: this.group, anchors: this.anchors, leds: this.leds, size: [W, D] }
  }
}

// ---------------- Arduino Uno R3 / Mega 2560 (shared layout) ----------------
function arduinoBase(b, { mega }) {
  const m = b.m
  // Copper and silkscreen
  b.traceField(14, 14, mega ? 80 : 46, 30, mega ? 150 : 90, mega ? 3 : 11)
  b.rect(-0.2, 37.6, 16.6, 13, 0.2)
  // Logo and name
  b.text('∞', mega ? 54 : 44.5, 42, 7.5, { bold: true })
  b.text(mega ? 'ARDUINO MEGA 2560' : 'ARDUINO', mega ? 54 : 44.5, mega ? 37.5 : 36.5, 2.4, { bold: true })
  if (!mega) b.text('UNO', 46, 28.5, 7.2, { italic: true, bold: true })
  b.text('DIGITAL (PWM~)', mega ? 40 : 44, 45.7, 1.5)
  b.text('POWER', 36.8, 7.4, 1.5)
  b.text('ANALOG IN', mega ? 66 : 57, 7.4, 1.5)
  b.text('ON', mega ? 70 : 59.2, 41.5, 1.3)
  b.text('L', 27.8, 43.6, 1.2)
  b.text('TX', 27.6, 40.1, 1.1)
  b.text('RX', 27.6, 37.6, 1.1)
  b.text('RESET', 14.5, 51.4, 1.0)
  b.text('ICSP', mega ? 87.6 : 66.2, 23, 1.0, { rot: 90 })
  b.text(mega ? 'MADE IN ITALY · MEGA 2560 R3' : 'MADE IN ITALY', mega ? 40 : 46, mega ? 14 : 20.5, 1.2, { bold: false })
  b.text('IOREF RESET 3V3 5V GND GND VIN', 36.8, 5.2, 0.95, { bold: false })

  // Connectors
  b.usbB(6.6, 44.1)
  b.barrelJack(4.6, 7.6)
  b.electrolytic(17.3, 6.0, 3.1, 5.6)
  b.electrolytic(17.3, 13.0, 3.1, 5.6)
  b.chip(6.5, 3.5, 1.6, 12.2, 18.8, ['1117'], { legs: 3, legSides: 2, pitch: 2.3, rot: Math.PI / 2 })
  b.box(3.5, 1.8, 0.5, m.steel, 12.2, 22.6)
  b.button(14.5, 47.0)
  // USB-serial bridge (ATmega16U2), its crystal and ICSP
  b.chip(5, 5, 0.9, 20.8, 42.5, ['16U2'], { legs: 32, pitch: 0.5, legLen: 0.5, rot: Math.PI / 4 })
  b.smdCrystal(20.5, 35.0)
  b.maleHeader(2, 3, 23.7, 44.5, null, { up: true, rowStep: PITCH })
  // Main microcontroller
  if (mega) {
    b.chip(14, 14, 1.4, 60, 23, ['ATMEGA2560', '16AU 1941'], { legs: 100, pitch: 0.5, rot: Math.PI / 4, color: '#c8c8cc' })
    b.crystal(43, 22, 0)
  } else {
    b.dip(28, 46.5, 15.8, ['ATMEGA328P-PU', '1941  ●'])
    b.crystal(27, 31.5, 0)
  }
  b.maleHeader(2, 3, mega ? 84.5 : 63.9, 25.5, null, { up: true })
  // LEDs
  b.led(29.9, 43.6, '#ffb000', 'builtin')
  b.led(29.9, 40.1, '#ffb000', 'tx')
  b.led(29.9, 37.6, '#ffb000', 'rx')
  b.led(mega ? 72.5 : 61.6, 41.5, '#2fff6a', 'power')
  // Small parts
  b.smdField(20, 26, 12, 8, 14, 3)
  b.smdField(24, 9, 8, 8, 8, 9)
  b.smdField(mega ? 70 : 52, 32, mega ? 22 : 8, 10, mega ? 18 : 8, 5)
  b.smdField(33, 34, 6, 5, 5, 13)
}

function uno() {
  const b = new Builder(68.6, 53.3, '#00878f', { corner: 1.2, holes: [[14, 2.5, 1.6], [15.3, 50.7, 1.6], [66.1, 7.6, 1.6], [66.1, 35.5, 1.6]] })
  arduinoBase(b, { mega: false })
  b.femaleHeader(['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], 18.8, 50.8)
  b.femaleHeader(['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], 45.72, 50.8)
  b.femaleHeader(['', 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND2', 'VIN'], 27.94, 2.54, { label: false })
  b.femaleHeader(['A0', 'A1', 'A2', 'A3', 'A4', 'A5'], 50.8, 2.54, { labelSide: -1 })
  return b.finish()
}

function mega() {
  const b = new Builder(101.6, 53.3, '#00878f', { corner: 1.2, holes: [[14, 2.5, 1.6], [15.3, 50.7, 1.6], [66.1, 7.6, 1.6], [66.1, 35.5, 1.6], [90.2, 50.7, 1.6], [96.5, 2.5, 1.6]] })
  arduinoBase(b, { mega: true })
  b.femaleHeader(['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], 18.8, 50.8)
  b.femaleHeader(['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], 45.72, 50.8)
  b.femaleHeader(['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21'], 68.58, 50.8)
  b.femaleHeader(['', 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GND2', 'VIN'], 27.94, 2.54, { label: false })
  b.femaleHeader(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], 50.8, 2.54, { labelSide: -1 })
  b.femaleHeader(['A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15'], 73.66, 2.54, { labelSide: -1 })
  // Double row D22-D53 along the right edge
  const left = ['5V']
  const right = ['5V']
  for (let n = 22; n <= 53; n += 2) { left.push(`D${n}`); right.push(`D${n + 1}`) }
  left.push('GND3')
  right.push('GND4')
  b.femaleHeader(left, 93.98, 48.26, { dir: 'y', labelSide: -1 })
  b.femaleHeader(right, 96.52, 48.26, { dir: 'y', labelSide: 1 })
  b.text('COMMUNICATION', 77.5, 45.7, 1.4)
  b.text('DIGITAL', 89.5, 6.5, 1.4, { rot: 90 })
  return b.finish()
}

// ---------------- Arduino Nano ----------------
function nano() {
  const b = new Builder(43.2, 17.8, '#0a6f9a', { corner: 0.6, holes: [[1.0, 1.0, 0.55], [42.2, 1.0, 0.55], [1.0, 16.8, 0.55], [42.2, 16.8, 0.55]] })
  b.traceField(8, 4, 28, 10, 50, 21)
  const top = ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND', 'RST', 'D0', 'D1']
  const bottom = ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST2', 'GND2', 'VIN']
  b.maleHeader(15, 1, 3.81, 16.51, [top], { up: false })
  b.maleHeader(15, 1, 3.81, 1.27, [bottom], { up: false })
  top.forEach((id, i) => b.text(id.replace(/^D(\d)/, '$1').replace('D0', 'RX0').replace('D1', 'TX1'), 3.81 + i * PITCH, 14.2, 0.85, { rot: 90, align: 'right', bold: false }))
  bottom.forEach((id, i) => b.text(id.replace(/^D(\d)/, '$1').replace(/2$/, ''), 3.81 + i * PITCH, 3.6, 0.85, { rot: 90, align: 'left', bold: false }))
  b.microUsb(2.2, 8.9, 0, 7.6, 9, 4) // mini-USB
  b.chip(7, 7, 1.2, 25.5, 8.9, ['ATMEGA', '328P'], { legs: 32, pitch: 0.8, rot: Math.PI / 4, color: '#c8c8cc' })
  b.chip(5, 5, 1, 12.5, 8.9, ['CH340'], { legs: 16, legSides: 2, pitch: 1.27, legLen: 0.8 })
  b.smdCrystal(18.5, 12.2)
  b.button(33.5, 8.9, 3.6, '#e9e9e9')
  b.led(8.6, 13.8, '#ffb000', 'builtin', Math.PI / 2)
  b.led(8.6, 4.0, '#2fff6a', 'power', Math.PI / 2)
  b.led(19.5, 4.6, '#ffb000', 'tx')
  b.led(19.5, 13.2, '#ffb000', 'rx')
  b.chip(2.9, 1.6, 1.0, 38.5, 13.6, ['1117'], { legs: 3, legSides: 2, pitch: 0.95 })
  b.smdField(14, 3.5, 10, 2.5, 6, 31)
  b.smdField(28, 12, 9, 2.5, 6, 37)
  b.text('NANO', 38.3, 6.5, 1.8, { rot: 90 })
  b.text('ARDUINO', 30, 4.0, 1.1)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) b.ringPad(40.5 + c * PITCH * 0.5 - 0.6, 6.4 + r * 1.27, 0.5, 0.25)
  return b.finish()
}

// ---------------- ESP32 DevKit V1 (30 pins) ----------------
function esp32() {
  const b = new Builder(51.5, 28.3, '#141414', { corner: 0.8, holes: [[1.6, 1.6, 0.0001]] })
  b.silk = '#e8e8e8'
  b.traceField(4, 6, 24, 16, 60, 41)
  const topIds = ['EN', 'GPIO36', 'GPIO39', 'GPIO34', 'GPIO35', 'GPIO32', 'GPIO33', 'GPIO25', 'GPIO26', 'GPIO27', 'GPIO14', 'GPIO12', 'GPIO13', 'GND', 'VIN']
  const botIds = ['GPIO23', 'GPIO22', 'TX0', 'RX0', 'GPIO21', 'GPIO19', 'GPIO18', 'GPIO5', 'GPIO17', 'GPIO16', 'GPIO4', 'GPIO2', 'GPIO15', 'GND2', '3V3']
  // Pin 0 is at the antenna end (high x)
  b.maleHeader(15, 1, 6.25, 26.5, [[...topIds].reverse()], { up: false })
  b.maleHeader(15, 1, 6.25, 1.8, [[...botIds].reverse()], { up: false })
  const short = (id) => id.replace('GPIO36', 'VP').replace('GPIO39', 'VN').replace(/^GPIO/, 'D').replace(/2$/, (m) => (id.startsWith('GND') ? '' : m))
  ;[...topIds].reverse().forEach((id, i) => b.text(short(id), 6.25 + i * PITCH, 24.3, 0.9, { rot: 90, align: 'right', bold: false }))
  ;[...botIds].reverse().forEach((id, i) => b.text(short(id), 6.25 + i * PITCH, 4.0, 0.9, { rot: 90, align: 'left', bold: false }))
  // ESP-WROOM-32 module: blue-black PCB carrier, metal can and antenna
  b.box(25.5, 18, 0.8, new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.6 }), 38.4, 14.15)
  b.shield(17.6, 15.8, 2.4, 34.6, 14.15, ['ESP32-WROOM-32', 'Espressif', 'FCC ID: 2AC7Z-ESPWROOM32'])
  const ant = textTexture([], { w: 128, h: 512, bg: '#1d1d22' })
  const g = ant.image.getContext('2d')
  g.strokeStyle = '#c9a35a'
  g.lineWidth = 10
  g.beginPath()
  g.moveTo(20, 470)
  for (let i = 0; i < 6; i++) { g.lineTo(20, 60 + i * 70); g.lineTo(105, 60 + i * 70); g.lineTo(105, 95 + i * 70); g.lineTo(20, 95 + i * 70) }
  g.stroke()
  ant.needsUpdate = true
  const antMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 17.4), new THREE.MeshStandardMaterial({ map: ant, roughness: 0.5 }))
  antMesh.rotation.x = -Math.PI / 2
  antMesh.position.copy(b.pos(47.8, 14.15, 0.81))
  b.group.add(antMesh)
  // USB side
  b.microUsb(1.8, 14.15)
  b.chip(5, 5, 1, 12.5, 11.5, ['CP2102'], { legs: 28, pitch: 0.5, legLen: 0.5 })
  b.chip(6.5, 3.5, 1.6, 9.3, 21, ['AMS1117'], { legs: 3, legSides: 2, pitch: 2.3 })
  b.button(4.6, 4.6, 4.2, '#1d1d1d')
  b.button(4.6, 23.7, 4.2, '#1d1d1d')
  b.text('EN', 8.0, 4.6, 1.1)
  b.text('BOOT', 8.6, 23.7, 1.1)
  b.led(17.6, 20.8, '#ff2a2a', 'power')
  b.led(17.6, 7.6, '#2f7bff', 'builtin')
  b.smdField(14, 15, 9, 6, 10, 43)
  b.smdField(20, 5, 5, 18, 8, 47)
  b.text('ESP32 DEVKIT V1', 20.5, 14.0, 1.2, { rot: 90 })
  return b.finish()
}

// ---------------- Raspberry Pi Pico W ----------------
function pico() {
  const b = new Builder(51, 21, '#1f7a3a', { corner: 0.5, holes: [[2, 4.8, 1.05], [2, 16.2, 1.05], [49, 4.8, 1.05], [49, 16.2, 1.05]] })
  b.traceField(6, 5, 38, 11, 70, 51)
  const x = (k) => 1.37 + (k - 1) * PITCH
  const side1 = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15']
  const side2 = ['GP16', 'GP17', 'GND', 'GP18', 'GP19', 'GP20', 'GP21', 'GND', 'GP22', 'RUN', 'GP26', 'GP27', 'GND', 'GP28', 'ADC_VREF', '3V3', '3V3_EN', 'GND', 'VSYS', 'VBUS']
  // Castellated edge pads
  const pad = (px, py, id, labelY, align) => {
    b.fillRect(px - 0.8, py - 1.1, 1.6, 2.2, '#dcb766')
    b.circle(px, py, 0.5, '#101010')
    b.tiny('castel', () => new THREE.BoxGeometry(1.6, 0.04, 2.2), b.m.gold, px, py, 0.01)
    if (id && !id.startsWith('GND')) b.anchors[id] = b.pos(px, py, 0.6)
    b.text(id.replace('ADC_VREF', 'VREF').replace('3V3_EN', 'EN'), px, labelY, 0.75, { rot: 90, align, bold: false })
  }
  side1.forEach((id, i) => pad(x(i + 1), 19.9, id, 18.0, 'right'))
  side2.forEach((id, i) => pad(x(20 - i), 1.1, id, 3.0, 'left'))
  b.microUsb(1.0, 10.5, 0, 7.8, 5.4, 2.8)
  b.chip(7, 7, 0.9, 24, 10.5, ['RP2-B2', '20/21 P64M15', 'Raspberry Pi'], { legs: 56, pitch: 0.4, legLen: 0.4, color: '#b8b8be' })
  b.chip(5.2, 5.2, 1.2, 14.5, 10.5, ['W25Q16', 'JVSNIQ'], { legs: 8, legSides: 2, pitch: 1.27, legLen: 1.0 })
  b.smdCrystal(17.8, 15.2)
  // Wireless chip under a can, then the antenna
  b.shield(10.5, 10.5, 1.4, 38.6, 10.5, ['', 'CYW43439'])
  b.fillRect(44.5, 6.5, 5, 8, '#1a6a32')
  b.line([[45, 7], [45, 14], [46.2, 14], [46.2, 7], [47.4, 7], [47.4, 14], [48.6, 14]], 0.35, '#c9a35a')
  b.button(8.5, 15.8, 3.5, '#f1f1f1')
  b.text('BOOTSEL', 8.5, 13.2, 0.8)
  b.led(5.4, 6.5, '#2fff6a', 'builtin')
  b.text('LED', 5.4, 8.0, 0.8)
  b.smdField(28.5, 4, 6, 3, 6, 53)
  b.smdField(28.5, 14, 6, 3, 6, 57)
  b.smdField(10, 4, 3, 3, 4, 59)
  b.text('Raspberry Pi Pico W', 25, 4.7, 1.25)
  b.text('© 2022', 25, 16.5, 0.9, { bold: false })
  for (const [i, id] of ['SWCLK', 'GND', 'SWDIO'].entries()) b.ringPad(50 - 1.0, 8 + i * PITCH, 0.6, 0.35) || void id
  return b.finish()
}

// ---------------- Raspberry Pi 5 ----------------
function rpi5() {
  const b = new Builder(85, 56, '#1e6b3a', { corner: 3, holes: [[3.5, 3.5, 1.375], [61.5, 3.5, 1.375], [3.5, 52.5, 1.375], [61.5, 52.5, 1.375]] })
  b.traceField(8, 12, 52, 34, 160, 61)
  // 40-pin header: odd pins on the inner row
  const phys = { 1: '3V3', 2: '5V', 4: '5V', 6: 'GND', 9: 'GND', 14: 'GND', 17: '3V3', 20: 'GND', 25: 'GND', 30: 'GND', 34: 'GND', 39: 'GND' }
  const bcm = { 3: 2, 5: 3, 7: 4, 8: 14, 10: 15, 11: 17, 12: 18, 13: 27, 15: 22, 16: 23, 18: 24, 19: 10, 21: 9, 22: 25, 23: 11, 24: 8, 26: 7, 27: 0, 28: 1, 29: 5, 31: 6, 32: 12, 33: 13, 35: 19, 36: 16, 37: 26, 38: 20, 40: 21 }
  const idFor = (p) => (bcm[p] != null ? `GPIO${bcm[p]}` : null)
  const inner = []
  const outer = []
  for (let k = 0; k < 20; k++) { inner.push(idFor(2 * k + 1)); outer.push(idFor(2 * k + 2)) }
  b.maleHeader(20, 2, 8.0, 51.23, [inner, outer], { up: true, rowStep: 2.54 })
  void phys
  // SoC under a heat spreader, RAM, RP1 I/O controller, PMIC
  b.box(17, 17, 1.0, new THREE.MeshStandardMaterial({ color: '#2b3a2f', roughness: 0.6 }), 29, 32)
  b.shield(14, 14, 1.0, 29, 32, ['BROADCOM', 'BCM2712ZPKFSB06C0T'])
  b.children = null
  b.chip(13, 11.5, 1.0, 46, 32, ['MICRON', 'D8CJN', 'LPDDR4X 4GB'], { color: '#a8a8ae' })
  b.chip(11, 11, 1.0, 62, 26, ['Raspberry Pi', 'RP1-C0', '2023'], { color: '#c8c8cc' })
  b.chip(6, 6, 0.8, 12, 12, ['DA9091'], { color: '#9a9aa0' })
  // Wireless module with antenna
  b.shield(11, 9.5, 1.4, 8.5, 34, ['', 'Raspberry Pi', 'Wi-Fi'])
  b.fillRect(1.6, 40, 4.5, 8, '#1a5e33')
  b.line([[2.2, 40.5], [2.2, 47.5], [3.4, 47.5], [3.4, 40.5], [4.6, 40.5], [4.6, 47.5]], 0.35, '#c9a35a')
  // Right edge: USB 2.0 stack (top), USB 3.0 stack (middle), Ethernet (bottom)
  b.usbA(77, 47.0, b.m.plasticSoft)
  b.usbA(77, 29.1, b.m.blueTongue)
  b.rj45(76.6, 10.3)
  // Bottom edge: USB-C power, two micro HDMI, camera/display connectors
  b.usbC(11.2, 2.6, Math.PI / 2)
  b.microHdmi(26.0, 2.8)
  b.microHdmi(39.5, 2.8)
  b.fpc(49.5, 12.5, 11, Math.PI / 2)
  b.fpc(54.8, 12.5, 11, Math.PI / 2)
  // Left edge: PCIe FPC, power button; RTC battery and fan headers
  b.fpc(2.6, 22, 13, Math.PI / 2)
  b.box(2.6, 3.4, 1.6, b.m.white, 1.4, 8.2)
  b.box(4.2, 2.6, 2.4, b.m.white, 66, 51)
  b.box(4.2, 2.6, 2.4, b.m.white, 46, 4)
  b.led(1.6, 12.5, '#ff2a2a', 'power')
  b.led(1.6, 14.4, '#2fff6a', 'act')
  b.smdField(18, 20, 20, 6, 22, 63)
  b.smdField(40, 20, 14, 4, 12, 67)
  b.smdField(36, 40, 18, 5, 16, 71)
  b.smdField(14, 6, 8, 6, 10, 73)
  b.text('Raspberry Pi 5', 46, 44.5, 2.4)
  b.text('© Raspberry Pi Ltd 2023', 46, 41.5, 1.1, { bold: false })
  b.text('PWR', 1.8, 10.5, 0.9, { rot: 90 })
  b.text('CAM/DISP 0', 49.5, 5.6, 0.9, { rot: 90 })
  b.text('CAM/DISP 1', 54.8, 5.6, 0.9, { rot: 90 })
  b.text('PCIe', 6, 22, 1.0, { rot: 90 })
  b.text('FAN', 66, 48.5, 0.9)
  b.text('BAT', 46, 6.2, 0.9)
  b.text('1', 6.8, 50.2, 1.0)
  b.text('40', 57.5, 55.2, 1.0)
  return b.finish()
}

const BUILDERS = { uno, nano, mega, esp32, pico, rpi5 }

export function buildBoardModel(id) {
  return (BUILDERS[id] || uno)()
}
