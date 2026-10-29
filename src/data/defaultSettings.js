// Defaults used until the admin saves settings. Everything here is editable in Admin > Site settings.
export const CATEGORIES = [
  { id: 'microcontrollers', name: 'Microcontrollers', blurb: 'Arduino, ESP32, Raspberry Pi' },
  { id: 'sensors', name: 'Sensors', blurb: 'Distance, motion, climate, gas' },
  { id: 'actuators', name: 'Actuators', blurb: 'Servos, steppers, relays, drivers' },
  { id: 'power', name: 'Power', blurb: 'Batteries, regulators, chargers' },
  { id: '3d-printers', name: '3D Printers', blurb: 'Printers, filament, spares' },
]

export const DEFAULT_SETTINGS = {
  store_name: 'TechChampionStore',
  tagline: 'IoT components, robot kits and 3D printing, delivered across Ghana.',
  grid_columns: 4,
  grid_rows: 4,
  email: 'agyeirichmondowusu@gmail.com',
  phones: ['0595189153', '0504929330'],
  whatsapp_number: '0595189153',
  address: 'KNUST, College of Science, Kumasi, Ghana',
  return_policy_days: 20,
  print_price_per_gram: 2, // ₵ per gram of filament, used for the 3D slicer's cost estimate
  socials: {
    tiktok: 'https://www.tiktok.com/',
    youtube: 'https://www.youtube.com/',
    instagram: 'https://www.instagram.com/',
    linkedin: 'https://www.linkedin.com/',
  },
  youtube_channel: 'https://www.youtube.com/',
  payment: {
    instructions: 'Pay with Mobile Money, then send your order on WhatsApp with the payment reference.',
    accounts: [
      { provider: 'MTN Mobile Money', account_name: 'TechChampionStore', account_number: '0595189153' },
      { provider: 'Telecel Cash', account_name: 'TechChampionStore', account_number: '0504929330' },
    ],
  },
  delivery_options: [
    { id: 'kumasi-office', label: 'Pickup From Our Kumasi Office (KNUST - College of Science)', fee: 0 },
    { id: 'koforidua', label: 'Delivery to Koforidua by Bus Station', fee: 55 },
    { id: 'vip-accra', label: 'Pickup From VIP Parcel Office (Accra Only)', fee: 50 },
    { id: 'knust-chemistry', label: 'Delivery to KNUST campus (Collection Point CHEMISTRY DEPT)', fee: 15 },
    { id: 'ho', label: 'Delivery to (Akatsi, Ho) Via Bus', fee: 95 },
    { id: 'obuasi', label: 'Delivery to Obuasi Via Bus', fee: 50 },
    { id: 'adum', label: 'Delivery to Adum', fee: 35 },
    { id: 'tamale', label: 'Delivery to Tamale Via STC', fee: 60 },
    { id: 'sunyani', label: 'Delivery to Sunyani by Bus Station', fee: 65 },
    { id: 'takoradi-tarkwa', label: 'Delivery to Takoradi and Tarkwa by Bus Station', fee: 105 },
  ],
  hero_images: [],
  champ_avatar_url: '',
  champ_api_url: '',
  analytics_mode: 'opt_in', // 'opt_in': count visits after the visitor allows it; 'notice': count unless they opt out
}
