// Turns MicroPython / Python scripts (the common subset used with GPIO) into async JavaScript.
// Every source line maps to the same output line so errors point at the right place.
// Supported: def, if/elif/else, while, for-in, try/except/finally, import, global, lambda,
// f-strings, keyword arguments, tuples, `x if c else y`, and/or/not/in/is.
// Not supported: classes, generators, with-blocks, slicing.

const BLOCKING = ['sleep', 'sleep_ms', 'sleep_us', 'wait_for_press', 'wait_for_release', 'wait_for_active', 'wait_for_inactive', 'pause', 'wait_for_edge']
const KEYWORDS = new Set(['if', 'elif', 'else', 'while', 'for', 'in', 'not', 'and', 'or', 'is', 'def', 'return', 'pass', 'break', 'continue', 'import', 'from', 'as', 'global', 'nonlocal', 'try', 'except', 'finally', 'raise', 'lambda', 'True', 'False', 'None', 'del', 'assert', 'with', 'class', 'yield', 'async', 'await'])

// Strings become placeholders; f-strings become template literals.
function hideStrings(line, strings) {
  let out = ''
  let i = 0
  while (i < line.length) {
    const c = line[i]
    const prefix = /[fFrRbB]/.test(c) && (line[i + 1] === '"' || line[i + 1] === "'") && !/[\w]/.test(line[i - 1] || '') ? c.toLowerCase() : ''
    const q = prefix ? line[i + 1] : c
    if (q === '"' || q === "'") {
      let j = i + (prefix ? 2 : 1)
      let body = ''
      while (j < line.length && line[j] !== q) {
        if (line[j] === '\\' && prefix !== 'r') { body += line[j] + (line[j + 1] ?? ''); j += 2 } else body += line[j++]
      }
      strings.push({ body, f: prefix === 'f', raw: prefix === 'r' })
      out += `__S${strings.length - 1}__`
      i = j + 1
    } else if (c === '#') {
      break
    } else {
      out += c
      i++
    }
  }
  return out
}

function matchClose(s, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' }
  const stack = []
  for (let i = open; i < s.length; i++) {
    if (pairs[s[i]]) stack.push(pairs[s[i]])
    else if (s[i] === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i }
  }
  return -1
}

function splitTop(s, sep = ',') {
  const parts = []
  let depth = 0
  let cur = ''
  for (const c of s) {
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    if (c === sep && depth === 0) { parts.push(cur); cur = '' } else cur += c
  }
  parts.push(cur)
  return parts
}

// Start of the operand that ends just before `end` (walking left over calls, indexing and attributes).
function operandStart(s, end) {
  let i = end
  while (i > 0 && s[i - 1] === ' ') i--
  for (;;) {
    if (s[i - 1] === ')' || s[i - 1] === ']') {
      let depth = 0
      let j = i - 1
      for (; j >= 0; j--) {
        if (s[j] === ')' || s[j] === ']') depth++
        else if (s[j] === '(' || s[j] === '[') { depth--; if (depth === 0) break }
      }
      i = j
    }
    let j = i
    while (j > 0 && /[\w.$]/.test(s[j - 1])) j--
    if (j === i) return i
    i = j
    if (s[i - 1] !== ')' && s[i - 1] !== ']') return i
  }
}

// End of the operand that starts at `start` (a single term).
function operandEnd(s, start) {
  let i = start
  while (s[i] === ' ') i++
  if (s[i] === '-' || s[i] === '+') i++
  if (s[i] === '(' || s[i] === '[') i = matchClose(s, i) + 1
  else while (i < s.length && /[\w.$]/.test(s[i])) i++
  while (s[i] === '(' || s[i] === '[' || s[i] === '.') {
    if (s[i] === '.') { i++; while (/[\w$]/.test(s[i] || '')) i++ } else i = matchClose(s, i) + 1
  }
  return i
}

// Extent of a whole expression around a position: stop at unmatched brackets or top-level commas.
function exprBounds(s, at) {
  let a = at
  let depth = 0
  while (a > 0) {
    const c = s[a - 1]
    if (')]}'.includes(c)) depth++
    else if ('([{'.includes(c)) { if (depth === 0) break; depth-- } else if (depth === 0 && (c === ',' || (c === '=' && !'=!<>'.includes(s[a - 2]) && s[a] !== '=') || c === ':')) break
    a--
  }
  let b = at
  depth = 0
  while (b < s.length) {
    const c = s[b]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) { if (depth === 0) break; depth-- } else if (depth === 0 && c === ',') break
    b++
  }
  return [a, b]
}

