<script setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Ellipsis, Plus, SlidersHorizontal, TrendingUp } from "lucide-vue-next";
import { useAuth } from "../composables/useAuth.js";
import { useTrades } from "../composables/useTrades.js";
import { useDashboardRange } from "../composables/useDashboardRange.js";
import apiFetch from "../utils/api.js";

const router = useRouter();
const { isLoggedIn, user } = useAuth();
const { trades: storedTrades, setTrades } = useTrades();
const { startDate, endDate, activePreset, setPreset, includesDate } = useDashboardRange();
const selectedDay = ref(new Date().getDate());
const calendarCursor = ref(endDate.value ? new Date(`${endDate.value}T00:00:00`) : new Date());
const ranges = ["1W", "1M", "3M", "YTD", "ALL"];
const apiUrl = import.meta.env.VITE_API_BASE_URL;

const { data: fetchedTrades, isLoading, isError } = useQuery({
	queryKey: ["trades"],
	queryFn: () => apiFetch(`${apiUrl}/api/trades`, { method: "GET", credentials: "include" }),
	enabled: computed(() => isLoggedIn.value),
	staleTime: 5 * 60 * 1000,
});

watch(fetchedTrades, (value) => { if (value) setTrades(value); }, { immediate: true });
watch(endDate, (value) => {
	calendarCursor.value = value ? new Date(`${value}T00:00:00`) : new Date();
	selectedDay.value = calendarCursor.value.getDate();
});

