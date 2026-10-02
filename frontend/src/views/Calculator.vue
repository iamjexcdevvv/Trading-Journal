<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import {
	DollarSign,
	Percent,
	Link2,
	Coins,
	Layers,
	Radio,
	PenLine,
	Search,
} from "lucide-vue-next";
import { useExchangeSymbols, useLivePrice } from "../composables/useMarketData.js";

defineOptions({ name: "ValueAtRiskCalculator" });

const capital = ref(1000);
const riskPercent = ref(1);
const entryPrice = ref(100);
const stopPrice = ref(98);
const marginAllocated = ref(100);

const riskAmount = computed(() => {
	if (capital.value <= 0 || riskPercent.value <= 0) return 0;
	return Number(((capital.value * riskPercent.value) / 100).toFixed(2));
});

const computedSlPercent = computed(() => {
	if (entryPrice.value <= 0 || stopPrice.value < 0 || entryPrice.value === stopPrice.value) return 0;
	return (Math.abs(entryPrice.value - stopPrice.value) / entryPrice.value) * 100;
});

const positionSizeUsd = computed(() => {
	const sl = computedSlPercent.value;
	if (sl <= 0) return 0;
	return Number((riskAmount.value / (sl / 100)).toFixed(2));
});

const requiredLeverage = computed(() => {
	if (marginAllocated.value <= 0 || positionSizeUsd.value <= 0) return 0;
	return Number((positionSizeUsd.value / marginAllocated.value).toFixed(1));
});

// --- Lot Size Calculator ---
const EXCHANGES = [
	{ id: "binance", label: "Binance" },
	{ id: "bybit", label: "Bybit" },
	{ id: "bitunix", label: "Bitunix" },
];

const lsExchange = ref("binance");
const lsCoin = ref("");
const lsCoinSearch = ref("");
const lsCoinDropdownOpen = ref(false);
const lsContractSize = ref(1);
const lsPriceSource = ref("auto"); // 'auto' | 'manual'
const lsManualPrice = ref(0);
const lsStopLossPrice = ref(0);

const { data: lsSymbols, isLoading: lsSymbolsLoading } = useExchangeSymbols(lsExchange);
const { price: lsLivePrice, subscribe: subscribeLivePrice, unsubscribe: unsubscribeLivePrice } =
	useLivePrice();

const lsIsValidCoin = computed(() => !!lsCoin.value && (lsSymbols.value || []).includes(lsCoin.value));

const lsFilteredCoins = computed(() => {
	const list = lsSymbols.value || [];
	const q = lsCoinSearch.value.trim().toUpperCase();
	if (!q) return list.slice(0, 50);
	return list.filter((s) => s.includes(q)).slice(0, 50);
});

const pickCoin = (s) => {
	lsCoin.value = s;
	lsCoinSearch.value = s;
	lsCoinDropdownOpen.value = false;
};

const onCoinSearchInput = () => {
	lsCoin.value = "";
	lsCoinDropdownOpen.value = true;
};

const lsEntryPrice = computed(() => {
	if (lsPriceSource.value === "manual") return lsManualPrice.value || 0;
	return lsLivePrice.value || 0;
});

// Reset the selected coin whenever the exchange changes (symbol lists don't overlap)
watch(lsExchange, () => {
	lsCoin.value = "";
	lsCoinSearch.value = "";
});

watch([lsCoin, lsPriceSource, lsExchange], ([coin, source, exchange]) => {
	if (source === "auto" && coin && (lsSymbols.value || []).includes(coin)) {
		subscribeLivePrice(exchange, coin);
	} else {
		unsubscribeLivePrice();
	}
});

onUnmounted(() => {
	unsubscribeLivePrice();
});

const lotSize = computed(() => {
	const priceDelta = Math.abs(lsEntryPrice.value - lsStopLossPrice.value);
	if (priceDelta <= 0 || lsContractSize.value <= 0 || riskAmount.value <= 0) return 0;
	return Number((riskAmount.value / (priceDelta * lsContractSize.value)).toFixed(4));
});

const lsPositionValueUsd = computed(() => {
	if (lotSize.value <= 0 || lsEntryPrice.value <= 0) return 0;
	return Number((lotSize.value * lsContractSize.value * lsEntryPrice.value).toFixed(2));
});

