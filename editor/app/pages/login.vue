<script setup lang="ts">
import { useExchangeToken } from '~/composables/useExchangeToken'

definePageMeta({ layout: false })

const exchangeToken = useExchangeToken()
const message = ref<string | null>(null)

onMounted(async () => {
  message.value = await exchangeToken()
})
</script>

<template>
  <div class="login">
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-else class="wait">Входим…</p>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  font-family: var(--font);
  font-size: 15px;
  color: var(--ink);
}
.wait {
  color: var(--ink-3);
}
</style>
