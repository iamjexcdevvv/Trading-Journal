<script setup>
import { computed, ref } from "vue";
import { Trash2, ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown, Pencil } from "lucide-vue-next";
import TradeDetailsModal from "./TradeDetailsModal.vue";

const props = defineProps({
	trades: { type: Array, required: true },
	lastAddedId: { type: String, default: null },
});

defineEmits(["delete", "edit"]);

const selectedTrade = ref(null);

const hasTrades = computed(() => props.trades.length > 0);

// Sort state
const sortOrder = ref('desc'); // 'desc' for newest first, 'asc' for oldest first

const sortedTrades = computed(() => {
	const tradesCopy = [...props.trades];
	return tradesCopy.sort((a, b) => {
		const dateA = new Date(a.createdAt);
		const dateB = new Date(b.createdAt);
		return sortOrder.value === 'desc' ? dateB - dateA : dateA - dateB;
	});
});

const toggleSort = () => {
	sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
};

const formatDateTime = (d) => {
	if (!(d instanceof Date)) d = new Date(d);
	return d.toLocaleString([], {
		month: "2-digit",
		day: "2-digit",
		year: "numeric",
	});
};

const formatPnl = (n) => {
	if (n === null || n === undefined || Number.isNaN(n)) return null;
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	const abs = Math.abs(n).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return `${sign}$${abs}`;
};

// Screenshot preview helpers
const isImage = (src) => {
	if (!src) return false;
	if (src.startsWith("data:image/")) return true;
	if (/tradingview\.com\/x\/[a-zA-Z0-9]+/i.test(src)) return true;
	return /\.(jpeg|jpg|gif|png|webp|svg)/i.test(src);
};

const getDisplayImageUrl = (src) => {
	if (!src) return "";
	if (src.startsWith("data:image/")) return src;

	const tvRegex = /tradingview\.com\/x\/([a-zA-Z0-9]+)\/?/i;
	const match = src.match(tvRegex);
	if (match) {
		const id = match[1];
		const firstChar = id.charAt(0).toLowerCase();
		return `https://s3.tradingview.com/snapshots/${firstChar}/${id}.png`;
	}
	return src;
};

// Lightbox state & controls
const lightboxImage = ref("");
const isLightboxOpen = ref(false);

const openLightbox = (src) => {
	lightboxImage.value = getDisplayImageUrl(src);
	isLightboxOpen.value = true;
	document.addEventListener("keydown", handleEscape);
};

const closeLightbox = () => {
	isLightboxOpen.value = false;
	lightboxImage.value = "";
	document.removeEventListener("keydown", handleEscape);
};

