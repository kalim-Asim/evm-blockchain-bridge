<script lang="ts">
import { defineComponent } from 'vue'
import NavBar from '@/components/Navbar.vue'
import Nav from '@/components/Nav.vue'

import Footer from '@/components/Footer.vue'

export default defineComponent({
  setup() {
    return {}
  },
  components: { NavBar, Nav, Footer },
})
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <NavBar />
    <router-view class="container max-w-8xl mx-auto flex-1 px-4" />
    <Nav />
  </div>
</template>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}
</style>