// x if c else y  ->  ((c) ? (x) : (y))
function ternaries(s) {
  for (let guard = 0; guard < 20; guard++) {
    const m = / if /.exec(s)
    if (!m) return s
    const at = m.index
    const [a, b] = exprBounds(s, at)
    const seg = s.slice(a, b)
    const local = at - a
    const elseIdx = seg.indexOf(' else ', local)
    if (elseIdx < 0) return s
    const x = seg.slice(0, local).trim()
    const c = seg.slice(local + 4, elseIdx).trim()
    const y = seg.slice(elseIdx + 6).trim()
    s = s.slice(0, a) + ` ((${c}) ? (${x}) : (${y}))` + s.slice(b)
  }
  return s
}

// Calls with keyword arguments get a trailing {__kw: true, ...}; bare tuples become arrays.
function rewriteBrackets(s) {
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '(' || c === '[' || c === '{') {
      const close = matchClose(s, i)
      if (close < 0) { out += s.slice(i); break }
      const inner = rewriteBrackets(s.slice(i + 1, close))
      if (c === '(') {
        const before = out.replace(/\s+$/, '')
        const isCall = /[\w$\])]$/.test(before) && !/\b(if|while|and|or|not|in|return|else|await|elif)$/.test(before)
        const parts = splitTop(inner)
        if (isCall) {
          const pos = []
          const kws = []
          for (const p of parts) {
            const m = p.match(/^\s*([A-Za-z_]\w*)\s*=(?!=)([^]*)$/)
            if (m) kws.push(`${m[1]}: ${m[2].trim()}`)
            else if (p.trim().startsWith('**')) kws.push(`...${p.trim().slice(2)}`)
            else if (p.trim().startsWith('*')) pos.push(`...${p.trim().slice(1)}`)
            else if (p.trim()) pos.push(p)
          }
          if (kws.length) pos.push(`{__kw: true, ${kws.join(', ')}}`)
          out += `(${pos.join(',')})`
        } else if (parts.length > 1 || /,\s*$/.test(inner)) {
          out += `[${parts.filter((p) => p.trim()).join(',')}]`
        } else {
          out += `(${inner})`
        }
      } else {
        out += c + inner + s[close]
      }
      i = close + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

// a // b and a in b, using single-operand bounds.
function binaryHelpers(s) {
  for (let guard = 0; guard < 30; guard++) {
    const fd = s.indexOf('//')
    if (fd < 0) break
    const a = operandStart(s, fd)
    const b = operandEnd(s, fd + 2)
    s = `${s.slice(0, a)}__fdiv(${s.slice(a, fd).trim()}, ${s.slice(fd + 2, b).trim()})${s.slice(b)}`
  }
  for (let guard = 0; guard < 30; guard++) {
    const m = /\s(not\s+)?in\s/.exec(s)
    if (!m) break
    const a = operandStart(s, m.index)
    const b = operandEnd(s, m.index + m[0].length)
    s = `${s.slice(0, a)}${m[1] ? '!' : ''}__in(${s.slice(a, m.index).trim()}, ${s.slice(m.index + m[0].length, b).trim()})${s.slice(b)}`
  }
  return s
}

function lambdas(s) {
  for (let guard = 0; guard < 10; guard++) {
    const m = /\blambda\b([^:]*):/.exec(s)
    if (!m) return s
    const start = m.index + m[0].length
    let depth = 0
    let end = start
    for (; end < s.length; end++) {
      const c = s[end]
      if ('([{'.includes(c)) depth++
      else if (')]}'.includes(c)) { if (depth === 0) break; depth-- } else if (c === ',' && depth === 0) break
    }
    s = `${s.slice(0, m.index)}(async (${m[1].trim()}) => (${s.slice(start, end).trim()}))${s.slice(end)}`
  }
  return s
}

function expr(s, ctx) {
  s = s
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/\bis\s+not\b/g, '!==')
    .replace(/\bis\b/g, '===')
  s = lambdas(s)
  s = ternaries(s)
  s = binaryHelpers(s)
  s = s
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!')
  s = rewriteBrackets(s)
  // Waiting calls and the script's own functions need await.
  const names = [...BLOCKING, ...ctx.functions]
  s = s.replace(new RegExp(`(?<![\\w$]|function\\s)((?:[A-Za-z_$][\\w$]*\\.)*)(${names.join('|')})\\s*\\(`, 'g'), (m, obj, fn) => `await ${obj}${fn}(`)
  return s
}

