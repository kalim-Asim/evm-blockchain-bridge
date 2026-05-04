/**
 * dataset-listener.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Listens to Transfer events on the CHSD (AKADollars) contract on Sepolia,
 * filters for transfers TO the bridge wallet, and writes each event as a
 * JSONL record — exactly the data your anomaly-detector.js works with.
 *
 * The record schema matches detector.record()'s expected shape:
 *   { sender, receiver, timestamp, txHash, blockNumber, amount }
 *
 * Usage:
 *   node backend/dataset-listener.js [output-file]
 *
 *   Default output: backend/dataset-raw-events.jsonl
 *   Override:       node backend/dataset-listener.js backend/data/normal-events.jsonl
 *
 * Ctrl-C to stop. Run this BEFORE starting dataset-traffic-gen.js.
 *
 * Uses your existing .env vars:
 *   ORIGIN_WSS_ENDPOINT, ORIGIN_HTTPS_ENDPOINT,
 *   ORIGIN_TOKEN_CONTRACT_ADDRESS, BRIDGE_WALLET
 */

require('dotenv').config()
const Web3 = require('web3')
const fs   = require('fs')
const path = require('path')
const { HttpsProxyAgent } = require('https-proxy-agent')

const CHSD_ABI = require('./AKADollars.json')

// ── Config ────────────────────────────────────────────────────────────────────

const WSS_URL    = process.env.ORIGIN_WSS_ENDPOINT
const HTTP_URL   = process.env.ORIGIN_HTTPS_ENDPOINT
const CONTRACT   = process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS
const BRIDGE     = (process.env.BRIDGE_WALLET || '').toLowerCase()
const OUTPUT     = process.argv[2] || path.join(__dirname, 'dataset-raw-events.jsonl')

if (!CONTRACT || !BRIDGE) {
  console.error('[Listener] Missing ORIGIN_TOKEN_CONTRACT_ADDRESS or BRIDGE_WALLET in .env')
  process.exit(1)
}
if (!WSS_URL && !HTTP_URL) {
  console.error('[Listener] Missing ORIGIN_WSS_ENDPOINT and ORIGIN_HTTPS_ENDPOINT in .env')
  process.exit(1)
}

// Ensure output directory exists
const outDir = path.dirname(OUTPUT)
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const _proxyUrl   = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const _proxyAgent = _proxyUrl ? new HttpsProxyAgent(_proxyUrl) : undefined
const makeOpts    = () => _proxyAgent ? { agent: { https: _proxyAgent } } : {}

// ── State ─────────────────────────────────────────────────────────────────────

let eventCount     = 0
let web3           = null
let subscription   = null
let pollInterval   = null
let lastSeenBlock  = 0

// ── File Writer ───────────────────────────────────────────────────────────────

function writeRecord(record) {
  fs.appendFileSync(OUTPUT, JSON.stringify(record) + '\n', 'utf8')
}

// ── Event Handler ─────────────────────────────────────────────────────────────

/**
 * Called on every Transfer event that goes TO the bridge wallet.
 * Matches exactly what event-watcher.js does before calling detector.record().
 */
async function handleTransfer(event) {
  const from  = (event.returnValues.from  || '').toLowerCase()
  const to    = (event.returnValues.to    || '').toLowerCase()
  const value = event.returnValues.value  || '0'

  // Only care about transfers INTO the bridge wallet — same filter as event-watcher.js
  if (to !== BRIDGE) return

  // Ignore bridge wallet sending to itself (internal ops)
  if (from === BRIDGE) return

  // Fetch the actual block timestamp from the EVM. This is crucial because
  // dataset-traffic-gen.js uses evm_increaseTime to fast-forward hours of traffic
  // in seconds. Date.now() would collapse everything into the current real second.
  let blockTimestampMs = Date.now()
  try {
    const block = await web3.eth.getBlock(event.blockNumber)
    if (block && block.timestamp) {
      blockTimestampMs = block.timestamp * 1000
    }
  } catch (err) {
    console.error(`[Listener] Failed to get block ${event.blockNumber} timestamp`)
  }

  const record = {
    // These 3 fields match exactly what anomaly-detector.js's record() expects:
    sender:      from,
    receiver:    to,
    timestamp:   blockTimestampMs,

    // Extra fields for feature extraction context:
    txHash:      event.transactionHash || 'unknown',
    blockNumber: event.blockNumber     || 0,
    amount:      value,                // wei as string
  }

  writeRecord(record)
  eventCount++

  console.log(
    `[Listener] #${eventCount}` +
    `  from=${from.slice(0, 10)}…` +
    `  block=${record.blockNumber}` +
    `  hash=${(record.txHash || '').slice(0, 12)}…`
  )
}

