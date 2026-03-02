<template>
  <div class="text-center pt-12">
    <h1 class="text-2xl font-bold mb-8">
      Bridge from {{destinationNetwork}} to {{originNetwork}}
    </h1>

    <p>
      This bridge allows you to send ChainstackDollars (D-CHSD) from {{destinationNetwork}} back to {{originNetwork}}
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
      <p class="text-xs mt-1">Your balance is: {{ walletBalance }}</p>

      <button
        type="button"
        class="inline-flex items-center px-4 py-2 mt-4 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
import DChainstackDollars from '../artifacts/contracts/DestinationToken.sol/DChainstackDollars.json'
import ChainstackDollars from '../artifacts/contracts/OriginToken.sol/ChainstackDollars.json'

export default defineComponent({
  components: { WalletConnect },
  setup() {
    const trxInProgress = ref<boolean>(false)

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

    const provider = new ethers.providers.Web3Provider((window as any).ethereum)
    // get the account that will pay for the trasaction
    const signer = provider.getSigner()

    let contract = new ethers.Contract(
      destinationTokenAddress,
      DChainstackDollars.abi,
      signer
    )

    let ethContract = new ethers.Contract(
      originTokenAddress,
      ChainstackDollars.abi,
      signer
    )

    const checkBalance = async function () {
      if (!walletStore.address) return; // Guard clause
      
      try {
        // 1. Re-initialize provider and contract to catch network changes
        const currentProvider = new ethers.providers.Web3Provider((window as any).ethereum);
        const currentContract = new ethers.Contract(
          destinationTokenAddress,
          DChainstackDollars.abi,
          currentProvider // Use provider for read-only calls
        );

        console.log('Checking balance for:', walletStore.address);
        
        // 2. This fetches D-CHSD Token balance
        let balance = await currentContract.balanceOf(walletStore.address);
        
        // 3. (Optional) If you want to see your native ONE balance for debugging:
        // let nativeBal = await currentProvider.getBalance(walletStore.address);
        // console.log('Native ONE Balance:', ethers.utils.formatEther(nativeBal));

        (walletBalance as any).value = ethers.utils.formatUnits(balance, 18);
        console.log('D-CHSD Balance:', walletBalance.value);
      } catch (error) {
        console.error('Error checking balance', error);
      }
    }

    const sendTokens = async function () {
      const amountFormatted = ethers.utils.parseUnits(amount.value, 18)
      console.log('amountFormatted :>> ', amountFormatted)
      console.log('amountFormatted.toString() :>> ', amountFormatted.toString())

      if (typeof (window as any).ethereum !== 'undefined') {
        trxInProgress.value = true
        // const provider = new ethers.providers.Web3Provider(window.ethereum)
        // get the account that will pay for the trasaction
        // const signer = provider.getSigner()
        // as the operation we're going to do is a transaction,
        // we pass the signer instead of the provider
        // const contract = new ethers.Contract(
        //   contractAddress,
        //   ChainstackDollars.abi,
        //   signer
        // )

        try {
          const transaction = await contract.transfer(
            bridgeWallet,
            amountFormatted.toString()
          )

          console.log('transaction :>> ', transaction)
          // wait for the transaction to actually settle in the blockchain
          await transaction.wait()
          amount.value = ''
          trxInProgress.value = false
        } catch (error) {
          console.error(error)
          trxInProgress.value = false
        }
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
      destinationNetworkId,
      destinationNetwork,
      ONE,
    }
  },

  mounted() {},

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
