<script setup>
import { computed, ref } from "vue";
import { Calendar, Target, BarChart3, ChevronLeft, ChevronRight, ListChecks, ShieldCheck } from "lucide-vue-next";
import { useTradingRules } from "../composables/useTradingRules";
import { useSetups } from "../composables/useSetups";

const props = defineProps({
	trades: { type: Array, required: true },
});

const { tradingRules } = useTradingRules();
const { setups } = useSetups();

// Old trades keep a label-only snapshot of rules at log time (rulesChecklist has
// no ruleId), so a deleted rule stays orphaned in that history forever unless we
// filter it back out against the live rules list here.
const activeRuleLabels = computed(() => new Set((tradingRules.value || []).map((r) => r.text)));

// Same problem for setup confluences: trade.checklist snapshots {label, required}
// off the setup's items at log time, no itemId link. Map setup name -> its current
// confluence labels so deleted setups/items drop out of the breakdown below.
const activeSetupItems = computed(() => {
	const map = {};
	(setups.value || []).forEach((setup) => {
		map[setup.name] = new Set(
			(setup.items || []).map((item) => (typeof item === "string" ? item : item.label))
		);
	});
	return map;
});

const hasTrades = computed(() => props.trades.length > 0);

// Date navigation state
const currentDate = ref(new Date());

const currentYear = computed(() => currentDate.value.getFullYear());
const currentMonth = computed(() => currentDate.value.getMonth());

const navigateMonth = (delta) => {
	const newDate = new Date(currentDate.value);
	newDate.setMonth(newDate.getMonth() + delta);
	currentDate.value = newDate;
};

const navigateYear = (delta) => {
	const newDate = new Date(currentDate.value);
	newDate.setFullYear(newDate.getFullYear() + delta);
	currentDate.value = newDate;
};

const goToToday = () => {
	currentDate.value = new Date();
};