// ── WebSocket Listener ────────────────────────────────────────────────────────

async function startWSS() {
  console.log('[Listener] Connecting via WebSocket:', WSS_URL)
  web3 = new Web3(new Web3.providers.WebsocketProvider(WSS_URL))

  const contract = new web3.eth.Contract(CHSD_ABI.abi, CONTRACT)

  subscription = contract.events.Transfer({})
    .on('data',  handleTransfer)
    .on('error', err => {
      console.error('[Listener] WSS error:', err.message)
      console.log('[Listener] Falling back to HTTP polling...')
      cleanup()
      startHTTPPoll()
    })

  console.log(`[Listener] Subscribed to Transfer events on ${CONTRACT}`)
  console.log(`[Listener] Filtering for transfers to bridge: ${BRIDGE}`)
  console.log(`[Listener] Writing to: ${OUTPUT}`)
  console.log('[Listener] Ctrl-C to stop\n')
}

// ── HTTP Polling Fallback ─────────────────────────────────────────────────────

async function startHTTPPoll() {
  console.log('[Listener] Starting HTTP polling fallback (2s interval)')
  web3 = new Web3(new Web3.providers.HttpProvider(HTTP_URL, makeOpts()))

  const contract = new web3.eth.Contract(CHSD_ABI.abi, CONTRACT)
  lastSeenBlock  = await web3.eth.getBlockNumber()

  console.log(`[Listener] Starting from block: ${lastSeenBlock}`)
  console.log(`[Listener] Writing to: ${OUTPUT}`)
  console.log('[Listener] Ctrl-C to stop\n')

  pollInterval = setInterval(async () => {
    try {
      const latest = await web3.eth.getBlockNumber()
      if (latest <= lastSeenBlock) return

      const events = await contract.getPastEvents('Transfer', {
        fromBlock: lastSeenBlock + 1,
        toBlock:   latest,
      })

      for (const e of events) handleTransfer(e)

      lastSeenBlock = latest
    } catch (err) {
      console.error('[Listener] Poll error:', err.message)
    }
  }, 2_000)
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

function cleanup() {
  if (subscription) {
    try { subscription.unsubscribe() } catch {}
    subscription = null
  }
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  if (web3 && web3.currentProvider && web3.currentProvider.disconnect) {
    try { web3.currentProvider.disconnect() } catch {}
  }
}

function shutdown() {
  console.log(`\n[Listener] Stopping. Total events captured: ${eventCount}`)
  console.log(`[Listener] Output: ${OUTPUT}`)
  cleanup()
  process.exit(0)
}

process.on('SIGINT',  shutdown)
process.on('SIGTERM', shutdown)

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[Listener] AKA Bridge Dataset Event Listener')
  console.log(`[Listener] Contract : ${CONTRACT}`)
  console.log(`[Listener] Bridge   : ${BRIDGE}`)

  // Try WSS first, fall back to HTTP if not configured
  if (WSS_URL) {
    try {
      await startWSS()
    } catch (err) {
      console.error('[Listener] WSS failed:', err.message)
      console.log('[Listener] Falling back to HTTP polling...')
      await startHTTPPoll()
    }
  } else {
    await startHTTPPoll()
  }
}

main().catch(err => {
  console.error('[Listener] Fatal:', err.message)
  process.exit(1)
})