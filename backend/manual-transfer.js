/**
 * Manual recovery script — sends CHSD from bridge wallet to a user wallet on Sepolia.
 * Use this when transferToEthWallet timed out and the user didn't receive their tokens.
 *
 * Usage:
 *   node manual-transfer.js <to_address> <amount_in_tokens>
 *
 * Example:
 *   node manual-transfer.js 0x3F33186C8e1c1e13bE51f81df819D894b3b2891d 10
 */

require('dotenv').config()
const Web3 = require('web3')
const { HttpsProxyAgent } = require('https-proxy-agent')

const _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
const _proxyAgent = _proxyUrl ? new HttpsProxyAgent(_proxyUrl) : undefined
const makeOpts = () => _proxyAgent ? { agent: { https: _proxyAgent } } : {}

const CHSD_ABI = require('./AKADollars.json')

const main = async () => {
  const toAddress = process.argv[2]
  const amountTokens = process.argv[3]

  if (!toAddress || !amountTokens) {
    console.error('Usage: node manual-transfer.js <to_address> <amount_in_tokens>')
    process.exit(1)
  }

  const web3 = new Web3(
    new Web3.providers.HttpProvider(process.env.ORIGIN_HTTPS_ENDPOINT, makeOpts())
  )
  web3.eth.accounts.wallet.add(process.env.BRIDGE_PRIV_KEY)

  const contract = new web3.eth.Contract(
    CHSD_ABI.abi,
    process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS
  )

  const amount = web3.utils.toWei(amountTokens, 'ether')
  console.log(`Sending ${amountTokens} CHSD → ${toAddress}`)

  const trx = contract.methods.transfer(toAddress, amount)
  const gas = await trx.estimateGas({ from: process.env.BRIDGE_WALLET })
  const gasPrice = await web3.eth.getGasPrice()
  const nonce = await web3.eth.getTransactionCount(process.env.BRIDGE_WALLET)

  const receipt = await web3.eth.sendTransaction({
    from: process.env.BRIDGE_WALLET,
    to: process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS,
    data: trx.encodeABI(),
    gas: Math.ceil(gas * 1.2),
    gasPrice,
    nonce,
  })

  console.log(`✅ Done! Hash: ${receipt.transactionHash}`)
  console.log(`See: ${process.env.ORIGIN_EXPLORER}${receipt.transactionHash}`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
