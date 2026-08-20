<script setup>
import { ref, computed, watch } from "vue";
import { ArrowUpRight, ArrowDownRight, Check, X } from "lucide-vue-next";
import { useStrategies } from "../composables/useStrategies.js";
import { useTags } from "../composables/useTags.js";

const props = defineProps({
	isOpen: { type: Boolean, required: true },
	trade: { type: Object, default: null }
});

const emit = defineEmits(["close", "submit"]);

const { strategiesByDirection } = useStrategies();
const { tagNames } = useTags();

const symbol = ref("");
const direction = ref("Long");
const strategy = ref("");
const notes = ref("");
const pnl = ref("");
const selectedTags = ref([]);
const tradeDate = ref("");

// Screenshot state
const screenshotTab = ref("file"); // 'file' | 'link'
const screenshot = ref("");
const screenshotLink = ref("");
const screenshotType = ref("");
const fileInput = ref(null);

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

const displayScreenshot = computed(() => {
	if (!screenshot.value) return "";
	if (screenshotType.value === "file") return screenshot.value;

	const url = screenshot.value;
	const tvRegex = /tradingview\.com\/x\/([a-zA-Z0-9]+)\/?/i;
	const match = url.match(tvRegex);
	if (match) {
		const id = match[1];
		const firstChar = id.charAt(0).toLowerCase();
		return `https://s3.tradingview.com/snapshots/${firstChar}/${id}.png`;
	}
	return url;
});

// Sync fields when trade prop changes
watch(
	() => props.trade,
	(newTrade) => {
		if (newTrade) {
			symbol.value = newTrade.symbol || "";
			direction.value = newTrade.direction || "Long";
			strategy.value = newTrade.strategy || "";
			notes.value = newTrade.notes || "";
			pnl.value = newTrade.pnl !== null && newTrade.pnl !== undefined ? newTrade.pnl.toString() : "";
			selectedTags.value = newTrade.tags ? [...newTrade.tags] : [];
			
			// Format date correctly to YYYY-MM-DD
			if (newTrade.date) {
				tradeDate.value = newTrade.date.split("T")[0];
			} else if (newTrade.createdAt) {
				tradeDate.value = newTrade.createdAt.split("T")[0];
			} else {
				tradeDate.value = new Date().toISOString().split("T")[0];
			}

			// Pre-fill screenshot
			if (newTrade.screenshot) {
				screenshot.value = newTrade.screenshot;
				if (newTrade.screenshot.startsWith("data:image/")) {
					screenshotType.value = "file";
				} else {
					screenshotType.value = "link";
					screenshotLink.value = newTrade.screenshot;
				}
			} else {
				screenshot.value = "";
				screenshotType.value = "";
				screenshotLink.value = "";
			}
		}
	},
	{ immediate: true },
);

// Watch direction to reset strategy if invalid
watch(direction, (newDir) => {
	const currentStrategies = strategiesByDirection.value[newDir] || [];
	if (!currentStrategies.includes(strategy.value)) {
		strategy.value = "";
	}
});

// Close on escape key
const handleClose = () => {
	emit("close");
};

const handleEscape = (e) => {
	if (e.key === "Escape" && props.isOpen) {
		handleClose();
	}
};

watch(
	() => props.isOpen,
	(isOpen) => {
		if (isOpen) {
			document.addEventListener("keydown", handleEscape);
		} else {
			document.removeEventListener("keydown", handleEscape);
		}
	},
);

const toggleTag = (tag) => {
	const index = selectedTags.value.indexOf(tag);
	if (index === -1) {
		selectedTags.value.push(tag);
	} else {
		selectedTags.value.splice(index, 1);
	}
};

const isValid = computed(() => symbol.value.trim().length > 0 && direction.value && strategy.value);

const onSubmit = () => {
	if (!isValid.value || !props.trade) return;

	const parsedPnl = pnl.value === "" || pnl.value === "-" ? null : Number(pnl.value);
	const cleanedSymbol = symbol.value.trim().toUpperCase();
	const cleanedNotes = notes.value.trim();

	emit("submit", {
		_id: props.trade._id,
		id: props.trade.id,
		payload: {
			date: tradeDate.value,
			symbol: cleanedSymbol,
			direction: direction.value,
			strategy: strategy.value,
			notes: cleanedNotes,
			pnl: Number.isFinite(parsedPnl) ? parsedPnl : null,
			screenshot: screenshot.value,
			tags: [...selectedTags.value],
		}
	});
};
</script>

