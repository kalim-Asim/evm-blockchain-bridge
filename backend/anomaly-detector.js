/**
 * Bridge Anomaly Detector
 *
 * Collects Transfer events into a 60-second window, extracts 14 statistical
 * features, and classifies the window as NORMAL or ATTACK using the trained SVM.
 *
 * Usage:
 *   const detector = require('./anomaly-detector')
 *   detector.start()           // starts the 60s classify loop
 *   detector.record(event)     // call on every Transfer event
 */

const { spawn } = require('child_process')
const path = require('path')
const EventEmitter = require('events')

const _emitter = new EventEmitter()
const WINDOW_MS = parseInt(process.env.ANOMALY_WINDOW_MS) || 60_000
const INFER_SCRIPT = path.join(__dirname, '..', 'ml', 'infer.py')

// Hourly transaction baselines (hours 0–23): peak ~35 at noon, trough ~4 at 4am
const HOURLY_BASELINES = [4,4,5,5,4,5,8,12,18,22,28,32,35,34,30,26,22,18,15,12,10,8,6,5]

// Current window: { timestamp (ms), sender, receiver }[]
let _window = []

/**
 * Add an array of mock events directly to the window (for UI simulator).
 */
const injectMockTxs = (events) => {
  const now = Date.now()
  for (const event of events) {
    _window.push({
      timestamp: now,
      sender: event.returnValues.from.toLowerCase(),
      receiver: event.returnValues.to.toLowerCase(),
    })
  }
}

const _extractFeatures = (events) => {
  const hour = new Date().getHours()
  const senders = events.map(e => e.sender)
  const receivers = events.map(e => e.receiver)
  const pairs = events.map(e => `${e.sender}->${e.receiver}`)
  const timestamps = events.map(e => e.timestamp).sort((a, b) => a - b)

  const txCount = events.length
  const uniqueSenders = new Set(senders).size
  const uniqueReceivers = new Set(receivers).size
  const activePairs = new Set(pairs).size
  const avgTxPerSec = txCount / 60

  // max transactions in any single second
  const secBuckets = {}
  for (const ts of timestamps) {
    const sec = Math.floor(ts / 1000)
    secBuckets[sec] = (secBuckets[sec] || 0) + 1
  }
  const maxTxIn1Sec = Math.max(...Object.values(secBuckets))

  // interarrival statistics
  let minInterarrival = 60
  let stdInterarrival = 0
  if (timestamps.length > 1) {
    const gaps = []
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push((timestamps[i] - timestamps[i - 1]) / 1000)
    }
    minInterarrival = Math.min(...gaps)
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    stdInterarrival = Math.sqrt(
      gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length
    )
  }

  // sender dominance
  const senderCounts = {}
  for (const s of senders) senderCounts[s] = (senderCounts[s] || 0) + 1
  const topSenderShare = Math.max(...Object.values(senderCounts)) / txCount

  // most-reused sender→receiver pair
  const pairCounts = {}
  for (const p of pairs) pairCounts[p] = (pairCounts[p] || 0) + 1
  const samePairRatio = Math.max(...Object.values(pairCounts)) / txCount

  // Shannon entropy of sender distribution
  const senderProbs = Object.values(senderCounts).map(c => c / txCount)
  const senderEntropy = -senderProbs.reduce(
    (s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0
  )

  // cyclical time encoding
  const sinHour = Math.sin(2 * Math.PI * hour / 24)
  const cosHour = Math.cos(2 * Math.PI * hour / 24)

  // deviation from typical hourly baseline
  const baseline = HOURLY_BASELINES[hour] ?? 15
  const rateDeviation = txCount - baseline

  return [
    txCount, uniqueSenders, uniqueReceivers, activePairs,
    avgTxPerSec, maxTxIn1Sec, minInterarrival, stdInterarrival,
    topSenderShare, samePairRatio, senderEntropy,
    sinHour, cosHour, rateDeviation,
  ]
}

const _runInference = (features) => {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [INFER_SCRIPT])
    let stdout = ''
    let stderr = ''

    py.stdout.on('data', d => { stdout += d })
    py.stderr.on('data', d => { stderr += d })

    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`infer.py exited ${code}: ${stderr.trim()}`))
        return
      }
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch {
        reject(new Error(`Failed to parse infer.py output: "${stdout.trim()}"`))
      }
    })

    py.stdin.write(JSON.stringify({ features }))
    py.stdin.end()
  })
}

