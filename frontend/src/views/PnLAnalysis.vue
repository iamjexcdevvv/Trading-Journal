<script setup>
import { useTrades } from '../composables/useTrades.js'
import PnLAnalysis from '../components/PnLAnalysis.vue'

const { trades } = useTrades()
</script>

<template>
  <div class="h-full min-h-0">
    <PnLAnalysis :trades="trades" />
  </div>
</template>
