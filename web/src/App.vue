<script lang="ts">
import { defineComponent } from 'vue'
import NavBar from '@/components/Navbar.vue'
import Nav from '@/components/Nav.vue'

export default defineComponent({
  components: { NavBar, Nav },
})
</script>

<template>
  <div class="flex flex-col min-h-screen bg-slate-50">
    <NavBar />
    <main class="flex-1">
      <router-view />
    </main>
    <Nav />
  </div>
</template>

<style>
* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, sans-serif;
  color: #0f172a;
}
</style>
