// Turns a mesh into per-layer toolpaths: walls, top/bottom skin, infill, supports, skirt/brim.
import { sliceContours } from './contours.js'
import { SCALE, regionFromLoops, offset, offsetRound, diff, intersect, union, unionAll, open, islands, clipLines, bounds, area } from './clip.js'

const PI4 = 1 - Math.PI / 4

/** Layer tops: the first layer, then fixed steps until the model height is covered. */
export function layerHeights(height, s) {
  const tops = [s.firstLayerHeight]
  for (let k = 1; ; k++) {
    const z = s.firstLayerHeight + k * s.layerHeight
    if (z - s.layerHeight / 2 >= height - 1e-6) break
    tops.push(+z.toFixed(4))
  }
  return tops
}

/** Spacing between neighbouring extrusions of width w and height h (stadium cross-section). */
export const lineSpacing = (w, h) => w - h * PI4

const toFlat = (path) => {
  const f = new Array(path.length * 2)
  for (let i = 0; i < path.length; i++) {
    f[i * 2] = path[i].X / SCALE
    f[i * 2 + 1] = path[i].Y / SCALE
  }
  return f
}

/** Parallel lines at `angle`, `gap` mm apart on a global grid so they line up from layer to layer. */
function hatch(region, gap, angle) {
  if (!region.length) return []
  const b = bounds(region)
  const c = Math.cos(angle), s = Math.sin(angle)
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]
  const along = corners.map(([x, y]) => x * c + y * s)
  const across = corners.map(([x, y]) => -x * s + y * c)
  const g = gap * SCALE
  const a0 = Math.min(...along) - g, a1 = Math.max(...along) + g
  const lines = []
  for (let k = Math.floor(Math.min(...across) / g); k * g <= Math.max(...across); k++) {
    const n = k * g
    lines.push([
      { X: Math.round(a0 * c - n * s), Y: Math.round(a0 * s + n * c) },
      { X: Math.round(a1 * c - n * s), Y: Math.round(a1 * s + n * c) },
    ])
  }
  return clipLines(lines, region).map(toFlat)
}

/** Fills `area` (the material boundary) with lines; centrelines sit half a spacing inside it. */
function fillLines(areaPaths, spacing, gap, angles, overlap) {
  const centre = offset(areaPaths, -spacing / 2 + overlap)
  const out = []
  for (const a of angles) out.push(...hatch(centre, gap, a))
  return out
}

function concentric(areaPaths, spacing, gap) {
  const out = []
  for (let d = spacing / 2, i = 0; i < 2000; d += gap, i++) {
    const loops = offset(areaPaths, -d)
    if (!loops.length) break
    for (const l of loops) out.push(toFlat(l))
  }
  return out
}

const deg = Math.PI / 180

function infillAngles(pattern, layer) {
  if (pattern === 'grid') return [45 * deg, 135 * deg]
  if (pattern === 'triangles') return [0, 60 * deg, 120 * deg]
  return [(layer % 2 ? 135 : 45) * deg]
}

/**
 * @param {{verts: Float64Array, tris: Uint32Array, height: number}} mesh in printer space (z = 0 on the bed)
 * @param {object} s slicing settings (mm, fraction for density)
 * @param {(stage: string, pct: number) => void} progress
 */
