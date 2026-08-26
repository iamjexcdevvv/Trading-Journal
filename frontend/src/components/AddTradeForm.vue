<script setup>
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowUpRight, ArrowDownRight, Check, X, ListChecks } from "lucide-vue-next";
import { useStrategies } from "../composables/useStrategies.js";
import { useTags } from "../composables/useTags.js";
import { useSetups } from "../composables/useSetups.js";

const route = useRoute();
const { strategiesByDirection } = useStrategies();
const { tagNames } = useTags();
const { setups } = useSetups();

const emit = defineEmits(["submit"]);

const symbol = ref(route.query.symbol || "");
const direction = ref(route.query.direction || "Long");
const strategy = ref(route.query.strategy || "");
const notes = ref(route.query.notes || "");
const justSubmitted = ref(false);
const pnl = ref(route.query.pnl || "");
const selectedTags = ref([]);
const tradeDate = ref(new Date().toISOString().split('T')[0]);
const setup = ref("");
const checklist = ref([]);

// Rebuild the checklist whenever the chosen setup changes
watch(setup, (newSetupName) => {
	const matched = (setups.value || []).find((s) => s.name === newSetupName);
	checklist.value = (matched?.items || []).map((label) => ({ label, checked: false }));
});

const toggleChecklistItem = (index) => {
	checklist.value[index].checked = !checklist.value[index].checked;
};

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

const isValid = computed(() => symbol.value.trim().length > 0 && direction.value && strategy.value);

const onSubmit = () => {
	if (!isValid.value) return;

	const parsedPnl = pnl.value === "" || pnl.value === "-" ? null : Number(pnl.value);
	const cleanedSymbol = symbol.value.trim().toUpperCase();
	const cleanedNotes = notes.value.trim();

	emit("submit", {
		date: tradeDate.value,
		symbol: cleanedSymbol,
		direction: direction.value,
		strategy: strategy.value,
		notes: cleanedNotes,
		pnl: Number.isFinite(parsedPnl) ? parsedPnl : null,
		screenshot: screenshot.value,
		tags: [...selectedTags.value],
		setup: setup.value,
		checklist: checklist.value.map(({ label, checked }) => ({ label, checked })),
	});

	resetInputs();
};

const resetInputs = () => {
	symbol.value = "";
	direction.value = "Long";
	strategy.value = "";
	notes.value = "";
	justSubmitted.value = true;
	pnl.value = "";
	selectedTags.value = [];
	tradeDate.value = new Date().toISOString().split('T')[0];
	setup.value = "";
	checklist.value = [];
	clearScreenshot();
	setTimeout(() => (justSubmitted.value = false), 1200);
};

const toggleTag = (tag) => {
	const index = selectedTags.value.indexOf(tag);
	if (index === -1) {
		selectedTags.value.push(tag);
	} else {
		selectedTags.value.splice(index, 1);
	}
};
</script>

