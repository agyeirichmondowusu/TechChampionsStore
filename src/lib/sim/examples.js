// Starter projects per board and language: the parts to place and the code that drives them.
import { pinById } from './boards'

// How a pin is written in each language.
function pinCode(board, id, lang) {
  const p = pinById(board, id)
  if (!p) return '0'
  if (lang === 'arduino') return /^A\d+$/.test(p.id) ? p.id : String(p.num)
  return String(p.num)
}

const fill = (code, board, lang) => {
  const max = lang === 'arduino' ? 2 ** board.adcBits - 1 : 65535
  return code
    .replace(/\{max\}/g, String(max))
    .replace(/\{steps\}/g, String(max + 1))
    .replace(/\{vref\}/g, board.vref.toFixed(1))
    .replace(/\{(\w+)\}/g, (m, key) => (board.defaults[key] ? pinCode(board, board.defaults[key], lang) : m))
}

const part = (board, type, roles, props) => ({ type, pins: Object.fromEntries(Object.entries(roles).map(([role, key]) => [role, board.defaults[key]])), props })

// ---------- Arduino C++ (Uno, Nano, Mega, ESP32, Pico) ----------
const ARDUINO = [
  {
    id: 'blink', name: 'Blink', parts: (b) => [part(b, 'led', { pin: 'led' }, { color: 'red' })],
    code: `// Blink: the on-board LED and an external LED take turns
const int LED_PIN = {led};

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  digitalWrite(LED_PIN, LOW);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  digitalWrite(LED_PIN, HIGH);
  delay(500);
}
`,
  },
  {
    id: 'button', name: 'Button and LED', parts: (b) => [part(b, 'button', { pin: 'button' }), part(b, 'led', { pin: 'led' }, { color: 'green' })],
    code: `// Hold the button to light the LED.
// INPUT_PULLUP keeps the pin HIGH, so a press reads LOW.
const int BUTTON_PIN = {button};
const int LED_PIN = {led};
int lastState = HIGH;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Press the button!");
}

void loop() {
  int state = digitalRead(BUTTON_PIN);
  if (state == LOW) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  if (state != lastState) {
    if (state == LOW) Serial.println("Pressed");
    else Serial.println("Released");
    lastState = state;
  }
  delay(10);
}
`,
  },
  {
    id: 'fade', name: 'Dimmer (potentiometer + PWM)', parts: (b) => [part(b, 'pot', { pin: 'pot' }, { value: 40 }), part(b, 'led', { pin: 'led' }, { color: 'yellow' })],
    code: `// Turn the knob to dim the LED with PWM.
const int POT_PIN = {pot};
const int LED_PIN = {led};
int lastBrightness = -1;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(POT_PIN);                  // 0 to {max}
  int brightness = map(raw, 0, {max}, 0, 255);
  analogWrite(LED_PIN, brightness);
  if (brightness != lastBrightness) {
    Serial.print("Pot: ");
    Serial.print(raw);
    Serial.print("  Brightness: ");
    Serial.println(brightness);
    lastBrightness = brightness;
  }
  delay(100);
}
`,
  },
  {
    id: 'servo', name: 'Servo knob', parts: (b) => [part(b, 'pot', { pin: 'pot' }, { value: 50 }), part(b, 'servo', { pin: 'servo' })],
    code: `// The servo follows the potentiometer.
#include <{servoLib}>

Servo arm;
const int POT_PIN = {pot};
const int SERVO_PIN = {servo};
int lastAngle = -1;

void setup() {
  arm.attach(SERVO_PIN);
  Serial.begin(9600);
}

void loop() {
  int angle = map(analogRead(POT_PIN), 0, {max}, 0, 180);
  arm.write(angle);
  if (angle != lastAngle) {
    Serial.print("Angle: ");
    Serial.println(angle);
    lastAngle = angle;
  }
  delay(20);
}
`,
  },
  {
    id: 'melody', name: 'Buzzer melody', parts: (b) => [part(b, 'buzzer', { pin: 'buzzer' }), part(b, 'button', { pin: 'button' })],
    code: `// Press the button to play a scale on the buzzer.
const int BUZZER_PIN = {buzzer};
const int BUTTON_PIN = {button};
int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(9600);
  Serial.println("Press the button to play");
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    for (int i = 0; i < 8; i++) {
      tone(BUZZER_PIN, notes[i]);
      delay(200);
    }
    noTone(BUZZER_PIN);
  }
  delay(20);
}
`,
  },
  {
    id: 'temp', name: 'Temperature alarm', parts: (b) => [part(b, 'temp', { pin: 'temp' }, { value: 24 }), part(b, 'led', { pin: 'led' }, { color: 'red' })],
    code: `// Read a TMP36 and light the LED above 30 °C.
const int TEMP_PIN = {temp};
const int LED_PIN = {led};

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(TEMP_PIN);
  float volts = raw * {vref} / {steps}.0;
  float celsius = (volts - 0.5) * 100.0;
  Serial.print("Temperature: ");
  Serial.print(celsius);
  Serial.println(" C");
  digitalWrite(LED_PIN, celsius > 30 ? HIGH : LOW);
  delay(1000);
}
`,
  },
  {
    id: 'rgb', name: 'RGB colour cycle', parts: (b) => [part(b, 'rgb', { r: 'r', g: 'g', b: 'b' })],
    code: `// Mix colours on an RGB LED with PWM.
const int RED_PIN = {r};
const int GREEN_PIN = {g};
const int BLUE_PIN = {b};

void setColor(int red, int green, int blue) {
  analogWrite(RED_PIN, red);
  analogWrite(GREEN_PIN, green);
  analogWrite(BLUE_PIN, blue);
}

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
}

void loop() {
  setColor(255, 0, 0);    delay(700);
  setColor(0, 255, 0);    delay(700);
  setColor(0, 0, 255);    delay(700);
  setColor(255, 160, 0);  delay(700);
  setColor(160, 0, 255);  delay(700);
}
`,
  },
  {
    id: 'traffic', name: 'Traffic light',
    parts: (b) => [part(b, 'led', { pin: 'led2' }, { color: 'red' }), part(b, 'led', { pin: 'led3' }, { color: 'yellow' }), part(b, 'led', { pin: 'led' }, { color: 'green' })],
    code: `// A traffic light: green, yellow, red.
const int RED_PIN = {led2};
const int YELLOW_PIN = {led3};
const int GREEN_PIN = {led};

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
}

void loop() {
  digitalWrite(GREEN_PIN, HIGH);
  delay(3000);
  digitalWrite(GREEN_PIN, LOW);
  digitalWrite(YELLOW_PIN, HIGH);
  delay(1000);
  digitalWrite(YELLOW_PIN, LOW);
  digitalWrite(RED_PIN, HIGH);
  delay(3000);
  digitalWrite(RED_PIN, LOW);
}
`,
  },
]

