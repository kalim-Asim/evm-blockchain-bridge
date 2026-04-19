/**
 * Recovery script: scans past blocks on Sepolia for Transfer events
 * that were sent to the bridge wallet but never processed (D-CHSD never minted).
 *
 * Usage:
 *   node recover-missed-events.js [fromBlock] [toBlock]
 *
 * If no block range is provided, it scans the last 5000 blocks.
 */

const Web3 = require('web3')
require('dotenv').config()
const { HttpsProxyAgent } = require('https-proxy-agent')

const { mintTokens } = require('./contract-methods.js')

const _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const _proxyAgent = _proxyUrl ? new HttpsProxyAgent(_proxyUrl) : undefined
const makeOpts = () => _proxyAgent ? { agent: { https: _proxyAgent } } : {}

const ORIGIN_TOKEN_CONTRACT_ADDRESS = process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS
const DESTINATION_TOKEN_CONTRACT_ADDRESS = process.env.DESTINATION_TOKEN_CONTRACT_ADDRESS
const BRIDGE_WALLET = process.env.BRIDGE_WALLET
const BRIDGE_WALLET_KEY = process.env.BRIDGE_PRIV_KEY
const WALLET_ZERO = process.env.WALLET_ZERO

const CHSD_ABIJSON = require('./AKADollars.json')
const QCHSD_ABIJSON = require('./DAKADollars.json')

const main = async () => {
  // Use HTTPS endpoints (reliable, no WSS needed)
  const web3Origin = new Web3(new Web3.providers.HttpProvider(process.env.ORIGIN_HTTPS_ENDPOINT, makeOpts()))
  const web3Dest = new Web3(new Web3.providers.HttpProvider(process.env.DESTINATION_HTTPS_ENDPOINT, makeOpts()))

  web3Origin.eth.accounts.wallet.add(BRIDGE_WALLET_KEY)
  web3Dest.eth.accounts.wallet.add(BRIDGE_WALLET_KEY)

  const originContract = new web3Origin.eth.Contract(CHSD_ABIJSON.abi, ORIGIN_TOKEN_CONTRACT_ADDRESS)
  const destContract = new web3Dest.eth.Contract(QCHSD_ABIJSON.abi, DESTINATION_TOKEN_CONTRACT_ADDRESS)

  // Determine block range
  const currentBlock = await web3Origin.eth.getBlockNumber()
  const fromBlock = process.argv[2] ? parseInt(process.argv[2]) : currentBlock - 5000
  const toBlock = process.argv[3] ? parseInt(process.argv[3]) : currentBlock

  console.log(`🔍 Scanning Origin (Sepolia) blocks ${fromBlock} → ${toBlock} for missed Transfer events...`)
  console.log(`   Bridge wallet: ${BRIDGE_WALLET}`)
  console.log(`   Origin contract: ${ORIGIN_TOKEN_CONTRACT_ADDRESS}`)
  console.log(`   Destination contract: ${DESTINATION_TOKEN_CONTRACT_ADDRESS}`)
  console.log('')

  // Get all Transfer events sent TO the bridge wallet
  const events = await originContract.getPastEvents('Transfer', {
    fromBlock,
    toBlock,
  })

  const missedEvents = events.filter(e => {
    const { from, to } = e.returnValues
    return (
      to.toLowerCase() === BRIDGE_WALLET.toLowerCase() &&
      from.toLowerCase() !== BRIDGE_WALLET.toLowerCase()
    )
  })

  if (missedEvents.length === 0) {
    console.log('✅ No missed bridge transfers found in this range.')
    return
  }

  console.log(`Found ${missedEvents.length} Transfer event(s) to bridge wallet:\n`)

  for (const event of missedEvents) {
    const { from, to, value } = event.returnValues
    const amountFormatted = Web3.utils.fromWei(value, 'ether')
    console.log(`  Block ${event.blockNumber} | TX: ${event.transactionHash}`)
    console.log(`    From: ${from}`)
    console.log(`    Amount: ${amountFormatted} CHSD`)

    // Check if D-CHSD was already minted for this user
    const destBalance = await destContract.methods.balanceOf(from).call()
    const destBalFormatted = Web3.utils.fromWei(destBalance, 'ether')
    console.log(`    User's current D-CHSD balance: ${destBalFormatted}`)

    // Ask for confirmation
    console.log(`    → Minting ${amountFormatted} D-CHSD for ${from}...`)

    try {
      const result = await mintTokens(web3Dest, destContract, value, from)
      if (result === false) {
        console.log(`    ❌ Minting failed (see error above)`)
      } else {
        console.log(`    ✅ Successfully minted ${amountFormatted} D-CHSD!`)
      }
    } catch (err) {
      console.error(`    ❌ Error minting:`, err.message || err)
    }
    console.log('')
  }

  console.log('🏁 Recovery complete.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