<template>
	<Teleport to="body">
		<Transition name="modal">
			<div
				v-if="isOpen"
				class="fixed inset-0 z-50 flex items-center justify-center p-4"
				data-testid="edit-trade-modal"
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
					<div
						class="px-6 py-4 border-b border-border flex items-center justify-between bg-surface/40"
					>
						<div class="flex items-baseline gap-2">
							<h2 class="font-heading font-black text-xl tracking-tight uppercase">
								Edit Trade
							</h2>
							<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
								// UPDATE
							</span>
						</div>
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
						<form @submit.prevent="onSubmit" class="flex flex-col gap-5" novalidate>
							<!-- Symbol -->
							<div class="flex flex-col gap-1.5">
								<label
									for="edit-symbol"
									class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>
									Symbol
								</label>
								<input
									id="edit-symbol"
									v-model="symbol"
									type="text"
									placeholder="e.g. AAPL, BTCUSDT"
									autocomplete="off"
									spellcheck="false"
									maxlength="16"
									class="bg-transparent border border-border px-3 py-2.5 font-mono text-base tracking-wider uppercase text-text-main placeholder:text-text-muted/50 placeholder:normal-case focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
									data-testid="edit-trade-symbol-input"
								/>
							</div>

							<!-- Date -->
							<div class="flex flex-col gap-1.5">
								<label
									for="edit-tradeDate"
									class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>
									Date
								</label>
								<input
									id="edit-tradeDate"
									v-model="tradeDate"
									type="date"
									class="bg-transparent border border-border px-3 py-2.5 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
									data-testid="edit-trade-date-input"
								/>
							</div>

							<!-- Direction toggle -->
							<div class="flex flex-col gap-1.5">
								<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
									Direction
								</span>
								<div class="grid grid-cols-2 border border-border">
									<button
										type="button"
										@click="direction = 'Long'"
										:class="[
											'flex items-center cursor-pointer justify-center gap-2 py-2.5 font-mono text-sm tracking-widest uppercase transition-colors duration-100 border-r border-border',
											direction === 'Long'
												? 'bg-success/15 text-success'
												: 'text-text-muted hover:bg-surface-hover hover:text-text-main',
										]"
										data-testid="edit-direction-long-btn"
									>
										<ArrowUpRight :size="16" :stroke-width="2.5" />
										Long
									</button>
									<button
										type="button"
										@click="direction = 'Short'"
										:class="[
											'flex items-center cursor-pointer justify-center gap-2 py-2.5 font-mono text-sm tracking-widest uppercase transition-colors duration-100',
											direction === 'Short'
												? 'bg-danger/15 text-danger'
												: 'text-text-muted hover:bg-surface-hover hover:text-text-main',
										]"
										data-testid="edit-direction-short-btn"
									>
										<ArrowDownRight :size="16" :stroke-width="2.5" />
										Short
									</button>
								</div>
							</div>

							<!-- Strategy -->
							<div class="flex flex-col gap-1.5">
								<label
									for="edit-strategy"
									class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>
									Strategy
								</label>
								<select
									id="edit-strategy"
									v-model="strategy"
									class="bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
									data-testid="edit-trade-strategy-select"
								>
									<option value="" disabled class="bg-background">Select strategy…</option>
									<option
										v-for="s in strategiesByDirection[direction] || []"
										:key="s"
										:value="s"
										class="bg-background text-text-main"
									>
										{{ s }}
									</option>
								</select>
							</div>

							<!-- Tags -->
							<div class="flex flex-col gap-1.5">
								<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
									Tags
								</span>
								<div class="flex flex-wrap gap-2">
									<button
										v-for="tag in tagNames"
										:key="tag"
										type="button"
										@click="toggleTag(tag)"
										:class="[
											'px-3 py-1.5 border font-mono text-xs tracking-wider uppercase transition-colors',
											selectedTags.includes(tag)
												? 'border-primary text-primary bg-primary/10'
												: 'border-border text-text-muted hover:text-text-main hover:border-primary/50',
										]"
										data-testid="edit-tag-btn"
									>
										{{ tag }}
									</button>
								</div>
								<div v-if="selectedTags.length > 0" class="flex flex-wrap gap-1 mt-1">
									<span
										v-for="tag in selectedTags"
										:key="tag"
										class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-mono tracking-wider uppercase rounded border border-primary/30"
									>
										{{ tag }}
										<button
											type="button"
											@click="toggleTag(tag)"
											class="hover:text-primary-foreground"
										>
											<X :size="10" :stroke-width="2.5" />
										</button>
									</span>
								</div>
							</div>

							<!-- Realized PNL -->
							<div class="flex flex-col gap-1.5">
								<label
									for="edit-pnl"
									class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>
									Realized PNL
								</label>
								<div class="relative">
									<span
										class="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-text-muted/60 pointer-events-none"
									>
										$
									</span>
									<input
										id="edit-pnl"
										v-model="pnl"
										type="number"
										step="0.01"
										inputmode="decimal"
										placeholder="0.00"
										class="w-full bg-transparent border border-border pl-7 pr-3 py-2.5 font-mono text-sm tabular-nums text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
										data-testid="edit-trade-pnl-input"
									/>
								</div>
							</div>

							<!-- Notes -->
							<div class="flex flex-col gap-1.5">
								<label
									for="edit-notes"
									class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>
									Notes
								</label>
								<textarea
									id="edit-notes"
									v-model="notes"
									rows="4"
									placeholder="Setup, emotions, observations…"
									class="bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100 resize-none"
									data-testid="edit-trade-notes-textarea"
								></textarea>
							</div>

							<!-- Screenshot Optional Field -->
							<div class="flex flex-col gap-1.5">
								<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
									Screenshot
								</span>
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
										data-testid="edit-screenshot-dropzone"
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
										data-testid="edit-screenshot-link-input"
									/>
								</div>

								<!-- Preview & Remove -->
								<div
									v-if="screenshot"
									class="mt-2 flex items-center gap-3 bg-surface/30 p-2 border border-border rounded-md"
								>
									<img
										:src="displayScreenshot"
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
							</div>

							<!-- Submit -->
							<button
								type="submit"
								:disabled="!isValid"
								:class="[
									'mt-4 w-full py-3.5 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100 flex items-center justify-center gap-2',
									isValid
										? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
										: 'bg-border text-text-muted cursor-not-allowed',
								]"
								data-testid="save-trade-btn"
							>
								Save Changes
							</button>
						</form>
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
	transition:
		transform 0.2s ease,
		opacity 0.2s ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
	transform: scale(0.95);
	opacity: 0;
}
</style>
