<template>
  <div class="py-12 px-4">
    <div class="max-w-md mx-auto">

      <!-- Simulator card -->
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-5 border-b border-slate-100">
          <h1 class="text-lg font-semibold text-slate-900">Bridge Transaction Simulator</h1>
          <p class="text-sm text-slate-500 mt-0.5">Send CHSD from your wallet to the bridge (Sepolia)</p>
        </div>

        <!-- Network route -->
        <div class="px-6 pt-5 pb-4 flex items-center gap-3">
          <div class="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p class="text-xs text-slate-400 mb-1 uppercase tracking-wide">From</p>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
              <span class="text-sm font-medium text-slate-800">Sepolia</span>
            </div>
          </div>

          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>

          <div class="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <p class="text-xs text-slate-400 mb-1 uppercase tracking-wide">To</p>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0"></span>
              <span class="text-sm font-medium text-slate-800">Bridge Wallet</span>
            </div>
          </div>
        </div>

        <!-- Connect wallet button -->
        <div class="px-6 pb-5">
          <button
            type="button"
            @click="connectWallet"
            class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>{{ account ? accountShort : 'Connect Wallet' }}</span>
          </button>
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
              id="amount"
              placeholder="0.00"
              class="w-full px-4 py-3 pr-20 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 text-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 select-none">CHSD</span>
          </div>
          <p class="text-xs text-slate-400 mt-2">
            Balance:
            <span class="text-slate-600 font-medium">{{ balanceDisplay }} CHSD</span>
          </p>
        </div>

        <!-- Send 1 action -->
        <div class="px-6 pb-4">
          <button
            type="button"
            @click="sendOne"
            :disabled="trxInProgress"
            class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <svg v-if="trxInProgress" class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>{{ trxInProgress ? 'Processing…' : 'Send 1 CHSD' }}</span>
            <svg v-if="!trxInProgress" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        <!-- Send 5x action -->
        <div class="px-6 pb-6">
          <button
            type="button"
            @click="sendFive"
            :disabled="trxInProgress"
            class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <span>Send 5× CHSD</span>
            <svg v-if="!trxInProgress" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

        <!-- Divider -->
        <div class="border-t border-slate-100 mx-6"></div>

        <!-- Batch send -->
        <div class="px-6 py-5">
          <label class="block text-sm font-medium text-slate-700 mb-2">Batch Send</label>
          <div class="flex gap-2">
            <input
              type="number"
              v-model.number="batchCount"
              min="1"
              placeholder="Count"
              class="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <button
              type="button"
              @click="sendBatch"
              class="flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 transition-colors duration-150"
            >
              Send Batch
            </button>
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-slate-100 mx-6"></div>

        <!-- Attack simulations -->
        <div class="px-6 py-5">
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-medium text-slate-700">Attack Simulations</p>
            <span class="text-xs text-slate-400">For anomaly testing</span>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              @click="simulate('flash')"
              class="flex-1 flex items-center justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors duration-150"
            >
              Flash Burst
            </button>
            <button
              type="button"
              @click="simulate('ddos')"
              class="flex-1 flex items-center justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors duration-150"
            >
              DDoS Pattern
            </button>
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-slate-100 mx-6"></div>

        <!-- Activity log -->
        <div class="px-6 py-5">
          <p class="text-sm font-medium text-slate-700 mb-2">Activity Log</p>
          <div class="bg-slate-900 rounded-xl p-4 max-h-48 overflow-auto">
            <div
              v-for="(entry, idx) in logs"
              :key="idx"
              class="text-emerald-400 font-mono text-xs mb-1 leading-relaxed"
            >{{ entry }}</div>
            <div v-if="logs.length === 0" class="text-slate-500 font-mono text-xs">No activity yet…</div>
          </div>
        </div>

      </div>

      <!-- Helper note -->
      <p class="text-center text-xs text-slate-400 mt-4">
        Simulator sends real on-chain transactions on the Sepolia testnet.
      </p>

    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue'
import { ethers } from 'ethers'

