import { cpSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'node_modules', '@horang-corp', 'avr-gcc-wasm')
const target = join(root, 'public', 'avr')
mkdirSync(target, { recursive: true })
cpSync(join(source, 'tools'), join(target, 'tools'), { recursive: true })
cpSync(join(source, 'assets'), join(target, 'assets'), { recursive: true })
copyFileSync(join(source, 'THIRD_PARTY_NOTICES.md'), join(target, 'THIRD_PARTY_NOTICES.md'))
console.log('AVR compiler assets copied to public/avr (about 54 MB).')