function restoreStrings(s, strings, ctx) {
  return s.replace(/__S(\d+)__/g, (m, n) => {
    const { body, f } = strings[n]
    if (!f) return JSON.stringify(body.replace(/\\(.)/g, (e, ch) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }[ch] ?? e)))
    // f-string: {expr} and {expr:.2f}
    let out = ''
    let i = 0
    while (i < body.length) {
      if (body[i] === '{' && body[i + 1] === '{') { out += '{'; i += 2; continue }
      if (body[i] === '}' && body[i + 1] === '}') { out += '}'; i += 2; continue }
      if (body[i] === '{') {
        const close = body.indexOf('}', i)
        const inner = body.slice(i + 1, close)
        const [e, spec] = inner.split(/:(?![^(]*\))/)
        out += '${__fmt(' + expr(e, ctx) + (spec ? `, ${JSON.stringify(spec)}` : '') + ')}'
        i = close + 1
        continue
      }
      out += body[i] === '`' ? '\\`' : body[i]
      i++
    }
    return '`' + out + '`'
  })
}

const assignTargets = (lhs) => lhs.split(',').map((t) => t.trim()).filter((t) => /^[A-Za-z_]\w*$/.test(t))

export function transpilePython(source) {
  const strings = []
  const rawLines = source.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')

  // Join lines inside open brackets (and backslash continuations), keeping line numbers.
  const lines = []
  for (let i = 0; i < rawLines.length; i++) {
    let line = hideStrings(rawLines[i], strings)
    let extra = 0
    const depth = (t) => [...t].reduce((d, c) => d + ('([{'.includes(c) ? 1 : ')]}'.includes(c) ? -1 : 0), 0)
    while ((depth(line) > 0 || /\\\s*$/.test(line)) && i + 1 < rawLines.length) {
      line = line.replace(/\\\s*$/, '') + ' ' + hideStrings(rawLines[++i], strings).trim()
      extra++
    }
    lines.push(line)
    for (let k = 0; k < extra; k++) lines.push('')
  }

  if (lines.some((l) => /^\s*(class|with|async)\b/.test(l))) throw new Error('Classes and with-blocks are not supported by the simulator yet.')

  // First pass: function names, and the names each scope assigns.
  const ctx = { functions: [] }
  const scopes = [] // { start, indent, names:Set, globals:Set }
  const moduleNames = new Set()
  let current = null
  lines.forEach((line, n) => {
    if (!line.trim()) return
    const indent = line.match(/^ */)[0].length
    if (current && indent <= current.indent) current = null
    const t = line.trim()
    const def = t.match(/^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:/)
    if (def) {
      ctx.functions.push(def[1])
      moduleNames.delete(def[1])
      current = { start: n, indent, names: new Set(), globals: new Set(), params: new Set(splitTop(def[2]).map((p) => p.trim().replace(/^\*+/, '').split('=')[0].trim()).filter(Boolean)) }
      scopes.push(current)
      return
    }
    const target = current ? current.names : moduleNames
    const g = t.match(/^global\s+(.+)$/)
    if (g && current) g[1].split(',').forEach((x) => current.globals.add(x.trim()))
    const forM = t.match(/^for\s+(.+?)\s+in\s/)
    if (forM) assignTargets(forM[1].replace(/[()[\]]/g, '')).forEach((x) => target.add(x))
    const asg = t.match(/^([A-Za-z_][\w\s,]*?)\s*(?:=(?!=)|\+=|-=|\*=|\/=|\/\/=|%=)/)
    if (asg && !/^(if|while|elif|return|print)\b/.test(t)) assignTargets(asg[1]).forEach((x) => target.add(x))
    const imp = t.match(/^import\s+(.+)$/)
    if (imp) imp[1].split(',').forEach((x) => { const p = x.trim().split(/\s+as\s+/); target.add((p[1] || p[0].split('.')[0]).trim()) })
    const from = t.match(/^from\s+\S+\s+import\s+(.+)$/)
    if (from && from[1].trim() !== '*') from[1].replace(/[()]/g, '').split(',').forEach((x) => { const p = x.trim().split(/\s+as\s+/); target.add((p[1] || p[0]).trim()) })
  })

  // Second pass: emit JavaScript.
  const out = []
  const stack = [0]
  const blockOpeners = []
  lines.forEach((line, n) => {
    if (!line.trim()) { out.push(''); return }
    const indent = line.match(/^ */)[0].length
    let prefix = ''
    while (indent < stack[stack.length - 1]) {
      stack.pop()
      prefix += '} '
      blockOpeners.pop()
    }
    let t = line.trim()
    let opens = false
    let js

    const header = t.match(/^(if|elif|else|while|for|def|try|except|finally)\b(.*):\s*(.*)$/)
    if (header) {
      const [, kw, rest, inline] = header
      opens = true
      if (kw === 'if') js = `if (${expr(rest.trim(), ctx)}) {`
      else if (kw === 'elif') js = `else if (${expr(rest.trim(), ctx)}) {`
      else if (kw === 'else') js = 'else {'
      else if (kw === 'while') js = `while (${expr(rest.trim(), ctx)}) { await __y();`
      else if (kw === 'for') {
        const m = rest.match(/^\s*(.+?)\s+in\s+(.+)$/)
        const target = m[1].replace(/[()]/g, '').includes(',') ? `[${m[1].replace(/[()[\]]/g, '')}]` : m[1].trim()
        js = `for (${target} of __iter(${expr(m[2], ctx)})) { await __y();`
      } else if (kw === 'def') {
        const m = t.match(/^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:/)
        const scope = scopes.find((s) => s.start === n)
        const locals = [...scope.names].filter((x) => !scope.globals.has(x) && !scope.params.has(x))
        const params = splitTop(m[2]).map((p) => p.trim()).filter(Boolean).map((p) => (p.startsWith('**') ? `__kwargs = {}` : p.startsWith('*') ? `...${p.slice(1)}` : p.replace(/=/, ' = '))).join(', ')
        js = `async function ${m[1]}(${params}) {${locals.length ? ` let ${locals.join(', ')};` : ''}`
      } else if (kw === 'try') js = 'try {'
      else if (kw === 'except') {
        const m = rest.match(/\bas\s+(\w+)/)
        js = `catch (${m ? m[1] : '__e'}) {`
      } else if (kw === 'finally') js = 'finally {'
      if (inline.trim()) {
        js += ` ${statement(inline.trim())} }`
        opens = false
      }
    } else {
      js = statement(t)
    }
    if (opens) {
      // The next non-empty line sets the block's indentation.
      let k = n + 1
      while (k < lines.length && !lines[k].trim()) k++
      const next = k < lines.length ? lines[k].match(/^ */)[0].length : indent + 4
      stack.push(next > indent ? next : indent + 4)
      blockOpeners.push(n)
    }
    out.push(' '.repeat(indent) + prefix + js)
  })
  if (stack.length > 1) out.push('}'.repeat(stack.length - 1))

  function statement(t) {
    if (t === 'pass') return ';'
    if (/^(break|continue)$/.test(t)) return t + ';'
    if (/^global\b|^nonlocal\b/.test(t)) return ';'
    if (/^return\b/.test(t)) return `return ${expr(t.slice(6).trim(), ctx)};`
    if (/^raise\b/.test(t)) return `throw new Error(String(${expr(t.slice(5).trim() || '"Error"', ctx)}));`
    if (/^del\b/.test(t)) return ';'
    if (/^assert\b/.test(t)) return `if (!(${expr(t.slice(6).trim(), ctx)})) throw new Error("AssertionError");`
    const imp = t.match(/^import\s+(.+)$/)
    if (imp) {
      return imp[1].split(',').map((x) => {
        const [mod, alias] = x.trim().split(/\s+as\s+/)
        return alias ? `${alias} = __import(${JSON.stringify(mod)});` : `${mod.split('.')[0]} = __import(${JSON.stringify(mod.split('.')[0])});`
      }).join(' ')
    }
    const from = t.match(/^from\s+(\S+)\s+import\s+(.+)$/)
    if (from) {
      if (from[2].trim() === '*') return `__importStar(${JSON.stringify(from[1])});`
      return from[2].replace(/[()]/g, '').split(',').map((x) => {
        const [name, alias] = x.trim().split(/\s+as\s+/)
        return `${alias || name} = __import(${JSON.stringify(from[1])})[${JSON.stringify(name)}];`
      }).join(' ')
    }
    const aug = t.match(/^([A-Za-z_][\w.[\]"'_]*)\s*(\/\/=|\*\*=)\s*(.+)$/)
    if (aug) return aug[2] === '//=' ? `${aug[1]} = __fdiv(${aug[1]}, ${expr(aug[3], ctx)});` : `${aug[1]} = ${aug[1]} ** (${expr(aug[3], ctx)});`
    const tuple = t.match(/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=(?!=)\s*(.+)$/)
    if (tuple) return `[${tuple[1]}] = __iter(${expr(tuple[2].includes(',') && !/^[[(]/.test(tuple[2].trim()) ? `(${tuple[2]})` : tuple[2], ctx)});`
    return expr(t, ctx) + ';'
  }

  let code = out.join('\n')
  const decl = [...moduleNames].filter((x) => !KEYWORDS.has(x))
  code = (decl.length ? `let ${decl.join(', ')};` : '') + code
  code = restoreStrings(code, strings, ctx)
  return { code, functions: ctx.functions }
}
