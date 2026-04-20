<template>
  <div class="text-center pt-12">
    <h1 class="text-2xl font-bold mb-8">
      Bridge from {{destinationNetwork}} to {{originNetwork}}
    </h1>

    <p>
      This bridge allows you to send AKADollars (D-CHSD) from {{destinationNetwork}} back to {{originNetwork}}
    </p>

    <WalletConnect
      class="my-4"
      :targetNetwork="destinationNetwork"
      :targetNetworkId="destinationNetworkId"
      currency="ONE"
      :decimals="18"
      :isNewNetwork="true"
    />

    <form class="w-96 mt-8 mx-auto">
      <label for="price" class="block mb-2 font-medium text-gray-700"
        >How much D-CHSD do you want to bridge?</label
      >
      <div class="mt-4 w-2/3 mx-auto relative rounded-md shadow-sm">
        <div
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
        >
          <span class="text-gray-500 sm:text-sm"> $ </span>
        </div>
        <input
          type="text"
          v-model="amount"
          name="price"
          id="price"
          class="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
          placeholder="0.00"
          aria-describedby="price-currency"
        />
        <div
          class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"
        >
          <span class="text-gray-500 sm:text-sm" id="price-currency">
            D-CHSD
          </span>
        </div>
      </div>
      <p class="text-xs mt-1">Your balance is: {{ walletBalance }} D-CHSD</p>

      <p
        v-if="errorMessage"
        class="px-4 py-2 bg-red-100 text-red-600 border border-red-600 rounded-lg w-auto mx-auto my-4 text-sm"
      >
        {{ errorMessage }}
      </p>

      <p
        v-if="walletStore.address && Number(walletBalance) === 0 && !errorMessage"
        class="px-4 py-2 bg-yellow-100 text-yellow-700 border border-yellow-500 rounded-lg w-auto mx-auto my-4 text-sm"
      >
        Your D-CHSD balance is 0. If you recently bridged CHSD from {{ originNetwork }}, please wait a few minutes for the bridge backend to process your transaction, then refresh this page.
      </p>

      <button
        type="button"
        class="inline-flex items-center px-4 py-2 mt-4 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="trxInProgress || Number(walletBalance) <= 0"
        @click="sendTokens"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="m-ml-1 mr-3 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        {{ trxInProgress ? `Processing...` : `Bridge to ${originNetwork}` }}
      </button>
    </form>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { ethers, BigNumber } from 'ethers'

import { useWalletStore } from '../stores/wallet'
import WalletConnect from '@/components/WalletConnect.vue'
import DAKADollars from '../artifacts/contracts/DestinationToken.sol/DAKADollars.json'
import AKADollars from '../artifacts/contracts/OriginToken.sol/AKADollars.json'

