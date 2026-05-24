<script setup>
import { watch } from 'vue'
import { X } from 'lucide-vue-next'
import AddTradeForm from './AddTradeForm.vue'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
})

const emit = defineEmits(['close', 'submit'])

const handleClose = () => {
  emit('close')
}

const handleSubmit = (payload) => {
  emit('submit', payload)
}

// Close on escape key
const handleEscape = (e) => {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleEscape)
  } else {
    document.removeEventListener('keydown', handleEscape)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="add-trade-modal"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click="handleClose"
          data-testid="modal-backdrop"
        ></div>

        <!-- Modal Content -->
        <div
          class="relative w-full max-w-lg bg-background border border-border rounded-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
          data-testid="modal-content"
        >
          <!-- Modal Header -->
          <div class="px-6 py-4 border-b border-border flex items-center justify-between bg-surface/40">
            <h2 class="font-heading font-black text-xl tracking-tight uppercase">New Trade</h2>
            <button
              @click="handleClose"
              class="p-2 text-text-muted hover:text-text-main transition-colors"
              data-testid="modal-close-btn"
            >
              <X :size="20" :stroke-width="2" />
            </button>
          </div>

          <!-- Modal Body -->
          <div class="flex-1 overflow-auto p-6">
            <AddTradeForm @submit="handleSubmit" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