const formatMonthYear = () => {
	return currentDate.value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const pnlStats = computed(() => {
	const tradesWithPnl = props.trades.filter((t) => t.pnl !== null && t.pnl !== undefined);
	const totalTrades = tradesWithPnl.length;

	if (totalTrades === 0) {
		return {
			winRate: 0,
			pnl1Day: 0,
			pnl7Days: 0,
		};
	}

	const wins = tradesWithPnl.filter((t) => t.pnl > 0);
	const winRate = (wins.length / totalTrades) * 100;

	const now = new Date();
	const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

	const pnl1Day = tradesWithPnl
		.filter((t) => new Date(t.createdAt) >= oneDayAgo)
		.reduce((sum, t) => sum + t.pnl, 0);

	const pnl7Days = tradesWithPnl
		.filter((t) => new Date(t.createdAt) >= sevenDaysAgo)
		.reduce((sum, t) => sum + t.pnl, 0);

	return {
		winRate,
		pnl1Day,
		pnl7Days,
	};
});

const strategyBreakdown = computed(() => {
	const breakdown = {};
	props.trades.forEach((trade) => {
		if (!breakdown[trade.strategy]) {
			breakdown[trade.strategy] = {
				total: 0,
				pnl: 0,
				wins: 0,
				losses: 0,
			};
		}
		breakdown[trade.strategy].total++;
		if (trade.pnl !== null && trade.pnl !== undefined) {
			breakdown[trade.strategy].pnl += trade.pnl;
			if (trade.pnl > 0) breakdown[trade.strategy].wins++;
			if (trade.pnl < 0) breakdown[trade.strategy].losses++;
		}
	});
	return Object.entries(breakdown).map(([strategy, data]) => ({
		strategy,
		...data,
		winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
	}));
});

const directionBreakdown = computed(() => {
	const longs = props.trades.filter((t) => t.direction === "Long");
	const shorts = props.trades.filter((t) => t.direction === "Short");

	const longPnl = longs.reduce((sum, t) => sum + (t.pnl || 0), 0);
	const shortPnl = shorts.reduce((sum, t) => sum + (t.pnl || 0), 0);

	return {
		long: { count: longs.length, pnl: longPnl },
		short: { count: shorts.length, pnl: shortPnl },
	};
});

// Confluence adherence: how often required/optional checklist items were checked
// off when a trade was logged. Ratio only — no "followed"/"missed" pass/fail framing.
const confluenceAdherence = computed(() => {
	const tradesWithChecklist = props.trades.filter((t) => (t.checklist || []).length > 0);

	const overall = { requiredChecked: 0, requiredTotal: 0, optionalChecked: 0, optionalTotal: 0 };
	const bySetup = {};

	tradesWithChecklist.forEach((trade) => {
		const setupName = trade.setup || "No Setup";
		const activeLabels = activeSetupItems.value[setupName];
		if (setupName !== "No Setup" && !activeLabels) return; // setup itself was deleted

		if (!bySetup[setupName]) {
			bySetup[setupName] = { requiredChecked: 0, requiredTotal: 0, optionalChecked: 0, optionalTotal: 0, trades: 0, byLabel: {} };
		}
		bySetup[setupName].trades++;

		trade.checklist
			.filter((item) => setupName === "No Setup" || activeLabels.has(item.label))
			.forEach((item) => {
				const bucket = item.required === false ? "optional" : "required";
				overall[`${bucket}Total`]++;
				bySetup[setupName][`${bucket}Total`]++;
				if (item.checked) {
					overall[`${bucket}Checked`]++;
					bySetup[setupName][`${bucket}Checked`]++;
				}

				if (!bySetup[setupName].byLabel[item.label]) {
					bySetup[setupName].byLabel[item.label] = { checked: 0, total: 0, required: item.required !== false };
				}
				bySetup[setupName].byLabel[item.label].total++;
				if (item.checked) bySetup[setupName].byLabel[item.label].checked++;
			});
	});

	const pct = (checked, total) => (total > 0 ? (checked / total) * 100 : null);

	return {
		tradeCount: tradesWithChecklist.length,
		requiredPct: pct(overall.requiredChecked, overall.requiredTotal),
		optionalPct: pct(overall.optionalChecked, overall.optionalTotal),
		bySetup: Object.entries(bySetup).map(([setupName, data]) => ({
			setup: setupName,
			trades: data.trades,
			requiredPct: pct(data.requiredChecked, data.requiredTotal),
			optionalPct: pct(data.optionalChecked, data.optionalTotal),
			items: Object.entries(data.byLabel)
				.map(([label, item]) => ({
					label,
					required: item.required,
					total: item.total,
					pct: pct(item.checked, item.total),
				}))
				.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)),
		})),
	};
});

// Rule adherence: how often each configured trading rule was actually checked off
// at log time. Sorted worst-first so the rule most often skipped surfaces on top —
// this is a "what to work on" list, not a pass/fail gate (logging is never blocked on it).
const ruleAdherence = computed(() => {
	const tradesWithRules = props.trades.filter((t) => (t.rulesChecklist || []).length > 0);

	const overall = { requiredChecked: 0, requiredTotal: 0, optionalChecked: 0, optionalTotal: 0 };
	const byRule = {};

	tradesWithRules.forEach((trade) => {
		trade.rulesChecklist.filter((item) => activeRuleLabels.value.has(item.label)).forEach((item) => {
			const bucket = item.required === false ? "optional" : "required";
			overall[`${bucket}Total`]++;
			if (item.checked) overall[`${bucket}Checked`]++;

			if (!byRule[item.label]) {
				byRule[item.label] = { checked: 0, total: 0, required: item.required !== false };
			}
			byRule[item.label].total++;
			if (item.checked) byRule[item.label].checked++;
		});
	});

	const pct = (checked, total) => (total > 0 ? (checked / total) * 100 : null);

	return {
		tradeCount: tradesWithRules.length,
		requiredPct: pct(overall.requiredChecked, overall.requiredTotal),
		optionalPct: pct(overall.optionalChecked, overall.optionalTotal),
		byRule: Object.entries(byRule)
			.map(([label, data]) => ({
				label,
				required: data.required,
				total: data.total,
				pct: pct(data.checked, data.total),
			}))
			.sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)),
	};
});