// ---------- MicroPython (Pico, ESP32) ----------
const mpHeader = (board) => (board.id === 'esp32' ? 'onboard = Pin(2, Pin.OUT)' : 'onboard = Pin("LED", Pin.OUT)')
const mpAdc = (board, key) => (board.id === 'esp32' ? `ADC(Pin({${key}}))` : `ADC({${key}})`)

const MICROPYTHON = [
  {
    id: 'blink', name: 'Blink', parts: (b) => [part(b, 'led', { pin: 'led' }, { color: 'red' })],
    code: (b) => `# Blink: the on-board LED and an external LED take turns
from machine import Pin
import time

${mpHeader(b)}
led = Pin({led}, Pin.OUT)

while True:
    onboard.value(1)
    led.value(0)
    time.sleep(0.5)
    onboard.value(0)
    led.value(1)
    time.sleep(0.5)
`,
  },
  {
    id: 'button', name: 'Button and LED', parts: (b) => [part(b, 'button', { pin: 'button' }), part(b, 'led', { pin: 'led' }, { color: 'green' })],
    code: () => `# Hold the button to light the LED. PULL_UP means a press reads 0.
from machine import Pin
import time

button = Pin({button}, Pin.IN, Pin.PULL_UP)
led = Pin({led}, Pin.OUT)
last = 1
print("Press the button!")

while True:
    state = button.value()
    led.value(1 if state == 0 else 0)
    if state != last:
        print("Pressed" if state == 0 else "Released")
        last = state
    time.sleep(0.01)
`,
  },
  {
    id: 'fade', name: 'Dimmer (potentiometer + PWM)', parts: (b) => [part(b, 'pot', { pin: 'pot' }, { value: 40 }), part(b, 'led', { pin: 'led' }, { color: 'yellow' })],
    code: (b) => `# Turn the knob to dim the LED with PWM.
from machine import Pin, PWM, ADC
import time

pot = ${mpAdc(b, 'pot')}
led = PWM(Pin({led}))
led.freq(1000)

while True:
    raw = pot.read_u16()          # 0 to 65535
    led.duty_u16(raw)
    print("Pot:", raw)
    time.sleep(0.2)
`,
  },
  {
    id: 'servo', name: 'Servo knob', parts: (b) => [part(b, 'pot', { pin: 'pot' }, { value: 50 }), part(b, 'servo', { pin: 'servo' })],
    code: (b) => `# The servo follows the potentiometer.
from machine import Pin, PWM, ADC
import time

pot = ${mpAdc(b, 'pot')}
servo = PWM(Pin({servo}))
servo.freq(50)

def set_angle(angle):
    # 0.5 ms to 2.5 ms pulse every 20 ms
    servo.duty_ns(int(500000 + angle * 2000000 / 180))

while True:
    angle = int(pot.read_u16() * 180 / 65535)
    set_angle(angle)
    time.sleep(0.05)
`,
  },
  {
    id: 'melody', name: 'Buzzer melody', parts: (b) => [part(b, 'buzzer', { pin: 'buzzer' }), part(b, 'button', { pin: 'button' })],
    code: () => `# Press the button to play a scale on the buzzer.
from machine import Pin, PWM
import time

buzzer = PWM(Pin({buzzer}))
button = Pin({button}, Pin.IN, Pin.PULL_UP)
notes = [262, 294, 330, 349, 392, 440, 494, 523]

while True:
    if button.value() == 0:
        for f in notes:
            buzzer.freq(f)
            buzzer.duty_u16(32768)
            time.sleep(0.2)
        buzzer.duty_u16(0)
    time.sleep(0.02)
`,
  },
  {
    id: 'temp', name: 'Temperature alarm', parts: (b) => [part(b, 'temp', { pin: 'temp' }, { value: 24 }), part(b, 'led', { pin: 'led' }, { color: 'red' })],
    code: (b) => `# Read a TMP36 and light the LED above 30 °C.
from machine import Pin, ADC
import time

sensor = ${mpAdc(b, 'temp')}
led = Pin({led}, Pin.OUT)

while True:
    volts = sensor.read_u16() * 3.3 / 65535
    celsius = (volts - 0.5) * 100
    print(f"Temperature: {celsius:.1f} C")
    led.value(1 if celsius > 30 else 0)
    time.sleep(1)
`,
  },
  {
    id: 'rgb', name: 'RGB colour cycle', parts: (b) => [part(b, 'rgb', { r: 'r', g: 'g', b: 'b' })],
    code: () => `# Mix colours on an RGB LED with PWM.
from machine import Pin, PWM
import time

red = PWM(Pin({r}))
green = PWM(Pin({g}))
blue = PWM(Pin({b}))
for channel in (red, green, blue):
    channel.freq(1000)

def set_color(r, g, b):
    red.duty_u16(r * 257)
    green.duty_u16(g * 257)
    blue.duty_u16(b * 257)

colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 160, 0), (160, 0, 255)]
while True:
    for c in colors:
        set_color(c[0], c[1], c[2])
        time.sleep(0.7)
`,
  },
  {
    id: 'traffic', name: 'Traffic light',
    parts: (b) => [part(b, 'led', { pin: 'led2' }, { color: 'red' }), part(b, 'led', { pin: 'led3' }, { color: 'yellow' }), part(b, 'led', { pin: 'led' }, { color: 'green' })],
    code: () => `# A traffic light: green, yellow, red.
from machine import Pin
import time

red = Pin({led2}, Pin.OUT)
yellow = Pin({led3}, Pin.OUT)
green = Pin({led}, Pin.OUT)

while True:
    green.on()
    time.sleep(3)
    green.off()
    yellow.on()
    time.sleep(1)
    yellow.off()
    red.on()
    time.sleep(3)
    red.off()
`,
  },
]

