// three.js viewer for one board: studio lighting, orbit controls, live pin glow and on-board LEDs.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildBoardModel } from './boardModels.js'

let glowTexture
function glowMap() {
  if (glowTexture) return glowTexture
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(c)
  return glowTexture
}

function setupStage(renderer, scene) {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(-60, 140, 80)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 400 })
  key.shadow.bias = -0.0005
  scene.add(key)
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x202430, 0.35))
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.28 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.01
  floor.receiveShadow = true
  scene.add(floor)
  return floor
}

function frame(camera, controls, size, model, angle = 1) {
  const [w, d] = size
  const r = Math.max(w, d * 1.4) * 1.18
  // Lift models whose parts hang below the PCB (pins pointing down) onto the floor.
  const box = new THREE.Box3().setFromObject(model)
  model.position.y = -box.min.y
  camera.position.set(-r * 0.15 * angle, r * 0.95, r * 0.95)
  controls?.target.set(0, 4, 0)
  camera.lookAt(0, 4, 0)
}

export class BoardScene {
  constructor(host) {
    this.host = host
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.touchAction = 'none'
    this.scene = new THREE.Scene()
    setupStage(this.renderer, this.scene)
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 2000)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minDistance = 25
    this.controls.maxDistance = 400
    this.controls.autoRotateSpeed = 0.6
    this.controls.addEventListener('start', () => (this.controls.autoRotate = false))
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.onHover = null
    this.glows = new Map()
    this.pinStates = {}
    this.serialFlash = 0

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.renderer.domElement.addEventListener('pointermove', (e) => this.hover(e))
    this.renderer.domElement.addEventListener('pointerleave', () => this.onHover?.(null))
    const loop = (t) => {
      this.raf = requestAnimationFrame(loop)
      this.controls.update()
      this.animate(t)
      this.renderer.render(this.scene, this.camera)
    }
    this.raf = requestAnimationFrame(loop)
  }

  resize() {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  setBoard(board) {
    if (this.model) {
      this.scene.remove(this.model.group)
      disposeTree(this.model.group)
    }
    this.board = board
    this.model = buildBoardModel(board.id)
    this.scene.add(this.model.group)
    frame(this.camera, this.controls, this.model.size, this.model.group)
    this.controls.autoRotate = true
    // One glow sprite and one invisible hit target per pin the board exposes.
    this.glows = new Map()
    this.hits = []
    const map = glowMap()
    for (const pin of board.pins) {
      const at = this.model.anchors[pin.id]
      if (!at) continue
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
      sprite.position.copy(at)
      sprite.scale.setScalar(4.2)
      sprite.renderOrder = 10
      this.model.group.add(sprite)
      this.glows.set(pin.num, { sprite, pin, level: 0 })
      const hit = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), new THREE.MeshBasicMaterial({ visible: false }))
      hit.position.copy(at)
      hit.userData.pin = pin
      this.model.group.add(hit)
      this.hits.push(hit)
    }
    this.setPins({})
  }

  // states: { num: {m, v, d, ...} }, wired: Set of pin numbers used by parts
  setPins(states, wired = this.wired || new Set()) {
    this.pinStates = states
    this.wired = wired
  }

  pulseSerial() { this.serialFlash = performance.now() }

  animate(t) {
    if (!this.model) return
    for (const g of this.glows.values()) {
      const s = this.pinStates[g.pin.num]
      let target = 0
      let color = '#ffb347'
      if (s?.m === 'out') {
        target = s.d != null ? s.d : s.v
        color = '#ff9a2e'
      } else if (s && this.wired.has(g.pin.num)) {
        target = 0.35 + (s.v ? 0.45 : 0)
        color = s.v ? '#5cc8ff' : '#3a7bff'
      } else if (this.wired.has(g.pin.num)) {
        target = 0.3
        color = '#5cc8ff'
      }
      g.level += (target - g.level) * 0.35
      g.sprite.material.opacity = Math.min(1, g.level)
      g.sprite.material.color.set(color)
      g.sprite.scale.setScalar(3 + g.level * 2.5)
    }
    const leds = this.model.leds
    const builtin = this.board.builtinLed != null ? this.pinStates[this.board.builtinLed] : null
    const lit = builtin?.m === 'out' ? (builtin.d != null ? builtin.d : builtin.v) : 0
    const glow = (m, k) => {
      if (!m) return
      m.material.emissive.copy(m.userData.glow)
      m.material.emissiveIntensity = k * 6
    }
    glow(leds.builtin, lit)
    glow(leds.power, this.running ? 1 : 0.6)
    glow(leds.act, this.running ? 0.5 + 0.5 * Math.sin(t / 180) ** 8 : 0)
    const flash = performance.now() - this.serialFlash < 90 ? 1 : 0
    glow(leds.tx, flash)
    glow(leds.rx, 0)
  }

  hover(e) {
    if (!this.onHover || !this.hits?.length) return
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.hits, false)[0]
    this.onHover(hit ? { pin: hit.object.userData.pin, x: e.clientX - r.left, y: e.clientY - r.top } : null)
  }

  resetView() {
    if (!this.model) return
    frame(this.camera, this.controls, this.model.size, this.model.group)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.controls.dispose()
    if (this.model) disposeTree(this.model.group)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose()
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    // Shared materials (from boardModels) are kept; per-mesh textured ones are freed.
    mats.forEach((m) => { if (m.map && m.map !== glowTexture) { m.map.dispose(); m.dispose() } })
  })
}

// Small still renders of every board for the picker, made once with a shared offscreen renderer.
const thumbs = new Map()
export function boardThumbnail(id, width = 240, height = 160) {
  const key = `${id}:${width}x${height}`
  if (thumbs.has(key)) return thumbs.get(key)
  const renderer = (boardThumbnail.renderer ||= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }))
  renderer.setPixelRatio(2)
  renderer.setSize(width, height, false)
  const scene = new THREE.Scene()
  setupStage(renderer, scene)
  const model = buildBoardModel(id)
  scene.add(model.group)
  const camera = new THREE.PerspectiveCamera(30, width / height, 1, 2000)
  frame(camera, null, model.size, model.group, 1.6)
  camera.position.multiplyScalar(0.92)
  camera.lookAt(0, 2, 0)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  disposeTree(model.group)
  scene.environment?.dispose()
  thumbs.set(key, url)
  return url
}
