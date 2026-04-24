<template>
  <div class="py-12 px-4">
    <div class="max-w-4xl mx-auto">

      <!-- Page header -->
      <div class="flex items-start justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900 tracking-tight">Security Monitor</h1>
          <p class="text-sm text-slate-500 mt-1">SVM anomaly detection · 60-second classification windows</p>
        </div>
        <div
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium"
          :class="connected
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-600'"
        >
          <span
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :class="connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'"
          ></span>
          {{ connected ? 'Live' : 'Offline' }}
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

        <div class="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-5">
          <p class="text-xs text-slate-400 uppercase tracking-widest mb-3">Windows Analyzed</p>
          <p class="text-4xl font-bold tabular-nums text-slate-900">{{ totalWindows }}</p>
        </div>

        <div
          class="bg-white rounded-2xl shadow-sm px-6 py-5 transition-all duration-300"
          :class="attackCount > 0
            ? 'border border-red-200 ring-1 ring-red-100'
            : 'border border-slate-200'"
        >
          <p
            class="text-xs uppercase tracking-widest mb-3"
            :class="attackCount > 0 ? 'text-red-500' : 'text-slate-400'"
          >Attacks Detected</p>
          <p
            class="text-4xl font-bold tabular-nums"
            :class="attackCount > 0 ? 'text-red-500' : 'text-slate-900'"
          >{{ attackCount }}</p>
        </div>

        <div class="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-5">
          <p class="text-xs text-slate-400 uppercase tracking-widest mb-3">Last Detection</p>
          <template v-if="lastAlert">
            <p
              class="text-sm font-semibold"
              :class="lastAlert.prediction === 1 ? 'text-red-500' : 'text-emerald-600'"
            >{{ lastAlert.label }}</p>
            <p class="text-xs text-slate-400 mt-1 font-mono">{{ formatTime(lastAlert.timestamp) }}</p>
          </template>
          <p v-else class="text-sm text-slate-300">—</p>
        </div>

      </div>

      <!-- Attack alert banner -->
      <div
        v-if="flashAttack"
        class="mb-6 flex items-start gap-4 bg-white border border-red-200 rounded-2xl shadow-sm px-5 py-4"
      >
        <div class="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-slate-900">Attack Detected</p>
          <p class="text-xs text-slate-500 mt-0.5 font-mono">
            {{ flashAttack.label }} · {{ (flashAttack.confidence * 100).toFixed(1) }}% confidence ·
            {{ flashAttack.txCount }} tx · {{ flashAttack.uniqueSenders }} unique senders
          </p>
        </div>
        <span class="text-xs text-slate-400 font-mono flex-shrink-0">{{ formatTime(flashAttack.timestamp) }}</span>
      </div>

      <!-- Detection log -->
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

        <!-- Log header -->
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-700">Detection Log</h2>
          <span class="text-xs text-slate-400 font-mono">newest first</span>
        </div>

        <!-- Empty state -->
        <div v-if="alerts.length === 0" class="py-20 text-center">
          <div class="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p class="text-sm text-slate-500 font-medium">No events yet</p>
          <p class="text-xs text-slate-400 mt-1.5 font-mono">cd backend &amp;&amp; node simulate-attack.js</p>
        </div>

        <!-- Log rows -->
        <div v-else class="divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
          <div
            v-for="(alert, i) in alerts"
            :key="alert.timestamp + '-' + i"
            class="px-6 py-4 flex items-center gap-5 transition-colors duration-100"
            :class="alert.prediction === 1 ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50/70'"
          >

            <!-- Status icon -->
            <div
              class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              :class="alert.prediction === 1 ? 'bg-red-100' : 'bg-emerald-50'"
            >
              <svg v-if="alert.prediction === 1" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <!-- Label badge -->
            <div class="w-20 flex-shrink-0">
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-md"
                :class="alert.prediction === 1
                  ? 'bg-red-100 text-red-600'
                  : 'bg-emerald-50 text-emerald-600'"
              >{{ alert.label }}</span>
            </div>

            <!-- Confidence bar -->
            <div class="flex-1 min-w-0">
              <div class="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Confidence</span>
                <span
                  class="font-medium"
                  :class="alert.prediction === 1 ? 'text-red-500' : 'text-emerald-600'"
                >{{ (alert.confidence * 100).toFixed(1) }}%</span>
              </div>
              <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :class="alert.prediction === 1 ? 'bg-red-400' : 'bg-emerald-400'"
                  :style="{ width: (alert.confidence * 100) + '%' }"
                ></div>
              </div>
            </div>

            <!-- Metrics -->
            <div class="hidden md:flex gap-5 text-xs font-mono flex-shrink-0">
              <span class="text-slate-400">tx=<span class="text-slate-600">{{ alert.txCount }}</span></span>
              <span class="text-slate-400">senders=<span class="text-slate-600">{{ alert.uniqueSenders }}</span></span>
              <span class="text-slate-400">
                pair_ratio=<span :class="alert.samePairRatio > 0.5 ? 'text-red-500 font-medium' : 'text-slate-600'">
                  {{ alert.samePairRatio.toFixed(2) }}
                </span>
              </span>
            </div>

            <!-- Timestamp -->
            <span class="text-xs text-slate-400 font-mono flex-shrink-0">{{ formatTime(alert.timestamp) }}</span>

          </div>
        </div>

      </div>

      <!-- Footer note -->
      <p class="text-center text-xs text-slate-400 mt-4">
        Classification runs every 60 seconds · powered by SVM with RBF kernel
      </p>

    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue'

interface AlertEvent {
  prediction: number
  label: string
  confidence: number
  txCount: number
  uniqueSenders: number
  samePairRatio: number
  timestamp: number
}

export default defineComponent({
  setup() {
    const connected = ref(false)
    const alerts = ref<AlertEvent[]>([])
    const flashAttack = ref<AlertEvent | null>(null)
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let flashTimer: ReturnType<typeof setTimeout> | null = null

    const totalWindows = computed(() => alerts.value.length)
    const attackCount = computed(() => alerts.value.filter(a => a.prediction === 1).length)
    const lastAlert = computed(() => alerts.value[0] ?? null)

    const formatTime = (ts: number) => {
      return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
    }

    const handleAlert = (alert: AlertEvent) => {
      alerts.value.unshift(alert)
      if (alerts.value.length > 50) alerts.value.pop()

      if (alert.prediction === 1) {
        flashAttack.value = alert
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => { flashAttack.value = null }, 8000)
      }
    }

    const connect = () => {
      if (es) { es.close(); es = null }

      const source = new EventSource('http://localhost:3001/events')

      source.onopen = () => { connected.value = true }

      source.onmessage = (e: MessageEvent) => {
        try { handleAlert(JSON.parse(e.data)) } catch {}
      }

      source.onerror = () => {
        connected.value = false
        source.close()
        es = null
        reconnectTimer = setTimeout(connect, 3000)
      }

      es = source
    }

    onMounted(connect)

    onUnmounted(() => {
      if (es) es.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (flashTimer) clearTimeout(flashTimer)
    })

    return { connected, alerts, totalWindows, attackCount, lastAlert, flashAttack, formatTime }
  },
})
</script>
