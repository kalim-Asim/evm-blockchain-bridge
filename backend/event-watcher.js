const Web3 = require('web3')
require('dotenv').config()

const {
  mintTokens,
  approveForBurn,
  burnTokens,
  transferToEthWallet,
} = require('./contract-methods.js')

const ORIGIN_TOKEN_CONTRACT_ADDRESS = process.env.ORIGIN_TOKEN_CONTRACT_ADDRESS
const DESTINATION_TOKEN_CONTRACT_ADDRESS =
  process.env.DESTINATION_TOKEN_CONTRACT_ADDRESS
const BRIDGE_WALLET = process.env.BRIDGE_WALLET

const BRIDGE_WALLET_KEY = process.env.BRIDGE_PRIV_KEY

const CHSD_ABIJSON = require('./ChainstackDollars.json')
const QCHSD_ABIJSON = require('./DChainstackDollars.json')

const handleEthEvent = async (event, provider, contract) => {
  console.log('handleEthEvent')
  const { from, to, value } = event.returnValues
  console.log('to :>> ', to)
  console.log('from :>> ', from)
  console.log('value :>> ', value)
  console.log('============================')

  if (from == BRIDGE_WALLET) {
    console.log('Transfer is a bridge back')
    return
  }
  if (to == BRIDGE_WALLET && to != from) {
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

  if (to == BRIDGE_WALLET && to != from) {
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

const getProvider = (url, name) => {
  const provider = new Web3.providers.WebsocketProvider(url, {
    reconnect: {
      auto: true,
      delay: 5000, // Wait 5s before reconnecting
      maxAttempts: 20,
      onTimeout: false
    },
    clientConfig: {
      keepalive: true,
      keepaliveInterval: 30000 // Send pings every 30s to prevent 1006 idle drops
    }
  });

  provider.on('connect', () => console.log(`✅ Connected to ${name} WSS`));
  provider.on('error', e => console.error(`❌ ${name} WS Error`, e));
  provider.on('end', e => console.error(`⚠️ ${name} WS Closed. Reconnecting...`, e));

  return provider;
};

const main = async () => {
  // Initialize Providers with the new helper
  const originProvider = getProvider(process.env.ORIGIN_WSS_ENDPOINT, 'Sepolia');
  const destProvider = getProvider(process.env.DESTINATION_WSS_ENDPOINT, 'Harmony');

  const web3Origin = new Web3(originProvider);
  const web3Dest = new Web3(destProvider);

  // Add accounts
  web3Origin.eth.accounts.wallet.add(BRIDGE_WALLET_KEY);
  web3Dest.eth.accounts.wallet.add(BRIDGE_WALLET_KEY);

  const originTokenContract = new web3Origin.eth.Contract(
    CHSD_ABIJSON.abi,
    ORIGIN_TOKEN_CONTRACT_ADDRESS
  );

  const destinationTokenContract = new web3Dest.eth.Contract(
    QCHSD_ABIJSON.abi,
    DESTINATION_TOKEN_CONTRACT_ADDRESS
  );

  // START LISTENERS
  originTokenContract.events.Transfer()
    .on('data', async (event) => {
      // Logic: Pass web3Dest to handle transaction on destination
      await handleEthEvent(event, web3Dest, destinationTokenContract);
    })
    .on('error', (err) => console.error('Origin Event Error:', err));

  destinationTokenContract.events.Transfer()
    .on('data', async (event) => {
      // Logic: Pass both to handle bridge back
      await handleDestinationEvent(
        event,
        web3Origin,
        originTokenContract,
        web3Dest,
        destinationTokenContract
      );
    })
    .on('error', (err) => console.error('Dest Event Error:', err));

  console.log("🚀 Bridge backend is active and listening...");
}

main();
