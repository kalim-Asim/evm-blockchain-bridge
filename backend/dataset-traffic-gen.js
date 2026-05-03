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
 *   mode: normal | burst | repeated | spike | sybil | botloop | all
 *
 * Required .env additions:
 *   DATASET_WALLET_KEYS=0xkey1,0xkey2,0xkey3,...   (min 5, recommend 10+)
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

const RPC         = process.env.ORIGIN_HTTPS_ENDPOINT
const CONTRACT    = process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS
const BRIDGE      = process.env.BRIDGE_WALLET
const AMOUNT      = process.env.DATASET_TRANSFER_AMOUNT || '1000000000000000' // 0.001 CHSD

// Load test wallet private keys from env
const RAW_KEYS    = (process.env.DATASET_WALLET_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)

if (!RPC || !CONTRACT || !BRIDGE) {
  console.error('[TrafficGen] Missing ORIGIN_HTTPS_ENDPOINT, ORIGIN_TOKEN_CONTRACT_ADDRESS, or BRIDGE_WALLET in .env')
  process.exit(1)
}

if (RAW_KEYS.length < 2) {
  console.error('[TrafficGen] DATASET_WALLET_KEYS must contain at least 2 private keys (recommend 10)')
  console.error('  Add to backend/.env:  DATASET_WALLET_KEYS=0xkey1,0xkey2,...')
  process.exit(1)
}

// ── Web3 setup ────────────────────────────────────────────────────────────────

const _proxyUrl   = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const _proxyAgent = _proxyUrl ? new HttpsProxyAgent(_proxyUrl) : undefined
const makeOpts    = () => _proxyAgent ? { agent: { https: _proxyAgent } } : {}

const web3 = new Web3(new Web3.providers.HttpProvider(RPC, makeOpts()))

// Register all test wallets
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const randFloat = (min, max) => Math.random() * (max - min) + min
const pick = arr => arr[randInt(0, arr.length - 1)]

/**
 * Send CHSD.transfer(BRIDGE_WALLET, amount) from a given wallet.
 * @param {string} fromAddress  - wallet address (must be in web3 wallet)
 * @param {boolean} wait        - whether to await confirmation
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
      // Fire-and-forget: don't await mining, maximises send rate for attack sim
      web3.eth.sendTransaction(txData).catch(() => {})
      process.stdout.write('·')
      return null
    }
  } catch (err) {
    process.stdout.write('✗')
    // Don't throw — one failed tx shouldn't stop the simulation
  }
}

// ── Traffic Modes ─────────────────────────────────────────────────────────────

/**
 * NORMAL: Realistic human-paced traffic from diverse wallets over 5 minutes.
 * Simulates real bridge users with natural timing variation:
 *   - Variable intervals (3–20 seconds, with occasional longer pauses)
 *   - Uses all available wallets randomly
 *   - Produces: low tx_count, high unique_senders, irregular time gaps,
 *               low top_sender_share, high sender_entropy
 */
async function runNormal() {
  const durationMs = 300_000  // 5 minutes of normal traffic
  console.log(`\n[TrafficGen] MODE=NORMAL  duration=${durationMs / 1000}s  (realistic human-paced)`)
  const end = Date.now() + durationMs
  let count = 0

  while (Date.now() < end) {
    const roll = Math.random()

    if (roll < 0.15) {
      // 15%: Heavy manual user — sends 4 to 8 transactions in rapid succession from SAME wallet
      // This enriches the dataset so the model doesn't misclassify a manual user as a bot
      const wallet = pick(wallets)
      const burstCount = randInt(4, 8)
      console.log(`[TrafficGen] (Heavy user burst: ${burstCount} txs from ${wallet.slice(0, 6)})`)
      for (let i = 0; i < burstCount; i++) {
        await sendTransfer(wallet, true)
        count++
        await sleep(randInt(500, 1500)) // 0.5s to 1.5s between clicks
      }
    } else {
      // 85%: Standard human user — 1 transaction
      const wallet = pick(wallets)
      await sendTransfer(wallet, true)
      count++
    }

    // Human-like timing between completely separate users
    let delay
    const delayRoll = Math.random()
    if (delayRoll < 0.7) {
      delay = randInt(3000, 12000)        // 70%: typical human pace
    } else if (delayRoll < 0.9) {
      delay = randInt(1500, 4000)          // 20%: slightly faster (active network)
    } else {
      delay = randInt(15000, 25000)        // 10%: long pause (quiet network)
    }
    await sleep(delay)
  }

  console.log(`\n[TrafficGen] NORMAL done — ${count} transactions sent over ${durationMs / 1000}s`)
}

/**
 * BURST (DDoS): Massive flood from 1–2 wallets.
 * Sends 200 transactions in rapid succession with minimal delay.
 * Produces: very high tx_count, low unique_senders, near-zero interarrival,
 *           high top_sender_share, near-zero sender_entropy
 */
async function runBurst() {
  const txCount = 200
  const delayMs = 50
  console.log(`\n[TrafficGen] MODE=BURST  txCount=${txCount}  delay=${delayMs}ms (DDoS flood)`)
  const attackers = wallets.slice(0, 2)  // only 2 wallets

  for (let i = 0; i < txCount; i++) {
    const wallet = attackers[i % 2]
    await sendTransfer(wallet, false)
    await sleep(delayMs)
  }

  // Wait for mempool to settle
  await sleep(5_000)
  console.log(`\n[TrafficGen] BURST done — ${txCount} transactions fired`)
}

