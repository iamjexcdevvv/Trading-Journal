<script setup>
import { computed, ref } from "vue";
import { Trash2, ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown, Upload, X, Check } from "lucide-vue-next";
import { useAuth } from "@/composables/useAuth";

const apiUrl = import.meta.env.VITE_API_BASE_URL;

const props = defineProps({
	trades: { type: Array, required: true },
	lastAddedId: { type: String, default: null },
});

const emit = defineEmits(["delete", "screenshot-updated"]);

const hasTrades = computed(() => props.trades.length > 0);

const isCancelling = ref(false);

const editingNoteId = ref(null);
const editingNoteValue = ref("");

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

const startEdit = (trade) => {
	isCancelling.value = false;
	editingNoteId.value = trade.id;
	editingNoteValue.value = trade.notes || "";
};

const saveNote = async (trade) => {
	if (isCancelling.value) return;

	try {
		trade.notes = editingNoteValue.value.trim();

		const response = await fetch(`${apiUrl}/api/trades/notes/${trade._id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ notes: trade.notes }),
		});

		if (!response.ok) {
			console.error(`Failed to update trade with id ${trade._id}:`, response.statusText);
		}
	} catch (error) {
		console.error("Error updating trade notes:", error);
	}

	editingNoteId.value = null;
};

const cancelEdit = () => {
	isCancelling.value = true;
	editingNoteId.value = null;
	editingNoteValue.value = "";
};

const vFocus = {
	mounted(el) {
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
	},
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

// Screenshot upload state
const isScreenshotModalOpen = ref(false);
const uploadingTradeId = ref(null);
const screenshotTab = ref("file"); // 'file' | 'link'
const screenshot = ref("");
const screenshotLink = ref("");
const screenshotType = ref("");
const fileInput = ref(null);
const isUploading = ref(false);

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
		closeScreenshotModal();
	}
};

const openScreenshotModal = (trade) => {
	uploadingTradeId.value = trade._id;
	screenshotTab.value = "file";
	screenshot.value = "";
	screenshotLink.value = "";
	screenshotType.value = "";
	isScreenshotModalOpen.value = true;
};

const closeScreenshotModal = () => {
	isScreenshotModalOpen.value = false;
	uploadingTradeId.value = null;
	screenshot.value = "";
	screenshotLink.value = "";
	screenshotType.value = "";
	if (fileInput.value) {
		fileInput.value.value = "";
	}
};

const handleFileUpload = (e) => {
	const file = e.target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = (event) => {
		screenshot.value = event.target.result;
		screenshotType.value = "file";
	};
	reader.readAsDataURL(file);
};

const handleLinkInput = () => {
	if (screenshotLink.value.trim()) {
		screenshot.value = screenshotLink.value.trim();
		screenshotType.value = "link";
	} else {
		screenshot.value = "";
		screenshotType.value = "";
	}
};

const clearScreenshot = () => {
	screenshot.value = "";
	screenshotLink.value = "";
	screenshotType.value = "";
	if (fileInput.value) {
		fileInput.value.value = "";
	}
};

const uploadScreenshot = async () => {
	if (!uploadingTradeId.value || !screenshot.value) return;

	isUploading.value = true;
	try {
		const response = await fetch(`${apiUrl}/api/trades/${uploadingTradeId.value}/screenshot`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ screenshot: screenshot.value }),
			credentials: "include",
		});

		if (!response.ok) {
			throw new Error(`Failed to upload screenshot: ${response.statusText}`);
		}

		const updatedTrade = await response.json();
		emit("screenshot-updated", updatedTrade);
		closeScreenshotModal();
	} catch (error) {
		console.error("Error uploading screenshot:", error);
	} finally {
		isUploading.value = false;
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
		<div v-else class="lg:ml-34 flex-1 overflow-auto">
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
						:class="[
							'group border-b border-border/60 hover:bg-surface-hover/60 transition-colors duration-100',
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
								<span v-else class="font-mono text-xs text-text-muted/30">
									Add note...
								</span>

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
						<td class="px-4 py-3 whitespace-nowrap">
							<div class="flex items-center gap-2">
								<div v-if="trade.screenshot" class="relative flex items-center">
									<img
										v-if="isImage(trade.screenshot)"
										:src="getDisplayImageUrl(trade.screenshot)"
										@click="openLightbox(trade.screenshot)"
										class="w-12 h-8 object-cover rounded border border-border/80 hover:border-primary/60 cursor-zoom-in hover:scale-105 transition-all duration-150"
										alt="Screenshot thumbnail"
									/>
									<a
										v-else
										:href="trade.screenshot"
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
								<button
									type="button"
									@click="openScreenshotModal(trade)"
									class="inline-flex items-center justify-center w-6 h-6 text-text-muted hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all duration-100"
									aria-label="Upload screenshot"
									title="Upload screenshot"
								>
									<Upload :size="12" :stroke-width="2" />
								</button>
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

	<!-- Screenshot Upload Modal -->
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="isScreenshotModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
				<div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeScreenshotModal"></div>
				<div class="relative w-full max-w-md bg-background border border-border rounded-lg shadow-2xl p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="font-heading font-black text-lg tracking-tight uppercase">
							Upload Screenshot
						</h3>
						<button @click="closeScreenshotModal" class="p-2 text-text-muted hover:text-text-main transition-colors">
							<X :size="20" :stroke-width="2" />
						</button>
					</div>

					<div class="flex flex-col gap-4">
						<div class="flex gap-2 mb-1.5 font-mono text-[10px]">
							<button
								type="button"
								@click="screenshotTab = 'file'"
								:class="[
									'px-2.5 py-1 border transition-colors uppercase tracking-wider',
									screenshotTab === 'file'
										? 'border-primary text-primary bg-primary/10'
										: 'border-border text-text-muted hover:text-text-main',
								]"
							>
								File Upload
							</button>
							<button
								type="button"
								@click="screenshotTab = 'link'"
								:class="[
									'px-2.5 py-1 border transition-colors uppercase tracking-wider',
									screenshotTab === 'link'
										? 'border-primary text-primary bg-primary/10'
										: 'border-border text-text-muted hover:text-text-main',
								]"
							>
								Paste Link
							</button>
						</div>

						<!-- File Upload -->
						<div v-show="screenshotTab === 'file'" class="flex flex-col gap-2">
							<div
								class="border border-dashed border-border p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-surface-hover/30 hover:border-primary/50 transition-all rounded-md"
								@click="fileInput.click()"
							>
								<input
									ref="fileInput"
									type="file"
									accept="image/*"
									class="hidden"
									@change="handleFileUpload"
								/>
								<span
									v-if="!screenshot"
									class="text-xs text-text-muted font-mono tracking-wide"
								>
									[SELECT IMAGE FILE]
								</span>
								<span
									v-else
									class="text-xs text-success flex items-center gap-1 font-mono tracking-wide"
								>
									<Check :size="12" /> [IMAGE LOADED]
								</span>
							</div>
						</div>

						<!-- Paste Link -->
						<div v-show="screenshotTab === 'link'">
							<input
								type="url"
								v-model="screenshotLink"
								placeholder="https://example.com/chart.png"
								class="w-full bg-transparent border border-border px-3 py-2 font-sans text-xs text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
								@input="handleLinkInput"
							/>
						</div>

						<!-- Preview & Remove -->
						<div
							v-if="screenshot"
							class="mt-2 flex items-center gap-3 bg-surface/30 p-2 border border-border rounded-md"
						>
							<img
								:src="getDisplayImageUrl(screenshot)"
								class="w-10 h-10 object-cover rounded border border-border"
							/>
							<div class="flex-1 min-w-0">
								<p class="text-[10px] font-mono text-text-muted truncate">
									{{ screenshotType === "file" ? "Local file uploaded" : screenshot }}
								</p>
							</div>
							<button
								type="button"
								@click="clearScreenshot"
								class="text-[10px] text-danger hover:underline font-mono uppercase tracking-wider shrink-0"
							>
								Remove
							</button>
						</div>

						<button
							type="button"
							@click="uploadScreenshot"
							:disabled="!screenshot || isUploading"
							:class="[
								'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
								screenshot && !isUploading
									? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
									: 'bg-border text-text-muted cursor-not-allowed',
							]"
						>
							{{ isUploading ? 'Uploading...' : 'Upload Screenshot' }}
						</button>
					</div>
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