export function sliceModel(mesh, s, progress = () => {}) {
  const tops = layerHeights(mesh.height, s)
  const hs = tops.map((z, i) => (i ? z - tops[i - 1] : z))
  const planes = tops.map((z, i) => z - hs[i] / 2)
  const w = s.lineWidth
  const L = tops.length

  progress('Cutting layers', 0)
  const loops = sliceContours(mesh.verts, mesh.tris, planes)
  const regions = new Array(L)
  for (let i = 0; i < L; i++) {
    regions[i] = regionFromLoops(loops[i])
    if (i % 20 === 0) progress('Building outlines', i / L)
  }

  // Walls and the area left for infill, per island.
  const layers = new Array(L)
  for (let i = 0; i < L; i++) {
    const sp = lineSpacing(w, hs[i])
    const isl = islands(regions[i]).map((poly) => {
      const walls = []
      for (let k = 0; k < s.walls; k++) {
        const loopsK = offset(poly, -(w / 2 + k * sp))
        if (!loopsK.length) break
        walls.push(loopsK)
      }
      const fill = walls.length === s.walls ? offset(poly, -(w / 2 + (s.walls - 1) * sp + sp / 2)) : []
      return { poly, walls, fill }
    })
    layers[i] = { z: tops[i], h: hs[i], islands: isl, fill: isl.flatMap((x) => x.fill) }
    if (i % 10 === 0) progress('Generating walls', i / L)
  }

  // Solid skin wherever the layers above (top) or below (bottom) do not cover this layer's infill area.
  const solidAll = s.infillDensity >= 0.999
  for (let i = 0; i < L; i++) {
    const lay = layers[i]
    if (!lay.fill.length) {
      lay.top = lay.solid = lay.sparse = []
      continue
    }
    let topSurf = []
    let solid = []
    if (solidAll) solid = lay.fill
    else {
      let cover = regions[i + 1] || []
      topSurf = diff(lay.fill, cover)
      for (let k = 2; k <= s.topLayers && cover.length; k++) cover = intersect(cover, regions[i + k] || [])
      const topZone = s.topLayers ? diff(lay.fill, cover) : []
      let below = regions[i - 1] || []
      for (let k = 2; k <= s.bottomLayers && below.length; k++) below = intersect(below, regions[i - k] || [])
      const botZone = s.bottomLayers ? diff(lay.fill, below) : []
      solid = open(unionAll(topZone, botZone), w * 0.3)
      solid = intersect(solid, lay.fill)
    }
    topSurf = s.topLayers ? open(intersect(topSurf, solid), w * 0.3) : []
    lay.top = topSurf
    lay.solid = topSurf.length ? diff(solid, topSurf) : solid
    lay.sparse = solidAll ? [] : diff(lay.fill, solid)
    if (i % 10 === 0) progress('Finding top and bottom skin', i / L)
  }

  const support = s.supports === 'none' ? [] : buildSupports(regions, layers, s, progress)

  progress('Planning toolpaths', 0)
  const out = []
  let pos = [s.bedCenter[0], s.bedCenter[1]]
  for (let i = 0; i < L; i++) {
    const lay = layers[i]
    const sp = lineSpacing(w, lay.h)
    const paths = []
    const add = (type, pts, closed) => pts.length >= 4 && paths.push({ type, pts, closed })

    if (i === 0 && s.adhesion !== 'none') {
      const base = unionAll(regions[0], support[0] || [])
      if (s.adhesion === 'brim') {
        const outers = islands(base).map((p) => [p[0]])
        const n = Math.max(1, Math.round(s.brimWidth / sp))
        for (let k = n - 1; k >= 0; k--) for (const l of offsetRound(union(outers.flat()), w / 2 + k * sp)) add('skirt', toFlat(l), true)
      } else {
        for (let k = s.skirtLoops - 1; k >= 0; k--) for (const l of offsetRound(base, s.skirtDistance + w / 2 + k * sp)) add('skirt', toFlat(l), true)
      }
    }
    const pre = orderPaths(paths, pos)
    if (pre.length) pos = lastPoint(pre[pre.length - 1])

    const sup = support[i] || []
    const supPaths = []
    if (sup.length) {
      for (const l of hatch(offset(sup, -w / 2), i === 0 ? s.supportSpacing / 2 : s.supportSpacing, 0)) supPaths.push({ type: 'support', pts: l, closed: false })
    }
    const supOrdered = orderPaths(supPaths, pos)
    if (supOrdered.length) pos = lastPoint(supOrdered[supOrdered.length - 1])

    // Visit islands nearest-first; inside each: inner walls, outer wall, then skin and infill.
    const todo = lay.islands.slice()
    const islandPaths = []
    while (todo.length) {
      let bi = 0, bd = Infinity
      todo.forEach((isl, k) => {
        const p = isl.poly[0][0]
        const d = (p.X / SCALE - pos[0]) ** 2 + (p.Y / SCALE - pos[1]) ** 2
        if (d < bd) [bi, bd] = [k, d]
      })
      const isl = todo.splice(bi, 1)[0]
      for (let k = isl.walls.length - 1; k >= 0; k--) {
        const type = k === 0 ? 'outer' : 'inner'
        const loopsK = orderPaths(isl.walls[k].map((l) => ({ type, pts: toFlat(l), closed: true })), pos, k === 0 && s.seam === 'rear')
        for (const p of loopsK) {
          islandPaths.push(p)
          pos = lastPoint(p)
        }
      }
      if (isl.fill.length) {
        const overlap = s.infillOverlap * w
        const top = intersect(lay.top, isl.fill)
        const solid = intersect(lay.solid, isl.fill)
        const sparse = intersect(lay.sparse, isl.fill)
        const skinAngle = [(i % 2 ? 135 : 45) * deg]
        const groups = [
          ['top', fillLines(top, sp, sp, skinAngle, overlap)],
          ['solid', fillLines(solid, sp, sp, skinAngle, overlap)],
        ]
        if (s.infillDensity > 0 && sparse.length) {
          const pat = s.infillPattern
          const dirs = pat === 'grid' ? 2 : pat === 'triangles' ? 3 : 1
          const gap = (sp * dirs) / s.infillDensity
          groups.push(['infill', pat === 'concentric' ? concentric(sparse, sp, sp / s.infillDensity) : fillLines(sparse, sp, gap, infillAngles(pat, i), overlap)])
        }
        for (const [type, lines] of groups) {
          const ordered = orderPaths(lines.map((pts) => ({ type, pts, closed: type === 'infill' && s.infillPattern === 'concentric' })), pos)
          for (const p of ordered) {
            islandPaths.push(p)
            pos = lastPoint(p)
          }
        }
      }
    }
    out.push({ z: lay.z, h: lay.h, paths: [...pre, ...supOrdered, ...islandPaths] })
    if (i % 10 === 0) progress('Planning toolpaths', i / L)
  }
  return { layers: out, modelArea: regions.map((r) => area(r)) }
}

