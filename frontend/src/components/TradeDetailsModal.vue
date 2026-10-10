<script setup>
import { computed, onUnmounted, watch } from "vue";
import { Check, X } from "lucide-vue-next";
import { useTradingRules } from "../composables/useTradingRules.js";
import { useSetups } from "../composables/useSetups.js";

const props = defineProps({ trade: { type: Object, default: null } });
const emit = defineEmits(["close"]);
const { tradingRules } = useTradingRules();
const { setups } = useSetups();

// Saved selections keep their historical state. Newly configured items appear unchecked.
const withCurrentItems = (saved = [], current = []) => {
	const items = [...saved];
	const labels = new Set(saved.map((item) => item.label));
	for (const item of current) {
		if (!item.label || labels.has(item.label)) continue;
		items.push({ ...item, checked: false });
		labels.add(item.label);
	}
	return items;
};

const displayedRules = computed(() => withCurrentItems(
	props.trade?.rulesChecklist || [],
	(tradingRules.value || []).map((rule) => ({ label: rule.text, required: rule.required !== false })),
));

const displayedConfluences = computed(() => {
	const setup = (setups.value || []).find((item) => item.name === props.trade?.setup)
		|| (setups.value || []).find((item) => item.name === props.trade?.strategy);
	const current = (setup?.items || []).map((item) => typeof item === "string"
		? { label: item, required: true }
		: { label: item.label, required: item.required !== false });
	return withCurrentItems(props.trade?.checklist || [], current);
});

const display = (value) => value === null || value === undefined || value === "" ? "—" : value;
const formatNumber = (value) => value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString();
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "—";

const imageUrl = (src) => {
	if (!src) return "";
	const match = src.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)\/?/i);
	if (match) return `https://s3.tradingview.com/snapshots/${match[1][0].toLowerCase()}/${match[1]}.png`;
	return /^(data:image\/|https?:\/\/.*\.(?:jpe?g|gif|png|webp|svg)(?:\?.*)?$)/i.test(src) ? src : "";
};

const handleEscape = (event) => {
	if (event.key === "Escape") emit("close");
};

watch(() => props.trade, (trade) => {
	if (trade) document.addEventListener("keydown", handleEscape);
	else document.removeEventListener("keydown", handleEscape);
});
onUnmounted(() => document.removeEventListener("keydown", handleEscape));
</script>

<template>
	<Teleport to="body">
		<div v-if="trade" class="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="trade-details-modal">
			<div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>
			<section role="dialog" aria-modal="true" aria-labelledby="trade-details-title" class="relative w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-border rounded-lg bg-background shadow-2xl">
				<header class="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-surface/40">
					<div>
						<p class="font-mono text-[10px] uppercase tracking-widest text-text-muted">Trade details</p>
						<h2 id="trade-details-title" class="font-heading text-xl font-black text-text-main">{{ trade.symbol }} <span class="text-sm font-normal text-text-muted">{{ display(trade.direction) }}</span></h2>
					</div>
					<button type="button" @click="emit('close')" aria-label="Close trade details" class="p-2 text-text-muted hover:text-text-main"><X :size="20" /></button>
				</header>
				<div class="overflow-y-auto p-6 space-y-6">
					<div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
						<div v-for="field in [
							{ label: 'Date', value: formatDate(trade.date) },
							{ label: 'Session', value: display(trade.session) },
							{ label: 'Strategy', value: display(trade.strategy) },
							{ label: 'Entry', value: formatNumber(trade.entryPrice) },
							{ label: 'Risk amount', value: trade.riskAmount == null ? '—' : `$${Number(trade.riskAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
							{ label: 'Exit', value: formatNumber(trade.exitPrice) },
							{ label: 'RRR used', value: trade.rMultiple == null ? '—' : `${trade.rMultiple}R` },
							{ label: 'Realized PNL', value: trade.pnl == null ? '—' : `$${Number(trade.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
						]" :key="field.label">
							<p class="font-mono text-[10px] uppercase tracking-widest text-text-muted">{{ field.label }}</p>
							<p class="mt-1 font-mono text-sm text-text-main break-words">{{ field.value }}</p>
						</div>
					</div>
					<div>
						<h3 class="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-2">Trading rules</h3>
						<p v-if="!displayedRules.length" class="text-sm text-text-muted">—</p>
						<ul v-else class="space-y-2">
							<li v-for="(item, index) in displayedRules" :key="index" class="flex items-start gap-2 text-sm" data-testid="trade-detail-rule">
								<Check v-if="item.checked" :size="16" class="text-success shrink-0" aria-label="Checked" />
								<X v-else :size="16" class="text-text-muted shrink-0" aria-label="Unchecked" />
								<span>{{ item.label }} <span v-if="item.required === false" class="text-text-muted">(optional)</span></span>
							</li>
						</ul>
					</div>
					<div>
						<h3 class="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-2">Setup confluences</h3>
						<p v-if="!displayedConfluences.length" class="text-sm text-text-muted">—</p>
						<ul v-else class="space-y-2">
							<li v-for="(item, index) in displayedConfluences" :key="index" class="flex items-start gap-2 text-sm" data-testid="trade-detail-confluence">
								<Check v-if="item.checked" :size="16" class="text-success shrink-0" aria-label="Checked" />
								<X v-else :size="16" class="text-text-muted shrink-0" aria-label="Unchecked" />
								<span>{{ item.label }} <span v-if="item.required === false" class="text-text-muted">(optional)</span></span>
							</li>
						</ul>
					</div>
					<div>
						<h3 class="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-2">Tags</h3>
						<p class="text-sm break-words">{{ trade.tags?.length ? trade.tags.join(', ') : '—' }}</p>
					</div>
					<div>
						<h3 class="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-2">Notes</h3>
						<p class="text-sm whitespace-pre-wrap break-words">{{ display(trade.notes) }}</p>
					</div>
					<div>
						<h3 class="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-2">Mistakes</h3>
						<p class="text-sm whitespace-pre-wrap break-words" data-testid="trade-detail-mistakes">{{ display(trade.mistakes) }}</p>
					</div>
					<div>
						<h3 class="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-2">Actionable takeaways</h3>
						<p class="text-sm whitespace-pre-wrap break-words" data-testid="trade-detail-actionable-takeaways">{{ display(trade.actionableTakeaways) }}</p>
					</div>
					<div>
						<h3 class="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-2">Screenshot</h3>
						<p v-if="!trade.screenshot" class="text-sm text-text-muted">—</p>
						<a v-else :href="trade.screenshot" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Open screenshot</a>
						<img v-if="imageUrl(trade.screenshot)" :src="imageUrl(trade.screenshot)" alt="Trade screenshot" class="mt-2 max-w-full max-h-80 object-contain border border-border" />
					</div>
				</div>
			</section>
		</div>
	</Teleport>
</template>
