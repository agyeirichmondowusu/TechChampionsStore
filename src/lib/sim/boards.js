// Board catalog for the simulator. Each pin has an id shown in the UI, the number the code uses
// (Arduino pin number, GPIO number, or BCM number on the Raspberry Pi) and its capabilities.
//   engine 'avr'    : the sketch is compiled to real ATmega328P firmware and emulated cycle by cycle
//   engine 'script' : the sketch runs in the built-in Arduino / MicroPython / Python runner

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

const avrPins = ({ digital, pwm, analog, analogBase, analogOnly = [] }) => [
  ...range(0, digital - 1).map((n) => ({ id: `D${n}`, num: n, out: true, pwm: pwm.includes(n), note: n === 0 ? 'RX' : n === 1 ? 'TX' : '' })),
  ...range(0, analog - 1).map((ch) => ({ id: `A${ch}`, num: analogBase + ch, out: !analogOnly.includes(ch), adc: ch, pwm: false })),
]

export const BOARDS = [
  {
    id: 'uno',
    name: 'Arduino Uno R3',
    short: 'Uno',
    chip: 'ATmega328P · 16 MHz',
    blurb: 'The classic starter board. Real firmware emulation.',
    engine: 'avr',
    languages: ['arduino'],
    vref: 5,
    adcBits: 10,
    builtinLed: 13,
    flash: 32256,
    upload: 'arduino-uno',
    pins: avrPins({ digital: 14, pwm: [3, 5, 6, 9, 10, 11], analog: 6, analogBase: 14 }),
    defaults: { led: 'D11', led2: 'D12', led3: 'D10', button: 'D2', button2: 'D4', pot: 'A0', ldr: 'A1', temp: 'A2', servo: 'D9', buzzer: 'D8', r: 'D3', g: 'D5', b: 'D6' },
  },
  {
    id: 'nano',
    name: 'Arduino Nano',
    short: 'Nano',
    chip: 'ATmega328P · 16 MHz',
    blurb: 'Uno power in a breadboard-friendly size. Real firmware emulation.',
    engine: 'avr',
    languages: ['arduino'],
    vref: 5,
    adcBits: 10,
    builtinLed: 13,
    flash: 30720,
    upload: 'arduino-nano',
    pins: avrPins({ digital: 14, pwm: [3, 5, 6, 9, 10, 11], analog: 8, analogBase: 14, analogOnly: [6, 7] }),
    defaults: { led: 'D11', led2: 'D12', led3: 'D10', button: 'D2', button2: 'D4', pot: 'A0', ldr: 'A1', temp: 'A2', servo: 'D9', buzzer: 'D8', r: 'D3', g: 'D5', b: 'D6' },
  },
  {
    id: 'mega',
    name: 'Arduino Mega 2560',
    short: 'Mega',
    chip: 'ATmega2560 · 16 MHz',
    blurb: '54 digital pins and 16 analog inputs for big projects.',
    engine: 'script',
    languages: ['arduino'],
    vref: 5,
    adcBits: 10,
    builtinLed: 13,
    pins: [
      ...range(0, 53).map((n) => ({ id: `D${n}`, num: n, out: true, pwm: (n >= 2 && n <= 13) || (n >= 44 && n <= 46), note: { 0: 'RX0', 1: 'TX0', 20: 'SDA', 21: 'SCL' }[n] || '' })),
      ...range(0, 15).map((ch) => ({ id: `A${ch}`, num: 54 + ch, out: true, adc: ch, pwm: false })),
    ],
    defaults: { led: 'D11', led2: 'D12', led3: 'D10', button: 'D2', button2: 'D4', pot: 'A0', ldr: 'A1', temp: 'A2', servo: 'D9', buzzer: 'D8', r: 'D3', g: 'D5', b: 'D6' },
  },
  {
    id: 'esp32',
    name: 'ESP32 DevKit V1',
    short: 'ESP32',
    chip: 'ESP32-WROOM-32 · 240 MHz · Wi-Fi + Bluetooth',
    blurb: 'Dual-core Wi-Fi board. Arduino or MicroPython.',
    engine: 'script',
    languages: ['arduino', 'micropython'],
    vref: 3.3,
    adcBits: 12,
    builtinLed: 2,
    pins: [
      ...[2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33].map((n) => ({
        id: `GPIO${n}`, num: n, out: true, pwm: true,
        adc: { 2: 2, 4: 0, 12: 15, 13: 14, 14: 16, 15: 13, 25: 18, 26: 19, 27: 17, 32: 4, 33: 5 }[n],
        note: { 2: 'LED', 21: 'SDA', 22: 'SCL', 25: 'DAC1', 26: 'DAC2' }[n] || '',
      })),
      ...[34, 35, 36, 39].map((n) => ({ id: `GPIO${n}`, num: n, out: false, pwm: false, adc: { 34: 6, 35: 7, 36: 0, 39: 3 }[n], note: { 36: 'VP', 39: 'VN' }[n] || 'input only' })),
    ],
    defaults: { led: 'GPIO4', led2: 'GPIO16', led3: 'GPIO17', button: 'GPIO15', button2: 'GPIO13', pot: 'GPIO34', ldr: 'GPIO35', temp: 'GPIO32', servo: 'GPIO18', buzzer: 'GPIO19', r: 'GPIO25', g: 'GPIO26', b: 'GPIO27' },
  },
  {
    id: 'pico',
    name: 'Raspberry Pi Pico W',
    short: 'Pico',
    chip: 'RP2040 · dual Cortex-M0+ · 133 MHz',
    blurb: 'Tiny, fast and cheap. MicroPython or Arduino.',
    engine: 'script',
    languages: ['micropython', 'arduino'],
    vref: 3.3,
    adcBits: 10,
    builtinLed: 25,
    pins: [
      ...range(0, 22).map((n) => ({ id: `GP${n}`, num: n, out: true, pwm: true, note: { 0: 'TX0', 1: 'RX0', 4: 'SDA0', 5: 'SCL0' }[n] || '' })),
      ...[26, 27, 28].map((n) => ({ id: `GP${n}`, num: n, out: true, pwm: true, adc: n - 26, note: `ADC${n - 26}` })),
      { id: 'LED', num: 25, out: true, pwm: true, note: 'on-board LED', hidden: true },
    ],
    defaults: { led: 'GP15', led2: 'GP14', led3: 'GP13', button: 'GP16', button2: 'GP17', pot: 'GP26', ldr: 'GP27', temp: 'GP28', servo: 'GP0', buzzer: 'GP18', r: 'GP10', g: 'GP11', b: 'GP12' },
  },
  {
    id: 'rpi5',
    name: 'Raspberry Pi 5',
    short: 'Pi 5',
    chip: 'BCM2712 · quad Cortex-A76 · 2.4 GHz',
    blurb: 'A full Linux computer. Control the 40-pin header with Python.',
    engine: 'script',
    languages: ['python'],
    vref: 3.3,
    adcBits: 0,
    builtinLed: null,
    pins: range(2, 27).map((n) => ({ id: `GPIO${n}`, num: n, out: true, pwm: true, note: { 2: 'SDA', 3: 'SCL', 12: 'PWM0', 13: 'PWM1', 14: 'TXD', 15: 'RXD', 18: 'PWM0' }[n] || '' })),
    defaults: { led: 'GPIO17', led2: 'GPIO27', led3: 'GPIO22', button: 'GPIO2', button2: 'GPIO3', servo: 'GPIO18', buzzer: 'GPIO23', r: 'GPIO5', g: 'GPIO6', b: 'GPIO13' },
  },
]

export const LANGUAGES = {
  arduino: { label: 'Arduino C++', file: 'sketch.ino' },
  micropython: { label: 'MicroPython', file: 'main.py' },
  python: { label: 'Python 3 (gpiozero)', file: 'main.py' },
}

export const boardById = (id) => BOARDS.find((b) => b.id === id) || BOARDS[0]
export const pinById = (board, id) => board.pins.find((p) => p.id === id)
export const pinByNum = (board, num) => board.pins.find((p) => p.num === num && !p.hidden) || board.pins.find((p) => p.num === num)