const forceClassify = async () => {
  const now = Date.now()
  _window = _window.filter(e => now - e.timestamp <= WINDOW_MS)
  const snapshot = [..._window]  // copy before clearing

  // Clear window after snapshot so next simulation window starts fresh
  _window = []

  if (snapshot.length === 0) return false

  const features = _extractFeatures(snapshot)
  try {
    const result = await _runInference(features)
    if (result.error) return false

    const senderCounts = {}
    const receiverCounts = {}
    for (const s of snapshot) {
      senderCounts[s.sender] = (senderCounts[s.sender] || 0) + 1
      receiverCounts[s.receiver] = (receiverCounts[s.receiver] || 0) + 1
    }
    const topSender = Object.keys(senderCounts).reduce((a, b) => senderCounts[a] > senderCounts[b] ? a : b)
    const topReceiver = Object.keys(receiverCounts).reduce((a, b) => receiverCounts[a] > receiverCounts[b] ? a : b)

    const alert = {
      prediction: result.prediction,
      label: result.label,
      confidence: result.confidence,
      txCount: snapshot.length,
      uniqueSenders: features[1],
      samePairRatio: features[9],
      timestamp: now,
      topSender,
      topReceiver
    }

    _emitter.emit('classification', alert)

    return result.prediction === 1
  } catch (err) {
    return false
  }
}

/**
 * Clear the sliding window. Useful for simulation scripts
 * that need to reset between test scenarios.
 */
const clearWindow = () => { _window = [] }

/**
 * Record a Transfer event and run inline classification using a sliding window.
 * Returns true if anomalous (block), false if normal (allow).
 */
const classifyTransaction = async (event) => {
  const now = Date.now()
  _window.push({
    timestamp: now,
    sender: event.returnValues.from.toLowerCase(),
    receiver: event.returnValues.to.toLowerCase(),
  })

  // Prune events older than 60s
  _window = _window.filter(e => now - e.timestamp <= WINDOW_MS)

  const snapshot = _window

  // Skip inference for sparse windows — you can't detect an attack pattern
  // from 1–2 transactions, and the degenerate features (entropy=0, etc.)
  // cause false positives.  The model was trained on windows with ≥ 3 events.
  if (snapshot.length < 3) {
    console.log(
      `✅ Normal traffic (window too small to classify: ${snapshot.length} tx)`
    )
    const alert = {
      prediction: 0,
      label: 'NORMAL',
      confidence: 1,
      txCount: snapshot.length,
      uniqueSenders: new Set(snapshot.map(e => e.sender)).size,
      samePairRatio: 0,
      timestamp: now,
      topSender: snapshot[0]?.sender || '',
      topReceiver: snapshot[0]?.receiver || '',
    }
    _emitter.emit('classification', alert)
    return false
  }

  const features = _extractFeatures(snapshot)

  try {
    const result = await _runInference(features)
    if (result.error) {
      console.error('[Anomaly] Inference error:', result.error)
      return false
    }

    const senderCounts = {}
    const receiverCounts = {}
    for (const s of snapshot) {
      senderCounts[s.sender] = (senderCounts[s.sender] || 0) + 1
      receiverCounts[s.receiver] = (receiverCounts[s.receiver] || 0) + 1
    }
    const topSender = Object.keys(senderCounts).reduce((a, b) => senderCounts[a] > senderCounts[b] ? a : b)
    const topReceiver = Object.keys(receiverCounts).reduce((a, b) => receiverCounts[a] > receiverCounts[b] ? a : b)

    const alert = {
      prediction: result.prediction,
      label: result.label,
      confidence: result.confidence,
      txCount: snapshot.length,
      uniqueSenders: features[1],
      samePairRatio: features[9],
      timestamp: now,
      topSender,
      topReceiver
    }

    _emitter.emit('classification', alert)

    if (result.prediction === 1) {
      console.log(
        `⚠️  ATTACK DETECTED  [${result.label}]` +
        `  confidence: ${(result.confidence * 100).toFixed(1)}%` +
        `  | tx=${snapshot.length}` +
        `  unique_senders=${features[1]}` +
        `  same_pair_ratio=${features[9].toFixed(2)}`
      )
      return true
    } else {
      console.log(
        `✅ Normal traffic` +
        `  confidence: ${(result.confidence * 100).toFixed(1)}%` +
        `  | tx=${snapshot.length}`
      )
      return false
    }
  } catch (err) {
    console.error('[Anomaly] Inference failed:', err.message)
    return false
  }
}

module.exports = { classifyTransaction, injectMockTxs, forceClassify, clearWindow, on: _emitter.on.bind(_emitter) }
