const http = require('http')
const Web3 = require('web3')
require('dotenv').config()
const { HttpsProxyAgent } = require('https-proxy-agent')

const _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const _proxyAgent = _proxyUrl ? new HttpsProxyAgent(_proxyUrl) : undefined
const makeHttpProviderOpts = () => _proxyAgent ? { agent: { https: _proxyAgent } } : {}

const {
  mintTokens,
  approveForBurn,
  burnTokens,
  transferToEthWallet,
} = require('./contract-methods.js')

const detector = require('./anomaly-detector')

const ORIGIN_TOKEN_CONTRACT_ADDRESS = process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS
const DESTINATION_TOKEN_CONTRACT_ADDRESS =
  process.env.DESTINATION_TOKEN_CONTRACT_ADDRESS
const BRIDGE_WALLET = process.env.BRIDGE_WALLET

const BRIDGE_WALLET_KEY = process.env.BRIDGE_PRIV_KEY

const CHSD_ABIJSON = require('./AKADollars.json')
const QCHSD_ABIJSON = require('./DAKADollars.json')

// Track processed events to avoid duplicates (across WSS + polling)
const processedEvents = new Set()

const handleEthEvent = async (event, provider, contract) => {
  const eventId = `${event.transactionHash}-${event.logIndex}`
  if (processedEvents.has(eventId)) return
  processedEvents.add(eventId)

  detector.record(event)

  console.log('handleEthEvent')
  const { from, to, value } = event.returnValues
  console.log('to :>> ', to)
  console.log('from :>> ', from)
  console.log('value :>> ', value)
  console.log('============================')

  if (from.toLowerCase() == BRIDGE_WALLET.toLowerCase()) {
    console.log('Transfer is a bridge back')
    return
  }
  if (to.toLowerCase() == BRIDGE_WALLET.toLowerCase() && to.toLowerCase() != from.toLowerCase()) {
    console.log('Tokens received on bridge from ETH chain! Time to bridge!')

    try {
      const tokensMinted = await mintTokens(provider, contract, value, from)
      if (!tokensMinted) return
      console.log('🌈🌈🌈🌈🌈 Bridge to destination completed')
    } catch (err) {
      console.error('Error processing transaction', err)
      // TODO: return funds
    }
  } else {
    console.log('Another transfer')
  }
}

const handleDestinationEvent = async (
  event,
  provider,
  contract,
  providerDest,
  contractDest
) => {
  const eventId = `${event.transactionHash}-${event.logIndex}`
  if (processedEvents.has(eventId)) return
  processedEvents.add(eventId)

  const { from, to, value } = event.returnValues
  console.log('handleDestinationEvent')
  console.log('to :>> ', to)
  console.log('from :>> ', from)
  console.log('value :>> ', value)
  console.log('============================')

  if (from == process.env.WALLET_ZERO) {
    console.log('Tokens minted')
    return
  }

  if (to.toLowerCase() == BRIDGE_WALLET.toLowerCase() && to.toLowerCase() != from.toLowerCase()) {
    console.log(
      'Tokens received on bridge from destination chain! Time to bridge back!'
    )

    try {
      // we need to approve burn, then burn
      const tokenBurnApproved = await approveForBurn(
        providerDest,
        contractDest,
        value
      )
      if (!tokenBurnApproved) return
      console.log('Tokens approved to be burnt')
      const tokensBurnt = await burnTokens(providerDest, contractDest, value)

      if (!tokensBurnt) return
      console.log(
        'Tokens burnt on destination, time to transfer tokens in ETH side'
      )
      const transferBack = await transferToEthWallet(
        provider,
        contract,
        value,
        from
      )
      if (!transferBack) return

      console.log('Tokens transfered to ETH wallet')
      console.log('🌈🌈🌈🌈🌈 Bridge back operation completed')
    } catch (err) {
      console.error('Error processing transaction', err)
      // TODO: return funds
    }
  } else {
    console.log('Something else triggered Transfer event')
  }
}

// ============================================================
// WSS Provider with auto-restart on failure
// ============================================================
const createWssProvider = (url, name, onPermanentFailure) => {
  const provider = new Web3.providers.WebsocketProvider(url, {
    reconnect: {
      auto: true,
      delay: 5000,
      maxAttempts: 30,
      onTimeout: false
    },
    clientConfig: {
      keepalive: true,
      keepaliveInterval: 30000
    }
  });

  provider.on('connect', () => console.log(`✅ Connected to ${name} WSS`));
  provider.on('error', e => console.error(`❌ ${name} WS Error`, e.message || e));
  provider.on('end', () => {
    console.error(`⚠️ ${name} WS Closed permanently. Falling back to HTTP polling.`);
    if (onPermanentFailure) onPermanentFailure();
  });

  return provider;
};

// ============================================================
// HTTP Polling fallback — polls getPastEvents every N seconds
// ============================================================
const POLL_INTERVAL_MS = 15000 // poll every 15 seconds