export default defineComponent({
  name: 'SimulatorView',
  setup() {
    const CHSD_CONTRACT_ADDRESS = '0xC9971B252B980fF08705cF28D554e34347fe2e23'
    const BRIDGE_WALLET = '0x95d524475F9af10b8745333Dbae73cba7d831272'
    const ERC20_ABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address owner) view returns (uint256)'
    ]

    const amount = ref('1')
    const batchCount = ref(10)
    const logs = ref<string[]>([])
    const account = ref<string | null>(null)
    const balance = ref<string>('-')
    const trxInProgress = ref(false)

    const accountShort = computed(() =>
      account.value
        ? account.value.slice(0, 6) + '…' + account.value.slice(-4)
        : ''
    )
    const balanceDisplay = computed(() => balance.value)

    const addLog = (msg: string) => {
      const time = new Date().toLocaleTimeString()
      logs.value.unshift(`[${time}] ${msg}`)
      if (logs.value.length > 200) logs.value.pop()
    }

    let provider: ethers.providers.Web3Provider | null = null
    let signer: ethers.Signer | null = null

    const connectWallet = async () => {
      try {
        if (!window.ethereum) throw new Error('MetaMask not found')
        provider = new ethers.providers.Web3Provider(window.ethereum as any)
        await provider.send('eth_requestAccounts', [])
        signer = provider.getSigner()
        account.value = await signer.getAddress()
        addLog('Connected: ' + account.value)
        await refreshBalance()
      } catch (err: any) {
        addLog('Connect failed: ' + (err.message || err))
      }
    }

    const refreshBalance = async () => {
      try {
        if (!provider || !account.value) return
        const token = new ethers.Contract(CHSD_CONTRACT_ADDRESS, ERC20_ABI, provider)
        const bal = await token.balanceOf(account.value)
        balance.value = ethers.utils.formatUnits(bal, 18)
      } catch {
        balance.value = '-'
      }
    }

    const sendTransfer = async (amtWei: ethers.BigNumber) => {
      if (!signer) await connectWallet()
      if (!signer) throw new Error('No signer')
      const token = new ethers.Contract(CHSD_CONTRACT_ADDRESS, ERC20_ABI, signer)
      addLog('Sending transfer...')
      const tx = await token.transfer(BRIDGE_WALLET, amtWei)
      addLog('Tx submitted: ' + tx.hash)
      tx.wait().then(() => {
        addLog('Tx confirmed: ' + tx.hash)
        refreshBalance()
      }).catch((err: any) => {
        addLog('Confirmation failed: ' + (err.message || err))
      })
      return tx.hash
    }

    const sendOne = async () => {
      trxInProgress.value = true
      try {
        await sendTransfer(ethers.utils.parseUnits('1', 18))
      } catch (err: any) {
        addLog('Transfer failed: ' + (err.message || err))
      } finally {
        trxInProgress.value = false
      }
    }

    const sendFive = async () => {
      trxInProgress.value = true
      try {
        for (let i = 0; i < 5; i++) {
          addLog(`Sending ${i + 1}/5`)
          await sendTransfer(ethers.utils.parseUnits('1', 18))
          await new Promise(r => setTimeout(r, 3000))
        }
      } catch (err: any) {
        addLog('Transfer failed: ' + (err.message || err))
      } finally {
        trxInProgress.value = false
      }
    }

    const sendBatch = async () => {
      const count = Number(batchCount.value) || 1
      addLog(`Sending batch of ${count} transfers`)
      for (let i = 0; i < count; i++) {
        sendTransfer(ethers.utils.parseUnits('1', 18)).catch(() => {})
      }
    }

    const sendToBackend = async (data: any) => {
      try {
        await fetch('http://localhost:3001/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } catch (e: any) {
         addLog('Backend mock error: ' + e.message)
      }
    }

    const simulate = async (type: string) => {
      if (type === 'flash') {
        addLog('Flash burst initiated via backend (50 tx)')
        await sendToBackend({ type: 'flash_burst', count: 50, from: account.value || '0xSimulatedUser' })
      } else if (type === 'ddos') {
        addLog('DDoS pattern initiated via backend (30 tx)')
        await sendToBackend({ type: 'ddos', count: 30, from: account.value || '0xSimulatedUser' })
      }
    }

    onMounted(() => {})

    return {
      amount, batchCount, logs, account, balance,
      accountShort, balanceDisplay, trxInProgress,
      connectWallet, sendOne, sendFive, sendBatch, simulate,
    }
  }
})
</script>