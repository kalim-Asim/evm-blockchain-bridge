<template>
  <nav class="bg-slate-900 border-b border-slate-800">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">

        <!-- Logo -->
        <div class="flex items-center gap-2.5 flex-shrink-0">
          <div class="w-7 h-7 bg-indigo-500 rounded-md flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <span class="text-white font-semibold text-base tracking-tight">AKA Bridge</span>
        </div>

        <!-- Navigation links -->
        <div class="flex items-center gap-1">
          <router-link
            v-for="link in links"
            :key="link.name"
            :to="link.to"
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150"
            :class="$route.name === link.name
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'"
          >{{ link.label }}</router-link>
        </div>

        <!-- Chain status -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
          <span class="text-xs text-slate-500 font-mono">Sepolia ↔ Harmony Testnet</span>
        </div>

      </div>
    </div>
  </nav>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  setup() {
    const links = [
      { name: 'Home',        to: '/',            label: 'Bridge' },
      { name: 'Destination', to: '/bridge-back', label: 'Bridge Back' },
      { name: 'Security',    to: '/security',    label: '🛡 Security' },
    ]
    return { links }
  },
})
</script>