// ---------- Python on the Raspberry Pi (gpiozero) ----------
const PYTHON = [
  {
    id: 'blink', name: 'Blink', parts: (b) => [part(b, 'led', { pin: 'led' }, { color: 'red' })],
    code: () => `# Blink an LED on GPIO{led}
from gpiozero import LED
from time import sleep

led = LED({led})

while True:
    led.on()
    sleep(0.5)
    led.off()
    sleep(0.5)
`,
  },
  {
    id: 'button', name: 'Button and LED', parts: (b) => [part(b, 'button', { pin: 'button' }), part(b, 'led', { pin: 'led' }, { color: 'green' })],
    code: () => `# The LED follows the button, using gpiozero events.
from gpiozero import LED, Button
from signal import pause

led = LED({led})
button = Button({button})

def pressed():
    print("Pressed")
    led.on()

def released():
    print("Released")
    led.off()

button.when_pressed = pressed
button.when_released = released
print("Press the button!")
pause()
`,
  },
  {
    id: 'pulse', name: 'Breathing LED (PWM)', parts: (b) => [part(b, 'led', { pin: 'led' }, { color: 'blue' })],
    code: () => `# Fade an LED in and out with software PWM.
from gpiozero import PWMLED
from signal import pause

led = PWMLED({led})
led.pulse(fade_in_time=1, fade_out_time=1)
pause()
`,
  },
  {
    id: 'servo', name: 'Servo sweep', parts: (b) => [part(b, 'servo', { pin: 'servo' })],
    code: () => `# Sweep a servo from 0° to 180° and back.
from gpiozero import AngularServo
from time import sleep

servo = AngularServo({servo}, min_angle=0, max_angle=180)

while True:
    for angle in range(0, 181, 10):
        servo.angle = angle
        sleep(0.1)
    for angle in range(180, -1, -10):
        servo.angle = angle
        sleep(0.1)
`,
  },
  {
    id: 'melody', name: 'Buzzer melody', parts: (b) => [part(b, 'buzzer', { pin: 'buzzer' }), part(b, 'button', { pin: 'button' })],
    code: () => `# Press the button to play a tune on a passive buzzer.
from gpiozero import TonalBuzzer, Button
from gpiozero.tones import Tone
from time import sleep

buzzer = TonalBuzzer({buzzer})
button = Button({button})
tune = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]

while True:
    button.wait_for_press()
    for note in tune:
        buzzer.play(Tone(note))
        sleep(0.2)
    buzzer.stop()
`,
  },
  {
    id: 'rgb', name: 'RGB colour cycle', parts: (b) => [part(b, 'rgb', { r: 'r', g: 'g', b: 'b' })],
    code: () => `# Cycle an RGB LED through some colours.
from gpiozero import RGBLED
from time import sleep

led = RGBLED(red={r}, green={g}, blue={b})
colors = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 0.6, 0), (0.6, 0, 1)]

while True:
    for c in colors:
        led.color = c
        sleep(0.7)
`,
  },
  {
    id: 'traffic', name: 'Traffic light',
    parts: (b) => [part(b, 'led', { pin: 'led2' }, { color: 'red' }), part(b, 'led', { pin: 'led3' }, { color: 'yellow' }), part(b, 'led', { pin: 'led' }, { color: 'green' })],
    code: () => `# gpiozero has a TrafficLights helper: red, amber, green.
from gpiozero import TrafficLights
from time import sleep

lights = TrafficLights({led2}, {led3}, {led})

while True:
    lights.green.on()
    sleep(3)
    lights.green.off()
    lights.amber.on()
    sleep(1)
    lights.amber.off()
    lights.red.on()
    sleep(3)
    lights.red.off()
`,
  },
]

const SETS = { arduino: ARDUINO, micropython: MICROPYTHON, python: PYTHON }

export function examplesFor(board, lang) {
  return (SETS[lang] || []).filter((ex) => {
    // Boards without analog inputs (Raspberry Pi) skip the sensor examples.
    const parts = ex.parts(board)
    return parts.every((p) => Object.values(p.pins).every(Boolean))
  })
}

export function buildExample(board, lang, id) {
  const ex = examplesFor(board, lang).find((e) => e.id === id) || examplesFor(board, lang)[0]
  let code = typeof ex.code === 'function' ? ex.code(board) : ex.code
  code = code.replace('{servoLib}', board.id === 'esp32' ? 'ESP32Servo.h' : 'Servo.h')
  return { id: ex.id, name: ex.name, code: fill(code, board, lang), parts: ex.parts(board) }
}
