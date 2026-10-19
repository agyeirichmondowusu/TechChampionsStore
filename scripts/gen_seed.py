"""Generates seed products (src/data/seedProducts.json), placeholder product art
(public/images/<category>/<slug>.svg) and supabase/seed.sql. Replace the art with real photos any time."""
import json, re, random, os
random.seed(7)

P = [
 # name, category, type, price, old_price, stock, short
 ("Arduino Uno R3 (ATmega328P)", "microcontrollers", "Development Board", 180, 220, 42, "The classic 5V board for learning electronics and prototyping."),
 ("Arduino Nano V3 (Type-C)", "microcontrollers", "Development Board", 95, 120, 60, "Breadboard-friendly ATmega328P board with USB-C."),
 ("Arduino Mega 2560 R3", "microcontrollers", "Development Board", 320, 380, 18, "54 digital I/O pins for big projects, 3D printers and robots."),
 ("ESP32 DevKit V1 (WiFi + Bluetooth)", "microcontrollers", "WiFi/BLE Board", 120, 150, 55, "Dual-core 240MHz MCU with WiFi and Bluetooth for IoT."),
 ("ESP8266 NodeMCU V3", "microcontrollers", "WiFi Board", 85, 100, 40, "Low-cost WiFi board for smart home and IoT dashboards."),
 ("ESP32-CAM with OV2640 Camera", "microcontrollers", "Camera Board", 140, 170, 25, "WiFi camera module for streaming, face detection and security cams."),
 ("Raspberry Pi 5 (4GB)", "microcontrollers", "Single Board Computer", 1450, 1600, 8, "Quad-core 2.4GHz Linux computer for AI, vision and robotics."),
 ("Raspberry Pi Pico W", "microcontrollers", "WiFi Board", 110, 130, 35, "RP2040 dual-core MCU with WiFi, programmable in MicroPython."),
 ("STM32F103C8T6 Blue Pill", "microcontrollers", "Development Board", 75, 90, 30, "72MHz ARM Cortex-M3 board for fast embedded projects."),
 ("Arduino Pro Mini 5V/16MHz", "microcontrollers", "Development Board", 60, 75, 28, "Tiny Arduino for wearables and space-constrained builds."),
 ("HC-SR04 Ultrasonic Distance Sensor", "sensors", "Distance", 25, 35, 120, "Measures 2cm to 400cm with 3mm accuracy."),
 ("DHT22 Temperature & Humidity Sensor", "sensors", "Environment", 55, 70, 48, "Accurate digital temperature and humidity readings."),
 ("DHT11 Temperature & Humidity Module", "sensors", "Environment", 25, 30, 90, "Budget digital temperature and humidity module."),
 ("HC-SR501 PIR Motion Sensor", "sensors", "Motion", 30, 40, 70, "Detects human movement up to 7 meters."),
 ("MPU6050 6-Axis Gyro + Accelerometer", "sensors", "Motion", 45, 60, 45, "3-axis gyro and accelerometer for drones and balancing robots."),
 ("IR Obstacle Avoidance Sensor", "sensors", "Distance", 15, 20, 150, "Adjustable infrared obstacle detection module."),
 ("Capacitive Soil Moisture Sensor", "sensors", "Environment", 20, 28, 80, "Corrosion-resistant soil moisture sensing for smart farms."),
 ("MQ-2 Smoke & Gas Sensor", "sensors", "Gas", 35, 45, 40, "Detects LPG, smoke, alcohol, propane and hydrogen."),
 ("BMP280 Pressure & Altitude Sensor", "sensors", "Environment", 40, 55, 36, "Barometric pressure and altitude sensing over I2C/SPI."),
 ("DS18B20 Waterproof Temperature Probe", "sensors", "Environment", 35, 45, 50, "1-Wire waterproof probe for liquids and outdoor use."),
 ("4-Channel Line Tracking Sensor", "sensors", "Line Follower", 55, 70, 30, "Four IR channels for fast line-following robots."),
 ("LDR Light Sensor Module", "sensors", "Light", 12, 15, 140, "Photoresistor module with digital and analog output."),
 ("SG90 Micro Servo Motor (9g)", "actuators", "Servo", 30, 40, 100, "180 degree micro servo for robot arms and pan-tilt."),
 ("MG996R Metal Gear Servo", "actuators", "Servo", 85, 110, 40, "High-torque metal gear servo for heavy robot joints."),
 ("28BYJ-48 Stepper Motor + ULN2003 Driver", "actuators", "Stepper", 45, 55, 45, "5V geared stepper with driver board, ideal for beginners."),
 ("NEMA 17 Stepper Motor (42mm)", "actuators", "Stepper", 180, 220, 20, "1.8 degree stepper used in CNC machines and 3D printers."),
 ("TT Gear Motor with Wheel", "actuators", "DC Motor", 20, 28, 120, "3-6V geared DC motor and wheel for robot cars."),
 ("L298N Dual H-Bridge Motor Driver", "actuators", "Motor Driver", 50, 65, 50, "Drive two DC motors or one stepper up to 2A per channel."),
 ("A4988 Stepper Motor Driver", "actuators", "Motor Driver", 30, 40, 60, "Microstepping driver for NEMA 17 steppers."),
 ("5V Single Channel Relay Module", "actuators", "Relay", 20, 25, 110, "Switch mains appliances safely from a microcontroller."),
 ("4-Channel 5V Relay Module", "actuators", "Relay", 55, 70, 40, "Optocoupler-isolated 4-way relay board for home automation."),
 ("Mini Submersible Water Pump (3-6V)", "actuators", "Pump", 35, 45, 45, "Small DC pump for smart irrigation and fountains."),
 ("18650 Li-ion Battery 3.7V 2600mAh", "power", "Battery", 45, 55, 90, "Rechargeable cell for robots and portable builds."),
 ("2x 18650 Battery Holder with Switch", "power", "Battery Holder", 15, 20, 100, "Series holder giving 7.4V with an on/off switch."),
 ("11.1V 2200mAh LiPo Battery (3S)", "power", "Battery", 280, 330, 15, "High-discharge LiPo pack for hexapods, drones and RC."),
 ("LM2596 DC-DC Buck Converter", "power", "Voltage Regulator", 35, 45, 70, "Step down 4-40V to 1.25-37V at up to 3A."),
 ("XL6009 DC-DC Boost Converter", "power", "Voltage Regulator", 35, 45, 50, "Step up 3-32V to 5-35V for battery projects."),
 ("TP4056 Li-ion Charger Module (Type-C)", "power", "Charger", 12, 15, 150, "1A single-cell charger with protection circuit."),
 ("MB102 Breadboard Power Supply", "power", "Power Supply", 25, 32, 60, "Plug-in 3.3V/5V supply for breadboard prototyping."),
 ("12V 2A DC Power Adapter", "power", "Power Supply", 60, 75, 40, "Reliable wall adapter for LED strips, routers and boards."),
 ("6V 2W Mini Solar Panel", "power", "Solar", 70, 90, 30, "Charge batteries and run sensors from the sun."),
 ("Creality Ender-3 V3 SE 3D Printer", "3d-printers", "FDM Printer", 3800, 4300, 4, "Auto-levelling 220x220x250mm FDM printer, great for beginners."),
 ("Creality K1C High-Speed 3D Printer", "3d-printers", "FDM Printer", 9500, 10500, 2, "Enclosed CoreXY printer at up to 600mm/s with carbon support."),
 ("PLA Filament 1.75mm 1kg (Blue)", "3d-printers", "Filament", 220, 260, 30, "Easy-printing PLA with low warping and vivid colour."),
 ("PETG Filament 1.75mm 1kg (Black)", "3d-printers", "Filament", 260, 300, 20, "Tough, heat-resistant filament for functional parts."),
 ("0.4mm Brass Nozzle Set (10 pcs)", "3d-printers", "Spare Part", 45, 60, 40, "MK8 brass nozzles for Ender and compatible printers."),
]

