<template>
  <div class="py-12 px-4">
    <div class="max-w-md mx-auto">

      <!-- Bridge card -->
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-100">
          <h1 class="text-lg font-semibold text-slate-900">Bridge Back</h1>
          <p class="text-sm text-slate-500 mt-0.5">
            Send D-CHSD from {{ destinationNetwork }} back to {{ originNetwork }}
          </p>
        </div>

        <!-- Network route -->
        <div class="px-6 pt-5 pb-4 flex items-center gap-3">
          <div class="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p class="text-xs text-slate-400 mb-1 uppercase tracking-wide">From</p>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0"></span>
              <span class="text-sm font-medium text-slate-800">{{ destinationNetwork }}</span>
            </div>
          </div>

          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>

          <div class="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p class="text-xs text-slate-400 mb-1 uppercase tracking-wide">To</p>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
              <span class="text-sm font-medium text-slate-800">{{ originNetwork }}</span>
            </div>
          </div>
        </div>

        <!-- Wallet -->
        <div class="px-6 pb-5">
          <WalletConnect
            :targetNetwork="destinationNetwork"
            :targetNetworkId="destinationNetworkId"
            currency="ONE"
            :decimals="18"
            :isNewNetwork="true"
          />
        </div>

        <!-- Divider -->
        <div class="border-t border-slate-100 mx-6"></div>

        <!-- Amount -->
        <div class="px-6 py-5">
          <label class="block text-sm font-medium text-slate-700 mb-2">Amount</label>
          <div class="relative">
            <input
              type="text"
              v-model="amount"
              id="price"
              placeholder="0.00"
              class="w-full px-4 py-3 pr-24 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 text-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 select-none">D-CHSD</span>
          </div>
          <p class="text-xs text-slate-400 mt-2">
            Balance:
            <span class="text-slate-600 font-medium">{{ walletBalance }} D-CHSD</span>
          </p>
        </div>

        <!-- Alerts -->
        <div class="px-6 space-y-3 pb-1">
          <!-- Error -->
          <div v-if="errorMessage" class="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm text-red-700">{{ errorMessage }}</p>
          </div>

          <!-- Zero balance info -->
          <div
            v-if="walletStore.address && Number(walletBalance) === 0 && !errorMessage"
            class="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm text-amber-700">
              Your D-CHSD balance is 0. If you recently bridged from {{ originNetwork }}, wait a few minutes for the bridge to process your transaction, then refresh.
            </p>
          </div>
        </div>

        <!-- Action -->
        <div class="px-6 py-5">
          <button
            type="button"
            @click="sendTokens"
            class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            :disabled="trxInProgress || Number(walletBalance) <= 0"
          >
            <svg v-if="trxInProgress" class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>{{ trxInProgress ? 'Processing…' : `Bridge to ${originNetwork}` }}</span>
            <svg v-if="!trxInProgress" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

      </div>

      <!-- Helper note -->
      <p class="text-center text-xs text-slate-400 mt-4">
        Tokens are burned on {{ destinationNetwork }} and released on {{ originNetwork }}.
      </p>

    </div>
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
