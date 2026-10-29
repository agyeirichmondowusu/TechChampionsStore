// Scroll-driven 3D scene for the Champ Core product page. The robot starts fully exploded above the
// line-follower mat and rebuilds itself as `progress` goes from 0 to 6, then can drive the track.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildCore, buildDrive, buildMat, drawOled, pathAt, setAnisotropy } from '../../lib/kit/champModels.js'

export const FINAL_STAGE = 6

// Camera keyframes per stage, in the robot's own frame (robot faces +z).
const KEYS = [
  { pos: [480, 470, 620], target: [0, 110, 0] },
  { pos: [360, 170, 300], target: [0, 55, 10] },
  { pos: [-300, 90, 300], target: [0, 55, 0] },
  { pos: [170, 330, 300], target: [0, 195, 10] },
  { pos: [-160, 320, 260], target: [0, 185, 10] },
  { pos: [300, 250, 360], target: [0, 65, 10] },
  { pos: [-300, 250, 330], target: [0, 45, 0] },
]
const CORE_ON_DRIVE = new THREE.Vector3(0, 55, 10)
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const clamp01 = (x) => Math.min(1, Math.max(0, x))
// A part with stage k assembles while the visitor scrolls from k - 0.6 to k.
const amount = (s, stage) => ease(clamp01((s - (stage - 0.6)) / 0.6))

