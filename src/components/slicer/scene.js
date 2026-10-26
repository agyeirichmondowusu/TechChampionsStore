// three.js scene for the slicer: build plate, the model, and the sliced toolpath preview. Printer space is Z-up, in mm.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { FEATURES } from '../../lib/slicer/gcode.js'

const MODEL_COLOR = new THREE.Color('#2f80ff')
const BAD_COLOR = new THREE.Color('#ef4444')
const FAT_LINE_LIMIT = 2_500_000 // beyond this many segments, fall back to 1px lines to save GPU memory

export class SlicerScene {
  constructor(host) {
    this.host = host
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000)
    this.camera.up.set(0, 0, 1)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.screenSpacePanning = true

    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a2340, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(-1, -1.6, 2.4)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x9cc2ff, 1.0)
    rim.position.set(1.5, 2, 0.8)
    this.scene.add(rim)
    this.keyLight = key

    this.bedGroup = new THREE.Group()
    this.scene.add(this.bedGroup)
    this.raycaster = new THREE.Raycaster()
    this.model = null
    this.preview = null
    this.travel = null
    this.onPick = null

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.resize()
    this.renderer.domElement.addEventListener('pointerdown', (e) => (this.down = [e.clientX, e.clientY]))
    this.renderer.domElement.addEventListener('pointerup', (e) => this.handleClick(e))
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  resize() {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.lineMat) this.lineMat.resolution.set(w, h)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  setBed([w, d, h]) {
    if (this.bed && this.bed.join() === [w, d, h].join()) return
    this.bed = [w, d, h]
    for (const c of [...this.bedGroup.children]) {
      this.bedGroup.remove(c)
      c.geometry?.dispose()
    }
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w, d, 2),
      new THREE.MeshStandardMaterial({ color: 0x1b2742, roughness: 0.9, metalness: 0.1 }),
    )
    plate.position.set(w / 2, d / 2, -1.01)
    this.bedGroup.add(plate)
    const grid = []
    for (let x = 0; x <= w + 1e-6; x += 10) grid.push(x, 0, 0, x, d, 0)
    for (let y = 0; y <= d + 1e-6; y += 10) grid.push(0, y, 0, w, y, 0)
    const gridGeo = new THREE.BufferGeometry()
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3))
    this.bedGroup.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x3a5288, transparent: true, opacity: 0.7 })))
    const axes = new THREE.BufferGeometry()
    axes.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.02, 30, 0, 0.02, 0, 0, 0.02, 0, 30, 0.02], 3))
    axes.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.3, 0.3, 1, 0.3, 0.3, 0.3, 1, 0.5, 0.3, 1, 0.5], 3))
    this.bedGroup.add(new THREE.LineSegments(axes, new THREE.LineBasicMaterial({ vertexColors: true })))
    const vol = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, d, h)),
      new THREE.LineBasicMaterial({ color: 0x6b8fd6, transparent: true, opacity: 0.25 }),
    )
    vol.position.set(w / 2, d / 2, h / 2)
    this.bedGroup.add(vol)
    this.controls.target.set(w / 2, d / 2, 0)
  }

  /** Loads triangle-soup positions; the transform is applied separately so rotating never rebuilds geometry. */
  setModel(positions) {
    if (this.model) {
      this.scene.remove(this.model)
      this.model.geometry.dispose()
    }
    this.model = null
    if (!positions) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ color: MODEL_COLOR, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    this.model = new THREE.Mesh(geo, mat)
    this.model.matrixAutoUpdate = false
    this.scene.add(this.model)
  }

  setModelMatrix(m, outOfBounds) {
    if (!this.model) return
    this.model.matrix.copy(m)
    this.model.matrixWorldNeedsUpdate = true
    this.model.material.color.copy(outOfBounds ? BAD_COLOR : MODEL_COLOR)
  }

  setMode(mode) {
    this.mode = mode
    if (this.model) {
      const ghost = mode === 'preview'
      this.model.material.transparent = ghost
      this.model.material.opacity = ghost ? 0.08 : 1
      this.model.material.depthWrite = !ghost
      this.model.visible = !ghost || !!this.preview
    }
    if (this.preview) this.preview.visible = mode === 'preview'
    if (this.travel) this.travel.visible = mode === 'preview' && this.showTravel
  }

  /** Builds toolpath ribbons from the worker's preview buffers, honouring hidden feature types. */
  setPreview(p, { lineWidth, hidden = [], showTravel = false } = {}) {
    for (const o of [this.preview, this.travel]) {
      if (!o) continue
      this.scene.remove(o)
      o.geometry.dispose()
    }
    this.preview = this.travel = null
    this.layerEnds = null
    this.showTravel = showTravel
    if (!p) return this.setMode(this.mode)

    const colors = p.types.map((t) => FEATURES[t].color)
    const hide = new Set(hidden.map((t) => p.types.indexOf(t)))
    const n = p.segType.length
    const pos = new Float32Array(n * 6)
    const col = new Float32Array(n * 6)
    const ends = new Uint32Array(p.layerSeg.length)
    let k = 0, layer = 0
    for (let i = 0; i < n; i++) {
      while (i >= p.layerSeg[layer]) ends[layer++] = k
      const t = p.segType[i]
      if (hide.has(t)) continue
      pos.set(p.seg.subarray(i * 6, i * 6 + 6), k * 6)
      // Alternate layers are shaded slightly differently so individual layers read in the preview.
      const shade = layer % 2 ? 0.86 : 1
      const c = colors[t]
      for (let v = 0; v < 2; v++) {
        col[k * 6 + v * 3] = c[0] * shade
        col[k * 6 + v * 3 + 1] = c[1] * shade
        col[k * 6 + v * 3 + 2] = c[2] * shade
      }
      k++
    }
    while (layer < ends.length) ends[layer++] = k
    this.layerEnds = ends
    this.fat = k <= FAT_LINE_LIMIT
    if (this.fat) {
      const geo = new LineSegmentsGeometry()
      geo.setPositions(pos.subarray(0, k * 6))
      geo.setColors(col.subarray(0, k * 6))
      this.lineMat = new LineMaterial({ vertexColors: true, worldUnits: true, linewidth: lineWidth * 0.95 })
      this.lineMat.resolution.set(this.host.clientWidth, this.host.clientHeight)
      this.preview = new LineSegments2(geo, this.lineMat)
    } else {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 6), 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, k * 6), 3))
      this.preview = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }))
    }
    this.preview.frustumCulled = false
    this.scene.add(this.preview)

    if (showTravel && p.trv.length) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(p.trv, 3))
      this.travel = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8b9ab5, transparent: true, opacity: 0.45 }))
      this.travel.frustumCulled = false
      this.travelEnds = p.layerTrv
      this.scene.add(this.travel)
    }
    this.setMode(this.mode)
  }

  /** Shows layers 0..index. */
  setLayer(index) {
    if (!this.preview || !this.layerEnds) return
    const end = this.layerEnds[Math.min(index, this.layerEnds.length - 1)] || 0
    if (this.fat) this.preview.geometry.instanceCount = end
    else this.preview.geometry.setDrawRange(0, end * 2)
    if (this.travel) this.travel.geometry.setDrawRange(0, (this.travelEnds[Math.min(index, this.travelEnds.length - 1)] || 0) * 2)
  }

  /** Points the camera at a box (min/max in printer space) from a named direction. */
  frame(box, view = 'iso') {
    const center = box ? new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5) : new THREE.Vector3(this.bed[0] / 2, this.bed[1] / 2, 0)
    const size = box ? box.max.clone().sub(box.min).length() : Math.hypot(...this.bed)
    const r = Math.max(size, 40) * 0.5
    const dist = r / Math.sin((this.camera.fov * Math.PI) / 360) * 1.15
    const dirs = { iso: [-0.55, -1, 0.75], front: [0, -1, 0.08], top: [0, -0.001, 1], side: [1, 0, 0.08] }
    const d = new THREE.Vector3(...dirs[view]).normalize()
    this.camera.position.copy(center).addScaledVector(d, dist)
    this.controls.target.copy(center)
    this.camera.near = Math.max(dist / 200, 0.1)
    this.camera.far = dist * 50
    this.camera.updateProjectionMatrix()
  }

  /** In "place on face" mode, a click on the model reports the clicked face's normal in printer space. */
  handleClick(e) {
    if (!this.onPick || !this.model || !this.down) return
    if (Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4) return
    const r = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.model.updateMatrixWorld()
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.intersectObject(this.model)[0]
    if (!hit) return
    const n = hit.face.normal.clone().transformDirection(this.model.matrixWorld)
    this.onPick(n)
  }

  snapshot() {
    return this.renderer.domElement.toDataURL('image/png')
  }
}
