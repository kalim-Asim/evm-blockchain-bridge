/**
 * dataset-traffic-gen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends REAL CHSD transfer transactions on a local Hardhat node (or Sepolia)
 * to generate comprehensive training data for the AKA Bridge anomaly detector.
 *
 * Each "transfer" calls CHSD.transfer(BRIDGE_WALLET, amount) from a test
 * wallet — exactly what a real user does when bridging.
 *
 * Usage:
 *   node backend/dataset-traffic-gen.js <mode>
 *
 *   Normal sub-modes (label=0):
 *     normal          — mixed realistic human traffic (default, ~5 min)
 *     normal-steady   — low-volume steady drip, 1 user at a time
 *     normal-busy     — busy-hour surge, many wallets, faster pace
 *     normal-whale    — few wallets sending large repeat transfers
 *     normal-retail   — many small wallets, each sends only 1–2 tx
 *     normal-offpeak  — night-time trickle, very sparse
 *
 *   Attack sub-modes (label=1):
 *     burst           — DDoS flood from 1–2 wallets
 *     repeated        — single wallet hammering
 *     spike           — multi-wave spike attack
 *     sybil           — coordinated multi-wallet flood
 *     botloop         — machine-precise bot timing
 *
 * Required .env additions:
 *   DATASET_WALLET_KEYS=0xkey1,0xkey2,0xkey3,...   (min 5, recommend 15+)
 *   DATASET_TRANSFER_AMOUNT=1000000000000000        (wei, default 0.001 CHSD)
 *
 * Your existing .env vars used:
 *   ORIGIN_HTTPS_ENDPOINT, ORIGIN_TOKEN_CONTRACT_ADDRESS, BRIDGE_WALLET
 */

require('dotenv').config()
const Web3 = require('web3')
const { HttpsProxyAgent } = require('https-proxy-agent')

const CHSD_ABI = require('./AKADollars.json')

// ── Config ────────────────────────────────────────────────────────────────────

const RPC      = process.env.ORIGIN_HTTPS_ENDPOINT
const CONTRACT = process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS
const BRIDGE   = process.env.BRIDGE_WALLET
const AMOUNT   = process.env.DATASET_TRANSFER_AMOUNT || '1000000000000000' // 0.001 CHSD

const RAW_KEYS = (process.env.DATASET_WALLET_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)

if (!RPC || !CONTRACT || !BRIDGE) {
  console.error('[TrafficGen] Missing ORIGIN_HTTPS_ENDPOINT, ORIGIN_TOKEN_CONTRACT_ADDRESS, or BRIDGE_WALLET in .env')
  process.exit(1)
}

if (RAW_KEYS.length < 2) {
  console.error('[TrafficGen] DATASET_WALLET_KEYS must contain at least 2 private keys (recommend 15)')
  console.error('  Add to backend/.env:  DATASET_WALLET_KEYS=0xkey1,0xkey2,...')
  process.exit(1)
}

// ── Web3 setup ────────────────────────────────────────────────────────────────

const _proxyUrl   = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const _proxyAgent = _proxyUrl ? new HttpsProxyAgent(_proxyUrl) : undefined
const makeOpts    = () => _proxyAgent ? { agent: { https: _proxyAgent } } : {}

const web3 = new Web3(new Web3.providers.HttpProvider(RPC, makeOpts()))

const wallets = RAW_KEYS.map(key => {
  const account = web3.eth.accounts.privateKeyToAccount(key)
  web3.eth.accounts.wallet.add(account)
  return account.address
})

const contract = new web3.eth.Contract(CHSD_ABI.abi, CONTRACT)

console.log(`[TrafficGen] Loaded ${wallets.length} test wallets`)
console.log(`[TrafficGen] Bridge wallet: ${BRIDGE}`)
console.log(`[TrafficGen] CHSD contract: ${CONTRACT}`)
console.log(`[TrafficGen] Transfer amount: ${AMOUNT} wei`)

// ── Time-Warping Engine ───────────────────────────────────────────────────────

// Track simulated time so loops think we've run for hours
let simulatedTimeMs = Date.now()
Date.now = () => simulatedTimeMs // Override globally for this script

const sendRpc = (method, params = []) => new Promise((resolve, reject) => {
  web3.currentProvider.send({
    jsonrpc: '2.0',
    method,
    params,
    id: new Date().getTime() // real time for jsonrpc id
  }, (err, res) => {
    if (err) return reject(err)
    resolve(res)
  })
})

const originalSleep = ms => new Promise(r => setTimeout(r, ms))

