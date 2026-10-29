// Turns an Arduino sketch (the common C++ subset) into async JavaScript for the script runner.
// Every line keeps its line number so runtime errors point at the right place in the sketch.
// Not supported: classes/structs, pointers, references, templates, static locals.

const TYPE_WORDS = [
  'unsigned long long', 'unsigned long', 'unsigned int', 'unsigned short', 'unsigned char', 'long long', 'long double',
  'signed char', 'unsigned', 'long', 'int', 'short', 'char', 'byte', 'word', 'bool', 'boolean', 'float', 'double', 'String',
  'size_t', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t', 'uint32_t', 'int32_t', 'uint64_t', 'int64_t', 'auto',
]
const NON_INT = new Set(['float', 'double', 'long double', 'String', 'bool', 'boolean', 'auto'])
const TYPE = TYPE_WORDS.map((t) => t.replace(/ /g, '\\s+')).join('|')
const BLOCKING = ['delay', 'delayMicroseconds', 'pulseIn', 'yield']

// Replace strings and char literals with placeholders so later regexes only see code.
function hideLiterals(src) {
  const strings = []
  const chars = []
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && n === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i++
      }
      i += 2
    } else if (c === '"' || c === "'") {
      let j = i + 1
      let body = ''
      while (j < src.length && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') { body += src[j] + (src[j + 1] ?? ''); j += 2 } else body += src[j++]
      }
      if (c === '"') { strings.push(body); out += `__S${strings.length - 1}__` } else { chars.push(body); out += `__C${chars.length - 1}__` }
      i = j + 1
    } else {
      out += c
      i++
    }
  }
  return { code: out, strings, chars }
}

const charCode = (body) => {
  const esc = { n: 10, t: 9, r: 13, 0: 0, '\\': 92, "'": 39, '"': 34 }
  if (body[0] === '\\') return esc[body[1]] ?? body.charCodeAt(1)
  return body.charCodeAt(0)
}

// Index just past the matching close bracket for the open bracket at `open`.
function matchBracket(s, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' }
  const stack = []
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (pairs[c]) stack.push(pairs[c])
    else if (c === stack[stack.length - 1]) {
      stack.pop()
      if (!stack.length) return i + 1
    }
  }
  return -1
}

// End of an expression starting at `start`: the first ; or , at depth 0, or an unmatched closer.
function exprEnd(s, start) {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) { if (depth === 0) return i; depth-- } else if ((c === ';' || c === ',') && depth === 0) return i
  }
  return s.length
}

// End of one operand (identifier with calls/indexing, a number, or a parenthesised group).
function operandEnd(s, start) {
  let i = start
  while (s[i] === ' ') i++
  if (s[i] === '(') return matchBracket(s, i)
  if (s[i] === '-' || s[i] === '!') i++
  while (i < s.length && /[\w.$]/.test(s[i])) i++
  while (s[i] === '(' || s[i] === '[') i = matchBracket(s, i)
  return i
}

// Insert a yield into every loop so long loops never freeze the page and Stop always works.
function instrumentLoops(code) {
  let out = ''
  let i = 0
  const re = /\b(for|while|do)\b/g
  let m
  while ((m = re.exec(code))) {
    const kw = m[1]
    const at = m.index
    if (kw === 'do') {
      const brace = code.indexOf('{', at)
      if (brace < 0 || code.slice(at + 2, brace).trim()) continue
      out += code.slice(i, brace + 1) + ' await __y();'
      i = brace + 1
      re.lastIndex = i
      continue
    }
    const open = code.indexOf('(', at)
    if (open < 0 || code.slice(at + kw.length, open).trim()) continue
    const close = matchBracket(code, open)
    if (close < 0) continue
    // `} while (x);` that ends a do-loop has nothing to instrument.
    const before = code.slice(0, at).replace(/\s+$/, '')
    let j = close
    while (/\s/.test(code[j])) j++
    if (kw === 'while' && before.endsWith('}') && code[j] === ';' && /\bdo\b[^]*$/.test(code.slice(0, at))) {
      const lastDo = code.lastIndexOf('do', at)
      const lastBrace = before.length - 1
      if (lastDo >= 0 && lastDo < lastBrace) {
        out += code.slice(i, j + 1)
        i = j + 1
        re.lastIndex = i
        continue
      }
    }
    if (code[j] === '{') {
      out += code.slice(i, j + 1) + ' await __y();'
      i = j + 1
    } else if (code[j] === ';') {
      out += code.slice(i, close) + ') { await __y(); }'
      i = j + 1
    } else {
      const end = exprEnd(code, j)
      out += code.slice(i, j) + '{ await __y(); ' + code.slice(j, end + 1) + ' }'
      i = end + 1
    }
    re.lastIndex = i
  }
  return out + code.slice(i)
}

