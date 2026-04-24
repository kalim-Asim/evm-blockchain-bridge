/**
 * AKA Bridge — Full Attack Simulation Suite
 *
 * 7 detection windows (20 s each, ~2.5 min total):
 *   Window 1 → NORMAL       baseline traffic
 *   Window 2 → DDoS         5600 tx from 1 wallet (800/sec × 7 sec)
 *   Window 3 → Sybil        500 tx from 250 fake wallets → 1 target
 *   Window 4 → Bot Loop     200 tx, identical pair, machine-perfect timing
 *   Window 5 → NORMAL       recovery traffic
 *   Window 6 → Flash Burst  2500 tx in 2 seconds then silence
 *   Window 7 → Coordinated  3 attackers, 3000 tx in sync bursts
 *
 * Usage:  node simulate-attack.js
 */

process.env.ANOMALY_WINDOW_MS = '20000'

const http = require('http')
const detector = require('./anomaly-detector')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const fakeEvent = (from, to) => ({ returnValues: { from, to, value: '1000000000000000000' } })
const addr = n => '0x' + String(n).padStart(40, '0')

const BRIDGE     = '0x95d524475f9af10b8745333dbae73cba7d831272'
const TARGET     = '0xffffffffffffffffffffffffffffffffffffffff'
const ATTACKER_1 = addr(0xdead)
const ATTACKER_2 = addr(0xbeef)
const ATTACKER_3 = addr(0xcafe)
const NORMAL_USERS = Array.from({ length: 15 }, (_, i) => addr(i + 1))

// Forward classification results to event-watcher (terminal + UI)
const postAlert = (alert) => {
  const body = JSON.stringify(alert)
  const req = http.request({
    hostname: 'localhost', port: 3001, path: '/alert', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  })
  req.on('error', () => {})
  req.write(body)
  req.end()
}
detector.on('classification', postAlert)

const banner = (n, total, label, detail) => {
  console.log(`\n━━━ Window ${n}/${total} · ${label} ${'━'.repeat(Math.max(0, 42 - label.length))}`)
  if (detail) console.log(`    ${detail}`)
}

const main = async () => {
  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║     AKA Bridge — Full Attack Simulation Suite        ║')
  console.log('║     7 windows · 20 s each · ~2.5 min total           ║')
  console.log('╚══════════════════════════════════════════════════════╝\n')

  detector.start()

  // ── Window 1: Normal baseline ────────────────────────────────────────────
  // 15 tx from 10 different wallets spread across 18 s → classifier sees normal
  banner(1, 7, 'NORMAL BASELINE', '15 tx · 10 wallets · 1.2 s apart')
  const w1 = [0,1,2,3,4,5,6,7,8,9,0,2,4,6,8]
  for (const i of w1) {
    detector.record(fakeEvent(NORMAL_USERS[i], BRIDGE))
    process.stdout.write('.')
    await sleep(1200)
  }
  console.log('\n    Waiting for classifier…')
  await sleep(6000)

  // ── Window 2: DDoS burst ─────────────────────────────────────────────────
  // 5600 tx from 1 wallet in 7 one-second bursts → max_tx_in_1sec ≈ 800
  banner(2, 7, 'DDoS ATTACK', '5600 tx · 1 wallet · 800/sec × 7 sec')
  for (let burst = 0; burst < 7; burst++) {
    for (let i = 0; i < 800; i++) detector.record(fakeEvent(ATTACKER_1, BRIDGE))
    process.stdout.write(` [burst ${burst + 1}/7]`)
    if (burst < 6) await sleep(1001)
  }
  console.log('\n    Waiting for classifier…')
  await sleep(15000)

  // ── Window 3: Sybil attack ───────────────────────────────────────────────
  // 500 tx from 250 unique wallets all targeting one address
  banner(3, 7, 'SYBIL ATTACK', '500 tx · 250 unique wallets → 1 target')
  for (let i = 0; i < 500; i++) detector.record(fakeEvent(addr(i + 10000), TARGET))
  console.log('    Burst sent. Waiting for classifier…')
  await sleep(24000)

  // ── Window 4: Bot loop ───────────────────────────────────────────────────
  // 200 tx on the exact same pair with machine-perfect 100 ms spacing
  // → std_interarrival ≈ 0, same_pair_ratio = 1.0
  banner(4, 7, 'BOT LOOP ATTACK', '200 tx · same pair · 100 ms intervals')
  for (let i = 0; i < 200; i++) {
    detector.record(fakeEvent(ATTACKER_2, BRIDGE))
    process.stdout.write(i % 20 === 19 ? '█' : '▒')
    await sleep(100)
  }
  console.log('\n    Waiting for classifier…')
  await sleep(17000)

  // ── Window 5: Normal recovery ────────────────────────────────────────────
  banner(5, 7, 'NORMAL RECOVERY', '10 tx · 8 different wallets')
  const w5 = [1,3,5,7,9,11,1,3,7,5]
  for (const i of w5) {
    detector.record(fakeEvent(NORMAL_USERS[i], BRIDGE))
    process.stdout.write('.')
    await sleep(1500)
  }
  console.log('\n    Waiting for classifier…')
  await sleep(9000)

  // ── Window 6: Flash burst ────────────────────────────────────────────────
  // 2500 tx in ~2 s then complete silence → extreme max_tx_in_1sec, rate_deviation
  banner(6, 7, 'FLASH BURST ATTACK', '2500 tx · 2 sec spike · then silence')
  for (let burst = 0; burst < 5; burst++) {
    for (let i = 0; i < 500; i++) detector.record(fakeEvent(ATTACKER_3, BRIDGE))
    process.stdout.write(` [burst ${burst + 1}/5]`)
    if (burst < 4) await sleep(400)
  }
  console.log('\n    Silence… waiting for classifier…')
  await sleep(24000)

  // ── Window 7: Coordinated multi-wallet attack ────────────────────────────
  // 3 attackers firing in sync — realistic coordinated scenario
  banner(7, 7, 'COORDINATED ATTACK', '3000 tx · 3 wallets · 5 sync rounds')
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < 200; i++) detector.record(fakeEvent(ATTACKER_1, BRIDGE))
    for (let i = 0; i < 200; i++) detector.record(fakeEvent(ATTACKER_2, BRIDGE))
    for (let i = 0; i < 200; i++) detector.record(fakeEvent(ATTACKER_3, BRIDGE))
    process.stdout.write(` [round ${round + 1}/5]`)
    if (round < 4) await sleep(1001)
  }
  console.log('\n    Waiting for classifier…')
  await sleep(17000)

  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║   Simulation complete — 7 windows · 5 attacks        ║')
  console.log('║   Check the Security Monitor at /security             ║')
  console.log('╚══════════════════════════════════════════════════════╝\n')
  process.exit(0)
}

main().catch(console.error)