async function sleep(ms) {
  simulatedTimeMs += ms
  const seconds = Math.floor(ms / 1000)
  if (seconds > 0) {
    try {
      await sendRpc('evm_increaseTime', [seconds])
      await sendRpc('evm_mine')
    } catch (err) {
      console.error('[TimeWarp] Error:', err.message)
    }
  }
  // Yield the event loop slightly so node doesn't crash and websockets can breathe
  await originalSleep(2)
}
const randInt  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick     = arr => arr[randInt(0, arr.length - 1)]

/**
 * Send CHSD.transfer(BRIDGE_WALLET, amount) from a given wallet.
 * wait=true  → awaits mining confirmation (used for normal traffic to be safe)
 * wait=false → fire-and-forget (used for attack flood to maximise send rate)
 */
async function sendTransfer(fromAddress, wait = false) {
  try {
    const trx      = contract.methods.transfer(BRIDGE, AMOUNT)
    const gas      = await trx.estimateGas({ from: fromAddress })
    const gasPrice = await web3.eth.getGasPrice()
    const nonce    = await web3.eth.getTransactionCount(fromAddress, 'pending')

    const txData = {
      from:     fromAddress,
      to:       CONTRACT,
      data:     trx.encodeABI(),
      gas:      Math.ceil(gas * 1.2),
      gasPrice,
      nonce,
    }

    if (wait) {
      const receipt = await web3.eth.sendTransaction(txData)
      console.log(`[TrafficGen] ✓ ${fromAddress.slice(0, 8)}… → hash ${receipt.transactionHash.slice(0, 12)}…`)
      return receipt
    } else {
      web3.eth.sendTransaction(txData).catch(() => {})
      process.stdout.write('·')
      return null
    }
  } catch (err) {
    process.stdout.write('✗')
  }
}

// ── NORMAL SUB-MODES ──────────────────────────────────────────────────────────
// Each sub-mode targets a distinct region of the feature space that is genuinely
// normal. Together they cover the full envelope that a real-world bridge sees,
// which prevents the SVM from learning a narrow normal class that false-flags
// legitimate power users, busy hours, or off-peak trickle traffic.
//
// Target: each sub-mode runs long enough to produce ≥ 150–200 clean 60-second
// windows after dataset-extract.js's sliding window extraction.
// At a STEP_MS of 1 s that means we need at least ~3–4 minutes of continuous
// traffic so the sliding windows don't run out of events.

// ─────────────────────────────────────────────────────────────────────────────
/**
 * NORMAL (mixed): The catch-all realistic mode.
 *
 * Blends all real-world usage patterns in one run:
 *   - Casual users: 1 tx per session, long pauses
 *   - Repeat users: 2–4 tx back-to-back, then gone
 *   - Power users: 5–10 tx in a session, tight spacing
 *   - Quiet spells: random long gaps between users
 *
 * Runs for 20 minutes → produces ~150–200 windows covering a wide feature
 * space. This is the most important mode — use it as the backbone.
 *
 * Feature profile produced:
 *   tx_count: 3–18/window  unique_senders: 3–12  top_sender_share: 0.1–0.5
 *   sender_entropy: 1.5–3.5  same_pair_ratio: 0.1–0.5  min_interarrival: 0.5–8s
 */