const handleEscape = (e) => {
	if (e.key === "Escape") {
		closeLightbox();
	}
};
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
		<div v-else class="flex-1 overflow-auto">
			<table class="w-full border-collapse" data-testid="trades-table">
				<thead class="sticky top-0 z-10 bg-background/95 backdrop-blur">
					<tr class="border-b border-border">
						<th
							class="text-left px-6 py-3 font-mono text-[10px] tracking-widest uppercase text-text-muted font-medium"
						>
							<button
								@click="toggleSort"
								class="flex items-center gap-1 hover:text-text-main transition-colors cursor-pointer"
							>
								Time
								<ArrowUp v-if="sortOrder === 'asc'" :size="12" :stroke-width="2" />
								<ArrowDown v-else :size="12" :stroke-width="2" />
							</button>
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
							Screenshot
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
						v-for="trade in sortedTrades"
						:key="trade.id"
						@click="selectedTrade = trade"
						@keydown.enter.self="selectedTrade = trade"
						@keydown.space.self.prevent="selectedTrade = trade"
						tabindex="0"
						role="button"
						:aria-label="`View ${trade.symbol} trade details`"
						:class="[
							'group border-b border-border/60 hover:bg-surface-hover/60 transition-colors duration-100 cursor-pointer focus-visible:outline focus-visible:outline-primary',
							trade.id === lastAddedId && 'row-in',
						]"
						:data-testid="`trade-row-${trade.id}`"
					>
						<td class="px-6 py-3">
							<div class="flex flex-col gap-1">
								<span
									class="font-mono text-xs text-text-muted tabular-nums whitespace-nowrap"
								>
									{{ formatDateTime(trade.createdAt) }}
								</span>
								<div
									v-if="trade.tags && trade.tags.length > 0"
									class="flex gap-1 overflow-x-auto scrollbar-thin max-w-36"
								>
									<span
										v-for="tag in trade.tags"
										:key="tag"
										class="px-1.5 py-0.5 bg-primary/20 text-primary text-[9px] font-mono tracking-wider uppercase rounded border border-primary/30 shrink-0"
									>
										{{ tag }}
									</span>
								</div>
							</div>
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
								<ArrowUpRight
									v-if="trade.direction === 'Long'"
									:size="12"
									:stroke-width="3"
								/>
								<ArrowDownRight v-else :size="12" :stroke-width="3" />
								{{ trade.direction }}
							</span>
						</td>
						<td class="px-4 py-3 font-sans text-sm text-text-main whitespace-nowrap align-middle">
							{{ trade.strategy }}
						</td>
						<td class="px-4 py-3 w-48 min-w-48 max-w-48">
							<span
								v-if="trade.notes"
								class="font-sans text-sm text-text-muted leading-snug overflow-y-auto max-h-12 scrollbar-thin block w-full break-words"
							>
								{{ trade.notes }}
							</span>
							<span v-else class="text-text-muted/30 font-mono text-xs">—</span>
						</td>
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<div v-if="trade.screenshot" class="relative flex items-center">
									<img
										v-if="isImage(trade.screenshot)"
										:src="getDisplayImageUrl(trade.screenshot)"
										@click.stop="openLightbox(trade.screenshot)"
										class="w-12 h-8 object-cover rounded border border-border/80 hover:border-primary/60 cursor-zoom-in hover:scale-105 transition-all duration-150"
										alt="Screenshot thumbnail"
									/>
									<a
										v-else
										:href="trade.screenshot"
										@click.stop
										target="_blank"
										class="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase text-primary hover:underline"
									>
										<svg
											class="w-3 h-3"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
											/>
										</svg>
										<span>[Link]</span>
									</a>
								</div>
								<span v-else class="text-text-muted/30 font-mono text-[10px]">—</span>
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
							<div class="flex items-center justify-end gap-1">
								<button
									type="button"
									@click.stop="$emit('edit', trade)"
									:data-testid="`edit-trade-btn-${trade.id}`"
									class="inline-flex items-center justify-center w-11 h-11 sm:w-7 sm:h-7 text-text-muted hover:text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-primary transition-colors duration-100"
									aria-label="Edit trade"
								>
									<Pencil :size="14" :stroke-width="2" />
								</button>
								<button
									type="button"
									@click.stop="$emit('delete', trade.id, trade._id)"
									:data-testid="`delete-trade-btn-${trade.id}`"
									class="inline-flex items-center justify-center w-11 h-11 sm:w-7 sm:h-7 text-text-muted hover:text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-primary transition-colors duration-100"
									aria-label="Delete trade"
								>
									<Trash2 :size="14" :stroke-width="2" />
								</button>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
	<TradeDetailsModal :trade="selectedTrade" @close="selectedTrade = null" />

	<!-- Lightbox Teleport -->
	<Teleport to="body">
		<Transition name="fade">
			<div
				v-if="isLightboxOpen"
				class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
				@click="closeLightbox"
			>
				<!-- Close Button -->
				<button
					@click.stop="closeLightbox"
					class="absolute top-6 right-6 p-2 text-text-muted hover:text-text-main transition-colors bg-surface/50 border border-border rounded-full hover:bg-surface"
					aria-label="Close image viewer"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>

				<!-- Main Image -->
				<div
					class="relative max-w-full max-h-[85vh] flex items-center justify-center"
					@click.stop
				>
					<img
						:src="lightboxImage"
						class="max-w-full max-h-[85vh] object-contain rounded-lg border border-border shadow-2xl select-none"
						alt="Enlarged screenshot"
					/>
				</div>
			</div>
		</Transition>
	</Teleport>


</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

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