def slugify(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

PAL = {"microcontrollers": ("#0a58e0", "#0f1f47"), "sensors": ("#00b3f5", "#0846b4"),
       "actuators": ("#4d93ff", "#16295c"), "power": ("#1e74ff", "#0a1633"), "3d-printers": ("#3fd0ff", "#0c3a8c")}

def art(cat, typ, seed):
    r = random.Random(seed)
    a, b = PAL[cat]
    pcb = r.choice(["#0b6b3a", "#0a3d91", "#111827"])
    g = []
    if cat == "microcontrollers":
        w, h = (300, 190) if "Computer" not in typ else (320, 220)
        x, y = 200 - w/2, 200 - h/2
        g.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{pcb}" stroke="#ffffff22" stroke-width="3"/>')
        for i in range(int(w/14)-2):
            g.append(f'<rect x="{x+18+i*14}" y="{y+10}" width="7" height="10" fill="#d1d5db"/><rect x="{x+18+i*14}" y="{y+h-20}" width="7" height="10" fill="#d1d5db"/>')
        g.append(f'<rect x="{x+w*0.38}" y="{y+h*0.33}" width="{w*0.26}" height="{h*0.36}" rx="4" fill="#0b0f19"/>')
        g.append(f'<rect x="{x+w*0.42}" y="{y+h*0.40}" width="{w*0.18}" height="{h*0.22}" rx="2" fill="{a}" opacity=".9"/>')
        g.append(f'<rect x="{x-14}" y="{y+h*0.35}" width="40" height="{h*0.3}" rx="4" fill="#cbd5e1"/>')
        if "WiFi" in typ or "Camera" in typ:
            g.append(f'<rect x="{x+w-90}" y="{y+30}" width="70" height="{h-60}" rx="6" fill="#9ca3af"/><path d="M{x+w-80} {y+45} h50 v12 h-40 v12 h40 v12 h-40" stroke="#1f2937" stroke-width="4" fill="none"/>')
        if "Camera" in typ:
            g.append(f'<circle cx="{x+w*0.2}" cy="{y+h/2}" r="34" fill="#111"/><circle cx="{x+w*0.2}" cy="{y+h/2}" r="18" fill="{a}"/><circle cx="{x+w*0.2-6}" cy="{y+h/2-6}" r="5" fill="#fff" opacity=".8"/>')
        for i in range(4):
            g.append(f'<circle cx="{x+w*0.2+i*18}" cy="{y+h*0.78}" r="4" fill="{r.choice(["#22d3ee","#60a5fa","#a5f3fc"])}"/>')
    elif cat == "sensors":
        g.append(f'<rect x="70" y="120" width="260" height="160" rx="12" fill="{pcb}" stroke="#ffffff22" stroke-width="3"/>')
        if typ == "Distance" and seed % 2 == 0:
            for cx in (140, 260):
                g.append(f'<circle cx="{cx}" cy="200" r="48" fill="#cbd5e1"/><circle cx="{cx}" cy="200" r="36" fill="#1f2937"/><circle cx="{cx}" cy="200" r="22" fill="#374151" stroke="#4b5563" stroke-width="4"/>')
        elif typ == "Environment":
            g.append(f'<rect x="150" y="135" width="100" height="120" rx="10" fill="#f8fafc"/>')
            for i in range(5):
                g.append(f'<rect x="165" y="{150+i*20}" width="70" height="8" rx="4" fill="#cbd5e1"/>')
        elif typ == "Motion":
            g.append(f'<circle cx="200" cy="195" r="62" fill="#f1f5f9"/><circle cx="200" cy="195" r="62" fill="url(#dome)"/>')
        elif typ == "Gas":
            g.append(f'<circle cx="200" cy="200" r="58" fill="#94a3b8"/><circle cx="200" cy="200" r="46" fill="#cbd5e1"/>' + ''.join(f'<circle cx="{200+dx}" cy="{200+dy}" r="3" fill="#475569"/>' for dx in range(-30,31,12) for dy in range(-30,31,12) if dx*dx+dy*dy<900))
        else:
            for i in range(4 if typ == "Line Follower" else 2):
                g.append(f'<rect x="{110+i*48}" y="170" width="30" height="50" rx="6" fill="#111827"/><circle cx="{125+i*48}" cy="185" r="7" fill="{a}"/><circle cx="{125+i*48}" cy="205" r="7" fill="#0f172a" stroke="#64748b"/>')
        for i in range(4):
            g.append(f'<rect x="{165+i*20}" y="285" width="8" height="34" fill="#d1d5db"/>')
    elif cat == "actuators":
        if typ == "Servo":
            g.append(f'<rect x="110" y="140" width="180" height="130" rx="10" fill="{a}"/><rect x="85" y="175" width="230" height="22" rx="5" fill="{a}" opacity=".85"/><circle cx="160" cy="140" r="26" fill="#f8fafc"/><rect x="100" y="132" width="120" height="16" rx="8" fill="#f8fafc"/><circle cx="160" cy="140" r="6" fill="#334155"/>')
        elif typ in ("Stepper", "DC Motor", "Pump"):
            g.append(f'<rect x="115" y="120" width="170" height="170" rx="18" fill="#1f2937"/><rect x="125" y="130" width="150" height="150" rx="14" fill="#9ca3af"/><circle cx="200" cy="205" r="34" fill="#4b5563"/><rect x="194" y="80" width="12" height="60" rx="3" fill="#e5e7eb"/>')
            if typ == "DC Motor":
                g.append(f'<circle cx="300" cy="205" r="62" fill="#111827"/><circle cx="300" cy="205" r="30" fill="{a}"/>')
        else:
            g.append(f'<rect x="70" y="120" width="260" height="170" rx="12" fill="{pcb}"/>')
            for i in range(2 if typ == "Motor Driver" else 4 if "4" in str(seed) else 1):
                g.append(f'<rect x="{100+i*58}" y="150" width="50" height="70" rx="6" fill="{a}"/>')
            g.append(f'<rect x="230" y="150" width="70" height="90" rx="6" fill="#111827"/>' + ''.join(f'<rect x="{236+k*11}" y="140" width="6" height="110" fill="#6b7280" opacity=".7"/>' for k in range(6)))
    elif cat == "power":
        if typ in ("Battery", "Battery Holder"):
            g.append(f'<rect x="90" y="150" width="220" height="100" rx="20" fill="{a}"/><rect x="310" y="182" width="16" height="36" rx="4" fill="#cbd5e1"/><rect x="100" y="160" width="60" height="80" rx="12" fill="#ffffff33"/><path d="M215 165 l-30 40 h24 l-12 32 l34 -44 h-24 z" fill="#fff"/>')
        elif typ == "Solar":
            g.append(f'<rect x="80" y="110" width="240" height="180" rx="8" fill="#0b1f4b" stroke="#cbd5e1" stroke-width="6"/>' + ''.join(f'<line x1="{80+i*40}" y1="110" x2="{80+i*40}" y2="290" stroke="#1e3a8a" stroke-width="3"/>' for i in range(1,6)) + ''.join(f'<line x1="80" y1="{110+i*45}" x2="320" y2="{110+i*45}" stroke="#1e3a8a" stroke-width="3"/>' for i in range(1,4)))
        else:
            g.append(f'<rect x="80" y="130" width="240" height="140" rx="12" fill="{pcb}"/><circle cx="150" cy="200" r="32" fill="#111827"/><circle cx="150" cy="200" r="14" fill="#9ca3af"/><rect x="215" y="160" width="70" height="40" rx="5" fill="{a}"/><rect x="215" y="215" width="20" height="30" fill="#e5e7eb"/><rect x="250" y="215" width="20" height="30" fill="#e5e7eb"/>')
    else:
        if typ == "FDM Printer":
            g.append(f'<rect x="95" y="90" width="18" height="230" fill="#1f2937"/><rect x="287" y="90" width="18" height="230" fill="#1f2937"/><rect x="95" y="80" width="210" height="18" fill="#1f2937"/><rect x="80" y="310" width="240" height="30" rx="6" fill="#111827"/><rect x="125" y="270" width="150" height="14" fill="{a}"/><rect x="113" y="170" width="174" height="10" fill="#6b7280"/><rect x="180" y="160" width="40" height="40" rx="6" fill="{a}"/><path d="M195 200 h10 l-5 12 z" fill="#e5e7eb"/><path d="M165 270 q35 -40 70 0" fill="#93c5fd" opacity=".9"/>')
        elif typ == "Filament":
            g.append(f'<circle cx="200" cy="200" r="110" fill="#111827"/><circle cx="200" cy="200" r="92" fill="{a if "Blue" in str(seed) or seed%2 else "#1f2937"}"/>' + ''.join(f'<circle cx="200" cy="200" r="{92-k*6}" fill="none" stroke="#ffffff22" stroke-width="2"/>' for k in range(8)) + '<circle cx="200" cy="200" r="38" fill="#0b0f19"/><circle cx="200" cy="200" r="20" fill="#e5e7eb"/>')
        else:
            for i in range(5):
                g.append(f'<g transform="translate({100+i*45} 170)"><polygon points="0,0 30,0 30,50 15,70 0,50" fill="#d4b26a"/><rect x="-4" y="0" width="38" height="14" fill="#c7a35a"/></g>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="800" height="800">
<defs><radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e9f1ff"/><stop offset="1" stop-color="#c9dcff"/></radialGradient>
<radialGradient id="dome" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#94a3b8" stop-opacity=".5"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="{b}" flood-opacity=".35"/></filter></defs>
<rect width="400" height="400" fill="url(#bg)"/>
<circle cx="340" cy="60" r="90" fill="{a}" opacity=".08"/><circle cx="40" cy="360" r="80" fill="{b}" opacity=".06"/>
<ellipse cx="200" cy="345" rx="130" ry="14" fill="{b}" opacity=".12"/>
<g filter="url(#sh)">{''.join(g)}</g></svg>'''

products = []
for i, (name, cat, typ, price, old, stock, short) in enumerate(P):
    slug = slugify(name)
    path = f'images/{cat}/{slug}.svg'
    with open(f'public/{path}', 'w') as fh: fh.write(art(cat, typ, i + (1 if 'Blue' in name else 0)))
    products.append(dict(
        name=name, slug=slug, category=cat, type=typ, price=price, old_price=old, stock=stock,
        short_description=short,
        description=f"{short}\n\nThe {name} is tested before dispatch and ships from our Kumasi office (KNUST, College of Science). "
                    f"It works with Arduino, ESP32 and Raspberry Pi projects. Watch the tutorial video below to get started, or chat with Champ for wiring help.",
        specs={"Category": cat.replace('-', ' ').title(), "Type": typ, "Condition": "Brand new", "Warranty": "20-day returns"},
        image_url='/' + path, gallery=[], video_url='', rating=round(random.uniform(4.3, 5.0), 1),
        sold=random.randint(12, 900), is_active=True, featured=i % 5 == 0,
    ))
with open('src/data/seedProducts.json', 'w') as fh: json.dump(products, fh, indent=1)

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)): return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"
cols = ['name','slug','category','type','price','old_price','stock','short_description','description','specs','image_url','video_url','rating','sold','is_active','featured']
with open('supabase/seed.sql', 'w') as fh:
    fh.write('-- Seed products. Image paths point at /public/images/<category>/ in the site; replace with Storage URLs as you upload real photos.\n')
    fh.write(f'insert into public.products ({", ".join(cols)}) values\n')
    fh.write(',\n'.join('(' + ', '.join(q(p[c]) for c in cols) + ')' for p in products))
    fh.write('\non conflict (slug) do nothing;\n')
print(len(products), 'products')