async function runNormal() {
  const durationMs = 450 * 60_000
  console.log(`\n[TrafficGen] MODE=NORMAL (mixed)  duration=${durationMs / 1000}s`)
  const end = Date.now() + durationMs
  let count = 0

  while (Date.now() < end) {
    const roll = Math.random()

    if (roll < 0.10) {
      // 10%: Power user — 5–10 tx in rapid session from same wallet
      const wallet     = pick(wallets)
      const burstCount = randInt(5, 10)
      console.log(`\n[TrafficGen] (Power user: ${burstCount} tx from ${wallet.slice(0, 8)}…)`)
      for (let i = 0; i < burstCount; i++) {
        await sendTransfer(wallet, true)
        count++
        await sleep(randInt(400, 1200))
      }
    } else if (roll < 0.30) {
      // 20%: Repeat user — 2–4 tx back-to-back
      const wallet     = pick(wallets)
      const burstCount = randInt(2, 4)
      for (let i = 0; i < burstCount; i++) {
        await sendTransfer(wallet, true)
        count++
        await sleep(randInt(800, 2500))
      }
    } else {
      // 70%: Casual user — exactly 1 tx
      await sendTransfer(pick(wallets), true)
      count++
    }

    // Inter-user delay: mostly 3–12 s, occasional longer pauses
    const delayRoll = Math.random()
    const delay = delayRoll < 0.70 ? randInt(3000, 12000)
                : delayRoll < 0.90 ? randInt(1000, 3000)
                :                    randInt(18000, 30000)
    await sleep(delay)
  }

  console.log(`\n[TrafficGen] NORMAL done — ${count} tx over ${durationMs / 1000}s`)
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * NORMAL-STEADY: Low-volume metronomic drip — one user at a time, moderate pace.
 *
 * Represents a quiet but consistently active bridge (e.g. 2–4 am UTC, or a
 * niche chain with light usage). Each window has a small but non-zero tx_count,
 * spread evenly across a handful of wallets.
 *
 * Runs 15 minutes → ~100–130 windows.
 *
 * Feature profile produced:
 *   tx_count: 3–8/window  unique_senders: 3–7  top_sender_share: 0.2–0.4
 *   sender_entropy: 1.5–2.5  min_interarrival: 4–12s  rate_deviation: -25 to -20
 */
async function runNormalSteady() {
  const durationMs = 360 * 60_000
  console.log(`\n[TrafficGen] MODE=NORMAL-STEADY  duration=${durationMs / 1000}s`)
  const end = Date.now() + durationMs
  let count = 0

  while (Date.now() < end) {
    // Always single tx, always different wallets, steady 5–15 s gaps
    await sendTransfer(pick(wallets), true)
    count++
    await sleep(randInt(5000, 15000))
  }

  console.log(`\n[TrafficGen] NORMAL-STEADY done — ${count} tx over ${durationMs / 1000}s`)
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * NORMAL-BUSY: High-activity legitimate hour — many users, faster pace.
 *
 * Simulates a peak-hour surge (e.g. a token launch, airdrop, or high-volume
 * trading session) where 15–30 tx/window is normal. Without this mode, the
 * SVM's upper boundary for "normal" is too low and it flags busy-but-legitimate
 * windows as DDoS attacks.
 *
 * Runs 15 minutes → ~100–130 windows at elevated rate.
 *
 * Feature profile produced:
 *   tx_count: 15–35/window  unique_senders: 8–15  top_sender_share: 0.1–0.25
 *   sender_entropy: 2.5–4.0  min_interarrival: 0.3–2s  rate_deviation: -5 to +5
 */
async function runNormalBusy() {
  const durationMs = 360 * 60_000
  console.log(`\n[TrafficGen] MODE=NORMAL-BUSY  duration=${durationMs / 1000}s`)
  const end = Date.now() + durationMs
  let count = 0

  while (Date.now() < end) {
    const roll = Math.random()

    if (roll < 0.20) {
      // 20%: Small cluster — 3–6 tx from same wallet (user clicking fast on busy UI)
      const wallet = pick(wallets)
      const n      = randInt(3, 6)
      for (let i = 0; i < n; i++) {
        await sendTransfer(wallet, true)
        count++
        await sleep(randInt(300, 900))
      }
    } else {
      // 80%: Individual users arriving quickly
      await sendTransfer(pick(wallets), true)
      count++
    }

    // Faster inter-user delay during busy hour: 0.5–4 s
    await sleep(randInt(500, 4000))
  }

  console.log(`\n[TrafficGen] NORMAL-BUSY done — ${count} tx over ${durationMs / 1000}s`)
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * NORMAL-WHALE: A few high-value wallets making many repeated transfers.
 *
 * Represents institutional or arbitrage users who move funds frequently.
 * top_sender_share is naturally high and same_pair_ratio is naturally high
 * — but this is NOT an attack. Without this mode the model conflates repeat
 * usage from a single wallet with bot_loop attacks.
 *
 * Uses only 2–3 wallets, each sending 20–40 tx over the session with
 * human-like (not machine-perfect) intervals.
 *
 * Runs 12 minutes → ~80–100 windows.
 *
 * Feature profile produced:
 *   tx_count: 8–20/window  unique_senders: 2–4  top_sender_share: 0.4–0.8
 *   same_pair_ratio: 0.4–0.8  sender_entropy: 0.5–1.5  min_interarrival: 2–8s
 *   std_interarrival: 1–5  (human jitter — key differentiator from bot_loop)
 */
async function runNormalWhale() {
  const durationMs = 24 * 60_000
  console.log(`\n[TrafficGen] MODE=NORMAL-WHALE  duration=${durationMs / 1000}s`)

  // Limit to first 3 wallets to concentrate sender distribution
  const whaleWallets = wallets.slice(0, Math.min(3, wallets.length))
  const end          = Date.now() + durationMs
  let count          = 0

  while (Date.now() < end) {
    const wallet = pick(whaleWallets)
    await sendTransfer(wallet, true)
    count++

    // Human jitter: NOT machine-precise. Ranges from 1.5 s to 12 s.
    // The std_interarrival of ~3–5 s clearly separates this from bot_loop
    // where std_interarrival ≈ 0.
    await sleep(randInt(1500, 12000))
  }

  console.log(`\n[TrafficGen] NORMAL-WHALE done — ${count} tx over ${durationMs / 1000}s`)
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * NORMAL-RETAIL: Many distinct wallets, each sending only 1–2 tx ever.
 *
 * Represents a retail airdrop or new-user onboarding event where hundreds of
 * new wallets all interact with the bridge once. unique_senders is high but
 * the volume per second is low and interarrivals are human-paced.
 *
 * Uses ALL available wallets in rotation, each only once or twice.
 *
 * Runs until all wallets have been used at least twice, or 15 minutes max.
 *
 * Feature profile produced:
 *   tx_count: 5–15/window  unique_senders: 5–15  top_sender_share: 0.05–0.15
 *   same_pair_ratio: 0.05–0.15  sender_entropy: 3.0–4.5  min_interarrival: 2–10s
 */
async function runNormalRetail() {
  const durationMs = 360 * 60_000
  console.log(`\n[TrafficGen] MODE=NORMAL-RETAIL  duration=${durationMs / 1000}s`)
  const end  = Date.now() + durationMs
  let count  = 0
  let cursor = 0  // walk through wallets in order — ensures max diversity

  while (Date.now() < end) {
    // Each wallet sends 1–2 tx then we move to the next one
    const wallet   = wallets[cursor % wallets.length]
    const txsToSend = Math.random() < 0.3 ? 2 : 1
    cursor++

    for (let i = 0; i < txsToSend; i++) {
      await sendTransfer(wallet, true)
      count++
      if (txsToSend > 1) await sleep(randInt(1000, 3000))
    }

    // Natural gap between different users discovering the bridge
    await sleep(randInt(2000, 9000))
  }

  console.log(`\n[TrafficGen] NORMAL-RETAIL done — ${count} tx over ${durationMs / 1000}s`)
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * NORMAL-OFFPEAK: Sparse night-time / weekend trickle.
 *
 * Very few transactions per window. Without this mode the model may flag
 * very-low-volume legitimate windows as suspicious simply because the
 * feature values are unusual. The sparse window guard in anomaly-detector.js
 * handles < 3 tx, but windows with 3–6 tx still need representation.
 *
 * Runs 15 minutes with very long inter-tx gaps.
 *
 * Feature profile produced:
 *   tx_count: 3–7/window  unique_senders: 3–6  min_interarrival: 8–25s
 *   rate_deviation: -28 to -22  (well below baseline — clearly off-peak)
 */
async function runNormalOffpeak() {
  const durationMs = 360 * 60_000
  console.log(`\n[TrafficGen] MODE=NORMAL-OFFPEAK  duration=${durationMs / 1000}s`)
  const end  = Date.now() + durationMs
  let count  = 0

  while (Date.now() < end) {
    await sendTransfer(pick(wallets), true)
    count++
    // Very long gaps — 8 s to 30 s
    await sleep(randInt(8000, 30000))
  }

  console.log(`\n[TrafficGen] NORMAL-OFFPEAK done — ${count} tx over ${durationMs / 1000}s`)
}

// ── ATTACK MODES ──────────────────────────────────────────────────────────────

/**
 * BURST (DDoS): Massive flood from 1–2 wallets.
 * Produces: very high tx_count, low unique_senders, near-zero interarrival,
 *           high top_sender_share, near-zero sender_entropy
 */
async function runBurst() {
  const windows = 100
  const txPerWindow = 60
  const delayMs = 50
  console.log(`\n[TrafficGen] MODE=BURST  windows=${windows}  (DDoS flood)`)
  const attackers = wallets.slice(0, 2)

  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < txPerWindow; i++) {
      await sendTransfer(attackers[i % 2], false)
      await sleep(delayMs)
    }
    // Jump forward by 1 minute to start a new tumbling window
    await sleep(60_000)
  }
  console.log(`\n[TrafficGen] BURST done — ${windows * txPerWindow} transactions fired`)
}

/**
 * REPEATED: Single wallet hammering the bridge over and over.
 * Produces: same_pair_ratio=1.0, top_sender_share=1.0, sender_entropy=0,
 *           unique_senders=1
 */
async function runRepeated() {
  const windows = 100
  const txPerWindow = 40
  const delayMs = 300
  console.log(`\n[TrafficGen] MODE=REPEATED  windows=${windows}  (single wallet hammering)`)
  const attacker = wallets[0]

  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < txPerWindow; i++) {
      await sendTransfer(attacker, false)
      await sleep(delayMs)
    }
    await sleep(60_000)
  }
  console.log(`\n[TrafficGen] REPEATED done — ${windows * txPerWindow} transactions fired`)
}

/**
 * SPIKE: Quiet baseline → sudden flood → quiet → second flood → recovery.
 * Produces: extreme rate_deviation in spike windows, high max_tx_in_1sec
 */
async function runSpike() {
  const windows = 100
  console.log(`\n[TrafficGen] MODE=SPIKE  windows=${windows} (quiet→spike→quiet)`)

  for (let w = 0; w < windows; w++) {
    // quiet phase
    for (let i = 0; i < 3; i++) {
      await sendTransfer(wallets[randInt(3, wallets.length - 1)], true)
      await sleep(randInt(3000, 6000))
    }
    // sudden spike
    const spikers = wallets.slice(0, 3)
    for (let i = 0; i < 30; i++) {
      await sendTransfer(spikers[i % 3], false)
      await sleep(50)
    }
    await sleep(60_000)
  }
  console.log(`\n[TrafficGen] SPIKE done`)
}

/**
 * SYBIL: Coordinated attack from many wallets all targeting the bridge.
 * Produces: high unique_senders, low top_sender_share, high tx_count,
 *           low interarrival
 */
async function runSybil() {
  const windows = 100
  const txPerWindow = 20
  const delayMs = 100
  console.log(`\n[TrafficGen] MODE=SYBIL  windows=${windows} (coordinated multi-wallet)`)

  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < txPerWindow; i++) {
      await sendTransfer(wallets[i % wallets.length], false)
      await sleep(delayMs)
    }
    await sleep(60_000)
  }
  console.log(`\n[TrafficGen] SYBIL done — ${windows * txPerWindow} transactions fired`)
}

