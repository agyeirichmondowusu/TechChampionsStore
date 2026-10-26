// Print-time estimate that follows Marlin's classic jerk planner, the same model Cura's time estimator uses:
// each move gets a trapezoid speed profile whose entry and exit speeds are limited by the jerk allowed at the
// corner, then backward and forward passes make sure every speed change is reachable with the acceleration.

const MIN_PLANNER_SPEED = 0.05 // mm/s

const maxAllowable = (accel, target, dist) => Math.sqrt(target * target + 2 * accel * dist)

/**
 * @param {{dx: number, dy: number, de: number, v: number}[]} moves relative moves; v in mm/s
 * @param {{accel: number, jerk: number, eJerk?: number}} m machine limits
 * @returns {number} seconds
 */
export function estimateTime(moves, { accel, jerk, eJerk = 5 }) {
  const n = moves.length
  if (!n) return 0
  const dist = new Float64Array(n)
  const nominal = new Float64Array(n)
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  const ve = new Float64Array(n)
  const maxEntry = new Float64Array(n)
  const entry = new Float64Array(n)
  const nominalLen = new Uint8Array(n)

  let prev = -1
  for (let i = 0; i < n; i++) {
    const { dx, dy, de, v } = moves[i]
    const xy = Math.hypot(dx, dy)
    const d = xy > 1e-6 ? xy : Math.abs(de) // an extruder-only move (retraction) is timed by its own length
    dist[i] = d
    nominal[i] = v
    if (d <= 0) continue
    vx[i] = (dx / d) * v
    vy[i] = (dy / d) * v
    ve[i] = (de / d) * v

    // Speed at which the head may start or stop dead without exceeding the jerk.
    let safe = Math.min(jerk / 2, v)
    if (Math.abs(ve[i]) > eJerk / 2) safe = Math.min(safe, eJerk / 2)
    let junction = safe
    if (prev >= 0 && nominal[prev] > 1e-4) {
      let factor = 1
      const jxy = Math.hypot(vx[i] - vx[prev], vy[i] - vy[prev])
      if (jxy > jerk) factor = jerk / jxy
      const je = Math.abs(ve[i] - ve[prev])
      if (je > eJerk) factor = Math.min(factor, eJerk / je)
      junction = Math.min(nominal[prev], v * factor)
    }
    maxEntry[i] = junction
    const allowable = maxAllowable(accel, MIN_PLANNER_SPEED, d)
    entry[i] = Math.min(junction, allowable)
    nominalLen[i] = v <= allowable ? 1 : 0
    prev = i
  }

  // Backward pass: make sure each move can slow down in time for the next one.
  let nextEntry = MIN_PLANNER_SPEED
  for (let i = n - 1; i >= 0; i--) {
    if (dist[i] <= 0) continue
    if (entry[i] !== maxEntry[i]) {
      entry[i] = !nominalLen[i] && maxEntry[i] > nextEntry ? Math.min(maxEntry[i], maxAllowable(accel, nextEntry, dist[i])) : maxEntry[i]
    }
    nextEntry = entry[i]
  }
  // Forward pass: make sure each move can actually reach its entry speed from the previous one.
  let p = -1
  for (let i = 0; i < n; i++) {
    if (dist[i] <= 0) continue
    if (p < 0) entry[i] = Math.min(entry[i], Math.min(jerk / 2, nominal[i]))
    else if (!nominalLen[p] && entry[p] < entry[i]) {
      entry[i] = Math.min(entry[i], maxAllowable(accel, entry[p], dist[p]))
    }
    p = i
  }

  let t = 0
  for (let i = 0; i < n; i++) {
    const d = dist[i]
    if (d <= 0) continue
    let j = i + 1
    while (j < n && dist[j] <= 0) j++
    const vi = entry[i]
    const vf = j < n ? entry[j] : MIN_PLANNER_SPEED
    const vn = Math.max(nominal[i], vi, vf)
    const accD = (vn * vn - vi * vi) / (2 * accel)
    const decD = (vn * vn - vf * vf) / (2 * accel)
    const plateau = d - accD - decD
    if (plateau >= 0) t += (vn - vi) / accel + plateau / vn + (vn - vf) / accel
    else {
      // Never reaches nominal speed: accelerate to a peak, then decelerate.
      const a1 = Math.min(Math.max((2 * accel * d - vi * vi + vf * vf) / (4 * accel), 0), d)
      const peak = Math.sqrt(vi * vi + 2 * accel * a1)
      t += (peak - vi) / accel + (peak - vf) / accel
    }
  }
  return t
}
