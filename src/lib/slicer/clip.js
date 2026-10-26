// Thin wrapper over Clipper (integer polygon boolean ops and offsetting). Coordinates are in microns.
import ClipperLib from 'clipper-lib'

export const SCALE = 1000 // 1 mm = 1000 units
const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType, PolyTree } = ClipperLib

/** Flat [x, y, ...] mm loop -> Clipper path. */
export const toPath = (flat) => {
  const p = new Array(flat.length / 2)
  for (let i = 0, j = 0; i < flat.length; i += 2, j++) p[j] = { X: Math.round(flat[i] * SCALE), Y: Math.round(flat[i + 1] * SCALE) }
  return p
}

/** Douglas-Peucker on a flat closed loop. Dense meshes produce far more points than a nozzle can resolve. */
export function simplifyLoop(flat, tol) {
  const n = flat.length / 2
  if (n < 8) return flat
  const keep = new Uint8Array(n)
  const t2 = tol * tol
  // Split the loop at its first point and the point farthest from it, then simplify both halves.
  let far = 0, fd = -1
  for (let i = 1; i < n; i++) {
    const d = (flat[i * 2] - flat[0]) ** 2 + (flat[i * 2 + 1] - flat[1]) ** 2
    if (d > fd) [far, fd] = [i, d]
  }
  keep[0] = keep[far] = 1
  const stack = [[0, far], [far, n]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const ax = flat[a * 2], ay = flat[a * 2 + 1]
    const bx = flat[(b % n) * 2], by = flat[(b % n) * 2 + 1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-12
    let idx = -1, best = t2
    for (let i = a + 1; i < b; i++) {
      const px = flat[i * 2] - ax, py = flat[i * 2 + 1] - ay
      const cr = px * dy - py * dx
      const d = (cr * cr) / len2
      if (d > best) [idx, best] = [i, d]
    }
    if (idx >= 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  const out = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1])
  return out
}

/** Builds the filled region of one layer from raw contour loops (non-zero winding handles overlapping shells). */
export function regionFromLoops(loops, tol = 0.015) {
  const paths = Clipper.CleanPolygons(loops.map((l) => toPath(simplifyLoop(l, tol))), 5)
  return union(paths, PolyFillType.pftNonZero)
}

const run = (type, subj, clip, fill = PolyFillType.pftNonZero) => {
  const c = new Clipper()
  c.AddPaths(subj, PolyType.ptSubject, true)
  if (clip) c.AddPaths(clip, PolyType.ptClip, true)
  const out = []
  c.Execute(type, out, fill, fill)
  return out
}

export const union = (a, fill) => run(ClipType.ctUnion, a, null, fill)
export const unionAll = (a, b) => run(ClipType.ctUnion, a, b)
export const intersect = (a, b) => (a.length && b.length ? run(ClipType.ctIntersection, a, b) : [])
export const diff = (a, b) => (!a.length ? [] : !b.length ? a : run(ClipType.ctDifference, a, b))

/** Offsets closed polygons by `mm` (negative shrinks). Miter joins keep corners sharp like the model. */
export function offset(paths, mm, join = JoinType.jtMiter) {
  if (!paths.length) return []
  const co = new ClipperOffset(3, 0.25 * SCALE * 0.01)
  co.AddPaths(paths, join, EndType.etClosedPolygon)
  const out = []
  co.Execute(out, mm * SCALE)
  return out
}

export const offsetRound = (paths, mm) => offset(paths, mm, JoinType.jtRound)

/** Morphological opening: removes slivers thinner than 2*mm. */
export const open = (paths, mm) => offset(offset(paths, -mm), mm)

export const area = (paths) => paths.reduce((s, p) => s + Clipper.Area(p), 0) / (SCALE * SCALE)

/** Splits a region into islands, each [outer, ...holes]. */
export function islands(paths) {
  if (!paths.length) return []
  const c = new Clipper()
  c.AddPaths(paths, PolyType.ptSubject, true)
  const tree = new PolyTree()
  c.Execute(ClipType.ctUnion, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  const res = []
  const walk = (node) => {
    for (const outer of node.Childs()) {
      res.push([outer.Contour(), ...outer.Childs().map((h) => h.Contour())])
      for (const h of outer.Childs()) walk(h)
    }
  }
  walk(tree)
  return res
}

/** Clips open polylines (Clipper paths) to a closed region; returns open paths. */
export function clipLines(lines, region) {
  if (!lines.length || !region.length) return []
  const c = new Clipper()
  c.AddPaths(lines, PolyType.ptSubject, false)
  c.AddPaths(region, PolyType.ptClip, true)
  const tree = new PolyTree()
  c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return Clipper.OpenPathsFromPolyTree(tree)
}

export const bounds = (paths) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of paths) for (const q of p) {
    if (q.X < x0) x0 = q.X
    if (q.X > x1) x1 = q.X
    if (q.Y < y0) y0 = q.Y
    if (q.Y > y1) y1 = q.Y
  }
  return { x0, y0, x1, y1 }
}

export const simplify = (paths, tol = 5) => Clipper.CleanPolygons(paths, tol)
