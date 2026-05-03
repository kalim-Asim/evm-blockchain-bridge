/**
 * dataset-extract.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads raw JSONL event files (produced by dataset-listener.js), groups them
 * into 60-second windows, and computes the EXACT SAME 14 features that
 * anomaly-detector.js's _extractFeatures() computes at runtime.
 *
 * The output CSV columns match train_svm.py's FEATURES list exactly:
 *   tx_count, unique_senders, unique_receivers, active_pairs,
 *   avg_tx_per_sec, max_tx_in_1sec, min_interarrival, std_interarrival,
 *   top_sender_share, same_pair_ratio, sender_entropy,
 *   sin_hour, cos_hour, rate_deviation
 *   + label (0/1) + attack_type (string)
 *
 * Usage:
 *   node backend/dataset-extract.js
 *
 * It reads these files (if they exist) and merges them into one CSV:
 *   backend/dataset-events-normal.jsonl    → label=0, attack_type=normal
 *   backend/dataset-events-burst.jsonl     → label=1, attack_type=ddos
 *   backend/dataset-events-repeated.jsonl  → label=1, attack_type=bot_loop
 *   backend/dataset-events-spike.jsonl     → label=1, attack_type=burst
 *   backend/dataset-events-sybil.jsonl     → label=1, attack_type=sybil
 *   backend/dataset-events-botloop.jsonl   → label=1, attack_type=bot_loop
 *
 * Output:
 *   ml/bridge_anomaly_dataset.csv  (replaces existing synthetic dataset)
 *
 * You can also pass explicit file mappings as arguments:
 *   node backend/dataset-extract.js \
 *     normal:backend/dataset-events-normal.jsonl \
 *     attack:backend/dataset-events-burst.jsonl
 */

require('dotenv').config()
const fs   = require('fs')
const path = require('path')

// ── Config ────────────────────────────────────────────────────────────────────

const WINDOW_MS = 60_000   // 60-second windows — matches ANOMALY_WINDOW_MS

// Hourly baselines — EXACT copy from anomaly-detector.js
const HOURLY_BASELINES = [4,4,5,5,4,5,8,12,18,22,28,32,35,34,30,26,22,18,15,12,10,8,6,5]

// Default input file mappings: filename → { label, attack_type }
const DEFAULT_INPUTS = [
  { file: path.join(__dirname, 'dataset-events-normal.jsonl'),   label: 0, attack_type: 'normal'   },
  { file: path.join(__dirname, 'dataset-events-burst.jsonl'),    label: 1, attack_type: 'ddos'     },
  { file: path.join(__dirname, 'dataset-events-repeated.jsonl'), label: 1, attack_type: 'bot_loop' },
  { file: path.join(__dirname, 'dataset-events-spike.jsonl'),    label: 1, attack_type: 'burst'    },
  { file: path.join(__dirname, 'dataset-events-sybil.jsonl'),    label: 1, attack_type: 'sybil'    },
  { file: path.join(__dirname, 'dataset-events-botloop.jsonl'),  label: 1, attack_type: 'bot_loop' },
]

// Output — goes directly into ml/ so train_svm.py can use it immediately
const OUTPUT_CSV = path.join(__dirname, '..', 'ml', 'bridge_anomaly_dataset.csv')

// ── Feature Computation ───────────────────────────────────────────────────────
// These formulas are a DIRECT PORT of _extractFeatures() in anomaly-detector.js.
// Any change to anomaly-detector.js must be reflected here too.

/**
 * Compute all 14 features for one window of events.
 * @param {Array} events  — array of { sender, receiver, timestamp } records
 * @returns {Object}       — one row matching train_svm.py's FEATURES list
 */
