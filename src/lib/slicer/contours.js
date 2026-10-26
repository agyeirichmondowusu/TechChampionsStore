// Cuts an indexed triangle mesh with horizontal planes and stitches the cut segments into closed loops.
//
// Each crossing triangle yields one segment whose two ends lie on two of its edges. Neighbouring
// triangles share those edges, so loops are stitched by edge identity rather than by comparing
// float coordinates, which keeps contours closed even on dense or slightly sloppy meshes.

const EPS_JOIN = 0.05 // mm; how far apart two open chain ends may be and still be joined

/**
 * @param {Float64Array} verts xyz per vertex (already transformed into printer space)
 * @param {Uint32Array} tris three vertex indices per triangle
 * @param {number[]} zs slice heights, ascending
 * @returns {number[][][]} for every height, a list of loops, each a flat [x0, y0, x1, y1, ...] array
 */
export function sliceContours(verts, tris, zs) {
  const nt = tris.length / 3
  const nv = verts.length / 3
  const zmin = new Float64Array(nt)
  const zmax = new Float64Array(nt)
  for (let t = 0; t < nt; t++) {
    const a = verts[tris[t * 3] * 3 + 2], b = verts[tris[t * 3 + 1] * 3 + 2], c = verts[tris[t * 3 + 2] * 3 + 2]
    zmin[t] = Math.min(a, b, c)
    zmax[t] = Math.max(a, b, c)
  }
  const order = new Uint32Array(nt)
  for (let t = 0; t < nt; t++) order[t] = t
  order.sort((p, q) => zmin[p] - zmin[q])

  const out = []
  let active = []
  let next = 0
  for (const z of zs) {
    while (next < nt && zmin[order[next]] <= z) active.push(order[next++])
    active = active.filter((t) => zmax[t] > z)
    out.push(cutLayer(verts, tris, active, z, nv))
  }
  return out
}

function cutLayer(verts, tris, active, z, nv) {
  // Segment storage: entry edge key, exit edge key, entry point, exit point.
  const n = active.length
  const e0 = new Float64Array(n)
  const e1 = new Float64Array(n)
  const pts = new Float64Array(n * 4)
  let count = 0
  const edgeKey = (a, b) => (a < b ? a * nv + b : b * nv + a)

  for (const t of active) {
    const i0 = tris[t * 3], i1 = tris[t * 3 + 1], i2 = tris[t * 3 + 2]
    const ids = [i0, i1, i2]
    // A vertex is "above" only when strictly above, so a vertex on the plane is treated the same way
    // by every triangle that shares it and the topology stays consistent.
    const up = ids.map((i) => verts[i * 3 + 2] > z)
    if (up[0] === up[1] && up[1] === up[2]) continue
    let down = -1, rise = -1
    for (let k = 0; k < 3; k++) {
      const a = k, b = (k + 1) % 3
      if (up[a] && !up[b]) down = k // edge goes from above to below
      else if (!up[a] && up[b]) rise = k
    }
    // Walking the triangle counter-clockwise (outward normal), the contour runs from the
    // above-to-below edge to the below-to-above edge, which makes outer loops counter-clockwise.
    const p = edgePoint(verts, ids[down], ids[(down + 1) % 3], z)
    const q = edgePoint(verts, ids[rise], ids[(rise + 1) % 3], z)
    e0[count] = edgeKey(ids[down], ids[(down + 1) % 3])
    e1[count] = edgeKey(ids[rise], ids[(rise + 1) % 3])
    pts[count * 4] = p[0]
    pts[count * 4 + 1] = p[1]
    pts[count * 4 + 2] = q[0]
    pts[count * 4 + 3] = q[1]
    count++
  }

  const byEdge = new Map()
  const link = (key, s) => {
    const l = byEdge.get(key)
    if (l) l.push(s)
    else byEdge.set(key, [s])
  }
  for (let s = 0; s < count; s++) {
    link(e0[s], s)
    link(e1[s], s)
  }

  const used = new Uint8Array(count)
  const loops = []
  const open = []
  for (let s0 = 0; s0 < count; s0++) {
    if (used[s0]) continue
    // Walk the segment graph without trusting segment direction, then fix the loop's direction by a
    // majority vote of the segments in it. That tolerates meshes with a few flipped triangles.
    const loop = []
    let fwd = 0
    let s = s0
    let forward = true
    let closed = false
    for (;;) {
      used[s] = 1
      const ex = forward ? e1[s] : e0[s]
      if (forward) {
        loop.push(pts[s * 4], pts[s * 4 + 1])
        fwd++
      } else {
        loop.push(pts[s * 4 + 2], pts[s * 4 + 3])
        fwd--
      }
      const cands = byEdge.get(ex)
      let nxt = -1
      for (const c of cands) {
        if (c === s0 && c !== s && loop.length > 2) {
          closed = true
          break
        }
        if (!used[c]) {
          nxt = c
          break
        }
      }
      if (closed || nxt < 0) {
        if (!closed) loop.push(forward ? pts[s * 4 + 2] : pts[s * 4], forward ? pts[s * 4 + 3] : pts[s * 4 + 1])
        break
      }
      forward = e0[nxt] === ex
      s = nxt
    }
    if (fwd < 0) reverseLoop(loop)
    if (closed) loops.push(loop)
    else open.push(loop)
  }

  // Holes in the mesh leave open chains; join chains whose ends nearly touch, then close them.
  if (open.length) loops.push(...joinOpen(open))
  return loops.filter((l) => l.length >= 6)
}

function edgePoint(verts, a, b, z) {
  const az = verts[a * 3 + 2], bz = verts[b * 3 + 2]
  const t = (z - az) / (bz - az)
  return [verts[a * 3] + (verts[b * 3] - verts[a * 3]) * t, verts[a * 3 + 1] + (verts[b * 3 + 1] - verts[a * 3 + 1]) * t]
}

function reverseLoop(l) {
  for (let i = 0, j = l.length - 2; i < j; i += 2, j -= 2) {
    const x = l[i], y = l[i + 1]
    l[i] = l[j]
    l[i + 1] = l[j + 1]
    l[j] = x
    l[j + 1] = y
  }
}

function joinOpen(chains) {
  const done = []
  const d2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2
  const tol = EPS_JOIN * EPS_JOIN
  while (chains.length) {
    let c = chains.pop()
    for (let guard = 0; guard < 10000; guard++) {
      const ex = c[c.length - 2], ey = c[c.length - 1]
      if (c.length > 4 && d2(ex, ey, c[0], c[1]) < tol) break
      let best = -1, bestD = Infinity, rev = false
      for (let i = 0; i < chains.length; i++) {
        const o = chains[i]
        const ds = d2(ex, ey, o[0], o[1])
        const de = d2(ex, ey, o[o.length - 2], o[o.length - 1])
        if (ds < bestD) [best, bestD, rev] = [i, ds, false]
        if (de < bestD) [best, bestD, rev] = [i, de, true]
      }
      // Gaps up to 2 mm are bridged; that covers missing triangles without inventing geometry.
      if (best < 0 || bestD > 4) break
      const o = chains.splice(best, 1)[0]
      if (rev) reverseLoop(o)
      c = c.concat(o)
    }
    done.push(c)
  }
  return done
}