const pnlCalendar = computed(() => {
	const calendar = {};
	const year = currentYear.value;
	const month = currentMonth.value;

	// Get first and last day of selected month
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);

	// Helper function to create a consistent date key (local time)
	const getDateKey = (date) => {
		const d = new Date(date);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	};

	// Initialize all days in the selected month
	for (let day = 1; day <= lastDay.getDate(); day++) {
		const date = new Date(year, month, day);
		const dateKey = getDateKey(date);
		calendar[dateKey] = { pnl: 0, trades: 0 };
	}

	// Fill in trade data for selected month
	props.trades.forEach((trade) => {
		if (trade.pnl !== null && trade.pnl !== undefined) {
			const tradeDate = new Date(trade.createdAt);
			if (tradeDate.getFullYear() === year && tradeDate.getMonth() === month) {
				const dateKey = getDateKey(tradeDate);
				if (calendar[dateKey]) {
					calendar[dateKey].pnl += trade.pnl;
					calendar[dateKey].trades++;
				}
			}
		}
	});

	return Object.entries(calendar).map(([date, data]) => ({
		date,
		...data,
	}));
});

const monthPnlStats = computed(() => {
	const year = currentYear.value;
	const month = currentMonth.value;

	const monthTrades = props.trades.filter((t) => {
		const tradeDate = new Date(t.createdAt);
		return tradeDate.getFullYear() === year && tradeDate.getMonth() === month;
	});

	const tradesWithPnl = monthTrades.filter((t) => t.pnl !== null && t.pnl !== undefined);
	const totalTrades = tradesWithPnl.length;

	if (totalTrades === 0) {
		return {
			totalPnl: 0,
			winRate: 0,
			totalWins: 0,
			totalLosses: 0,
			totalTrades: 0,
		};
	}

	const wins = tradesWithPnl.filter((t) => t.pnl > 0);
	const losses = tradesWithPnl.filter((t) => t.pnl < 0);

	const totalPnl = tradesWithPnl.reduce((sum, t) => sum + t.pnl, 0);
	const winRate = (wins.length / totalTrades) * 100;

	return {
		totalPnl,
		winRate,
		totalWins: wins.length,
		totalLosses: losses.length,
		totalTrades,
	};
});

const formatPnl = (n) => {
	if (n === null || n === undefined || Number.isNaN(n)) return "$0.00";
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	const abs = Math.abs(n).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return `${sign}$${abs}`;
};

const formatPercent = (n) => {
	return `${n.toFixed(1)}%`;
};