function extractFeatures(events) {
  // Derive window hour from the first event's timestamp
  const windowTime = new Date(events[0].timestamp)
  const hour       = windowTime.getHours()

  const senders    = events.map(e => e.sender)
  const receivers  = events.map(e => e.receiver)
  const pairs      = events.map(e => `${e.sender}->${e.receiver}`)
  const timestamps = events.map(e => e.timestamp).sort((a, b) => a - b)

  // ── Basic ──────────────────────────────────────────────────────────────────
  const tx_count        = events.length
  const unique_senders  = new Set(senders).size
  const unique_receivers = new Set(receivers).size
  const active_pairs    = new Set(pairs).size

  // ── Velocity ──────────────────────────────────────────────────────────────
  const avg_tx_per_sec  = tx_count / 60    // fixed 60s window

  // max transactions in any single second  (same as anomaly-detector.js)
  const secBuckets = {}
  for (const ts of timestamps) {
    const sec = Math.floor(ts / 1000)
    secBuckets[sec] = (secBuckets[sec] || 0) + 1
  }
  const max_tx_in_1sec = Math.max(...Object.values(secBuckets))

  // interarrival stats — gaps in SECONDS between consecutive events
  let min_interarrival = 60
  let std_interarrival = 0
  if (timestamps.length > 1) {
    const gaps = []
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push((timestamps[i] - timestamps[i - 1]) / 1000)
    }
    min_interarrival = Math.min(...gaps)
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    std_interarrival = Math.sqrt(
      gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length
    )
  }

  // ── Pattern ───────────────────────────────────────────────────────────────

  // sender dominance
  const senderCounts = {}
  for (const s of senders) senderCounts[s] = (senderCounts[s] || 0) + 1
  const top_sender_share = Math.max(...Object.values(senderCounts)) / tx_count

  // most-reused sender→receiver pair
  const pairCounts = {}
  for (const p of pairs) pairCounts[p] = (pairCounts[p] || 0) + 1
  const same_pair_ratio = Math.max(...Object.values(pairCounts)) / tx_count

  // Shannon entropy of sender distribution
  const senderProbs = Object.values(senderCounts).map(c => c / tx_count)
  const sender_entropy = -senderProbs.reduce(
    (s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0
  )

  // ── Context ───────────────────────────────────────────────────────────────

  // Cyclical hour encoding (same trig as anomaly-detector.js)
  const sin_hour = Math.sin(2 * Math.PI * hour / 24)
  const cos_hour = Math.cos(2 * Math.PI * hour / 24)

  // Deviation from typical hourly baseline
  const baseline       = HOURLY_BASELINES[hour] ?? 15
  const rate_deviation = tx_count - baseline

  return {
    tx_count,
    unique_senders,
    unique_receivers,
    active_pairs,
    avg_tx_per_sec:   round6(avg_tx_per_sec),
    max_tx_in_1sec,
    min_interarrival: round6(min_interarrival),
    std_interarrival: round6(std_interarrival),
    top_sender_share: round6(top_sender_share),
    same_pair_ratio:  round6(same_pair_ratio),
    sender_entropy:   round6(sender_entropy),
    sin_hour:         round6(sin_hour),
    cos_hour:         round6(cos_hour),
    rate_deviation:   round6(rate_deviation),
  }
}

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000
}

// ── JSONL Reader ──────────────────────────────────────────────────────────────

function loadEvents(filePath) {
  if (!fs.existsSync(filePath)) return []

  const lines  = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean)
  const events = []

  for (const line of lines) {
    try {
      const e = JSON.parse(line)
      // Normalise: ensure required fields exist
      if (e.sender && e.receiver && e.timestamp) {
        events.push({
          sender:    e.sender.toLowerCase(),
          receiver:  e.receiver.toLowerCase(),
          timestamp: Number(e.timestamp),
        })
      }
    } catch {
      // skip malformed lines
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp)
}

// ── Windowing ─────────────────────────────────────────────────────────────────

/**
 * Split events into WINDOW_MS-sized buckets and extract one feature row per bucket.
 */
function windowAndExtract(events, label, attack_type) {
  if (events.length === 0) return []

  const firstTs   = events[0].timestamp
  const lastTs    = events[events.length - 1].timestamp
  const rows      = []

  // Align window start to a clean boundary
  let winStart = firstTs - (firstTs % WINDOW_MS)
  const STEP_MS = 1000 // Slide forward 1 second at a time to create overlapping windows

  while (winStart <= lastTs) {
    const winEnd    = winStart + WINDOW_MS
    const winEvents = events.filter(e => e.timestamp >= winStart && e.timestamp < winEnd)

    if (winEvents.length >= 3) {  // skip near-empty windows
      const features = extractFeatures(winEvents)
      rows.push({ ...features, label, attack_type })
    }

    winStart += STEP_MS // Slide by 1 second instead of a full 60 seconds
  }

  return rows
}

