<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import {
	ArrowUpRight,
	ArrowDownRight,
	Calculator,
	Check,
	DollarSign,
	Percent,
	Plus,
	Link2,
	Coins,
	Layers,
	Radio,
	PenLine,
	Search,
} from "lucide-vue-next";
import { useStrategies } from "../composables/useStrategies.js";
import { useExchangeSymbols, useLivePrice } from "../composables/useMarketData.js";

const router = useRouter();
const { strategiesByDirection } = useStrategies();

// Input states
const symbol = ref("");
const capital = ref(1000);
const riskAmount = ref(10);
const riskPercent = ref(1);
const direction = ref("Long");
const strategy = ref("");

// Stop loss state
const stopLossType = ref("percent"); // 'percent' | 'price'
const stopLossPercent = ref(2);
const entryPrice = ref(100);
const stopPrice = ref(98);

// Margin state
const marginAllocated = ref(100);

// Take profit state
const tpType = ref("rr"); // 'rr' | 'price'
const rrRatio = ref(2);
const tpPrice = ref(104);

// Keep Risk Amount and Risk Percent in sync
watch(capital, (newCap) => {
	if (newCap <= 0) return;
	riskAmount.value = Number(((newCap * riskPercent.value) / 100).toFixed(2));
});

const onRiskAmountChange = () => {
	if (capital.value > 0) {
		riskPercent.value = Number(((riskAmount.value / capital.value) * 100).toFixed(2));
	}
};

const onRiskPercentChange = () => {
	riskAmount.value = Number(((capital.value * riskPercent.value) / 100).toFixed(2));
};

// Sync Stop Price if stopLossPercent is changed while in price mode
const syncStopPrice = () => {
	if (entryPrice.value <= 0) return;
	if (direction.value === "Long") {
		stopPrice.value = Number((entryPrice.value * (1 - stopLossPercent.value / 100)).toFixed(4));
	} else {
		stopPrice.value = Number((entryPrice.value * (1 + stopLossPercent.value / 100)).toFixed(4));
	}
};

// Sync TP Price if R:R or Entry is changed
const syncTpPrice = () => {
	if (entryPrice.value <= 0) return;
	const slDist = Math.abs(entryPrice.value - stopPrice.value);
	if (direction.value === "Long") {
		tpPrice.value = Number((entryPrice.value + slDist * rrRatio.value).toFixed(4));
	} else {
		tpPrice.value = Number((entryPrice.value - slDist * rrRatio.value).toFixed(4));
	}
};

// Computations
const computedSlPercent = computed(() => {
	if (stopLossType.value === "percent") {
		return stopLossPercent.value || 0;
	} else {
		if (!entryPrice.value || !stopPrice.value || entryPrice.value === stopPrice.value) return 0;
		return Number(
			((Math.abs(entryPrice.value - stopPrice.value) / entryPrice.value) * 100).toFixed(2),
		);
	}
});

const computedRrRatio = computed(() => {
	if (tpType.value === "rr") {
		return rrRatio.value || 0;
	} else {
		if (!entryPrice.value || !tpPrice.value || !stopPrice.value) return 0;
		const slDist = Math.abs(entryPrice.value - stopPrice.value);
		if (slDist === 0) return 0;

		if (direction.value === "Long") {
			return Number(((tpPrice.value - entryPrice.value) / slDist).toFixed(2));
		} else {
			return Number(((entryPrice.value - tpPrice.value) / slDist).toFixed(2));
		}
	}
});

const computedTpPrice = computed(() => {
	if (tpType.value === "price") {
		return tpPrice.value || 0;
	} else {
		if (entryPrice.value <= 0 || computedSlPercent.value <= 0) return 0;
		const pct = computedSlPercent.value * computedRrRatio.value;
		if (direction.value === "Long") {
			return Number((entryPrice.value * (1 + pct / 100)).toFixed(4));
		} else {
			return Number((entryPrice.value * (1 - pct / 100)).toFixed(4));
		}
	}
});

const positionSizeUsd = computed(() => {
	const sl = computedSlPercent.value;
	if (sl <= 0) return 0;
	return Number((riskAmount.value / (sl / 100)).toFixed(2));
});

const positionSizeUnits = computed(() => {
	if (entryPrice.value <= 0 || positionSizeUsd.value <= 0) return 0;
	return Number((positionSizeUsd.value / entryPrice.value).toFixed(4));
});

const requiredLeverage = computed(() => {
	if (marginAllocated.value <= 0 || positionSizeUsd.value <= 0) return 0;
	return Number((positionSizeUsd.value / marginAllocated.value).toFixed(1));
});

const expectedProfitUsd = computed(() => {
	return Number((riskAmount.value * computedRrRatio.value).toFixed(2));
});