/**
 * REPEATED: Single wallet hammering the bridge over and over.
 * Sends 150 transactions from the exact same wallet with short delays.
 * Produces: same_pair_ratio=1.0, top_sender_share=1.0, sender_entropy=0,
 *           unique_senders=1
 */
async function runRepeated() {
  const txCount = 150
  const delayMs = 300
  console.log(`\n[TrafficGen] MODE=REPEATED  txCount=${txCount}  delay=${delayMs}ms (single wallet hammering)`)
  const attacker = wallets[0]  // single wallet only

  for (let i = 0; i < txCount; i++) {
    await sendTransfer(attacker, false)
    await sleep(delayMs)
  }

  await sleep(5_000)
  console.log(`\n[TrafficGen] REPEATED done — ${txCount} transactions fired`)
}

/**
 * SPIKE: Quiet baseline → sudden flood → quiet again → second flood → recovery.
 * Simulates a realistic two-wave spike attack with clear contrast against baseline.
 * Produces: extreme rate_deviation in spike windows, high max_tx_in_1sec
 */
async function runSpike() {
  console.log(`\n[TrafficGen] MODE=SPIKE (multi-phase: quiet→spike→quiet→spike→quiet)`)

  // Phase 1: quiet baseline (20 txs, slow — ~90 seconds)
  console.log('[TrafficGen] Phase 1: quiet baseline (~90s)')
  for (let i = 0; i < 20; i++) {
    await sendTransfer(wallets[randInt(3, wallets.length - 1)], true)
    await sleep(randInt(3000, 6000))
  }

  // Phase 2: first spike (80 txs, very fast from 3 wallets)
  console.log('\n[TrafficGen] Phase 2: FIRST SPIKE (80 tx, rapid)')
  const spikers = wallets.slice(0, 3)
  for (let i = 0; i < 80; i++) {
    await sendTransfer(spikers[i % 3], false)
    await sleep(40)
  }
  await sleep(5_000)

  // Phase 3: quiet recovery (15 txs, slow — ~60 seconds)
  console.log('\n[TrafficGen] Phase 3: quiet recovery (~60s)')
  for (let i = 0; i < 15; i++) {
    await sendTransfer(wallets[randInt(4, wallets.length - 1)], true)
    await sleep(randInt(3000, 5000))
  }

  // Phase 4: second spike (60 txs)
  console.log('\n[TrafficGen] Phase 4: SECOND SPIKE (60 tx)')
  for (let i = 0; i < 60; i++) {
    await sendTransfer(spikers[i % 3], false)
    await sleep(50)
  }
  await sleep(5_000)

  // Phase 5: final quiet (10 txs)
  console.log('\n[TrafficGen] Phase 5: final quiet recovery (~40s)')
  for (let i = 0; i < 10; i++) {
    await sendTransfer(wallets[randInt(5, wallets.length - 1)], true)
    await sleep(randInt(3000, 5000))
  }

  console.log('\n[TrafficGen] SPIKE done')
}

/**
 * SYBIL: Coordinated attack from many wallets all targeting the bridge.
 * Uses ALL available wallets cycling rapidly.
 * Produces: high unique_senders, low top_sender_share (spread out),
 *           high tx_count, low interarrival
 */
async function runSybil() {
  const txCount = 250
  const delayMs = 100
  console.log(`\n[TrafficGen] MODE=SYBIL  txCount=${txCount}  delay=${delayMs}ms (coordinated multi-wallet)`)

  // Use ALL wallets to maximise unique_senders
  for (let i = 0; i < txCount; i++) {
    const wallet = wallets[i % wallets.length]
    await sendTransfer(wallet, false)
    await sleep(delayMs)
  }

  await sleep(5_000)
  console.log(`\n[TrafficGen] SYBIL done — ${txCount} transactions fired from ${wallets.length} wallets`)
}

/**
 * BOTLOOP: Machine-precise timing from a single sender.
 * Sends 180 transactions at perfectly regular intervals — the strongest
 * bot signature possible (std_interarrival ≈ 0).
 * Produces: std_interarrival ≈ 0, same_pair_ratio=1.0, sender_entropy=0
 */
async function runBotLoop() {
  const txCount = 180
  const intervalMs = 250
  console.log(`\n[TrafficGen] MODE=BOTLOOP  txCount=${txCount}  interval=${intervalMs}ms (machine-precise)`)
  const bot = wallets[0]  // single bot wallet

  for (let i = 0; i < txCount; i++) {
    await sendTransfer(bot, false)
    // Exact interval — NO jitter — this is the bot's machine signature
    await sleep(intervalMs)
  }

  await sleep(5_000)
  console.log(`\n[TrafficGen] BOTLOOP done — ${txCount} transactions fired`)
}

// ── Entry Point ───────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] || 'normal'

  // Sanity check: confirm wallets have CHSD balance
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
    case 'normal':   await runNormal();   break
    case 'burst':    await runBurst();    break
    case 'repeated': await runRepeated(); break
    case 'spike':    await runSpike();    break
    case 'sybil':    await runSybil();    break
    case 'botloop':  await runBotLoop();  break
    default:
      console.error(`Unknown mode: "${mode}"`)
      console.error('Valid modes: normal | burst | repeated | spike | sybil | botloop')
      process.exit(1)
  }

  process.exit(0)
}

main().catch(err => {
  console.error('[TrafficGen] Fatal:', err.message)
  process.exit(1)
})