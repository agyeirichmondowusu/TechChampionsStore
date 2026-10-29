// Turn an Arduino sketch into plain C++ the way the Arduino IDE does: include Arduino.h and declare
// every function before it is used. #line directives keep compiler errors on the user's line numbers.
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'return', 'else', 'do', 'catch', 'sizeof'])

export function prepareSketch(source) {
  const lines = source.split('\n')
  const prototypes = []
  let firstFunction = -1
  let lastInclude = -1
  let depth = 0
  let inComment = false
  for (let i = 0; i < lines.length; i++) {
    // Strip comments and strings so braces inside them are not counted.
    let text = lines[i]
    if (inComment) {
      const end = text.indexOf('*/')
      if (end < 0) continue
      text = text.slice(end + 2)
      inComment = false
    }
    text = text.replace(/\/\*.*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''")
    const open = text.indexOf('/*')
    if (open >= 0) { text = text.slice(0, open); inComment = true }
    text = text.replace(/\/\/.*$/, '')
    if (depth === 0) {
      if (/^\s*#\s*include\b/.test(text) && firstFunction < 0) lastInclude = i
      // A definition header, with the opening brace on this line or the next one.
      const m = text.match(/^\s*((?:[A-Za-z_][\w:<>]*[\s*&]+)+?)([A-Za-z_]\w*)\s*\(([^;{}()]*(?:\([^()]*\)[^;{}()]*)*)\)\s*(?:const\s*)?\{?\s*$/)
      const nextOpens = text.trim().endsWith('{') || /^\s*\{/.test(lines[i + 1] || '')
      if (m && nextOpens && !CONTROL.has(m[2]) && !/^\s*(?:return|else|new|delete)\b/.test(m[1])) {
        const params = m[3].replace(/=\s*[^,]+/g, '') // default values belong on the first declaration only
        if (!/\b(setup|loop)\b/.test(m[2])) prototypes.push(`${m[1].trim()} ${m[2]}(${params});`)
        if (firstFunction < 0) firstFunction = i
      }
    }
    for (const c of text) {
      if (c === '{') depth++
      else if (c === '}') depth = Math.max(0, depth - 1)
    }
  }
  const head = lines.slice(0, lastInclude + 1)
  const rest = lines.slice(lastInclude + 1)
  return [
    '#include <Arduino.h>',
    '#line 1',
    ...head,
    ...prototypes,
    `#line ${lastInclude + 2}`,
    ...rest,
  ].join('\n')
}