export function createChampScene(container, { tip, onDrivingChange } = {}) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  container.prepend(renderer.domElement)
  setAnisotropy(renderer.capabilities.getMaxAnisotropy())

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(34, 1, 1, 6000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enableZoom = false
  controls.enablePan = false
  controls.maxPolarAngle = Math.PI * 0.48
  controls.enabled = false

  const KEY_OFF = new THREE.Vector3(160, 380, 220)
  const key = new THREE.DirectionalLight(0xfff6ea, 2.6)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.4
  Object.assign(key.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 50, far: 1200 })
  scene.add(key, key.target)
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x404a60, 0.45))

  const mat = buildMat()
  scene.add(mat)

  const drive = buildDrive()
  const robot = drive.root
  scene.add(robot)

  // Every group with explode data remembers where it belongs.
  const parts = []
  const collect = (root) => root.traverse((o) => {
    if (o.userData.explode) { o.userData.base = o.position.clone(); parts.push(o) }
  })
  collect(robot)

  const cores = {}
  let core = null
  let variant = 'uno'
  function setVariant(k) {
    if (core) robot.remove(core.root)
    if (!cores[k]) {
      cores[k] = buildCore(k)
      const r = cores[k].root
      r.position.copy(CORE_ON_DRIVE)
      r.userData.explode = { stage: 5, off: [0, 100, 0] }
      cores[k].live.feet.visible = false
      collect(r)
    }
    core = cores[k]
    variant = k
    robot.add(core.root)
  }
  setVariant('uno')

  // ---------- state ----------
  let target = 0 // scroll progress requested by the page
  let shown = 0 // smoothed progress actually drawn
  let driving = false
  let phase = 0
  let userOrbited = false
  const startPose = () => {
    phase = 0
    const p = pathAt(0), q = pathAt(0.002)
    robot.position.set(p.x, 0, p.z)
    robot.rotation.y = Math.atan2(q.x - p.x, q.z - p.z)
  }
  startPose()
  controls.addEventListener('start', () => { userOrbited = true })

  function setProgress(s) {
    target = Math.max(0, Math.min(FINAL_STAGE, s))
    if (target < FINAL_STAGE - 0.3) {
      if (driving) setDriving(false)
      if (userOrbited || robot.position.lengthSq() > 1) { userOrbited = false; startPose() }
    }
  }
  function setDriving(on) {
    if (on && shown < FINAL_STAGE - 0.05) shown = FINAL_STAGE
    if (!on && driving) userOrbited = true // stay where the robot stopped
    driving = on
    onDrivingChange?.(on)
  }

  // ---------- pose for a progress value ----------
  const tmpV = new THREE.Vector3(), camPos = new THREE.Vector3(), camTarget = new THREE.Vector3()
  function applyParts(s) {
    for (const o of parts) {
      const { stage, off } = o.userData.explode
      const k = 1 - amount(s, stage)
      o.position.set(o.userData.base.x + off[0] * k, o.userData.base.y + off[1] * k, o.userData.base.z + off[2] * k)
    }
    // Lift the whole kit while the underside parts are apart so nothing sinks into the mat.
    robot.position.y = 60 * (1 - amount(s, 2.6))
  }
  function keyframe(s, outPos, outTarget) {
    const k = Math.min(FINAL_STAGE, Math.max(1, Math.ceil(s)))
    const f = ease(clamp01((s - (k - 0.6)) / 0.6))
    const a = KEYS[k - 1], b = KEYS[k]
    outPos.set(...a.pos).lerp(tmpV.set(...b.pos), f)
    outTarget.set(...a.target).lerp(tmpV.set(...b.target), f)
    outPos.applyAxisAngle(THREE.Object3D.DEFAULT_UP, robot.rotation.y).add(robot.position)
    outTarget.applyAxisAngle(THREE.Object3D.DEFAULT_UP, robot.rotation.y).add(robot.position)
  }

  // ---------- hover tooltips (mouse only) ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
  const hiBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#3fd0ff'))
  hiBox.visible = false
  hiBox.material.depthTest = false
  hiBox.renderOrder = 10
  scene.add(hiBox)
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect()
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ptr, camera)
    for (const h of ray.intersectObject(robot, true)) {
      let o = h.object
      while (o && !o.userData.pick) o = o.parent
      if (o) return o
    }
    return null
  }
  function onMove(e) {
    if (!tip || e.pointerType !== 'mouse' || e.buttons) return
    const o = pick(e)
    if (!o) { tip.style.display = 'none'; hiBox.visible = false; return }
    const { name, desc, pin } = o.userData.pick
    tip.replaceChildren()
    const b = document.createElement('b'); b.textContent = name
    const d = document.createElement('span'); d.textContent = desc
    tip.append(b, d)
    if (pin) { const c = document.createElement('code'); c.textContent = pin; tip.append(c) }
    const r = container.getBoundingClientRect()
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14
    if (x > r.width - 280) x -= 300
    if (y > r.height - 150) y -= 160
    tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.display = 'flex'
    hiBox.box.setFromObject(o); hiBox.visible = true
  }
  const onLeave = () => { if (tip) tip.style.display = 'none'; hiBox.visible = false }
  renderer.domElement.addEventListener('pointermove', onMove)
  renderer.domElement.addEventListener('pointerleave', onLeave)

  // ---------- size ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w / h < 0.9 ? 48 : 34
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()

  // ---------- loop ----------
  let raf = 0, last = performance.now(), oledAt = 0
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = now / 1000
    shown += (target - shown) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 6))
    if (Math.abs(target - shown) < 0.0005) shown = target
    if (driving) shown = FINAL_STAGE
    applyParts(shown)

    // board lights
    const L = core.live
    const cyc = t % 4.2, lit = cyc < 1.8 ? 2 : cyc < 2.5 ? 1 : 0
    L.tl.forEach((l, i) => { const on = i === lit ? 1 : 0; l.m.emissiveIntensity = on * 3.2; l.gl.material.opacity = on * 0.75 })
    L.rgb.forEach((p, i) => {
      p.m.emissive.setHSL((t * 0.15 + i * 0.12) % 1, 1, 0.55)
      p.m.emissiveIntensity = 2.4
      p.gl.material.color.copy(p.m.emissive)
      p.gl.material.opacity = 0.7
    })
    L.blink.set(t % 1 < 0.5 ? 1 : 0)
    L.knob.rotation.y = Math.sin(t * 0.5) * 1.6
    if (now - oledAt > 120) { drawOled(L.oled, now, variant, 'robot', driving); oledAt = now }

    const atEnd = shown > FINAL_STAGE - 0.02
    controls.enabled = atEnd
    if (driving) {
      const before = robot.position.clone(), h0 = robot.rotation.y
      const p1 = pathAt(phase), p2 = pathAt(phase + 0.001)
      phase += (140 * dt) / (p1.distanceTo(p2) / 0.001)
      const p = pathAt(phase), q = pathAt(phase + 0.002)
      robot.position.set(p.x, robot.position.y, p.z)
      robot.rotation.y = Math.atan2(q.x - p.x, q.z - p.z)
      const moved = robot.position.distanceTo(before)
      let dh = robot.rotation.y - h0
      if (dh > Math.PI) dh -= 2 * Math.PI
      if (dh < -Math.PI) dh += 2 * Math.PI
      for (const w of drive.live.wheels) w.spin.rotation.x += (moved - w.side * dh * 83) / 32.5
      drive.live.head.rotation.y = Math.sin(t * 2.2) * 0.6
      tmpV.copy(robot.position).sub(before)
      camera.position.add(tmpV)
      controls.target.add(tmpV)
    } else {
      drive.live.head.rotation.y *= 0.92
      if (!(atEnd && userOrbited)) {
        keyframe(shown, camPos, camTarget)
        camera.position.copy(camPos)
        controls.target.copy(camTarget)
      }
    }
    key.position.copy(controls.target).add(KEY_OFF)
    key.target.position.copy(controls.target)
    if (controls.enabled) controls.update()
    else camera.lookAt(controls.target)
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return {
    setProgress,
    setVariant,
    setDriving,
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      scene.traverse((o) => {
        o.geometry?.dispose()
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        ms.forEach((m) => { m.map?.dispose(); m.dispose() })
      })
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
