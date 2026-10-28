// Parts you can wire to a board. Each role says what the pin must support:
//   out = digital output, pwm = PWM output, in = digital input, adc = analog input.

export const PARTS = {
  led: { name: 'LED', group: 'Outputs', roles: [{ key: 'pin', label: 'Anode (+)', need: 'out' }], props: { color: 'red' }, blurb: 'Lights up when the pin is HIGH; dims with PWM.' },
  rgb: {
    name: 'RGB LED', group: 'Outputs', blurb: 'Common-cathode RGB LED. Mix colours with PWM.',
    roles: [{ key: 'r', label: 'Red', need: 'pwm' }, { key: 'g', label: 'Green', need: 'pwm' }, { key: 'b', label: 'Blue', need: 'pwm' }],
  },
  buzzer: { name: 'Piezo buzzer', group: 'Outputs', roles: [{ key: 'pin', label: 'Signal', need: 'out' }], blurb: 'Plays tone() frequencies through your speakers.' },
  servo: { name: 'Servo (SG90)', group: 'Outputs', roles: [{ key: 'pin', label: 'Signal', need: 'pwm' }], blurb: 'Turns 0 to 180° from the pulse width.' },
  button: { name: 'Push button', group: 'Inputs', roles: [{ key: 'pin', label: 'Signal', need: 'in' }], blurb: 'Press and hold. Reads LOW with INPUT_PULLUP, HIGH otherwise.' },
  switch: { name: 'Slide switch', group: 'Inputs', roles: [{ key: 'pin', label: 'Signal', need: 'in' }], blurb: 'Stays on or off.' },
  pot: { name: 'Potentiometer', group: 'Sensors', roles: [{ key: 'pin', label: 'Wiper', need: 'adc' }], props: { value: 50 }, blurb: 'A 10 kΩ knob from 0 V to the board voltage.' },
  ldr: { name: 'Light sensor (LDR)', group: 'Sensors', roles: [{ key: 'pin', label: 'Signal', need: 'adc' }], props: { value: 60 }, blurb: 'Photoresistor divider: brighter light, higher voltage.' },
  temp: { name: 'Temperature (TMP36)', group: 'Sensors', roles: [{ key: 'pin', label: 'Vout', need: 'adc' }], props: { value: 25 }, blurb: 'Outputs 0.5 V + 10 mV per °C.' },
}

export const LED_COLORS = {
  red: '#ff3b3b', green: '#22e35a', blue: '#3b82ff', yellow: '#ffd23b', white: '#f8fafc', orange: '#ff8a1f',
}

export const pinFits = (pin, need) => (need === 'in' ? true : need === 'out' ? pin.out : need === 'pwm' ? pin.out && pin.pwm : need === 'adc' ? pin.adc != null : false)

// Voltage a sensor part puts on its pin, for the board's reference voltage.
export function partVoltage(part, vref) {
  const v = part.props?.value ?? 0
  if (part.type === 'pot') return (v / 100) * vref
  if (part.type === 'ldr') return (v / 100) * vref * 0.95
  if (part.type === 'temp') return Math.min(vref, 0.5 + v * 0.01)
  return 0
}

let seq = 0
export const newPartId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`
