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

        <!-- Balance display -->
        <div class="px-6 pt-5 pb-3">
          <p class="text-xs text-slate-400">
            Balance:
            <span class="text-slate-600 font-medium">{{ balanceDisplay }} CHSD</span>
          </p>
        </div>

        <!-- Unified Traffic Injector -->
        <div class="px-6 py-5">
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-slate-700">Bridge Traffic Injector</label>
            <span class="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-500 rounded-md">AI-Evaluated</span>
          </div>
          <p class="text-xs text-slate-500 mb-4 leading-relaxed">
            Enter the number of transactions and click Send. The AI decides the outcome.<br/>
            • <strong class="text-emerald-600">1 – 9 tx:</strong> Sent as <strong>NORMAL</strong> traffic via MetaMask (real on-chain transfers)<br/>
            • <strong class="text-red-500">10+ tx:</strong> Flagged as <strong>ATTACK</strong> pattern (simulated high-speed DDoS flood)
          </p>
          <div class="flex gap-2">
            <input
              type="number"
              v-model.number="dynamicCount"
              min="1"
              max="1000"
              placeholder="Number of transactions"
              class="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <button
              type="button"
              @click="sendDynamicTraffic"
              :disabled="trxInProgress"
              class="flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold text-white transition-colors duration-150 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              :class="dynamicCount >= 10 ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'"
            >
              <svg v-if="trxInProgress" class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              {{ dynamicCount >= 10 ? 'Simulate Attack' : 'Send Traffic' }}
            </button>
          </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-slate-100 mx-6"></div>

        <!-- Activity log -->
        <div class="px-6 py-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-slate-700">Activity Log</p>
              <span class="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{{ logs.length }} entries</span>
            </div>
            <button
              v-if="logs.length > 0"
              @click="logs = []"
              class="text-[10px] px-2 py-1 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-md transition-colors font-medium"
            >Clear</button>
          </div>
          <div class="bg-slate-900 rounded-xl p-5 max-h-[50vh] overflow-y-auto" style="scrollbar-width: thin; scrollbar-color: #475569 transparent;">
            <div
              v-for="(entry, idx) in logs"
              :key="idx"
              class="font-mono text-xs mb-1.5 leading-relaxed"
              :class="entry.includes('ATTACK') || entry.includes('🚨') ? 'text-red-400' : entry.includes('✅') ? 'text-emerald-400' : 'text-slate-300'"
            >{{ entry }}</div>
            <div v-if="logs.length === 0" class="text-slate-500 font-mono text-xs py-8 text-center">Waiting for activity…</div>
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
import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import { ethers } from 'ethers'

export default defineComponent({
  name: 'SimulatorView',
  setup() {
    const CHSD_CONTRACT_ADDRESS = import.meta.env.VITE_ORIGIN_TOKEN_ADDRESS
    const BRIDGE_WALLET = import.meta.env.VITE_BRIDGE_WALLET
    const ERC20_ABI = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address owner) view returns (uint256)'
    ]

    const amount = ref('1')
    const dynamicCount = ref(1)
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

    const sendDynamicTraffic = async () => {
      const count = Number(dynamicCount.value) || 1
      if (count < 10) {
        // Normal traffic — send real on-chain transactions via MetaMask
        trxInProgress.value = true
        try {
          for (let i = 0; i < count; i++) {
            addLog(`Sending normal transfer ${i + 1}/${count} via MetaMask...`)
            await sendTransfer(ethers.utils.parseUnits('1', 18))
            if (i < count - 1) await new Promise(r => setTimeout(r, 3000))
          }
        } catch (err: any) {
          addLog('Transfer failed: ' + (err.message || err))
        } finally {
          trxInProgress.value = false
        }
      } else {
        // Attack pattern — simulate high-speed flood directly to backend
        simulate('ddos', count)
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

    const simulate = async (type: string, overrideCount?: number) => {
      const count = overrideCount || (type === 'flash' ? 50 : 30)
      addLog(`Initiating ${type.toUpperCase()} pattern via backend (${count} tx)...`)
      
      // Visual fireworks in the activity log
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const fakeHash = '0x' + Array.from({length: 8}, () => Math.floor(Math.random()*16).toString(16)).join('')
          addLog(`[Tx ${i+1}/${count}] INJECT mock-hash-${fakeHash} ...`)
        }, i * (type === 'flash' ? 20 : 60))
      }

      setTimeout(async () => {
        await sendToBackend({ type: type === 'flash' ? 'flash_burst' : 'ddos', count, from: account.value || '0xSimulatedUser' })
        addLog(`>> Attack payload fully deployed to bridge backend.`)
      }, count * (type === 'flash' ? 20 : 60) + 100)
    }

    let es: EventSource | null = null

    onMounted(() => {
      // Connect to SSE so the simulator tab also shows the AI response in real-time
      es = new EventSource('http://localhost:3001/events')
      es.onmessage = (e: MessageEvent) => {
        try {
          const alert = JSON.parse(e.data)
          if (alert.prediction === 1) {
            addLog(`🚨 [SVM ML] ATTACK INTERCEPTED! Pattern: ${alert.label}`)
            addLog(`   => Confidence: ${(alert.confidence * 100).toFixed(1)}% | Txs Blocked: ${alert.txCount}`)
          } else if (alert.prediction === 0) {
            addLog(`✅ [SVM ML] Traffic analysis clean. Confidence: ${(alert.confidence * 100).toFixed(1)}%`)
          }
        } catch {}
      }
    })

    onUnmounted(() => {
      if (es) es.close()
    })

    return {
      dynamicCount, logs, account, balance,
      accountShort, balanceDisplay, trxInProgress,
      connectWallet, sendDynamicTraffic,
    }
  }
})
</script>