const formatDate = (dateStr) => {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getBarWidth = (value, max) => {
	if (max === 0) return 0;
	return Math.abs((value / max) * 100);
};

const maxStrategyPnl = computed(() => {
	const values = strategyBreakdown.value.map((s) => Math.abs(s.pnl));
	return values.length > 0 ? Math.max(...values) : 1;
});

const maxCalendarPnl = computed(() => {
	const values = pnlCalendar.value.map((d) => Math.abs(d.pnl));
	return values.length > 0 ? Math.max(...values) : 1;
});
</script>

<template>
	<div class="h-full flex flex-col" data-testid="pnl-analysis">
		<!-- Header -->
		<div
			class="lg:ml-34 px-6 h-12 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur"
		>
			<div class="flex items-center gap-3">
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					PnL Analysis
				</span>
				<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
					{{ trades.length }} {{ trades.length === 1 ? "trade" : "trades" }}
				</span>
			</div>
			<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
				// ANALYTICS
			</span>
		</div>

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
					status :: no data
				</div>
				<pre
					class="font-mono text-[10px] sm:text-xs text-text-muted/60 leading-tight mb-8 select-none"
				>
 ┌─────────────────────────────┐
 │   NO TRADES TO ANALYZE       │
 │   LOG TRADES TO SEE STATS    │
 └─────────────────────────────┘</pre
				>
				<p class="font-mono text-sm text-primary cursor-blink tracking-wider">waiting</p>
				<p class="mt-6 font-sans text-sm text-text-muted">
					Navigate to Trade Logging to add trades.
					<br />
					Analytics will appear here automatically.
				</p>
			</div>
		</div>

		<!-- Content -->
		<div v-else class="lg:ml-34 flex-1 overflow-auto p-6">
			<!-- Time-based Stats -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
				<!-- Win Rate -->
				<div class="border border-border bg-surface/40 p-4" data-testid="stat-win-rate">
					<div class="flex items-center gap-2 mb-2">
						<Target :size="16" :stroke-width="2" class="text-text-muted" />
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
						>
							Win Rate
						</span>
					</div>
					<span class="font-mono font-bold text-2xl tabular-nums text-primary">
						{{ formatPercent(pnlStats.winRate) }}
					</span>
				</div>

				<!-- 1 Day PnL -->
				<div class="border border-border bg-surface/40 p-4" data-testid="stat-1day-pnl">
					<div class="flex items-center gap-2 mb-2">
						<Calendar :size="16" :stroke-width="2" class="text-text-muted" />
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
						>
							1 Day PnL
						</span>
					</div>
					<span
						:class="[
							'font-mono font-bold text-2xl tabular-nums',
							pnlStats.pnl1Day > 0 && 'text-success',
							pnlStats.pnl1Day < 0 && 'text-danger',
							pnlStats.pnl1Day === 0 && 'text-text-muted',
						]"
					>
						{{ formatPnl(pnlStats.pnl1Day) }}
					</span>
				</div>

				<!-- 7 Days PnL -->
				<div class="border border-border bg-surface/40 p-4" data-testid="stat-7days-pnl">
					<div class="flex items-center gap-2 mb-2">
						<Calendar :size="16" :stroke-width="2" class="text-text-muted" />
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
						>
							7 Days PnL
						</span>
					</div>
					<span
						:class="[
							'font-mono font-bold text-2xl tabular-nums',
							pnlStats.pnl7Days > 0 && 'text-success',
							pnlStats.pnl7Days < 0 && 'text-danger',
							pnlStats.pnl7Days === 0 && 'text-text-muted',
						]"
					>
						{{ formatPnl(pnlStats.pnl7Days) }}
					</span>
				</div>
			</div>

			<!-- PnL Calendar -->
			<div class="border border-border bg-surface/40 p-4 mb-8" data-testid="pnl-calendar">
				<!-- Calendar Header with Navigation -->
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-2">
						<Calendar :size="16" :stroke-width="2" class="text-text-muted" />
						<span class="font-heading font-black text-sm tracking-widest uppercase">
							PnL Calendar
						</span>
					</div>
					<div class="flex items-center gap-2">
						<button
							@click="navigateYear(-1)"
							class="p-1 text-text-muted hover:text-text-main transition-colors"
							title="Previous year"
						>
							<ChevronLeft :size="16" :stroke-width="2" />
						</button>
						<button
							@click="navigateMonth(-1)"
							class="p-1 text-text-muted hover:text-text-main transition-colors"
							title="Previous month"
						>
							<ChevronLeft :size="16" :stroke-width="2" />
						</button>
						<span
							class="font-mono text-sm font-bold text-text-main min-w-[140px] text-center"
						>
							{{ formatMonthYear() }}
						</span>
						<button
							@click="navigateMonth(1)"
							class="p-1 text-text-muted hover:text-text-main transition-colors"
							title="Next month"
						>
							<ChevronRight :size="16" :stroke-width="2" />
						</button>
						<button
							@click="navigateYear(1)"
							class="p-1 text-text-muted hover:text-text-main transition-colors"
							title="Next year"
						>
							<ChevronRight :size="16" :stroke-width="2" />
						</button>
						<button
							@click="goToToday"
							class="ml-2 px-2 py-1 text-[10px] font-mono tracking-wider uppercase border border-border hover:border-primary hover:text-primary transition-colors"
						>
							Today
						</button>
					</div>
				</div>

				<!-- Month Stats -->
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-3 bg-surface/30 rounded">
					<div>
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1"
						>
							Month PnL
						</span>
						<span
							:class="[
								'font-mono font-bold text-lg tabular-nums',
								monthPnlStats.totalPnl > 0 && 'text-success',
								monthPnlStats.totalPnl < 0 && 'text-danger',
								monthPnlStats.totalPnl === 0 && 'text-text-muted',
							]"
						>
							{{ formatPnl(monthPnlStats.totalPnl) }}
						</span>
					</div>
					<div>
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1"
						>
							Win Rate
						</span>
						<span class="font-mono font-bold text-lg tabular-nums text-primary">
							{{ formatPercent(monthPnlStats.winRate) }}
						</span>
					</div>
					<div>
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1"
						>
							Trades
						</span>
						<span class="font-mono font-bold text-lg tabular-nums text-text-main">
							{{ monthPnlStats.totalTrades }}
						</span>
					</div>
					<div>
						<span
							class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1"
						>
							W/L
						</span>
						<span class="font-mono font-bold text-lg tabular-nums">
							<span class="text-success">{{ monthPnlStats.totalWins }}</span
							>/<span class="text-danger">{{ monthPnlStats.totalLosses }}</span>
						</span>
					</div>
				</div>

				<!-- Calendar Grid -->
				<div class="grid grid-cols-7 gap-2">
					<div v-for="day in pnlCalendar" :key="day.date" class="relative group">
						<div
							:class="[
								'h-16 rounded border border-border flex flex-col items-center justify-center transition-all duration-200',
								day.pnl > 0 && 'bg-success/10 border-success/30',
								day.pnl < 0 && 'bg-danger/10 border-danger/30',
								day.pnl === 0 && 'bg-surface/40',
							]"
						>
							<span class="font-mono text-[10px] text-text-muted mb-1">
								{{ formatDate(day.date) }}
							</span>
							<span
								:class="[
									'font-mono text-xs font-bold tabular-nums',
									day.pnl > 0 && 'text-success',
									day.pnl < 0 && 'text-danger',
									day.pnl === 0 && 'text-text-muted/40',
								]"
							>
								{{ formatPnl(day.pnl) }}
							</span>
						</div>
						<!-- Tooltip -->
						<div
							v-if="day.trades > 0"
							class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-background border border-border rounded text-[10px] font-mono text-text-muted opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10"
						>
							{{ day.trades }} trade{{ day.trades > 1 ? "s" : "" }}
						</div>
					</div>
				</div>
			</div>

			<!-- Direction Breakdown -->
			<div
				class="border border-border bg-surface/40 p-4 mb-8"
				data-testid="direction-breakdown"
			>
				<div class="flex items-center gap-2 mb-4">
					<BarChart3 :size="16" :stroke-width="2" class="text-text-muted" />
					<span class="font-heading font-black text-sm tracking-widest uppercase">
						Direction Breakdown
					</span>
				</div>
				<div class="space-y-4">
					<!-- Long -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span
								class="font-mono text-xs text-text-muted tracking-wider uppercase"
							>
								Long
							</span>
							<span class="font-mono text-xs text-text-muted">
								{{ directionBreakdown.long.count }} trades
							</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
								<div
									class="h-full bg-success transition-all duration-300"
									:style="{
										width: `${getBarWidth(directionBreakdown.long.pnl, maxStrategyPnl)}%`,
									}"
								></div>
							</div>
							<span
								:class="[
									'font-mono text-xs tabular-nums',
									directionBreakdown.long.pnl > 0 && 'text-success',
									directionBreakdown.long.pnl < 0 && 'text-danger',
								]"
							>
								{{ formatPnl(directionBreakdown.long.pnl) }}
							</span>
						</div>
					</div>
					<!-- Short -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<span
								class="font-mono text-xs text-text-muted tracking-wider uppercase"
							>
								Short
							</span>
							<span class="font-mono text-xs text-text-muted">
								{{ directionBreakdown.short.count }} trades
							</span>
						</div>
						<div class="flex items-center gap-2">
							<div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
								<div
									class="h-full bg-danger transition-all duration-300"
									:style="{
										width: `${getBarWidth(directionBreakdown.short.pnl, maxStrategyPnl)}%`,
									}"
								></div>
							</div>
							<span
								:class="[
									'font-mono text-xs tabular-nums',
									directionBreakdown.short.pnl > 0 && 'text-success',
									directionBreakdown.short.pnl < 0 && 'text-danger',
								]"
							>
								{{ formatPnl(directionBreakdown.short.pnl) }}
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Strategy Breakdown -->
			<div class="border border-border bg-surface/40 p-4" data-testid="strategy-breakdown">
				<div class="flex items-center gap-2 mb-4">
					<BarChart3 :size="16" :stroke-width="2" class="text-text-muted" />
					<span class="font-heading font-black text-sm tracking-widest uppercase">
						Strategy Breakdown
					</span>
				</div>
				<div class="space-y-3">
					<div
						v-for="item in strategyBreakdown"
						:key="item.strategy"
						class="border-b border-border/60 pb-3 last:border-0 last:pb-0"
					>
						<div class="flex items-center justify-between mb-2">
							<span class="font-sans text-sm text-text-main">{{
								item.strategy
							}}</span>
							<div class="flex items-center gap-4">
								<span class="font-mono text-xs text-text-muted">
									{{ item.total }} trades
								</span>
								<span class="font-mono text-xs text-text-muted">
									{{ formatPercent(item.winRate) }} win rate
								</span>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
								<div
									:class="[
										'h-full transition-all duration-300',
										item.pnl > 0 ? 'bg-success' : 'bg-danger',
									]"
									:style="{ width: `${getBarWidth(item.pnl, maxStrategyPnl)}%` }"
								></div>
							</div>
							<span
								:class="[
									'font-mono text-xs tabular-nums',
									item.pnl > 0 && 'text-success',
									item.pnl < 0 && 'text-danger',
								]"
							>
								{{ formatPnl(item.pnl) }}
							</span>
						</div>
					</div>
				</div>
			</div>

				<!-- Confluence Adherence -->
				<div
					v-if="confluenceAdherence.tradeCount > 0"
					class="border border-border bg-surface/40 p-4 mt-8"
					data-testid="confluence-adherence"
				>
					<div class="flex items-center justify-between mb-4">
						<div class="flex items-center gap-2">
							<ListChecks :size="16" :stroke-width="2" class="text-text-muted" />
							<span class="font-heading font-black text-sm tracking-widest uppercase">
								Confluence Adherence
							</span>
						</div>
						<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
							{{ confluenceAdherence.tradeCount }} logged with checklist
						</span>
					</div>

					<!-- Overall -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 bg-surface/30 rounded">
						<div>
							<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
								Required Confluences Checked
							</span>
							<span class="font-mono font-bold text-lg tabular-nums text-primary">
								{{ confluenceAdherence.requiredPct !== null ? formatPercent(confluenceAdherence.requiredPct) : "—" }}
							</span>
						</div>
						<div>
							<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
								Optional Confluences Used
							</span>
							<span class="font-mono font-bold text-lg tabular-nums text-text-main">
								{{ confluenceAdherence.optionalPct !== null ? formatPercent(confluenceAdherence.optionalPct) : "—" }}
							</span>
						</div>
					</div>

					<!-- Per setup -->
					<div class="space-y-3">
						<div
							v-for="item in confluenceAdherence.bySetup"
							:key="item.setup"
							class="border-b border-border/60 pb-3 last:border-0 last:pb-0"
						>
							<div class="flex items-center justify-between mb-2">
								<span class="font-sans text-sm text-text-main">{{ item.setup }}</span>
								<span class="font-mono text-xs text-text-muted">
									{{ item.trades }} trades
								</span>
							</div>
							<div class="flex items-center gap-2 mb-1">
								<div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
									<div
										class="h-full bg-primary transition-all duration-300"
										:style="{ width: `${item.requiredPct ?? 0}%` }"
									></div>
								</div>
								<span class="font-mono text-xs tabular-nums text-text-main w-24 text-right">
									{{ item.requiredPct !== null ? `${formatPercent(item.requiredPct)} required` : "no required" }}
								</span>
							</div>
							<div v-if="item.optionalPct !== null" class="flex items-center gap-2">
								<div class="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
									<div
										class="h-full bg-text-muted/60 transition-all duration-300"
										:style="{ width: `${item.optionalPct}%` }"
									></div>
								</div>
								<span class="font-mono text-[10px] tabular-nums text-text-muted w-24 text-right">
									{{ formatPercent(item.optionalPct) }} optional
								</span>
							</div>

							<!-- Individual confluences, worst-first -->
							<div class="mt-2 pl-3 border-l border-border/40 space-y-1.5">
								<div
									v-for="conf in item.items"
									:key="conf.label"
									class="flex items-center gap-2"
								>
									<span class="font-sans text-xs text-text-muted flex-1 truncate">
										{{ conf.label }}
										<span v-if="!conf.required" class="ml-1 font-mono text-[9px] text-text-muted/50 tracking-widest uppercase">
											optional
										</span>
									</span>
									<div class="w-20 h-1.5 bg-border rounded-full overflow-hidden">
										<div
											class="h-full bg-primary/70 transition-all duration-300"
											:style="{ width: `${conf.pct ?? 0}%` }"
										></div>
									</div>
									<span class="font-mono text-[10px] tabular-nums text-text-muted w-10 text-right">
										{{ conf.pct !== null ? formatPercent(conf.pct) : "—" }}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Rule Adherence -->
				<div
					v-if="ruleAdherence.tradeCount > 0"
					class="border border-border bg-surface/40 p-4 mt-8"
					data-testid="rule-adherence"
				>
					<div class="flex items-center justify-between mb-4">
						<div class="flex items-center gap-2">
							<ShieldCheck :size="16" :stroke-width="2" class="text-text-muted" />
							<span class="font-heading font-black text-sm tracking-widest uppercase">
								Rule Adherence
							</span>
						</div>
						<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
							{{ ruleAdherence.tradeCount }} logged with rules
						</span>
					</div>

					<!-- Overall -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-3 bg-surface/30 rounded">
						<div>
							<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
								Required Rules Followed
							</span>
							<span class="font-mono font-bold text-lg tabular-nums text-primary">
								{{ ruleAdherence.requiredPct !== null ? formatPercent(ruleAdherence.requiredPct) : "—" }}
							</span>
						</div>
						<div>
							<span class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1">
								Optional Rules Followed
							</span>
							<span class="font-mono font-bold text-lg tabular-nums text-text-main">
								{{ ruleAdherence.optionalPct !== null ? formatPercent(ruleAdherence.optionalPct) : "—" }}
							</span>
						</div>
					</div>

					<!-- Per rule, worst-first: what to work on -->
					<div class="space-y-3">
						<div
							v-for="item in ruleAdherence.byRule"
							:key="item.label"
							class="border-b border-border/60 pb-3 last:border-0 last:pb-0"
						>
							<div class="flex items-center justify-between mb-2">
								<span class="font-sans text-sm text-text-main">
									{{ item.label }}
									<span v-if="!item.required" class="ml-1 font-mono text-[9px] text-text-muted/50 tracking-widest uppercase">
										optional
									</span>
								</span>
								<span class="font-mono text-xs text-text-muted">
									{{ item.total }} trades
								</span>
							</div>
							<div class="flex items-center gap-2">
								<div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
									<div
										class="h-full transition-all duration-300"
										:class="(item.pct ?? 0) < 50 ? 'bg-danger' : 'bg-primary'"
										:style="{ width: `${item.pct ?? 0}%` }"
									></div>
								</div>
								<span class="font-mono text-xs tabular-nums text-text-main w-16 text-right">
									{{ item.pct !== null ? formatPercent(item.pct) : "—" }}
								</span>
							</div>
						</div>
					</div>
				</div>
		</div>
	</div>
</template>
