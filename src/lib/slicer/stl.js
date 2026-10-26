// STL parsing (binary + ASCII) and vertex welding. Pure functions, used inside the slicer worker.

const isBinary = (buf) => {
  if (buf.byteLength < 84) return false
  const n = new DataView(buf).getUint32(80, true)
  if (84 + n * 50 === buf.byteLength) return true
  // Some exporters write "solid" at the start of binary files, so only trust the header when the size check fails.
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(256, buf.byteLength)))
  return !/^\s*solid[\s\S]*facet/.test(head)
}

/** Returns a Float32Array of triangle soup: 9 floats (3 vertices) per triangle. */
export function parseSTL(buf) {
  if (isBinary(buf)) {
    const dv = new DataView(buf)
    const n = Math.min(dv.getUint32(80, true), Math.floor((buf.byteLength - 84) / 50))
    const out = new Float32Array(n * 9)
    for (let i = 0, o = 84; i < n; i++, o += 50) {
      for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true)
    }
    return out
  }
  const text = new TextDecoder().decode(buf)
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g
  const vals = []
  let m
  while ((m = re.exec(text))) vals.push(+m[1], +m[2], +m[3])
  const n = Math.floor(vals.length / 9)
  return Float32Array.from(vals.slice(0, n * 9))
}

/**
 * Welds identical vertices so the slicer can follow shared edges between triangles.
 * Uses an open-addressing hash on the raw float bits (STL repeats exact values for shared corners).
 */
export function indexMesh(soup) {
  const nv = soup.length / 3
  const bits = new Uint32Array(soup.buffer, soup.byteOffset, soup.length)
  let size = 1
  while (size < nv * 2) size <<= 1
  const table = new Int32Array(size).fill(-1)
  const verts = new Float32Array(soup.length)
  const vbits = new Uint32Array(verts.buffer)
  const tris = new Uint32Array(nv)
  let count = 0
  for (let i = 0; i < nv; i++) {
    // -0 and +0 are the same point but have different bits.
    const a = bits[i * 3] === 0x80000000 ? 0 : bits[i * 3]
    const b = bits[i * 3 + 1] === 0x80000000 ? 0 : bits[i * 3 + 1]
    const c = bits[i * 3 + 2] === 0x80000000 ? 0 : bits[i * 3 + 2]
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & (size - 1)
    for (;;) {
      const j = table[h]
      if (j < 0) {
        table[h] = count
        vbits[count * 3] = a
        vbits[count * 3 + 1] = b
        vbits[count * 3 + 2] = c
        tris[i] = count++
        break
      }
      if (vbits[j * 3] === a && vbits[j * 3 + 1] === b && vbits[j * 3 + 2] === c) {
        tris[i] = j
        break
      }
      h = (h + 1) & (size - 1)
    }
  }
  // Drop degenerate triangles (two corners welded together); they carry no surface.
  let w = 0
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2]
    if (a === b || b === c || a === c) continue
    tris[w++] = a
    tris[w++] = b
    tris[w++] = c
  }
  return { verts: verts.slice(0, count * 3), tris: tris.slice(0, w) }
}

/** Volume (mm³) by signed tetrahedra and surface area (mm²) of an indexed mesh. */
export function meshStats(verts, tris) {
  let vol = 0
  let area = 0
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3
    const ax = verts[a], ay = verts[a + 1], az = verts[a + 2]
    const bx = verts[b], by = verts[b + 1], bz = verts[b + 2]
    const cx = verts[c], cy = verts[c + 1], cz = verts[c + 2]
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
  }
  return { volume: Math.abs(vol), area }
}