const startHttpPolling = (
  httpWeb3Origin,
  httpWeb3Dest,
  originContract,
  destContract,
  lastOriginBlock,
  lastDestBlock,
  originHttpOk = true,
  destHttpOk = true
) => {
  console.log('📡 Starting HTTP polling fallback...')

  // Poll Origin (Sepolia) for Transfer events
  const pollOrigin = async () => {
    if (!originHttpOk) return
    try {
      const currentBlock = await httpWeb3Origin.eth.getBlockNumber()
      if (lastOriginBlock.value >= currentBlock) return

      const fromBlock = lastOriginBlock.value + 1
      console.log(`[HTTP Poll] Checking Origin blocks ${fromBlock} → ${currentBlock}`)

      const events = await originContract.getPastEvents('Transfer', {
        fromBlock,
        toBlock: currentBlock
      })

      for (const event of events) {
        await handleEthEvent(event, httpWeb3Dest, destContract)
      }

      lastOriginBlock.value = currentBlock
    } catch (err) {
      console.error('[HTTP Poll] Origin polling error:', err.message || err)
    }
  }

  // Poll Destination (Harmony) for Transfer events
  const pollDest = async () => {
    if (!destHttpOk) return
    try {
      const currentBlock = await httpWeb3Dest.eth.getBlockNumber()
      if (lastDestBlock.value >= currentBlock) return

      const fromBlock = lastDestBlock.value + 1
      console.log(`[HTTP Poll] Checking Destination blocks ${fromBlock} → ${currentBlock}`)

      const events = await destContract.getPastEvents('Transfer', {
        fromBlock,
        toBlock: currentBlock
      })

      for (const event of events) {
        await handleDestinationEvent(
          event,
          httpWeb3Origin,
          originContract,
          httpWeb3Dest,
          destContract
        )
      }

      lastDestBlock.value = currentBlock
    } catch (err) {
      console.error('[HTTP Poll] Destination polling error:', err.message || err)
    }
  }

  const originInterval = setInterval(pollOrigin, POLL_INTERVAL_MS)
  const destInterval = setInterval(pollDest, POLL_INTERVAL_MS)

  // Run immediately on start
  pollOrigin()
  pollDest()

  return { originInterval, destInterval }
}

// ============================================================
// SSE Alert Server — broadcasts classification results to the UI
// and accepts POSTed alerts from simulate-attack.js
// ============================================================
const setupAlertServer = () => {
  const sseClients = new Set()

  const broadcastSSE = (alert) => {
    const data = `data: ${JSON.stringify(alert)}\n\n`
    for (const client of [...sseClients]) {
      try { client.write(data) }
      catch (_) { sseClients.delete(client) }
    }
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      res.write(':ok\n\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))

    } else if (req.method === 'POST' && req.url === '/alert') {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try {
          const alert = JSON.parse(body)
          if (alert.prediction === 1) {
            console.log(
              `\n⚠️  [SIMULATION] ATTACK DETECTED  [${alert.label}]` +
              `  confidence: ${(alert.confidence * 100).toFixed(1)}%` +
              `  | tx=${alert.txCount}` +
              `  unique_senders=${alert.uniqueSenders}` +
              `  same_pair_ratio=${alert.samePairRatio.toFixed(2)}\n`
            )
          } else {
            console.log(
              `\n✅ [SIMULATION] Normal traffic` +
              `  confidence: ${(alert.confidence * 100).toFixed(1)}%` +
              `  | tx=${alert.txCount}\n`
            )
          }
          broadcastSSE(alert)
        } catch (_) {}
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' })
        res.end()
      })

    } else {
      res.writeHead(404)
      res.end()
    }
  })

  // Also relay detector events from real blockchain traffic
  detector.on('classification', broadcastSSE)

  server.listen(3001, () => {
    console.log('📡 Alert server ready — SSE: http://localhost:3001/events | POST: http://localhost:3001/alert')
  })
}