/**
 * BOTLOOP: Machine-precise timing from a single sender.
 * Produces: std_interarrival ≈ 0, same_pair_ratio=1.0, sender_entropy=0
 */
async function runBotLoop() {
  const windows = 100
  const txPerWindow = 40
  const intervalMs = 250
  console.log(`\n[TrafficGen] MODE=BOTLOOP  windows=${windows} (machine-precise)`)
  const bot = wallets[0]

  for (let w = 0; w < windows; w++) {
    for (let i = 0; i < txPerWindow; i++) {
      await sendTransfer(bot, false)
      await sleep(intervalMs)
    }
    await sleep(60_000)
  }
  console.log(`\n[TrafficGen] BOTLOOP done — ${windows * txPerWindow} transactions fired`)
}

// ── Entry Point ───────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] || 'normal'

  // Sanity-check: confirm wallets have CHSD balance
  console.log('\n[TrafficGen] Checking wallet CHSD balances...')
  for (const w of wallets.slice(0, 3)) {
    try {
      const bal = await contract.methods.balanceOf(w).call()
      console.log(`  ${w.slice(0, 10)}…  ${Web3.utils.fromWei(bal, 'ether')} CHSD`)
    } catch {
      console.log(`  ${w.slice(0, 10)}…  (balance check failed)`)
    }
  }

  switch (mode) {
    case 'normal':         await runNormal();         break
    case 'normal-steady':  await runNormalSteady();   break
    case 'normal-busy':    await runNormalBusy();     break
    case 'normal-whale':   await runNormalWhale();    break
    case 'normal-retail':  await runNormalRetail();   break
    case 'normal-offpeak': await runNormalOffpeak();  break
    case 'burst':          await runBurst();          break
    case 'repeated':       await runRepeated();       break
    case 'spike':          await runSpike();          break
    case 'sybil':          await runSybil();          break
    case 'botloop':        await runBotLoop();        break
    default:
      console.error(`Unknown mode: "${mode}"`)
      console.error('Normal modes:  normal | normal-steady | normal-busy | normal-whale | normal-retail | normal-offpeak')
      console.error('Attack modes:  burst | repeated | spike | sybil | botloop')
      process.exit(1)
  }

  process.exit(0)
}

main().catch(err => {
  console.error('[TrafficGen] Fatal:', err.message)
  process.exit(1)
})