export function transpileArduino(source) {
  const { code: hidden, strings, chars } = hideLiterals(source.replace(/\r\n?/g, '\n'))
  let code = hidden
  const includes = []

  // Preprocessor
  code = code.replace(/^[ \t]*#[ \t]*(\w+)(.*)$/gm, (line, directive, rest) => {
    if (directive === 'include') { includes.push(rest.trim().replace(/[<>"]/g, '')); return '' }
    if (directive === 'define') {
      const m = rest.match(/^\s+([A-Za-z_]\w*)\s+(.+)$/)
      return m ? `let ${m[1]} = ${m[2].trim()};` : ''
    }
    return ''
  })

  // Number suffixes: 1000UL, 3.5f
  code = code.replace(/(?<![\w.])(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?:UL|ul|LL|ll|L|l|U|u|f|F)\b/g, '$1')

  // Library objects
  code = code.replace(/\bServo\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*;/g, (m, names) => names.split(',').map((n) => `let ${n.trim()} = new Servo();`).join(' '))

  // Function prototypes, then definitions
  const fnRe = new RegExp(`(^|[\\n;}])([ \\t]*)(?:static\\s+|inline\\s+)*(?:${TYPE}|void)\\s*[*&]?\\s+([A-Za-z_]\\w*)\\s*\\(([^()]*)\\)\\s*;`, 'g')
  code = code.replace(fnRe, (m, lead, ws, name) => (name === 'if' || name === 'while' ? m : `${lead}${ws}`))
  const functions = new Set()
  const defRe = new RegExp(`(^|[\\n;}])([ \\t]*)(?:static\\s+|inline\\s+)*(?:${TYPE}|void)\\s*[*&]?\\s+([A-Za-z_]\\w*)\\s*\\(([^()]*)\\)(\\s*)\\{`, 'g')
  code = code.replace(defRe, (m, lead, ws, name, params, gap) => {
    functions.add(name)
    const args = params.trim() === 'void' ? '' : params.split(',').map((p) => {
      const [decl, def] = p.split('=')
      const id = decl.replace(/\[.*?\]/g, '').trim().split(/[\s*&]+/).pop()
      return id ? (def ? `${id} = ${def.trim()}` : id) : ''
    }).filter(Boolean).join(', ')
    return `${lead}${ws}async function ${name}(${args})${gap}{`
  })

  // Variable declarations, remembering which names are integers so `/` truncates like C.
  const intVars = new Set()
  const declRe = new RegExp(`(^|[;{}(\\n]|\\belse\\b)(\\s*)(?:(?:const|static|volatile|constexpr)\\s+)*(${TYPE})\\b\\s*[*&]?\\s*(?=[A-Za-z_])`, 'g')
  code = code.replace(declRe, (m, lead, ws, type, offset, all) => {
    const after = all.slice(offset + m.length)
    const end = exprEnd(after, 0)
    const names = after.slice(0, end).split(',').map((d) => d.trim().match(/^[A-Za-z_]\w*/)?.[0]).filter(Boolean)
    if (!NON_INT.has(type.replace(/\s+/g, ' '))) names.forEach((n) => intVars.add(n))
    return `${lead}${ws}let `
  })

  // Arrays: let a[3] = {1, 2, 3};  let a[5];  let grid[2][3];
  code = code.replace(/\blet\s+([A-Za-z_]\w*)\s*((?:\[[^\]]*\])+)\s*(=?)/g, (m, name, dims, eq) => {
    if (eq) return `let ${name} = `
    const sizes = [...dims.matchAll(/\[([^\]]*)\]/g)].map((d) => d[1] || '0')
    return `let ${name} = __arr(${sizes.join(', ')})`
  })
  // Brace initialisers become array literals
  {
    const re = /(\blet\s+[A-Za-z_]\w*\s*=\s*)\{/g
    let m
    while ((m = re.exec(code))) {
      const open = m.index + m[1].length
      const close = matchBracket(code, open)
      if (close < 0) break
      const inner = code.slice(open, close).replace(/\{/g, '[').replace(/\}/g, ']')
      code = code.slice(0, open) + inner + code.slice(close)
      re.lastIndex = close
    }
  }

  // Integer truncation on assignment to int variables: x = a / b;  x /= 2;
  if (intVars.size) {
    const names = [...intVars].join('|')
    const re = new RegExp(`(\\blet\\s+)?\\b(${names})\\s*(\\/=|\\*=|=)(?!=)`, 'g')
    let out = ''
    let last = 0
    let m
    while ((m = re.exec(code))) {
      const prev = code[m.index - 1]
      if (prev === '.' || prev === '!' || prev === '<' || prev === '>' || prev === '=') continue
      const start = m.index + m[0].length
      const end = exprEnd(code, start)
      const expr = code.slice(start, end)
      if (!expr.trim()) continue
      const [, letKw = '', name, op] = m
      const value = op === '=' ? expr : `${name} ${op[0]} (${expr})`
      out += code.slice(last, m.index) + `${letKw}${name} = __int(${value.trim()})`
      last = end
      re.lastIndex = end
    }
    code = out + code.slice(last)
  }

  // Casts: (int)x -> __int(x); other casts are dropped.
  code = code.replace(new RegExp(`\\(\\s*(?:${TYPE})\\s*\\)`, 'g'), (cast) => `__CAST${/float|double/.test(cast) ? 'F' : 'I'}__`)
  {
    let out = ''
    let i = 0
    let idx
    while ((idx = code.indexOf('__CAST', i)) >= 0) {
      const kind = code[idx + 6]
      const start = idx + 9
      const end = operandEnd(code, start)
      out += code.slice(i, idx) + (kind === 'I' ? `__int(${code.slice(start, end)})` : `(${code.slice(start, end)})`)
      i = end
    }
    code = out + code.slice(i)
  }

  code = code
    .replace(/\bNULL\b/g, 'null')
    .replace(/\.length\(\)/g, '.length')
    .replace(/\bsizeof\s*\(/g, '__sizeof(')
    .replace(/->/g, '.')

  // Calls that wait, and calls to the sketch's own functions, need await.
  const awaitNames = [...BLOCKING, ...functions]
  code = code.replace(new RegExp(`(?<![\\w.$]|function\\s)(${awaitNames.join('|')})\\s*\\(`, 'g'), 'await $1(')

  code = instrumentLoops(code)

  // Put literals back. A char printed on its own stays a character; elsewhere it is its number.
  code = code.replace(/(print|println|write)\(\s*__C(\d+)__\s*\)/g, (m, fn, n) => `${fn}(${JSON.stringify(String.fromCharCode(charCode(chars[n])))})`)
  code = code.replace(/__C(\d+)__/g, (m, n) => String(charCode(chars[n])))
  code = code.replace(/__S(\d+)__/g, (m, n) => `"${strings[n]}"`)

  if (/\b(class|struct|template|typedef)\b/.test(code)) {
    throw new Error('Classes, structs and templates are not supported by the script runner yet. Use the Uno or Nano for full C++.')
  }
  return { code, includes, functions: [...functions] }
}