const returnOnMargin = computed(() => {
	if (marginAllocated.value <= 0) return 0;
	return Number(((expectedProfitUsd.value / marginAllocated.value) * 100).toFixed(1));
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

// Watch type switches to sync prices
watch(stopLossType, (type) => {
	if (type === "price") {
		syncStopPrice();
	}
});

watch(tpType, (type) => {
	if (type === "price") {
		syncTpPrice();
	}
});

// Export to Journal
const logTrade = () => {
	const notesStr = `[Calculator Trade Plan]
Capital: $${capital.value} | Risk: $${riskAmount.value} (${riskPercent.value}%)
Entry: $${entryPrice.value} | SL: $${stopLossType.value === "price" ? stopPrice.value : stopLossPercent.value + "%"} (${computedSlPercent.value.toFixed(2)}%)
Position Size: $${positionSizeUsd.value} (${positionSizeUnits.value} units)
Required Leverage: ${requiredLeverage.value}x | Margin: $${marginAllocated.value}
Target TP: $${computedTpPrice.value} (${computedRrRatio.value.toFixed(1)}R)
Est. Profit: $${expectedProfitUsd.value} (${returnOnMargin.value}% RoM)`;

	router.push({
		path: "/trade-logging",
		query: {
			symbol: symbol.value.trim().toUpperCase(),
			direction: direction.value,
			strategy: strategy.value,
			entryPrice: entryPrice.value,
			rMultiple: computedRrRatio.value,
			notes: notesStr,
			pnl: "",
			autoOpen: "true",
		},
	});
};
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

				<!-- Asset Symbol & Direction -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div class="flex flex-col gap-1.5">
						<label
							for="calc-symbol"
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Symbol</label
						>
						<input
							id="calc-symbol"
							v-model="symbol"
							type="text"
							placeholder="e.g. BTCUSDT"
							class="bg-transparent border border-border px-3 py-2 font-mono text-sm tracking-wider uppercase text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
						/>
					</div>
					<div class="flex flex-col gap-1.5 md:col-span-2">
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Direction</span
						>
						<div
							class="grid grid-cols-2 border border-border rounded-md overflow-hidden"
						>
							<button
								type="button"
								@click="direction = 'Long'"
								:class="[
									'flex items-center cursor-pointer justify-center gap-2 py-2 font-mono text-xs tracking-widest uppercase transition-colors duration-100 border-r border-border',
									direction === 'Long'
										? 'bg-success/15 text-success'
										: 'text-text-muted hover:bg-surface-hover hover:text-text-main',
								]"
							>
								<ArrowUpRight :size="14" />
								Long
							</button>
							<button
								type="button"
								@click="direction = 'Short'"
								:class="[
									'flex items-center cursor-pointer justify-center gap-2 py-2 font-mono text-xs tracking-widest uppercase transition-colors duration-100',
									direction === 'Short'
										? 'bg-danger/15 text-danger'
										: 'text-text-muted hover:bg-surface-hover hover:text-text-main',
								]"
							>
								<ArrowDownRight :size="14" />
								Short
							</button>
						</div>
					</div>
				</div>

				<!-- Capital & Risk Setup -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border/40 pt-4">
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
							for="calc-risk-amt"
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Risk Amount ($)</label
						>
						<div class="relative">
							<DollarSign
								:size="12"
								class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60"
							/>
							<input
								id="calc-risk-amt"
								v-model.number="riskAmount"
								type="number"
								step="0.1"
								min="0.1"
								@input="onRiskAmountChange"
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
								@input="onRiskPercentChange"
								class="w-full bg-transparent border border-border pl-6 pr-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
					</div>
				</div>

				<!-- Stop Loss Settings -->
				<div class="flex flex-col gap-3 border-t border-border/40 pt-4">
					<div class="flex items-center justify-between">
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Stop Loss Config</span
						>
						<div class="flex gap-2 font-mono text-[9px]">
							<button
								type="button"
								@click="stopLossType = 'percent'"
								:class="[
									'px-2 py-0.5 border rounded transition-colors uppercase tracking-wider',
									stopLossType === 'percent'
										? 'border-primary text-primary bg-primary/10'
										: 'border-border text-text-muted hover:text-text-main',
								]"
							>
								Percentage
							</button>
							<button
								type="button"
								@click="stopLossType = 'price'"
								:class="[
									'px-2 py-0.5 border rounded transition-colors uppercase tracking-wider',
									stopLossType === 'price'
										? 'border-primary text-primary bg-primary/10'
										: 'border-border text-text-muted hover:text-text-main',
								]"
							>
								Price points
							</button>
						</div>
					</div>

					<!-- Stop Loss Input Options -->
					<div
						v-if="stopLossType === 'percent'"
						class="grid grid-cols-1 md:grid-cols-2 gap-4"
					>
						<div class="flex flex-col gap-1.5">
							<label
								for="calc-sl-pct"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Stop Loss Distance (%)</label
							>
							<div class="relative">
								<Percent
									:size="12"
									class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60"
								/>
								<input
									id="calc-sl-pct"
									v-model.number="stopLossPercent"
									type="number"
									step="0.1"
									min="0.01"
									class="w-full bg-transparent border border-border pl-6 pr-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
								/>
							</div>
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								for="calc-entry-ref"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Reference Entry Price ($)</label
							>
							<input
								id="calc-entry-ref"
								v-model.number="entryPrice"
								type="number"
								step="0.0001"
								min="0.0001"
								class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
					</div>

					<div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/40 pt-4">
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

					<!-- Strategy Tag Select -->
					<div class="flex flex-col gap-1.5">
						<label
							for="calc-strategy"
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Strategy Tag (Optional)</label
						>
						<select
							id="calc-strategy"
							v-model="strategy"
							class="bg-transparent border border-border px-3 py-2 font-sans text-xs text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
						>
							<option value="" class="bg-background text-text-muted">
								Select Strategy...
							</option>
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
				</div>

				<!-- Take Profit Target Planner -->
				<div class="flex flex-col gap-3 border-t border-border/40 pt-4">
					<div class="flex items-center justify-between">
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
							>Take Profit Planner (Optional)</span
						>
						<div class="flex gap-2 font-mono text-[9px]">
							<button
								type="button"
								@click="tpType = 'rr'"
								:class="[
									'px-2 py-0.5 border rounded transition-colors uppercase tracking-wider',
									tpType === 'rr'
										? 'border-primary text-primary bg-primary/10'
										: 'border-border text-text-muted hover:text-text-main',
								]"
							>
								R:R Multiple
							</button>
							<button
								type="button"
								@click="tpType = 'price'"
								:class="[
									'px-2 py-0.5 border rounded transition-colors uppercase tracking-wider',
									tpType === 'price'
										? 'border-primary text-primary bg-primary/10'
										: 'border-border text-text-muted hover:text-text-main',
								]"
							>
								TP Price
							</button>
						</div>
					</div>

					<div v-if="tpType === 'rr'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label
								for="calc-rr"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Target R:R Ratio</label
							>
							<input
								id="calc-rr"
								v-model.number="rrRatio"
								type="number"
								step="0.5"
								min="0.1"
								class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
					</div>
					<div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label
								for="calc-tp-pr"
								class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
								>Take Profit Price ($)</label
							>
							<input
								id="calc-tp-pr"
								v-model.number="tpPrice"
								type="number"
								step="0.0001"
								min="0.0001"
								class="bg-transparent border border-border px-3 py-2 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary rounded-md"
							/>
						</div>
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

						<!-- Financial Sizing Breakdown -->
						<div class="grid grid-cols-2 gap-4">
							<div class="bg-background/20 p-3 border border-border/40 rounded-md">
								<p
									class="font-mono text-[9px] text-text-muted uppercase tracking-wider"
								>
									Margin Used
								</p>
								<p class="text-lg font-mono font-bold text-text-main mt-0.5">
									${{ marginAllocated }}
								</p>
							</div>
							<div class="bg-background/20 p-3 border border-border/40 rounded-md">
								<p
									class="font-mono text-[9px] text-text-muted uppercase tracking-wider"
								>
									Risk Amount
								</p>
								<p class="text-lg font-mono font-bold text-danger mt-0.5">
									${{ riskAmount }}
								</p>
							</div>
						</div>

						<!-- Take Profit Estimates -->
						<div
							v-if="computedSlPercent > 0"
							class="bg-background/30 p-4 border border-border/60 rounded-md flex flex-col gap-2"
						>
							<p
								class="font-mono text-[10px] text-text-muted uppercase tracking-wider border-b border-border/40 pb-1.5"
							>
								Take Profit Sizing
							</p>

							<div class="grid grid-cols-2 gap-4 font-mono text-xs">
								<div>
									<span class="text-text-muted text-[10px]">Target TP Price</span>
									<p class="font-bold text-text-main mt-0.5">
										${{
											computedTpPrice.toLocaleString(undefined, {
												minimumFractionDigits: 2,
												maximumFractionDigits: 4,
											})
										}}
									</p>
								</div>
								<div>
									<span class="text-text-muted text-[10px]">Expected Profit</span>
									<p class="font-bold text-success mt-0.5">
										+${{ expectedProfitUsd }}
									</p>
								</div>
							</div>

							<div
								class="grid grid-cols-2 gap-4 font-mono text-xs border-t border-border/30 pt-2 mt-1"
							>
								<div>
									<span class="text-text-muted text-[10px]">Reward Multiple</span>
									<p class="font-bold text-text-main mt-0.5">
										{{ computedRrRatio.toFixed(2) }}R
									</p>
								</div>
								<div>
									<span class="text-text-muted text-[10px]"
										>Return on Margin</span
									>
									<p class="font-bold text-success mt-0.5">
										+{{ returnOnMargin }}%
									</p>
								</div>
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

					<!-- Log Trade Integration Button -->
					<button
						type="button"
						@click="logTrade"
						:disabled="computedSlPercent <= 0 || requiredLeverage <= 0"
						:class="[
							'w-full py-3.5 font-heading font-bold text-xs tracking-widest uppercase transition-all duration-100 flex items-center justify-center gap-2 rounded-md',
							computedSlPercent > 0 && requiredLeverage > 0
								? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px cursor-pointer'
								: 'bg-border text-text-muted cursor-not-allowed',
						]"
					>
						<Plus :size="14" />
						Log Planned Trade →
					</button>
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