</script>

<template>
	<div class="h-full flex flex-col min-h-0 bg-background" data-testid="calculator-page">
		<!-- Header -->
		<div
			class="px-6 h-12 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur shrink-0"
		>
			<div class="flex items-center gap-3">
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Value at Risk Calculator
				</span>
				<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
					// Risk-Based Position Sizing
				</span>
			</div>
		</div>

		<!-- Main Workspace Grid -->
		<div
			class="flex-1 overflow-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-0"
		>
			<!-- Left Side: Inputs Form (xl:col-span-7) -->
			<form
				@submit.prevent
				class="xl:col-span-7 flex flex-col gap-5 bg-surface/20 border border-border p-6 rounded-lg backdrop-blur"
			>
				<div class="flex items-baseline justify-between border-b border-border/60 pb-3">
					<h2 class="font-heading font-black text-lg tracking-tight uppercase">Inputs</h2>
					<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase"
						>// METRICS</span
					>
				</div>

				<!-- Capital & Risk Setup -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="flex flex-col gap-1.5">
						<label
							for="calc-capital"
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Account Balance</label
						>
						<div class="relative">
							<DollarSign
								:size="12"
								class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60"
							/>
							<input
								id="calc-capital"
								v-model.number="capital"
								type="number"
								step="1"
								min="1"
								class="w-full bg-transparent border border-border pl-6 pr-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
					</div>
					<div class="flex flex-col gap-1.5">
						<label
							for="calc-risk-pct"
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Risk Percentage (%)</label
						>
						<div class="relative">
							<Percent
								:size="12"
								class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60"
							/>
							<input
								id="calc-risk-pct"
								v-model.number="riskPercent"
								type="number"
								step="0.05"
								min="0.01"
								class="w-full bg-transparent border border-border pl-6 pr-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
					</div>
				</div>

				<!-- Stop Loss Settings -->
				<div class="flex flex-col gap-3 border-t border-border/40 pt-4">
					<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
						>Entry and Stop Loss</span
					>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label
								for="calc-entry-pr"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Entry Price ($)</label
							>
							<input
								id="calc-entry-pr"
								v-model.number="entryPrice"
								type="number"
								step="0.0001"
								min="0.0001"
								class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								for="calc-stop-pr"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Stop Loss Price ($)</label
							>
							<input
								id="calc-stop-pr"
								v-model.number="stopPrice"
								type="number"
								step="0.0001"
								min="0.0001"
								class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
					</div>
				</div>

				<!-- Collateral / Margin Allocation -->
				<div class="grid grid-cols-1 gap-4 border-t border-border/40 pt-4">
					<div class="flex flex-col gap-1.5">
						<label
							for="calc-margin"
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Margin Allocated (Collateral)</label
						>
						<div class="relative">
							<DollarSign
								:size="12"
								class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60"
							/>
							<input
								id="calc-margin"
								v-model.number="marginAllocated"
								type="number"
								step="1"
								min="1"
								class="w-full bg-transparent border border-border pl-6 pr-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
						<span class="text-[10px] text-text-muted leading-tight"
							>Money committed as margin. Used to calculate required leverage.</span
						>
					</div>
				</div>

				<!-- Lot Size Calculator -->
				<div class="flex flex-col gap-3 border-t border-border/40 pt-4">
					<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
						>Lot Size Calculator</span
					>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label
								for="ls-exchange"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted flex items-center gap-1"
								><Link2 :size="11" /> Exchange</label
							>
							<select
								id="ls-exchange"
								v-model="lsExchange"
								class="bg-transparent border border-border px-3 py-2 font-sans text-xs text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							>
								<option
									v-for="ex in EXCHANGES"
									:key="ex.id"
									:value="ex.id"
									class="bg-background text-text-main"
								>
									{{ ex.label }}
								</option>
							</select>
						</div>
						<div class="flex flex-col gap-1.5 relative">
							<label
								for="ls-coin"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted flex items-center gap-1"
								><Coins :size="11" /> Coin</label
							>
							<div class="relative">
								<Search
									:size="12"
									class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60"
								/>
								<input
									id="ls-coin"
									v-model="lsCoinSearch"
									type="text"
									autocomplete="off"
									:placeholder="lsSymbolsLoading ? 'Loading pairs...' : 'Search coin e.g. BTC'"
									class="w-full bg-transparent border border-border pl-7 pr-3 py-2 font-mono text-sm tracking-wider uppercase text-text-main placeholder:text-text-muted/40 placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
									@input="onCoinSearchInput"
									@focus="lsCoinDropdownOpen = true"
									@keydown.esc="lsCoinDropdownOpen = false"
									@blur="lsCoinDropdownOpen = false"
								/>
							</div>

							<!-- Search results dropdown -->
							<ul
								v-if="lsCoinDropdownOpen"
								class="absolute top-full mt-1 left-0 right-0 z-20 max-h-48 overflow-y-auto bg-background border border-border rounded-md shadow-lg"
							>
								<li v-if="lsSymbolsLoading" class="px-3 py-2 font-mono text-xs text-text-muted">
									Loading pairs...
								</li>
								<li
									v-else-if="lsFilteredCoins.length === 0"
									class="px-3 py-2 font-mono text-xs text-text-muted"
								>
									No matches
								</li>
								<li
									v-for="s in lsFilteredCoins"
									:key="s"
									@mousedown.prevent="pickCoin(s)"
									:class="[
										'px-3 py-1.5 font-mono text-xs uppercase tracking-wider cursor-pointer hover:bg-primary/10 hover:text-primary',
										s === lsCoin ? 'text-primary bg-primary/5' : 'text-text-main',
									]"
								>
									{{ s }}
								</li>
							</ul>
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label
								for="ls-contract-size"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted flex items-center gap-1"
								><Layers :size="11" /> Contract Size</label
							>
							<input
								id="ls-contract-size"
								v-model.number="lsContractSize"
								type="number"
								step="0.0001"
								min="0.0001"
								class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								for="ls-sl-price"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Stop Loss Price ($)</label
							>
							<input
								id="ls-sl-price"
								v-model.number="lsStopLossPrice"
								type="number"
								step="0.0001"
								min="0"
								class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
					</div>

					<div class="flex flex-col gap-1.5">
						<div class="flex items-center justify-between">
							<span
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Entry Price</span
							>
							<div class="flex gap-2 font-mono text-[9px]">
								<button
									type="button"
									@click="lsPriceSource = 'auto'"
									:class="[
										'px-2 py-0.5 border rounded transition-colors uppercase tracking-wider flex items-center gap-1',
										lsPriceSource === 'auto'
											? 'border-primary text-primary bg-primary/10'
											: 'border-border text-text-muted hover:text-text-main',
									]"
								>
									<Radio :size="10" /> Live
								</button>
								<button
									type="button"
									@click="lsPriceSource = 'manual'"
									:class="[
										'px-2 py-0.5 border rounded transition-colors uppercase tracking-wider flex items-center gap-1',
										lsPriceSource === 'manual'
											? 'border-primary text-primary bg-primary/10'
											: 'border-border text-text-muted hover:text-text-main',
									]"
								>
									<PenLine :size="10" /> Manual
								</button>
							</div>
						</div>

						<input
							v-if="lsPriceSource === 'manual'"
							v-model.number="lsManualPrice"
							type="number"
							step="0.0001"
							min="0"
							placeholder="Enter price ($)"
							class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
						/>
						<div
							v-else
							class="bg-background/30 border border-border px-3 py-2 font-mono text-sm rounded-md flex items-center justify-between"
						>
							<span v-if="!lsIsValidCoin" class="text-text-muted text-xs"
								>Select a coin to stream its live price</span
							>
							<span v-else-if="lsLivePrice === null" class="text-text-muted text-xs"
								>Connecting...</span
							>
							<span v-else class="text-text-main font-bold"
								>${{
									lsLivePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })
								}}</span
							>
							<span
								v-if="lsIsValidCoin"
								class="w-1.5 h-1.5 rounded-full"
								:class="lsLivePrice !== null ? 'bg-success animate-pulse' : 'bg-text-muted'"
							/>
						</div>
					</div>
				</div>
			</form>

			<!-- Right Side: Outputs & Calculations Dashboard (xl:col-span-5) -->
			<div class="xl:col-span-5 flex flex-col gap-6">
				<!-- Summary Card -->
				<div
					class="bg-surface/30 border border-border p-6 rounded-lg backdrop-blur flex flex-col gap-5"
				>
					<div class="flex items-baseline justify-between border-b border-border/60 pb-3">
						<h2
							class="font-heading font-black text-lg tracking-tight uppercase text-primary"
						>
							Outputs
						</h2>
						<span
							class="font-mono text-[10px] text-text-muted tracking-widest uppercase"
							>// CALCULATION</span
						>
					</div>

					<!-- Value at Risk Summary -->
					<div class="flex flex-col gap-4">
						<!-- Value at Risk -->
						<div
							class="bg-background/45 p-4 border border-border/60 rounded-md text-center"
						>
							<p
								class="font-mono text-[10px] text-text-muted uppercase tracking-wider"
							>
								Value at Risk
							</p>
							<p
								class="text-4xl font-heading font-black tracking-tight text-text-main mt-1.5"
							>
								<span class="text-primary text-2xl font-mono">$</span
								>{{ riskAmount.toLocaleString() }}
							</p>
							<p class="text-[10px] text-text-muted mt-1 leading-normal font-mono">
								Account Balance × Risk Percentage
							</p>
						</div>

						<!-- Formula Breakdown -->
						<div
							class="p-3 border border-border/60 rounded-md font-mono text-xs flex flex-col gap-1"
						>
							<div class="font-bold uppercase tracking-wider text-primary">
								Position Sizing Breakdown
							</div>
							<div
								class="text-[10px] text-text-muted flex items-center justify-between border-t border-current/20 mt-1.5 pt-1.5"
							>
								<span>Stop Loss %</span>
								<span class="font-bold font-mono"
									>{{ computedSlPercent.toFixed(2) }}%</span
								>
							</div>
							<div
								class="text-[10px] text-text-muted flex items-center justify-between"
							>
								<span>Maximum Position Size</span>
								<span class="font-bold font-mono"
									>${{ positionSizeUsd.toLocaleString() }}</span
								>
							</div>
							<div
								class="text-[10px] text-text-muted flex items-center justify-between"
							>
								<span>Required Leverage</span>
								<span class="font-bold font-mono text-primary"
									>{{ requiredLeverage }}x</span
								>
							</div>
						</div>

						<!-- Lot Size Result -->
						<div
							class="bg-background/30 p-4 border border-border/60 rounded-md flex flex-col gap-2"
						>
							<p
								class="font-mono text-[10px] text-text-muted uppercase tracking-wider border-b border-border/40 pb-1.5 flex items-center justify-between"
							>
								<span>Lot Size Calculator</span>
								<span class="text-text-muted/70"
									>{{ EXCHANGES.find((e) => e.id === lsExchange)?.label }}<template
										v-if="lsCoin"
									>
										/ {{ lsCoin.toUpperCase() }}</template
									></span
								>
							</p>

							<div class="text-center py-1">
								<p class="font-mono text-[10px] text-text-muted uppercase tracking-wider">
									Lot Size (Contracts)
								</p>
								<p class="text-3xl font-heading font-black tracking-tight text-primary mt-1">
									{{ lotSize > 0 ? lotSize : "—" }}
								</p>
							</div>

							<div class="grid grid-cols-2 gap-4 font-mono text-xs border-t border-border/30 pt-2">
								<div>
									<span class="text-text-muted text-[10px]">Entry Price Used</span>
									<p class="font-bold text-text-main mt-0.5">
										{{ lsEntryPrice > 0 ? `$${lsEntryPrice}` : "—" }}
									</p>
								</div>
								<div>
									<span class="text-text-muted text-[10px]">Position Value</span>
									<p class="font-bold text-text-main mt-0.5">
										${{ lsPositionValueUsd.toLocaleString() }}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
/* Chrome, Safari, Edge, Opera */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

/* Firefox */
input[type="number"] {
	-moz-appearance: textfield;
}
</style>
