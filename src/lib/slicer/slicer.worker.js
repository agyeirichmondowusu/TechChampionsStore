// Runs parsing and slicing off the main thread so the page stays responsive on big models.
import { parseSTL, indexMesh, meshStats } from './stl.js'
import { sliceModel } from './slicer.js'
import { writeGcode } from './gcode.js'
import { resolveSettings } from './profiles.js'

let mesh = null

self.onmessage = (ev) => {
  const msg = ev.data
  try {
    if (msg.type === 'load') {
      const soup = parseSTL(msg.buffer)
      if (!soup.length) throw new Error('No triangles found. Is this a valid STL file?')
      mesh = indexMesh(soup)
      const st = meshStats(mesh.verts, mesh.tris)
      const display = soup.slice()
      self.postMessage({ type: 'loaded', id: msg.id, positions: display, triangles: mesh.tris.length / 3, volume: st.volume, area: st.area }, [display.buffer])
    } else if (msg.type === 'slice') {
      if (!mesh) throw new Error('Load a model first.')
      const s = resolveSettings(msg.settings)
      const m = msg.matrix // column-major 4x4, as three.js stores it
      const v = mesh.verts
      const out = new Float64Array(v.length)
      let zmin = Infinity, zmax = -Infinity
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2]
        out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
        out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
        out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
        if (out[i + 2] < zmin) zmin = out[i + 2]
        if (out[i + 2] > zmax) zmax = out[i + 2]
      }
      for (let i = 2; i < out.length; i += 3) out[i] -= zmin
      let tris = mesh.tris
      // Mirroring flips triangle winding; swap two corners so outer contours stay counter-clockwise.
      const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2])
      if (det < 0) {
        tris = tris.slice()
        for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]]
      }
      const t0 = performance.now()
      const progress = (stage, pct) => self.postMessage({ type: 'progress', id: msg.id, stage, pct })
      const sliced = sliceModel({ verts: out, tris, height: zmax - zmin }, s, progress)
      progress('Writing G-code', 1)
      const res = writeGcode(sliced, s, { name: msg.name })
      const p = res.preview
      self.postMessage(
        { type: 'sliced', id: msg.id, gcode: res.gcode, stats: { ...res.stats, sliceMs: performance.now() - t0 }, preview: p },
        [p.seg.buffer, p.segType.buffer, p.trv.buffer, p.layerSeg.buffer, p.layerTrv.buffer, p.layerZ.buffer],
      )
    }
  } catch (e) {
    console.error(e)
    self.postMessage({ type: 'error', id: msg.id, message: e.message || String(e) })
  }
}
