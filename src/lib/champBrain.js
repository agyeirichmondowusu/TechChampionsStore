import { searchProducts } from '../components/SearchBar'
import { cedi } from './format'
import { ROBOTS } from '../data/robots'

// Offline answers used when no AI endpoint is configured or it can't be reached.
const STOP = new Set('a an the i me my we you your do does is are can could would should have has of for to in on at and or with about what which how much many any some there price cost costs sell sells stock available buy need want looking get show tell please hi hello hey good best one recommend suggest it this that'.split(' '))

const PROJECTS = [
  [/line[ -]?follow/, 'line tracking arduino tt motor l298n'],
  [/smart ?home|home automation/, 'esp32 relay pir dht22'],
  [/weather|climate/, 'dht22 bmp280 esp32'],
  [/irrigat|farm|soil|garden/, 'soil moisture pump relay esp32'],
  [/robot ?car|obstacle/, 'tt motor l298n ultrasonic arduino'],
  [/security|alarm|intruder/, 'pir esp32-cam relay'],
  [/drone|balanc/, 'mpu6050 lipo'],
  [/3d|print/, 'printer filament nozzle'],
  [/solar/, 'solar 18650 tp4056'],
]

const list = (ps) => ps.map((p) => `• ${p.name}: ${cedi(p.price)} (${p.stock > 0 ? `${p.stock} in stock` : 'out of stock'})`).join('\n')

export function localReply(text, { products, settings }) {
  const t = text.toLowerCase()
  const say = (reply, items = []) => ({ reply, products: items })

  if (/^\s*(hi|hello|hey|good (morning|afternoon|evening)|yo|howdy)\b/.test(t) && t.split(' ').length < 6)
    return say("Hi, I'm Champ! I can help you find components, check prices and stock, plan a project, or explain delivery and payment. What are you building?")

  if (/deliver|shipping|ship|bus|stc|parcel|pickup|pick up|courier|transport/.test(t)) {
    const generic = /^(deliver\w*|pickup|pick|station|office|from|with|send|cost|much|fees?|shipping|parcel|campus|only)$/
    const hit = settings.delivery_options.filter((o) => t.split(/\W+/).some((w) => w.length > 3 && !generic.test(w) && o.label.toLowerCase().includes(w)))
    if (hit.length) return say(hit.map((o) => `${o.label}: ${o.fee ? cedi(o.fee) : 'free'}.`).join(' ') + ' You choose this at checkout.')
    return say('Here are our delivery options:\n' + settings.delivery_options.map((o) => `• ${o.label}: ${o.fee ? cedi(o.fee) : 'Free'}`).join('\n'))
  }
  if (/return|refund|exchange|warranty/.test(t))
    return say(`You can return eligible items within ${settings.return_policy_days} days. Message us on WhatsApp at ${settings.whatsapp_number} with your order number and photos, and we'll replace or refund it.`)
  if (/pay|momo|mobile money|account number|transfer/.test(t))
    return say(`${settings.payment.instructions} ` + settings.payment.accounts.map((a) => `${a.provider}: ${a.account_number} (${a.account_name}).`).join(' '))
  if (/contact|phone|call|whatsapp|email|reach|address|where.*(you|office|shop)|location/.test(t))
    return say(`You can call ${settings.phones.join(' or ')}, WhatsApp ${settings.whatsapp_number}, or email ${settings.email}. Our office is at ${settings.address}.`)
  if (/how.*(order|checkout|buy)|place an order|account/.test(t))
    return say('Add items to your cart, open the cart and press checkout. Enter your name and phone, pick a delivery option, then press "Send order on WhatsApp". The message lists your items, quantities and total. No account is needed.')

  const robot = ROBOTS.find((r) => t.includes(r.id.split('-')[0]) || r.name.toLowerCase().split(' ').some((w) => w.length > 4 && t.includes(w)))
  if (robot || /robot|hexapod|spider|dog|kit/.test(t)) {
    if (robot) return say(`${robot.name}: ${robot.tagline}. ${robot.sections[0].body} Open it in our Robots section to watch it assemble, or WhatsApp us for the price.`)
    return say(`We have ${ROBOTS.length} robot kits: ${ROBOTS.map((r) => r.name).join(', ')}. Which one would you like to know about?`)
  }

  const project = PROJECTS.find(([re]) => re.test(t))
  if (project) {
    const picks = project[1].split(' ').map((k) => searchProducts(products, k)[0]).filter(Boolean)
    const uniq = [...new Map(picks.map((p) => [p.id, p])).values()].slice(0, 5)
    if (uniq.length) return say(`For that project I'd start with:\n${list(uniq)}\nWant wiring tips for any of these?`, uniq)
  }

  const words = t.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w))
  let found = []
  for (let n = words.length; n > 0 && !found.length; n--) found = searchProducts(products, words.slice(0, n).join(' '))
  if (!found.length) {
    const scores = new Map()
    words.forEach((w) => searchProducts(products, w).forEach((p) => scores.set(p, (scores.get(p) || 0) + 1)))
    found = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
  }
  if (found.length) {
    const top = found.slice(0, 4)
    if (/how much|price|cost|stock|left|available|remain/.test(t) || top.length === 1)
      return say(`${top[0].name} is ${cedi(top[0].price)}, and we have ${top[0].stock} left. ${top[0].short_description}`, top.slice(0, 1))
    return say(`Here's what I found:\n${list(top)}`, top)
  }

  return say(`I'm not sure about that yet. I can help with components, prices, stock, projects, delivery and payment. For anything else, WhatsApp us at ${settings.whatsapp_number}.`)
}
