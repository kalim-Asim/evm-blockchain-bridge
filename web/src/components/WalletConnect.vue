<template>
  <div>
    <!-- Wrong network -->
    <button
      v-if="!network_ok"
      @click="switchOrAdd()"
      class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors duration-150"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      Switch to {{ targetNetwork }}
    </button>

    <!-- Connected -->
    <div
      v-else-if="walletStore.address"
      class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      <span class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
      {{ walletStore.acc_short }}
    </div>

    <!-- Connect wallet -->
    <button
      v-else
      @click="connectWallet()"
      class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors duration-150"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
      Connect Wallet
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'

import { useWalletStore } from '../stores/wallet'

export default defineComponent({
  async mounted() {
    await this.checkNetwork()
  },
  computed: {},
  props: {
    targetNetwork: {
      type: String,
      required: true,
      // defaul: 'mainnet',
    },
    targetNetworkId: {
      type: String,
      required: true,
      // defaul: '0x1',
    },
    currency: {
      type: String,
      required: true,
    },
    decimals: {
      type: Number,
      required: true,
    },
    isNewNetwork: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  setup(props) {
    console.log('props :>> ', props)
    const walletStore = useWalletStore()

    const network_ok = ref<boolean>(false)

    // checks if current chain matches with the one provided in env variable
    const checkNetwork = async () => {
      console.log(`Target network is ${props.targetNetworkId}`)
      if ((window as any).ethereum) {
        const currentChainId = await (window as any).ethereum.request({
          method: 'eth_chainId',
        })
        console.log('Current network  :>> ', currentChainId)

        if (currentChainId == props.targetNetworkId) network_ok.value = true
      }
    }

    const switchOrAdd = () => {
      props.isNewNetwork ? addNetwork() : switchNetwork()
    }

    const addNetwork = async () => {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: props.targetNetworkId,
            chainName: props.targetNetwork,
            rpcUrls: [import.meta.env.VITE_DESTINATION_NETWORK_RPC],
            nativeCurrency: {
              name: props.currency,
              symbol: props.currency, // 2-6 characters long
              decimals: props.decimals,
            },
          },
        ],
      })
      // refresh
      window.location.reload()
    }
    // switches network to the one provided in env variable
    const switchNetwork = async () => {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: props.targetNetworkId }],
      })
      // refresh
      window.location.reload()
    }
    // checks network and connects wallet
    const connectWallet = async () => {
      if (!network_ok.value) await switchNetwork()
      try {
        const data = await (window as any).ethereum.request({
          method: 'eth_requestAccounts',
        })
        console.log('data :>> ', data)

        walletStore.saveWalletData({
          address: data[0],
          network: props.targetNetwork,
        })
        console.log('DApp connected to your wallet 💰')
      } catch (error) {
        console.error('Error connecting DApp to your wallet')
        console.error(error)
      }
    }
    return {
      connectWallet,
      walletStore,
      checkNetwork,

      network_ok,

      switchOrAdd,
    }
  },
})
</script>