const realTrades = computed(() => storedTrades.value);
const filteredTrades = computed(() => realTrades.value.filter((trade) => includesDate(trade.date || trade.createdAt)));
const closedTrades = computed(() => filteredTrades.value.filter((trade) => trade.pnl !== null && trade.pnl !== undefined && Number.isFinite(Number(trade.pnl))));
const sortedTrades = computed(() => [...filteredTrades.value].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)));
const money = (value) => `${value >= 0 ? "+" : "−"}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const currentStreak = computed(() => {
	const results = sortedTrades.value.filter((trade) => Number(trade.pnl) !== 0);
	if (!results.length) return { count: 0, result: "trades" };
	const winning = Number(results[0].pnl) > 0;
	let count = 0;
	for (const trade of results) { if ((Number(trade.pnl) > 0) !== winning) break; count += 1; }
	return { count, result: winning ? "wins" : "losses" };
});
const stats = computed(() => {
	const wins = closedTrades.value.filter((trade) => Number(trade.pnl) > 0);
	const losses = closedTrades.value.filter((trade) => Number(trade.pnl) < 0);
	const net = closedTrades.value.reduce((sum, trade) => sum + Number(trade.pnl), 0);
	const grossWins = wins.reduce((sum, trade) => sum + Number(trade.pnl), 0);
	const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + Number(trade.pnl), 0));
	return { wins, losses, net, winRate: closedTrades.value.length ? wins.length / closedTrades.value.length * 100 : 0, profitFactor: grossLosses ? grossWins / grossLosses : 0 };
});
const metrics = computed(() => [
	{ label: "Net P&L", value: money(stats.value.net), change: `${stats.value.net >= 0 ? "+" : ""}${stats.value.net ? "Live" : "0%"}`, trend: stats.value.net >= 0 ? "up" : "down", tone: stats.value.net >= 0 ? "profit" : "", detail: "all recorded trades" },
	{ label: "Win rate", value: `${stats.value.winRate.toFixed(1)}%`, change: `${stats.value.wins.length} wins`, trend: stats.value.winRate >= 50 ? "up" : "down", detail: `${stats.value.losses.length} losses` },
	{ label: "Profit factor", value: stats.value.profitFactor.toFixed(2), change: stats.value.profitFactor >= 1 ? "Profitable" : "Below 1", trend: stats.value.profitFactor >= 1 ? "up" : "down", detail: "gross profit / loss" },
	{ label: "Average R:R", value: "—", change: "No risk field", trend: "neutral", detail: "available on new trades" },
	{ label: "Total trades", value: String(filteredTrades.value.length), change: `${closedTrades.value.length} closed`, trend: "neutral", detail: "in selected range" },
	{ label: "Current streak", value: `${currentStreak.value.count} ${currentStreak.value.result}`, change: "Current", trend: currentStreak.value.result === "wins" ? "up" : currentStreak.value.result === "losses" ? "down" : "neutral", detail: "latest results" },
]);
const calendarDays = computed(() => {
	const year = calendarCursor.value.getFullYear(); const month = calendarCursor.value.getMonth(); const days = new Date(year, month + 1, 0).getDate();
	return Array.from({ length: days }, (_, index) => {
		const day = index + 1;
		const pnl = closedTrades.value.filter((trade) => { const date = new Date(trade.date || trade.createdAt); return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day; }).reduce((sum, trade) => sum + Number(trade.pnl), 0);
		return { day, pnl };
	});
});
const calendarTitle = computed(() => calendarCursor.value.toLocaleDateString("en-US", { month: "long", year: "numeric" }));
const calendarLeadingDays = computed(() => (new Date(calendarCursor.value.getFullYear(), calendarCursor.value.getMonth(), 1).getDay() + 6) % 7);
function navigateCalendar(offset) {
	const date = new Date(calendarCursor.value);
	date.setMonth(date.getMonth() + offset, 1);
	calendarCursor.value = date;
	selectedDay.value = 1;
}
const monthPnl = computed(() => calendarDays.value.reduce((sum, day) => sum + day.pnl, 0));
const chartValues = computed(() => {
	let total = 0;
	return [...closedTrades.value].sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt)).map((trade) => total += Number(trade.pnl));
});
const chartPoints = computed(() => {
	const values = chartValues.value.length ? chartValues.value : [0]; const min = Math.min(...values, 0); const max = Math.max(...values, 1); const span = max - min || 1;
	return values.map((value, index) => `${values.length === 1 ? 0 : index / (values.length - 1) * 578},${174 - (value - min) / span * 160}`).join(" ");
});
const chartArea = computed(() => `0,174 ${chartPoints.value} 578,190 0,190`);
const chartYLabels = computed(() => {
	const values = chartValues.value.length ? chartValues.value : [0];
	const minimum = Math.min(...values, 0); const maximum = Math.max(...values, 0); const span = maximum - minimum || 1;
	return Array.from({ length: 4 }, (_, index) => maximum - span * index / 3).map((value) => money(value));
});
const chartXLabels = computed(() => {
	const dates = closedTrades.value.map((trade) => new Date(trade.date || trade.createdAt)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
	const fallbackEnd = endDate.value ? new Date(`${endDate.value}T00:00:00`) : new Date();
	const fallbackStart = startDate.value ? new Date(`${startDate.value}T00:00:00`) : fallbackEnd;
	const first = dates[0] || fallbackStart; const last = dates.at(-1) || fallbackEnd; const span = last - first;
	return Array.from({ length: 5 }, (_, index) => new Date(first.getTime() + span * index / 4).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
});
const trades = computed(() => sortedTrades.value.slice(0, 5).map((trade) => ({
	...trade,
	market: trade.exchange || trade.strategy || "Manual trade",
	direction: String(trade.direction || "—").toUpperCase(),
	entry: Number.isFinite(Number(trade.entryPrice)) ? Number(trade.entryPrice).toLocaleString() : "—",
	exit: Number.isFinite(Number(trade.exitPrice)) ? Number(trade.exitPrice).toLocaleString() : "—",
	size: Number.isFinite(Number(trade.qty)) ? String(trade.qty) : "—",
	r: trade.rMultiple || "—",
	setup: trade.setup || trade.strategy || "Unassigned",
	date: new Date(trade.date || trade.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
	displayPnl: Number.isFinite(Number(trade.pnl)) ? money(Number(trade.pnl)) : "Open",
})));
</script>

<template>
	<div class="dashboard-page">
		<section class="dashboard-intro">
			<div><h2>Good evening, {{ user.displayName }}.</h2><p>Here’s how your trading performance is shaping up.</p></div>
			<button class="primary-action" @click="router.push('/trade-logging?autoOpen=true')"><Plus :size="17" /> Log trade</button>
		</section>
		<div v-if="isError" class="data-message error">Could not load saved trades. Check backend connection, then retry.</div>
		<div v-else-if="isLoading" class="data-message">Loading your saved trading data…</div>
		<section class="metrics-grid">
			<article v-for="metric in metrics" :key="metric.label" class="metric-card">
				<div class="metric-header"><span>{{ metric.label }}</span></div>
				<strong :class="['metric-value', metric.tone]">{{ metric.value }}</strong>
				<div class="metric-foot"><span :class="['metric-change', metric.trend]"><ArrowUpRight v-if="metric.trend === 'up'" :size="13" /><ArrowDownRight v-if="metric.trend === 'down'" :size="13" />{{ metric.change }}</span><span>{{ metric.detail }}</span></div>
			</article>
		</section>
		<section class="performance-grid">
			<article class="panel equity-panel">
				<header class="panel-header"><div><h3>Equity curve</h3><p>Cumulative P&L from saved trades</p></div><div class="range-tabs"><button v-for="range in ranges" :key="range" :class="{ active: activePreset === range }" @click="setPreset(range)">{{ range }}</button></div></header>
				<div class="equity-summary"><div><span>Cumulative P&L</span><strong>{{ money(stats.net) }}</strong></div><span class="summary-gain"><TrendingUp :size="14" /> {{ closedTrades.length }} closed</span></div>
				<div class="chart-wrap">
					<div class="chart-y-labels"><span v-for="label in chartYLabels" :key="label">{{ label }}</span></div>
					<svg viewBox="0 0 578 190" preserveAspectRatio="none" role="img" aria-label="Rising account equity curve">
						<defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity=".25"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>
						<line v-for="y in [15,65,115,165]" :key="y" x1="0" :y1="y" x2="578" :y2="y" class="chart-gridline" /><polygon :points="chartArea" fill="url(#equityFill)" /><polyline :points="chartPoints" fill="none" stroke="#4f8cff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
					</svg>
					<div class="chart-x-labels"><span v-for="label in chartXLabels" :key="label">{{ label }}</span></div>
				</div>
			</article>
			<article class="panel calendar-panel">
				<header class="panel-header calendar-header"><div><h3>{{ calendarTitle }}</h3><p><span :class="monthPnl >= 0 ? 'profit-text' : 'loss-text'">{{ money(monthPnl) }}</span> in selected range</p></div><div><button class="calendar-arrow" aria-label="Previous month" @click="navigateCalendar(-1)"><ChevronLeft :size="16" /></button><button class="calendar-arrow" aria-label="Next month" @click="navigateCalendar(1)"><ChevronRight :size="16" /></button></div></header>
				<div class="calendar-weekdays"><span v-for="day in ['MON','TUE','WED','THU','FRI','SAT','SUN']" :key="day">{{ day }}</span></div>
				<div class="calendar-grid"><span v-for="blank in calendarLeadingDays" :key="`blank-${blank}`"></span><button v-for="day in calendarDays" :key="day.day" :class="[{ selected: selectedDay === day.day, profit: day.pnl > 0, loss: day.pnl < 0 }]" @click="selectedDay = day.day"><small>{{ day.day }}</small><b v-if="day.pnl">{{ day.pnl > 0 ? '+' : '−' }}${{ Math.abs(day.pnl).toLocaleString() }}</b></button></div>
				<footer class="calendar-legend"><span><i class="profit"></i> Profit</span><span><i class="loss"></i> Loss</span><span><i></i> No trades</span></footer>
			</article>
		</section>
		<section class="panel trades-panel">
			<header class="panel-header trades-header"><div><h3>Recent trades</h3><p>Your latest saved trading activity</p></div><div class="trade-actions"><button class="secondary-action"><SlidersHorizontal :size="15" /> Filter</button><button class="text-action">View all trades <ArrowUpRight :size="15" /></button></div></header>
			<div class="table-scroll"><table><thead><tr><th>Symbol</th><th>Direction</th><th>Entry</th><th>Exit</th><th>Position size</th><th>P&L</th><th>R-Multiple</th><th>Setup</th><th>Date</th><th></th></tr></thead><tbody>
				<tr v-for="trade in trades" :key="trade._id || trade.symbol + trade.date" @click="router.push('/trade-logging')"><td><div class="symbol-cell"><span>{{ trade.symbol }}</span><small>{{ trade.market }}</small></div></td><td><span :class="['direction-badge', trade.direction.toLowerCase()]">{{ trade.direction }}</span></td><td class="number-cell">{{ trade.entry }}</td><td class="number-cell">{{ trade.exit }}</td><td>{{ trade.size }}</td><td :class="['number-cell pnl-cell', trade.pnl > 0 ? 'profit-text' : trade.pnl < 0 ? 'loss-text' : '']">{{ trade.displayPnl }}</td><td :class="['number-cell', trade.pnl > 0 ? 'profit-text' : trade.pnl < 0 ? 'loss-text' : '']">{{ trade.r }}</td><td><span class="setup-pill">{{ trade.setup }}</span></td><td class="date-cell">{{ trade.date }}</td><td><button class="row-menu"><Ellipsis :size="17" /></button></td></tr>
				<tr v-if="!trades.length && !isLoading"><td colspan="10" class="empty-trades">No saved trades yet. Log your first trade to begin.</td></tr>
			</tbody></table></div>
		</section>
	</div>
</template>