// ============================================================
// Main
// ============================================================
const main = async () => {
  // ----- HTTP providers (used for polling + transactions) -----
  const httpWeb3Origin = new Web3(new Web3.providers.HttpProvider(process.env.ORIGIN_HTTPS_ENDPOINT, makeHttpProviderOpts()))
  const httpWeb3Dest = new Web3(new Web3.providers.HttpProvider(process.env.DESTINATION_HTTPS_ENDPOINT, makeHttpProviderOpts()))

  httpWeb3Origin.eth.accounts.wallet.add(BRIDGE_WALLET_KEY)
  httpWeb3Dest.eth.accounts.wallet.add(BRIDGE_WALLET_KEY)

  const httpOriginContract = new httpWeb3Origin.eth.Contract(
    CHSD_ABIJSON.abi,
    ORIGIN_TOKEN_CONTRACT_ADDRESS
  )
  const httpDestContract = new httpWeb3Dest.eth.Contract(
    QCHSD_ABIJSON.abi,
    DESTINATION_TOKEN_CONTRACT_ADDRESS
  )

  // ----- Test HTTP endpoints before proceeding -----
  let originHttpOk = false
  let destHttpOk = false
  let lastOriginBlock = { value: 0 }
  let lastDestBlock = { value: 0 }

  try {
    lastOriginBlock.value = await httpWeb3Origin.eth.getBlockNumber()
    originHttpOk = true
    console.log(`✅ Origin HTTP endpoint OK — block: ${lastOriginBlock.value}`)
  } catch (err) {
    console.error(`❌ Origin HTTP endpoint FAILED: ${err.message}`)
    console.error(`   Check your ORIGIN_HTTPS_ENDPOINT in .env — it may be expired.`)
  }

  try {
    lastDestBlock.value = await httpWeb3Dest.eth.getBlockNumber()
    destHttpOk = true
    console.log(`✅ Destination HTTP endpoint OK — block: ${lastDestBlock.value}`)
  } catch (err) {
    console.error(`❌ Destination HTTP endpoint FAILED: ${err.message}`)
    console.error(`   Check your DESTINATION_HTTPS_ENDPOINT in .env — it may be expired.`)
  }

  if (!originHttpOk && !destHttpOk) {
    console.error('\n⛔ Both HTTP endpoints are down. Cannot start the bridge.')
    console.error('Please update your .env with working RPC endpoints:')
    console.error('  ORIGIN_HTTPS_ENDPOINT=<your Sepolia HTTPS RPC URL>')
    console.error('  ORIGIN_WSS_ENDPOINT=<your Sepolia WSS RPC URL>')
    console.error('\nYou can get free endpoints from:')
    console.error('  - https://www.alchemy.com/  (Sepolia)')
    console.error('  - https://www.infura.io/    (Sepolia)')
    console.error('  - https://chainstack.com/   (Sepolia)')
    process.exit(1)
  }

  // ----- Track polling state -----
  let pollingActive = false
  let pollingIntervals = null

  const activatePolling = () => {
    if (pollingActive) return
    pollingActive = true
    pollingIntervals = startHttpPolling(
      httpWeb3Origin,
      httpWeb3Dest,
      httpOriginContract,
      httpDestContract,
      lastOriginBlock,
      lastDestBlock,
      originHttpOk,
      destHttpOk
    )
  }

  // ----- Try WSS providers (faster real-time events) -----
  let wssOriginFailed = false
  let wssDestFailed = false

  const checkWssFailed = () => {
    if (wssOriginFailed || wssDestFailed) {
      activatePolling()
    }
  }

  try {
    const originProvider = createWssProvider(
      process.env.ORIGIN_WSS_ENDPOINT,
      'Sepolia',
      () => { wssOriginFailed = true; checkWssFailed() }
    )
    const destProvider = createWssProvider(
      process.env.DESTINATION_WSS_ENDPOINT,
      'Harmony',
      () => { wssDestFailed = true; checkWssFailed() }
    )

    const web3Origin = new Web3(originProvider)
    const web3Dest = new Web3(destProvider)

    web3Origin.eth.accounts.wallet.add(BRIDGE_WALLET_KEY)
    web3Dest.eth.accounts.wallet.add(BRIDGE_WALLET_KEY)

    const originTokenContract = new web3Origin.eth.Contract(
      CHSD_ABIJSON.abi,
      ORIGIN_TOKEN_CONTRACT_ADDRESS
    )
    const destinationTokenContract = new web3Dest.eth.Contract(
      QCHSD_ABIJSON.abi,
      DESTINATION_TOKEN_CONTRACT_ADDRESS
    )

    // WSS event listeners — use HTTP providers for sending transactions (more reliable)
    originTokenContract.events.Transfer()
      .on('data', async (event) => {
        await handleEthEvent(event, httpWeb3Dest, httpDestContract)
        if (event.blockNumber > lastOriginBlock.value) {
          lastOriginBlock.value = event.blockNumber
        }
      })
      .on('error', (err) => {
        console.error('Origin WSS Event Error:', err.message || err)
        wssOriginFailed = true
        checkWssFailed()
      })

    destinationTokenContract.events.Transfer()
      .on('data', async (event) => {
        await handleDestinationEvent(
          event,
          httpWeb3Origin,
          httpOriginContract,
          httpWeb3Dest,
          httpDestContract
        )
        if (event.blockNumber > lastDestBlock.value) {
          lastDestBlock.value = event.blockNumber
        }
      })
      .on('error', (err) => {
        console.error('Dest WSS Event Error:', err.message || err)
        wssDestFailed = true
        checkWssFailed()
      })

    console.log('🚀 Bridge backend is active — WSS listeners started')
  } catch (err) {
    console.error('WSS setup failed, using HTTP polling only:', err.message || err)
    activatePolling()
  }

  // Also start polling as a safety net — dedup prevents double processing
  setTimeout(() => {
    if (!pollingActive) {
      console.log('📡 Starting HTTP polling as safety net alongside WSS...')
      activatePolling()
    }
  }, 10000)

  detector.start()
  setupAlertServer()
  console.log('🚀 Bridge backend is active and listening...')
}

main().catch(err => {
  console.error('Fatal error in main:', err)
  process.exit(1)
})