// ── CSV Writer ────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'tx_count', 'unique_senders', 'unique_receivers', 'active_pairs',
  'avg_tx_per_sec', 'max_tx_in_1sec', 'min_interarrival', 'std_interarrival',
  'top_sender_share', 'same_pair_ratio', 'sender_entropy',
  'sin_hour', 'cos_hour', 'rate_deviation',
  'label', 'attack_type',
]

function writeCSV(rows, outputPath) {
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map(r =>
      CSV_HEADERS.map(h => {
        const v = r[h]
        return typeof v === 'string' ? `"${v}"` : v
      }).join(',')
    ),
  ]

  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8')
}

// ── Parse CLI Args ────────────────────────────────────────────────────────────

/**
 * Allow overriding inputs via CLI:
 *   node dataset-extract.js normal:./my-normal.jsonl attack:./my-burst.jsonl
 */
function parseArgs() {
  const args = process.argv.slice(2)
  if (args.length === 0) return DEFAULT_INPUTS

  return args.map(arg => {
    const [labelStr, filePath] = arg.split(':')
    const isAttack = labelStr !== 'normal'
    return {
      file:        path.resolve(filePath),
      label:       isAttack ? 1 : 0,
      attack_type: isAttack ? labelStr : 'normal',
    }
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const inputs = parseArgs()
  const allRows = []

  console.log('\n[Extract] AKA Bridge Dataset Feature Extractor')
  console.log(`[Extract] Window size: ${WINDOW_MS / 1000}s`)
  console.log(`[Extract] Output: ${OUTPUT_CSV}\n`)

  let totalEvents = 0

  for (const { file, label, attack_type } of inputs) {
    if (!fs.existsSync(file)) {
      console.log(`[Extract] SKIP  ${path.basename(file)}  (not found)`)
      continue
    }

    const events = loadEvents(file)
    if (events.length === 0) {
      console.log(`[Extract] SKIP  ${path.basename(file)}  (empty)`)
      continue
    }

    const rows = windowAndExtract(events, label, attack_type)
    allRows.push(...rows)
    totalEvents += events.length

    console.log(
      `[Extract] OK    ${path.basename(file).padEnd(40)}` +
      `  events=${String(events.length).padStart(5)}` +
      `  windows=${String(rows.length).padStart(4)}` +
      `  label=${label}  type=${attack_type}`
    )
  }

  if (allRows.length === 0) {
    console.error('\n[Extract] No rows generated. Check that JSONL files exist and are non-empty.')
    console.error('[Extract] Run dataset-listener.js and dataset-traffic-gen.js first.')
    process.exit(1)
  }

  // Shuffle rows so normal and attack windows are interleaved
  for (let i = allRows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allRows[i], allRows[j]] = [allRows[j], allRows[i]]
  }

  writeCSV(allRows, OUTPUT_CSV)

  // Summary
  const normalCount = allRows.filter(r => r.label === 0).length
  const attackCount = allRows.filter(r => r.label === 1).length
  const attackTypes = {}
  for (const r of allRows) if (r.label === 1) attackTypes[r.attack_type] = (attackTypes[r.attack_type] || 0) + 1

  console.log('\n[Extract] ─────────────────────────────────────────────')
  console.log(`[Extract] Total events processed : ${totalEvents}`)
  console.log(`[Extract] Total windows (rows)   : ${allRows.length}`)
  console.log(`[Extract]   Normal  (label=0)    : ${normalCount}`)
  console.log(`[Extract]   Attack  (label=1)    : ${attackCount}`)
  for (const [type, count] of Object.entries(attackTypes)) {
    console.log(`[Extract]     ${type.padEnd(12)}: ${count}`)
  }
  console.log(`[Extract] ─────────────────────────────────────────────`)
  console.log(`[Extract] Saved → ${OUTPUT_CSV}`)
  console.log('\n[Extract] Next step:')
  console.log('  cd ml && python3 train_svm.py\n')
}

main()