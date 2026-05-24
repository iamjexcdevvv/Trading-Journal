<script setup>
import { computed, ref } from 'vue'
import { Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-vue-next'

const props = defineProps({
  trades: { type: Array, required: true },
  lastAddedId: { type: String, default: null },
})

defineEmits(['delete'])

const hasTrades = computed(() => props.trades.length > 0)

const isCancelling = ref(false)

const editingNoteId = ref(null)
const editingNoteValue = ref('')

const startEdit = (trade) => {
  isCancelling.value = false
  editingNoteId.value = trade.id
  editingNoteValue.value = trade.notes || ''
}

const saveNote = async (trade) => {
  if (isCancelling.value) return

  try {
    trade.notes = editingNoteValue.value.trim()

    const response = await fetch(`http://localhost:3000/api/trade/notes/${trade._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: trade.notes }),
    })

    if (!response.ok) {
      console.error(`Failed to update trade with id ${trade._id}:`, response.statusText)
    }
  } catch (error) {
    console.error('Error updating trade notes:', error)
  }

  editingNoteId.value = null
}

const cancelEdit = () => {
  isCancelling.value = true
  editingNoteId.value = null
  editingNoteValue.value = ''
}

const vFocus = {
  mounted(el) {
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  },
}

const formatDateTime = (d) => {
  if (!(d instanceof Date)) d = new Date(d)
  return d.toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

const formatPnl = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return null
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}$${abs}`
}
</script>

<template>
  <div class="h-full flex flex-col" data-testid="trades-list">
    <!-- Empty state -->
    <div
      v-if="!hasTrades"
      class="flex-1 flex items-center justify-center px-6"
      data-testid="empty-state"
    >
      <div class="text-center max-w-md">
        <div
          class="font-mono text-xs text-text-muted tracking-widest mb-6 inline-block border border-border px-3 py-1 uppercase"
        >
          status :: idle
        </div>
        <pre
          class="font-mono text-[10px] sm:text-xs text-text-muted/60 leading-tight mb-8 select-none"
        >
 ┌─────────────────────────────┐
 │   NO TRADES LOGGED          │
 │   AWAITING INPUT            │
 └─────────────────────────────┘</pre
        >
        <p class="font-mono text-sm text-primary cursor-blink tracking-wider">ready</p>
        <p class="mt-6 font-sans text-sm text-text-muted">
          Fill the form on the left to log your first trade.
          <br />
          Track symbol, direction, strategy and any notes.
        </p>
      </div>
    </div>

    <!-- Table -->
    <div v-else class="lg:ml-34 flex-1 overflow-auto">
      <table class="w-full border-collapse" data-testid="trades-table">
        <thead class="sticky top-0 z-10 bg-background/95 backdrop-blur">
          <tr class="border-b border-border">
            <th
              class="text-left px-6 py-3 font-mono text-[10px] tracking-widest uppercase text-text-muted font-medium"
            >
              Time
            </th>
            <th
              class="text-left px-4 py-3 font-mono text-[10px] tracking-widest uppercase text-text-muted font-medium"
            >
              Symbol
            </th>
            <th
              class="text-left px-4 py-3 font-mono text-[10px] tracking-widest uppercase text-text-muted font-medium"
            >
              Direction
            </th>
            <th
              class="text-left px-4 py-3 font-mono text-[10px] tracking-widest uppercase text-text-muted font-medium"
            >
              Strategy
            </th>
            <th
              class="text-left px-4 py-3 font-mono text-[10px] tracking-widest uppercase text-text-muted font-medium"
            >
              Notes
            </th>
            <th
              class="text-left px-4 py-3 font-mono text-[10px] tracking-widest uppercase text-text-muted font-medium"
            >
              Realized PNL
            </th>
            <th class="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="trade in trades"
            :key="trade.id"
            :class="[
              'group border-b border-border/60 hover:bg-surface-hover/60 transition-colors duration-100',
              trade.id === lastAddedId && 'row-in',
            ]"
            :data-testid="`trade-row-${trade.id}`"
          >
            <td class="px-6 py-3 font-mono text-xs text-text-muted tabular-nums whitespace-nowrap">
              {{ formatDateTime(trade.createdAt) }}
            </td>
            <td
              class="px-4 py-3 font-mono text-sm font-bold text-text-main tracking-wider whitespace-nowrap"
            >
              {{ trade.symbol }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span
                :class="[
                  'inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[11px] tracking-widest uppercase font-medium',
                  trade.direction === 'Long'
                    ? 'bg-success/15 text-success'
                    : 'bg-danger/15 text-danger',
                ]"
                :data-testid="`trade-direction-${trade.id}`"
              >
                <ArrowUpRight v-if="trade.direction === 'Long'" :size="12" :stroke-width="3" />
                <ArrowDownRight v-else :size="12" :stroke-width="3" />
                {{ trade.direction }}
              </span>
            </td>
            <td class="px-4 py-3 font-sans text-sm text-text-main whitespace-nowrap">
              {{ trade.strategy }}
            </td>
            <td class="px-4 py-3 w-48 min-w-48 max-w-48">
              <div
                v-if="!editingNoteId || editingNoteId !== trade.id"
                @click="startEdit(trade)"
                class="group relative cursor-text min-h-[2rem] flex items-start gap-2"
              >
                <span
                  v-if="trade.notes"
                  class="font-sans text-sm text-text-muted leading-snug overflow-y-auto max-h-12 scrollbar-thin block w-full break-words"
                >
                  {{ trade.notes }}
                </span>
                <span v-else class="font-mono text-xs text-text-muted/30"> Add note... </span>

                <span
                  class="opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 mt-0.5"
                >
                  <svg
                    class="w-3.5 h-3.5 text-text-muted/50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828A2 2 0 0110 16H8v-2a2 2 0 01.586-1.414z"
                    />
                  </svg>
                </span>
              </div>

              <!-- Editing state -->
              <div v-else class="relative">
                <textarea
                  v-focus
                  v-model="editingNoteValue"
                  @blur="saveNote(trade)"
                  @keydown.enter.exact.prevent="saveNote(trade)"
                  @keydown.esc="cancelEdit"
                  rows="3"
                  placeholder="Add note..."
                  class="w-full bg-surface border border-primary/40 focus:border-primary rounded-md px-3 py-2 font-sans text-sm text-text-main placeholder:text-text-muted/30 resize-none outline-none transition-colors duration-150 leading-snug overflow-y-auto max-h-32 scrollbar-thin"
                />
                <div class="flex items-center justify-end gap-2 mt-1">
                  <span class="font-mono text-[10px] text-text-muted/40"
                    >esc to cancel · enter to save</span
                  >
                </div>
              </div>
            </td>
            <td
              class="px-4 py-3 text-center font-mono text-sm font-bold tabular-nums whitespace-nowrap"
              :data-testid="`trade-pnl-${trade.id}`"
            >
              <span
                v-if="trade.pnl !== null && trade.pnl !== undefined"
                :class="[
                  trade.pnl > 0 && 'text-success',
                  trade.pnl < 0 && 'text-danger',
                  trade.pnl === 0 && 'text-text-muted',
                ]"
              >
                {{ formatPnl(trade.pnl) }}
              </span>
              <span v-else class="text-text-muted/40 font-mono text-xs">—</span>
            </td>
            <td class="px-4 py-3 text-right">
              <button
                type="button"
                @click="$emit('delete', trade.id, trade._id)"
                :data-testid="`delete-trade-btn-${trade.id}`"
                class="inline-flex items-center justify-center w-7 h-7 text-text-muted hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-all duration-100"
                aria-label="Delete trade"
              >
                <Trash2 :size="14" :stroke-width="2" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