<template>
	<form
		@submit.prevent="onSubmit"
		class="p-6 flex flex-col gap-5 h-full"
		data-testid="add-trade-form"
		novalidate
	>
		<!-- Title -->
		<div class="flex items-baseline justify-between">
			<h2 class="font-heading font-black text-xl tracking-tight uppercase">New Trade</h2>
			<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
				// INPUT
			</span>
		</div>

		<!-- Symbol -->
		<div class="flex flex-col gap-1.5">
			<label
				for="symbol"
				class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
			>
				Symbol
			</label>
			<input
				id="symbol"
				v-model="symbol"
				type="text"
				placeholder="e.g. AAPL, BTCUSDT"
				autocomplete="off"
				spellcheck="false"
				maxlength="16"
				class="bg-transparent border border-border px-3 py-2.5 font-mono text-base tracking-wider uppercase text-text-main placeholder:text-text-muted/50 placeholder:normal-case focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
				data-testid="trade-symbol-input"
			/>
		</div>

		<!-- Date -->
		<div class="flex flex-col gap-1.5">
			<label
				for="tradeDate"
				class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
			>
				Date
			</label>
			<input
				id="tradeDate"
				v-model="tradeDate"
				type="date"
				class="bg-transparent border border-border px-3 py-2.5 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
				data-testid="trade-date-input"
			/>
		</div>

		<!-- Direction toggle -->
		<div class="flex flex-col gap-1.5">
			<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
				Direction
			</span>
			<div class="grid grid-cols-2 border border-border" data-testid="trade-direction-toggle">
				<button
					type="button"
					@click="direction = 'Long'"
					:class="[
						'flex items-center cursor-pointer justify-center gap-2 py-2.5 font-mono text-sm tracking-widest uppercase transition-colors duration-100 border-r border-border',
						direction === 'Long'
							? 'bg-success/15 text-success'
							: 'text-text-muted hover:bg-surface-hover hover:text-text-main',
					]"
					data-testid="direction-long-btn"
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
					data-testid="direction-short-btn"
				>
					<ArrowDownRight :size="16" :stroke-width="2.5" />
					Short
				</button>
			</div>
		</div>

		<!-- Strategy -->
		<div class="flex flex-col gap-1.5">
			<label
				for="strategy"
				class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
			>
				Strategy
			</label>
			<select
				id="strategy"
				v-model="strategy"
				class="bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
				data-testid="trade-strategy-select"
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
					data-testid="tag-btn"
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

		<!-- Setup -->
		<div class="flex flex-col gap-1.5">
			<label
				for="setup"
				class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
			>
				Setup
			</label>
			<select
				id="setup"
				v-model="setup"
				class="bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
				data-testid="trade-setup-select"
			>
				<option value="" class="bg-background">No setup…</option>
				<option
					v-for="s in setups || []"
					:key="s._id"
					:value="s.name"
					class="bg-background text-text-main"
				>
					{{ s.name }}
				</option>
			</select>
		</div>

		<!-- Confluences / Confirmations Checklist -->
		<div v-if="checklist.length > 0" class="flex flex-col gap-1.5">
			<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted flex items-center gap-1.5">
				<ListChecks :size="12" :stroke-width="2" />
				Confluences / Confirmations
			</span>
			<div class="flex flex-col gap-2 border border-border p-3 bg-surface/20" data-testid="trade-checklist">
				<label
					v-for="(item, index) in checklist"
					:key="index"
					class="flex items-center gap-2.5 cursor-pointer group"
					data-testid="checklist-item"
				>
					<input
						type="checkbox"
						:checked="item.checked"
						@change="toggleChecklistItem(index)"
						class="w-4 h-4 accent-primary cursor-pointer"
					/>
					<span
						:class="[
							'font-sans text-sm transition-colors',
							item.checked ? 'text-text-main' : 'text-text-muted group-hover:text-text-main',
						]"
					>
						{{ item.label }}
					</span>
				</label>
			</div>
		</div>

		<!-- Realized PNL -->
		<div class="flex flex-col gap-1.5">
			<label
				for="pnl"
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
					id="pnl"
					v-model="pnl"
					type="number"
					step="0.01"
					inputmode="decimal"
					placeholder="0.00"
					class="w-full bg-transparent border border-border pl-7 pr-3 py-2.5 font-mono text-sm tabular-nums text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
					data-testid="trade-pnl-input"
				/>
			</div>
		</div>

		<!-- Notes -->
		<div class="flex flex-col gap-1.5">
			<label
				for="notes"
				class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
			>
				Notes
			</label>
			<textarea
				id="notes"
				v-model="notes"
				rows="4"
				placeholder="Setup, emotions, observations…"
				class="bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100 resize-none"
				data-testid="trade-notes-textarea"
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
					data-testid="screenshot-dropzone"
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
					data-testid="screenshot-link-input"
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
				'mt-auto w-full py-3.5 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100 flex items-center justify-center gap-2',
				isValid
					? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
					: 'bg-border text-text-muted cursor-not-allowed',
			]"
			data-testid="submit-trade-btn"
		>
			<template v-if="justSubmitted">
				<Check :size="16" :stroke-width="3" />
				Logged
			</template>
			<template v-else> Log Trade → </template>
		</button>
	</form>
</template>
