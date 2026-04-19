/**
 * Anomaly Detector — Live Simulation
 *
 * Feeds fake Transfer events directly into the detector (no blockchain needed).
 * Runs two 15-second windows:
 *   Window 1 → NORMAL  (12 txs, 10 different wallets, spread out)
 *   Window 2 → ATTACK  (3000 txs from 2 wallets in a burst — DDoS pattern)
 *
 * Usage:
 *   ANOMALY_WINDOW_MS=15000 node simulate-attack.js
 */

process.env.ANOMALY_WINDOW_MS = '20000'   // 20-second windows for the demo

const detector = require('./anomaly-detector')

const sleep = ms => new Promise(r => setTimeout(r, ms))

const fakeEvent = (from, to) => ({
  returnValues: { from, to, value: '1000000000000000000' }
})

const BRIDGE_WALLET = '0x95d524475f9af10b8745333dbae73cba7d831272'
const ATTACKER_1    = '0x000000000000000000000000000000000000dead'
const ATTACKER_2    = '0x000000000000000000000000000000000000beef'

// 10 distinct "normal" user wallets
const NORMAL_USERS = Array.from({ length: 10 }, (_, i) =>
  '0x' + String(i + 1).padStart(40, '0')
)

const main = async () => {
  console.log('\n╔══════════════════════════════════════════════════╗')
  console.log('║   AKA Bridge — Anomaly Detector Live Simulation  ║')
  console.log('║   Window duration: 20 seconds (demo mode)        ║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  detector.start()

  // ── Window 1: Normal traffic ──────────────────────────────────────────────
  console.log('━━━ Window 1: NORMAL traffic ━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Sending 12 transactions from 10 different wallets...')

  const normalSenders = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 2]  // 12 events
  for (const i of normalSenders) {
    detector.record(fakeEvent(NORMAL_USERS[i], BRIDGE_WALLET))
    process.stdout.write('.')
    await sleep(1600)   // ~1.6s apart → 12 × 1.6s = 19.2s spread
  }

  console.log('\nWindow closing — waiting for classifier...')
  await sleep(8000)   // let the 20s interval fire

  // ── Window 2: DDoS Attack ─────────────────────────────────────────────────
  await sleep(1000)
  console.log('\n━━━ Window 2: DDoS ATTACK ━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Sending 3200 transactions from 1 wallet (400/sec × 8 sec)...')

  // Spread across 8 bursts of 400 (1 burst/sec) — matches training: max_tx_in_1sec≈400
  for (let burst = 0; burst < 8; burst++) {
    for (let i = 0; i < 400; i++) {
      detector.record(fakeEvent(ATTACKER_1, BRIDGE_WALLET))
    }
    if (burst < 7) await sleep(1001)
  }

  console.log('Burst complete. Waiting for classifier...')
  await sleep(13000)  // wait for the 20s interval to fire

  // ── Window 3: Sybil Attack ────────────────────────────────────────────────
  await sleep(2000)
  console.log('\n━━━ Window 3: Sybil ATTACK ━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Sending 300 transactions from 150 fake wallets to 1 target...')

  const TARGET = '0xffffffffffffffffffffffffffffffffffffffff'
  for (let i = 0; i < 300; i++) {
    const sybilWallet = '0x' + String(i).padStart(40, '0')
    detector.record(fakeEvent(sybilWallet, TARGET))
  }

  console.log('Sybil burst sent. Waiting for classifier...')
  await sleep(22000)

  console.log('\n✔  Simulation complete. Check the output above.\n')
  process.exit(0)
}

main().catch(console.error)