export default defineComponent({
  components: { WalletConnect },
  setup() {
    const trxInProgress = ref<boolean>(false)
    const errorMessage = ref<string>('')

    const walletStore = useWalletStore()
    const amount = ref<string>('')
    const walletBalance = ref<Number>(0)
    const ONE = 1
    const originTokenAddress = import.meta.env.VITE_ORIGIN_TOKEN_ADDRESS as string

    const destinationTokenAddress = import.meta.env
      .VITE_DESTINATION_TOKEN_ADDRESS as string

    const originNetwork = import.meta.env.VITE_ORIGIN_NETWORK_NAME
    const destinationNetwork = import.meta.env.VITE_DESTINATION_NETWORK_NAME
    const destinationNetworkId = import.meta.env.VITE_DESTINATION_NETWORK_ID

    const bridgeWallet = import.meta.env.VITE_BRIDGE_WALLET

    /** Helper: returns true only when MetaMask is on the destination chain */
    const isOnCorrectNetwork = async (): Promise<boolean> => {
      if (!(window as any).ethereum) return false
      const currentChainId = await (window as any).ethereum.request({
        method: 'eth_chainId',
      })
      return currentChainId === destinationNetworkId
    }

    /** Helper: returns a fresh provider + signer bound to the current MetaMask state */
    const getFreshProviderAndSigner = () => {
      const provider = new ethers.providers.Web3Provider((window as any).ethereum)
      const signer = provider.getSigner()
      return { provider, signer }
    }

    const checkBalance = async function () {
      if (!walletStore.address) return
      errorMessage.value = ''

      try {
        // Use a direct JsonRpcProvider to Harmony for balance reads.
        // MetaMask's injected provider on Harmony testnet can return stale/zero
        // balances — bypassing it gives a reliable read.
        const rpcUrl = import.meta.env.VITE_DESTINATION_NETWORK_RPC as string
        const readProvider = new ethers.providers.JsonRpcProvider(rpcUrl)
        const currentContract = new ethers.Contract(
          destinationTokenAddress,
          DAKADollars.abi,
          readProvider
        )

        console.log('Checking D-CHSD balance for:', walletStore.address)
        console.log('On destination contract:', destinationTokenAddress)

        let balance = await currentContract.balanceOf(walletStore.address)
        ;(walletBalance as any).value = ethers.utils.formatUnits(balance, 18)
        console.log('D-CHSD Balance:', walletBalance.value)
      } catch (error) {
        console.error('Error checking balance', error)
        errorMessage.value = 'Could not fetch your D-CHSD balance. Make sure you are connected to ' + destinationNetwork + '.'
      }
    }

    const sendTokens = async function () {
      errorMessage.value = ''

      // Validate amount
      if (!amount.value || Number(amount.value) <= 0) {
        errorMessage.value = 'Please enter a valid amount.'
        return
      }

      // Validate balance
      if (Number(amount.value) > Number(walletBalance.value)) {
        errorMessage.value = `Insufficient D-CHSD balance. You have ${walletBalance.value} but tried to send ${amount.value}.`
        return
      }

      // Check that user is not sending to their own address (bridge wallet misconfiguration)
      if (walletStore.address.toLowerCase() === (bridgeWallet as any).toLowerCase()) {
        errorMessage.value = 'Your wallet address is the same as the bridge wallet. Please use a different wallet address.'
        return
      }

      const amountFormatted = ethers.utils.parseUnits(amount.value, 18)
      console.log('amountFormatted :>> ', amountFormatted)
      console.log('amountFormatted.toString() :>> ', amountFormatted.toString())

      if (typeof (window as any).ethereum !== 'undefined') {
        // Verify network before sending
        const onCorrectNetwork = await isOnCorrectNetwork()
        if (!onCorrectNetwork) {
          errorMessage.value = 'Please switch to ' + destinationNetwork + ' before sending.'
          return
        }

        trxInProgress.value = true

        try {
          // Re-create provider/signer/contract to ensure we're on the right network
          const { signer } = getFreshProviderAndSigner()
          const freshContract = new ethers.Contract(
            destinationTokenAddress,
            DAKADollars.abi,
            signer
          )

          const gasPrice = await signer.getGasPrice()
          const transaction = await freshContract.transfer(
            bridgeWallet,
            amountFormatted.toString(),
            { type: 0, gasPrice }   // Harmony Testnet doesn't support EIP-1559 (type-2)
          )

          console.log('transaction :>> ', transaction)
          // wait for the transaction to actually settle in the blockchain
          await transaction.wait()
          amount.value = ''
          trxInProgress.value = false
          // Refresh balance after successful transfer
          await checkBalance()
        } catch (error: any) {
          console.error(error)
          trxInProgress.value = false
          // Parse common ERC20 revert reasons for user-friendly messages
          const reason = error?.data?.message || error?.message || ''
          if (reason.includes('transfer amount exceeds balance')) {
            errorMessage.value = 'Transfer failed: you do not have enough D-CHSD tokens. Bridge CHSD from ' + originNetwork + ' first.'
          } else if (reason.includes('user rejected')) {
            errorMessage.value = 'Transaction was rejected in your wallet.'
          } else {
            errorMessage.value = 'Transaction failed. Please check the console for details.'
          }
        }
      }
    }

    return {
      walletStore,
      trxInProgress,
      errorMessage,
      amount,
      walletBalance,
      sendTokens,
      checkBalance,
      originNetwork,
      destinationNetworkId,
      destinationNetwork,
      ONE,
    }
  },

  async mounted() {
    // If wallet was already connected (e.g. navigating from Origin page),
    // the watcher won't fire because the address hasn't changed.
    // Only check balance if we're on the correct network already.
    if (useWalletStore().address) {
      await this.checkBalance()
    }
  },

  computed: {
    accAvailable() {
      return useWalletStore().address
    },
  },
  watch: {
    async accAvailable(newVal, old) {
      console.log(`updating from ${old} to ${newVal}`)
      await this.checkBalance()
    },
  },
})
</script>