const lastPoint = (p) => (p.closed ? [p.pts[0], p.pts[1]] : [p.pts[p.pts.length - 2], p.pts[p.pts.length - 1]])

/** Greedy nearest-neighbour ordering. Loops start at their nearest vertex (or the rear-most for an aligned seam). */
function orderPaths(paths, start, rearSeam = false) {
  const left = paths.filter((p) => p.pts.length >= 4)
  const out = []
  let [px, py] = start
  while (left.length) {
    let best = 0, bestD = Infinity, bestIdx = 0, bestRev = false
    for (let k = 0; k < left.length; k++) {
      const p = left[k].pts
      if (left[k].closed) {
        for (let j = 0; j < p.length; j += 2) {
          const d = (p[j] - px) ** 2 + (p[j + 1] - py) ** 2
          if (d < bestD) [best, bestD, bestIdx] = [k, d, j]
        }
      } else {
        const ds = (p[0] - px) ** 2 + (p[1] - py) ** 2
        const de = (p[p.length - 2] - px) ** 2 + (p[p.length - 1] - py) ** 2
        if (ds < bestD) [best, bestD, bestRev] = [k, ds, false]
        if (de < bestD) [best, bestD, bestRev] = [k, de, true]
      }
    }
    const p = left.splice(best, 1)[0]
    if (p.closed) {
      let idx = bestIdx
      if (rearSeam) {
        let my = -Infinity
        for (let j = 0; j < p.pts.length; j += 2) if (p.pts[j + 1] > my + 1e-6) [my, idx] = [p.pts[j + 1], j]
      }
      p.pts = p.pts.slice(idx).concat(p.pts.slice(0, idx))
    } else if (bestRev) {
      const r = []
      for (let j = p.pts.length - 2; j >= 0; j -= 2) r.push(p.pts[j], p.pts[j + 1])
      p.pts = r
    }
    out.push(p)
    ;[px, py] = lastPoint(p)
  }
  return out
}

/** Support columns under overhangs steeper than the threshold angle, kept clear of the model. */
function buildSupports(regions, layers, s, progress) {
  const L = regions.length
  const w = s.lineWidth
  const overhang = new Array(L).fill(null).map(() => [])
  for (let j = 1; j < L; j++) {
    const allow = layers[j].h * Math.tan(s.supportAngle * deg)
    overhang[j] = open(diff(regions[j], offset(regions[j - 1], allow)), w / 2)
    if (j % 20 === 0) progress('Detecting overhangs', j / L)
  }
  let shadow = null
  if (s.supports === 'buildplate') {
    shadow = new Array(L)
    let acc = []
    for (let j = 0; j < L; j++) {
      acc = j ? union(unionAll(acc, regions[j])) : regions[0]
      shadow[j] = acc
    }
  }
  const sup = new Array(L).fill(null).map(() => [])
  const gap = s.supportZGap
  let carry = []
  for (let j = L - 1; j >= 0; j--) {
    const src = overhang[j + 1 + gap]
    if (src && src.length) carry = unionAll(carry, src)
    if (!carry.length) continue
    let here = diff(carry, offset(regions[j], s.supportXYGap))
    if (shadow) here = diff(here, offset(shadow[j], s.supportXYGap))
    carry = here
    // Leave a gap above model surfaces the support stands on.
    for (let k = 1; k <= gap && j - k >= 0; k++) here = diff(here, offset(regions[j - k], s.supportXYGap))
    sup[j] = open(here, w / 2)
    if (j % 20 === 0) progress('Building supports', 1 - j / L)
  }
  return sup
}
