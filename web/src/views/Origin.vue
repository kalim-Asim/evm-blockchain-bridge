<template>
  <div class="py-12 px-4">
    <div class="max-w-md mx-auto">

      <!-- Bridge card -->
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-100">
          <h1 class="text-lg font-semibold text-slate-900">Bridge Tokens</h1>
          <p class="text-sm text-slate-500 mt-0.5">
            Send CHSD from {{ originNetwork }} to {{ destinationNetwork }}
          </p>
        </div>

        <!-- Network route -->
        <div class="px-6 pt-5 pb-4 flex items-center gap-3">
          <div class="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p class="text-xs text-slate-400 mb-1 uppercase tracking-wide">From</p>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
              <span class="text-sm font-medium text-slate-800">{{ originNetwork }}</span>
            </div>
          </div>

          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>

          <div class="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p class="text-xs text-slate-400 mb-1 uppercase tracking-wide">To</p>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0"></span>
              <span class="text-sm font-medium text-slate-800">{{ destinationNetwork }}</span>
            </div>
          </div>
        </div>

        <!-- Wallet -->
        <div class="px-6 pb-5">
          <WalletConnect
            :targetNetwork="originNetwork"
            :targetNetworkId="originNetworkId"
            :currency="ETH"
            :decimals="18"
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
              class="w-full px-4 py-3 pr-20 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 text-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 select-none">CHSD</span>
          </div>
          <p class="text-xs text-slate-400 mt-2">
            Balance:
            <span class="text-slate-600 font-medium">{{ walletBalance }} CHSD</span>
          </p>
        </div>

        <!-- Action -->
        <div class="px-6 pb-6">
          <button
            type="button"
            @click="sendTokens"
            class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            :disabled="trxInProgress"
          >
            <svg v-if="trxInProgress" class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>{{ trxInProgress ? 'Processing…' : `Bridge to ${destinationNetwork}` }}</span>
            <svg v-if="!trxInProgress" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        <!-- Success -->
        <div v-if="bridgedOk" class="mx-6 mb-6 flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p class="text-sm text-emerald-700 font-medium">
            Tokens bridged to {{ destinationNetwork }} successfully.
          </p>
        </div>

      </div>

      <!-- Helper note -->
      <p class="text-center text-xs text-slate-400 mt-4">
        Bridged tokens typically arrive within 30–60 seconds.
      </p>

    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { ethers, BigNumber } from 'ethers'

import { useWalletStore } from '../stores/wallet'
import WalletConnect from '@/components/WalletConnect.vue'

import AKADollars from '../artifacts/contracts/OriginToken.sol/AKADollars.json'

export default defineComponent({
  components: { WalletConnect },
  setup() {
    const trxInProgress = ref<boolean>(false)
    const bridgedOk = ref<boolean>(false)

    const walletStore = useWalletStore()
    const amount = ref<string>('')
    const walletBalance = ref<number>(0)
    const ETH = 'ETH'

    const originTokenAddress = import.meta.env.VITE_ORIGIN_TOKEN_ADDRESS as string

    const originNetwork = import.meta.env.VITE_ORIGIN_NETWORK_NAME
    const originNetworkId = import.meta.env.VITE_ORIGIN_NETWORK_ID
    const destinationNetwork = import.meta.env.VITE_DESTINATION_NETWORK_NAME

    const bridgeWallet = import.meta.env.VITE_BRIDGE_WALLET

    const getContract = () => {
      const provider = new ethers.providers.Web3Provider((window as any).ethereum)
      const signer = provider.getSigner()
      return new ethers.Contract(originTokenAddress, AKADollars.abi, signer)
    }

    const checkBalance = async function () {
      if (!(window as any).ethereum || !walletStore.address) return
      try {
        const contract = getContract()
        let balance = await contract.balanceOf(walletStore.address)
        balance = ethers.utils.formatUnits(balance, 18)
        console.log('balance :>> ', balance)
        walletBalance.value = balance
      } catch (error) {
        console.error('Error checking balance', error)
      }
    }

    const sendTokens = async function () {
      if (typeof (window as any).ethereum === 'undefined') return
      const amountFormatted = ethers.utils.parseUnits(amount.value, 18)
      trxInProgress.value = true

      try {
        const contract = getContract()
        const transaction = await contract.transfer(
          bridgeWallet,
          amountFormatted.toString()
        )

        console.log('transaction :>> ', transaction)
        await transaction.wait()
        bridgedOk.value = true
        amount.value = ''
        trxInProgress.value = false
      } catch (error) {
        console.error(error)
        trxInProgress.value = false
      }
    }

    return {
      walletStore,
      trxInProgress,
      amount,
      walletBalance,
      sendTokens,
      checkBalance,
      originNetwork,
      originNetworkId,
      destinationNetwork,
      bridgedOk,
      ETH,
    }
  },

  async mounted() {
    // If wallet was already connected (e.g. navigating back from Destination page),
    // the watcher won't fire because the address hasn't changed.
    // So we need to check the balance immediately on mount.
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
