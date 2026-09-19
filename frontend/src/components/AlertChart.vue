<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
	CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineStyle,
	createChart, createSeriesMarkers,
} from 'lightweight-charts';
import { BellPlus, Maximize2, Minimize2, Minus, Radio, Search, Square, TrendingUp, Waves } from 'lucide-vue-next';
import { useCandles, useExchangeSymbols, useLivePrice } from '../composables/useMarketData.js';

const props = defineProps({
	alerts: { type: Array, default: () => [] },
	history: { type: Array, default: () => [] },
	drawings: { type: Array, default: () => [] },
	highlightDrawingId: { type: String, default: null },
});
const emit = defineEmits(['create-alert', 'update-alert', 'create-drawing', 'update-drawing', 'delete-drawing', 'create-drawing-alert', 'view-drawing-alert', 'toggle-drawing-alert', 'delete-drawing-alert']);

const exchange = ref('bitunix');
const symbol = ref('BTCUSDT');
const symbolInput = ref('BTCUSDT');
const interval = ref('15m');
const candleType = ref('candles');
const chartHost = ref(null);
const placing = ref(false);
const coordinateVersion = ref(0);
const dragPrices = ref({});
const latestCandle = ref(null);
const chartPanel = ref(null);
const chartStage = ref(null);
const drawingTool = ref(null);
const pendingPoints = ref([]);
const hoverPoint = ref(null);
const selectedDrawingId = ref(null);
const contextMenu = ref(null);
const drawingDrafts = ref({});
const isFullscreen = ref(false);
const intervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const candleTypes = [
	{ value: 'candles', label: 'Candles' },
	{ value: 'heikin_ashi', label: 'Heikin Ashi' },
];
const exchanges = [
	{ value: 'bitunix', label: 'Bitunix' },
	{ value: 'binance', label: 'Binance' },
	{ value: 'bybit', label: 'Bybit' },
];
const intervalSeconds = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 };
const { data: symbols } = useExchangeSymbols(exchange);
const {
	data: candlePages, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage,
} = useCandles(exchange, symbol, interval);
const candles = computed(() => {
	const byTime = new Map();
	for (const candle of candlePages.value?.pages?.flat() || []) byTime.set(candle.time, candle);
	return [...byTime.values()].sort((a, b) => a.time - b.time);
});
const { price: livePrice, subscribe, unsubscribe } = useLivePrice();
const matchingAlerts = computed(() => props.alerts.filter((alert) => alert.isActive && alert.status === 'active' && alert.alertType === 'price' && (alert.exchange || 'bitunix') === exchange.value && alert.symbol === symbol.value));
const matchingDrawings = computed(() => props.drawings.filter((drawing) => drawing.exchange === exchange.value && drawing.symbol === symbol.value));
const drawingAlerts = computed(() => new Map(props.alerts.filter((alert) => alert.alertType === 'drawing' && alert.drawingId).map((alert) => [String(alert.drawingId), alert])));
const priceChange = computed(() => {
	const candle = latestCandle.value;
	return candle?.open ? ((candle.close - candle.open) / candle.open) * 100 : 0;
});

let chart;
let candleSeries;
let volumeSeries;
let markers;
let resizeObserver;
let renderedCandles = [];
let displayedCandles = [];
let renderedKey = '';
let priceLines = new Map();
let dragging = null;
let draggingDrawing = null;
let coordinateSyncFrame = null;
let coordinateSyncActive = false;

const drawingShapes = computed(() => {
	coordinateVersion.value;
	if (!chart || !candleSeries || !chartHost.value) return [];
	const width = chartHost.value.clientWidth;
	return matchingDrawings.value.map((drawing) => shapeForDrawing({ ...drawing, geometry: drawingDrafts.value[drawing._id] || drawing.geometry }, width)).filter(Boolean);
});
const drawingPreview = computed(() => {
	coordinateVersion.value;
	if (!drawingTool.value || !hoverPoint.value || !chartHost.value) return null;
	const points = [...pendingPoints.value, hoverPoint.value];
	let previewType = drawingTool.value;
	if (previewType === 'parallel_channel' && points.length === 2) previewType = 'trendline';
	const required = previewType === 'horizontal_line' ? 1 : previewType === 'parallel_channel' ? 3 : 2;
	const shape = points.length >= required ? shapeForDrawing({ _preview: true, drawingType: previewType, geometry: { points: points.slice(0, required) }, label: '' }, chartHost.value.clientWidth) : null;
	return { shape, points: points.map((point) => ({ x: point.x, y: point.y })) };
});

function coordinateForTimestamp(time) {
	const step = intervalSeconds[interval.value];
	const alignedTime = Math.floor(time / step) * step;
	const direct = chart?.timeScale().timeToCoordinate(alignedTime);
	if (direct != null) return direct;
	const firstTime = renderedCandles[0]?.time;
	if (!Number.isFinite(firstTime) || !Number.isFinite(alignedTime) || !step) return null;
	return chart.timeScale().logicalToCoordinate((alignedTime - firstTime) / step);
}

function chartPoint(point) {
	const x = coordinateForTimestamp(point.time);
	const y = candleSeries?.priceToCoordinate(point.price);
	return x == null || y == null ? null : { x, y };
}

function shapeForDrawing(drawing, width) {
	const points = drawing.geometry?.points || [];
	const screen = points.map((point) => {
		if (drawing._preview && Number.isFinite(point.x) && Number.isFinite(point.y)) return { x: point.x, y: point.y };
		const y = candleSeries.priceToCoordinate(point.price);
		return drawing.drawingType === 'horizontal_line' ? (y == null ? null : { x: 0, y }) : chartPoint(point);
	});
	if (screen.some((point) => !point)) return null;
	const lines = [];
	let polygon = null;
	if (drawing.drawingType === 'horizontal_line') lines.push({ x1: 0, y1: screen[0].y, x2: width, y2: screen[0].y });
	if (drawing.drawingType === 'trendline') lines.push({ x1: screen[0].x, y1: screen[0].y, x2: screen[1].x, y2: screen[1].y });
	if (drawing.drawingType === 'ray') {
		const slope = (screen[1].y - screen[0].y) / (screen[1].x - screen[0].x || 1);
		lines.push({ x1: screen[0].x, y1: screen[0].y, x2: width, y2: screen[0].y + slope * (width - screen[0].x) });
	}
	if (drawing.drawingType === 'rectangle') polygon = `${screen[0].x},${screen[0].y} ${screen[1].x},${screen[0].y} ${screen[1].x},${screen[1].y} ${screen[0].x},${screen[1].y}`;
	if (drawing.drawingType === 'parallel_channel') {
		const slope = (points[1].price - points[0].price) / (points[1].time - points[0].time);
		const baseAtThird = points[0].price + slope * (points[2].time - points[0].time);
		const offset = points[2].price - baseAtThird;
		const parallel = [points[0], points[1]].map((point) => chartPoint({ time: point.time, price: point.price + offset }));
		if (parallel.some((point) => !point)) return null;
		const pixelSlope = (screen[1].y - screen[0].y) / (screen[1].x - screen[0].x || 1);
		const first = { x1: 0, y1: screen[0].y - pixelSlope * screen[0].x, x2: width, y2: screen[0].y + pixelSlope * (width - screen[0].x) };
		const second = { x1: 0, y1: parallel[0].y - pixelSlope * parallel[0].x, x2: width, y2: parallel[0].y + pixelSlope * (width - parallel[0].x) };
		lines.push(first, second);
		polygon = `${first.x1},${first.y1} ${first.x2},${first.y2} ${second.x2},${second.y2} ${second.x1},${second.y1}`;
	}
	const firstLine = lines[0];
	const label = firstLine ? { x: Math.max(8, firstLine.x1 + 7), y: firstLine.y1 - 7 } : { x: Math.min(screen[0].x, screen[1]?.x) + 7, y: Math.min(screen[0].y, screen[1]?.y) - 7 };
	const controlPoints = drawing.drawingType === 'horizontal_line' ? [{ x: width / 2, y: screen[0].y }] : screen;
	return { drawing, lines, polygon, label, controlPoints };
}

function applySymbol() {
	const next = symbolInput.value.trim().toUpperCase();
	if (/^[A-Z0-9]{1,20}$/.test(next) && (!symbols.value?.length || symbols.value.includes(next))) symbol.value = next;
	else symbolInput.value = symbol.value;
}

function formatPrice(value) {
	if (!Number.isFinite(Number(value))) return '—';
	return Number(value).toLocaleString(undefined, { maximumFractionDigits: Number(value) < 1 ? 8 : 2 });
}

function refreshCoordinates() {
	coordinateVersion.value += 1;
}

function syncInteractionCoordinates() {
	refreshCoordinates();
	coordinateSyncFrame = coordinateSyncActive ? requestAnimationFrame(syncInteractionCoordinates) : null;
}

function startCoordinateSync() {
	coordinateSyncActive = true;
	if (coordinateSyncFrame === null) coordinateSyncFrame = requestAnimationFrame(syncInteractionCoordinates);
}

function stopCoordinateSync() {
	coordinateSyncActive = false;
	if (coordinateSyncFrame === null) coordinateSyncFrame = requestAnimationFrame(syncInteractionCoordinates);
}

function scheduleCoordinateSync() {
	if (coordinateSyncFrame === null) coordinateSyncFrame = requestAnimationFrame(syncInteractionCoordinates);
}

function lineTop(alert) {
	coordinateVersion.value;
	const price = dragPrices.value[alert._id] ?? Number(alert.targetValue);
	const coordinate = candleSeries?.priceToCoordinate(price);
	return coordinate === null || coordinate === undefined ? { display: 'none' } : { top: `${coordinate}px` };
}

function syncPriceLines() {
	if (!candleSeries) return;
	for (const line of priceLines.values()) candleSeries.removePriceLine(line);
	priceLines = new Map();
	for (const alert of matchingAlerts.value) {
		priceLines.set(alert._id, candleSeries.createPriceLine({
			price: Number(alert.targetValue), color: '#f0b85b', lineWidth: 1,
			lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: alert.name,
		}));
	}
	nextTick(refreshCoordinates);
}

function syncMarkers() {
	if (!markers || !renderedCandles.length) return;
	const first = renderedCandles[0].time;
	const last = renderedCandles.at(-1).time;
	const step = intervalSeconds[interval.value];
	const values = props.history
		.filter((event) => (event.exchange || 'bitunix') === exchange.value && event.symbol === symbol.value)
		.map((event) => ({
			time: Math.floor(new Date(event.triggeredAt).getTime() / 1000 / step) * step,
			position: 'aboveBar', color: '#f0b85b', shape: 'circle', text: 'Alert',
		}))
		.filter((marker) => marker.time >= first && marker.time <= last)
		.sort((a, b) => a.time - b.time);
	markers.setMarkers(values);
}

function setHistoricalData(values) {
	if (!candleSeries || !Array.isArray(values)) return;
	const key = `${exchange.value}:${symbol.value}:${interval.value}`;
	const sameDataset = renderedKey === key;
	const previousFirstTime = sameDataset ? renderedCandles[0]?.time : null;
	const previousRange = sameDataset ? chart.timeScale().getVisibleLogicalRange() : null;
	renderedCandles = values.map((item) => ({ ...item }));
	renderedKey = key;
	latestCandle.value = renderedCandles.at(-1) || null;
	renderCandleData();
	if (previousRange && previousFirstTime && renderedCandles[0]?.time < previousFirstTime) {
		const added = renderedCandles.filter((item) => item.time < previousFirstTime).length;
		chart.timeScale().setVisibleLogicalRange({ from: previousRange.from + added, to: previousRange.to + added });
	} else if (renderedCandles.length) {
		chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, renderedCandles.length - 100), to: renderedCandles.length + 5 });
	}
	syncMarkers();
	syncPriceLines();
}

function heikinAshiCandle(item, previous = null) {
	const close = (item.open + item.high + item.low + item.close) / 4;
	const open = previous ? (previous.open + previous.close) / 2 : (item.open + item.close) / 2;
	return { ...item, open, high: Math.max(item.high, open, close), low: Math.min(item.low, open, close), close };
}

function heikinAshiData(values) {
	let previous = null;
	return values.map((item) => (previous = heikinAshiCandle(item, previous)));
}

function renderCandleData() {
	if (!candleSeries || !volumeSeries) return;
	displayedCandles = candleType.value === 'heikin_ashi' ? heikinAshiData(renderedCandles) : renderedCandles.map((item) => ({ ...item }));
	candleSeries.setData(displayedCandles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
	volumeSeries.setData(displayedCandles.map((item) => ({
		time: item.time, value: item.volume,
		color: item.close >= item.open ? '#35c98a55' : '#f06d7555',
	})));
	refreshCoordinates();
}

function handleVisibleRange(range) {
	refreshCoordinates();
	if (!range || !hasNextPage.value || isFetchingNextPage.value) return;
	const bars = candleSeries?.barsInLogicalRange(range);
	if (bars && bars.barsBefore < 25) fetchNextPage();
}

function updateLiveCandle(value) {
	if (!candleSeries || !Number.isFinite(value) || !renderedCandles.length) return;
	const step = intervalSeconds[interval.value];
	const time = Math.floor(Date.now() / 1000 / step) * step;
	const previous = renderedCandles.at(-1);
	const candle = previous.time === time
		? { ...previous, high: Math.max(previous.high, value), low: Math.min(previous.low, value), close: value }
		: { time, open: previous.close, high: value, low: value, close: value, volume: 0 };
	if (previous.time === time) renderedCandles[renderedCandles.length - 1] = candle;
	else renderedCandles.push(candle);
	latestCandle.value = candle;
	const previousDisplayed = displayedCandles[renderedCandles.length - 2];
	const display = candleType.value === 'heikin_ashi'
		? heikinAshiCandle(candle, previousDisplayed)
		: { ...candle };
	displayedCandles[renderedCandles.length - 1] = display;
	candleSeries.update({ time: display.time, open: display.open, high: display.high, low: display.low, close: display.close });
	refreshCoordinates();
}

function timestampAtCoordinate(x, suppliedTime = null) {
	if (typeof suppliedTime === 'number' && Number.isFinite(suppliedTime) && suppliedTime > 0) return Math.floor(suppliedTime);
	const directTime = chart.timeScale().coordinateToTime(x);
	if (typeof directTime === 'number' && Number.isFinite(directTime) && directTime > 0) return Math.floor(directTime);
	const logical = chart.timeScale().coordinateToLogical(x);
	const firstTime = renderedCandles[0]?.time;
	if (!Number.isFinite(logical) || !Number.isFinite(firstTime)) return null;
	const projectedTime = firstTime + Math.round(logical) * intervalSeconds[interval.value];
	return projectedTime > 0 ? projectedTime : null;
}

function handleCrosshairMove(param) {
	refreshCoordinates();
	if (!drawingTool.value || !param.point) { hoverPoint.value = null; return; }
	const time = timestampAtCoordinate(param.point.x, param.time);
	const price = candleSeries.coordinateToPrice(param.point.y);
	hoverPoint.value = Number.isFinite(time) && time > 0 && Number.isFinite(price)
		? { time, price: Number(price.toPrecision(10)), x: param.point.x, y: param.point.y }
		: null;
}

function handleChartClick(param) {
	contextMenu.value = null;
	if (drawingTool.value && param.point) {
		const time = timestampAtCoordinate(param.point.x, param.time);
		const price = candleSeries.coordinateToPrice(param.point.y);
		if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(price)) return;
		pendingPoints.value.push({ time, price: Number(price.toPrecision(10)), x: param.point.x, y: param.point.y });
		const needed = drawingTool.value === 'horizontal_line' ? 1 : drawingTool.value === 'parallel_channel' ? 3 : 2;
		if (pendingPoints.value.length === needed) {
			const drawingType = drawingTool.value;
			emit('create-drawing', { drawingId: crypto.randomUUID(), exchange: exchange.value, symbol: symbol.value, timeframe: interval.value, drawingType, geometry: { points: pendingPoints.value.map(({ time: pointTime, price: pointPrice }) => ({ time: pointTime, price: pointPrice })) }, style: {}, label: drawingLabel(drawingType) });
			drawingTool.value = null;
			pendingPoints.value = [];
			hoverPoint.value = null;
		}
		return;
	}
	if (!placing.value || !param.point) return;
	const price = candleSeries.coordinateToPrice(param.point.y);
	if (!Number.isFinite(price)) return;
	placing.value = false;
	emit('create-alert', { exchange: exchange.value, symbol: symbol.value, price: Number(price.toPrecision(10)) });
}

function drawingLabel(type) { return ({ horizontal_line: 'Horizontal Line', trendline: 'Trendline', ray: 'Ray', rectangle: 'Price Zone', parallel_channel: 'Parallel Channel' })[type]; }
function activateDrawing(type) { drawingTool.value = drawingTool.value === type ? null : type; pendingPoints.value = []; hoverPoint.value = null; placing.value = false; contextMenu.value = null; }
function togglePricePlacement() { placing.value = !placing.value; drawingTool.value = null; pendingPoints.value = []; hoverPoint.value = null; }
function selectDrawing(event, drawing) { event.stopPropagation(); selectedDrawingId.value = drawing._id; contextMenu.value = null; }
function openDrawingMenu(event, drawing) { event.preventDefault(); event.stopPropagation(); selectedDrawingId.value = drawing._id; const rect = chartStage.value.getBoundingClientRect(); contextMenu.value = { drawing, x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function closeDrawingMenu() { contextMenu.value = null; }
function editDrawing(drawing) { const label = window.prompt('Drawing label', drawing.label || drawingLabel(drawing.drawingType)); if (label !== null) emit('update-drawing', { id: drawing._id, data: { label } }); closeDrawingMenu(); }
function duplicateDrawing(drawing) {
	const offset = intervalSeconds[interval.value];
	emit('create-drawing', { drawingId: crypto.randomUUID(), exchange: drawing.exchange, symbol: drawing.symbol, timeframe: drawing.timeframe, drawingType: drawing.drawingType, geometry: { points: drawing.geometry.points.map((point) => ({ time: point.time + offset, price: Number((point.price * 1.002).toPrecision(10)) })) }, style: drawing.style || {}, label: `${drawing.label || drawingLabel(drawing.drawingType)} Copy` });
	closeDrawingMenu();
}
function deleteDrawing(drawing) {
	const activeAlert = drawingAlerts.value.get(String(drawing._id));
	const message = activeAlert?.isActive ? 'This drawing has an active alert.\n\nDeleting it will also remove its alert.' : 'Delete this drawing?';
	if (window.confirm(message)) emit('delete-drawing', { id: drawing._id, cascade: Boolean(activeAlert) });
	closeDrawingMenu();
}
function addDrawingAlert(drawing) { emit('create-drawing-alert', drawing); closeDrawingMenu(); }
function viewDrawingAlert(drawing) { emit('view-drawing-alert', drawing); closeDrawingMenu(); }
function toggleDrawingAlert(drawing) { const alert = drawingAlerts.value.get(String(drawing._id)); if (alert) emit('toggle-drawing-alert', alert._id); closeDrawingMenu(); }
function deleteDrawingAlert(drawing) { const alert = drawingAlerts.value.get(String(drawing._id)); if (alert && window.confirm('Delete alert and keep drawing?')) emit('delete-drawing-alert', alert._id); closeDrawingMenu(); }

async function toggleFullscreen() {
	if (document.fullscreenElement === chartPanel.value) await document.exitFullscreen();
	else await chartPanel.value?.requestFullscreen();
}

async function handleFullscreenChange() {
	isFullscreen.value = document.fullscreenElement === chartPanel.value;
	await nextTick();
	refreshCoordinates();
}

function startDrawingDrag(event, drawing) {
	if (event.button !== 0) return;
	event.preventDefault(); event.stopPropagation(); selectedDrawingId.value = drawing._id;
	draggingDrawing = { drawing, startX: event.clientX, startY: event.clientY, points: drawing.geometry.points.map((point) => ({ ...point })) };
	window.addEventListener('pointermove', dragDrawing);
	window.addEventListener('pointerup', endDrawingDrag, { once: true });
}
function startDrawingPointDrag(event, drawing, pointIndex) {
	if (event.button !== 0) return;
	event.preventDefault(); event.stopPropagation(); selectedDrawingId.value = drawing._id;
	const geometry = drawingDrafts.value[drawing._id] || drawing.geometry;
	draggingDrawing = { drawing, pointIndex, points: geometry.points.map((point) => ({ ...point })) };
	window.addEventListener('pointermove', dragDrawingPoint);
	window.addEventListener('pointerup', endDrawingDrag, { once: true });
}
function dragDrawingPoint(event) {
	if (!draggingDrawing || !chartHost.value) return;
	const rect = chartHost.value.getBoundingClientRect();
	const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
	const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
	const price = candleSeries.coordinateToPrice(y);
	const original = draggingDrawing.points[draggingDrawing.pointIndex];
	const time = draggingDrawing.drawing.drawingType === 'horizontal_line' ? original.time : timestampAtCoordinate(x);
	if (!Number.isFinite(time) || time <= 0 || !Number.isFinite(price) || price <= 0) return;
	const points = draggingDrawing.points.map((point, index) => index === draggingDrawing.pointIndex
		? { time, price: Number(price.toPrecision(10)) }
		: { ...point });
	drawingDrafts.value = { ...drawingDrafts.value, [draggingDrawing.drawing._id]: { points } };
}
function dragDrawing(event) {
	if (!draggingDrawing) return;
	const dx = event.clientX - draggingDrawing.startX;
	const dy = event.clientY - draggingDrawing.startY;
	const points = draggingDrawing.points.map((point) => {
		const original = chartPoint(point);
		if (!original) return null;
		const time = timestampAtCoordinate(original.x + (draggingDrawing.drawing.drawingType === 'horizontal_line' ? 0 : dx));
		const price = candleSeries.coordinateToPrice(original.y + dy);
		return { time, price: Number(Number(price).toPrecision(10)) };
	}).filter((point) => point && Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.price) && point.price > 0);
	if (points.length === draggingDrawing.points.length) drawingDrafts.value = { ...drawingDrafts.value, [draggingDrawing.drawing._id]: { points } };
}
function endDrawingDrag() {
	window.removeEventListener('pointermove', dragDrawing);
	window.removeEventListener('pointermove', dragDrawingPoint);
	if (!draggingDrawing) return;
	const geometry = drawingDrafts.value[draggingDrawing.drawing._id];
	if (geometry) emit('update-drawing', { id: draggingDrawing.drawing._id, data: { geometry } });
	draggingDrawing = null;
}

function startDrag(event, alert) {
	event.preventDefault();
	dragging = { id: alert._id, original: Number(alert.targetValue) };
	window.addEventListener('pointermove', dragLine);
	window.addEventListener('pointerup', endDrag, { once: true });
}

function dragLine(event) {
	if (!dragging || !chartHost.value) return;
	const rect = chartHost.value.getBoundingClientRect();
	const price = candleSeries.coordinateToPrice(Math.max(0, Math.min(rect.height, event.clientY - rect.top)));
	if (!Number.isFinite(price)) return;
	dragPrices.value = { ...dragPrices.value, [dragging.id]: price };
	priceLines.get(dragging.id)?.applyOptions({ price });
	refreshCoordinates();
}

function endDrag() {
	window.removeEventListener('pointermove', dragLine);
	if (!dragging) return;
	const value = dragPrices.value[dragging.id];
	if (Number.isFinite(value) && value !== dragging.original) {
		emit('update-alert', { id: dragging.id, targetValue: Number(value.toPrecision(10)) });
	}
	dragging = null;
}

onMounted(() => {
	document.addEventListener('fullscreenchange', handleFullscreenChange);
	chart = createChart(chartHost.value, {
		autoSize: true,
		layout: { background: { type: ColorType.Solid, color: '#111318' }, textColor: '#747b86', attributionLogo: true },
		grid: { vertLines: { color: '#202329' }, horzLines: { color: '#202329' } },
		crosshair: { mode: CrosshairMode.Normal },
		rightPriceScale: { borderColor: '#2a2d34', scaleMargins: { top: 0.08, bottom: 0.22 } },
		timeScale: { borderColor: '#2a2d34', timeVisible: true, secondsVisible: false, rightOffset: 5 },
	});
	candleSeries = chart.addSeries(CandlestickSeries, {
		upColor: '#35c98a', downColor: '#f06d75', borderVisible: false,
		wickUpColor: '#35c98a', wickDownColor: '#f06d75', priceLineVisible: true,
	});
	volumeSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
	volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
	markers = createSeriesMarkers(candleSeries, []);
	chart.subscribeClick(handleChartClick);
	chart.subscribeCrosshairMove(handleCrosshairMove);
	chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);
	chartHost.value.addEventListener('pointerdown', startCoordinateSync, { passive: true });
	chartHost.value.addEventListener('wheel', scheduleCoordinateSync, { passive: true });
	window.addEventListener('pointerup', stopCoordinateSync);
	window.addEventListener('pointercancel', stopCoordinateSync);
	resizeObserver = new ResizeObserver(refreshCoordinates);
	resizeObserver.observe(chartHost.value);
	if (candles.value) setHistoricalData(candles.value);
});

watch(candles, setHistoricalData);
watch(candleType, renderCandleData);
watch(livePrice, (value) => updateLiveCandle(Number(value)));
watch([exchange, symbol, interval], () => {
	subscribe(exchange.value, symbol.value);
	placing.value = false;
	drawingTool.value = null;
	pendingPoints.value = [];
	hoverPoint.value = null;
	contextMenu.value = null;
}, { immediate: true });
watch(matchingAlerts, syncPriceLines, { deep: true });
watch(() => props.history, syncMarkers, { deep: true });
watch(() => props.drawings, () => { drawingDrafts.value = {}; refreshCoordinates(); }, { deep: true });
watch(() => props.highlightDrawingId, async (id) => {
	if (!id) return;
	const drawing = props.drawings.find((item) => String(item._id) === String(id));
	if (!drawing) return;
	exchange.value = drawing.exchange; symbol.value = drawing.symbol; symbolInput.value = drawing.symbol; interval.value = drawing.timeframe; selectedDrawingId.value = drawing._id;
	await nextTick(); refreshCoordinates();
});

onUnmounted(() => {
	document.removeEventListener('fullscreenchange', handleFullscreenChange);
	chartHost.value?.removeEventListener('pointerdown', startCoordinateSync);
	chartHost.value?.removeEventListener('wheel', scheduleCoordinateSync);
	window.removeEventListener('pointerup', stopCoordinateSync);
	window.removeEventListener('pointercancel', stopCoordinateSync);
	window.removeEventListener('pointermove', dragLine);
	window.removeEventListener('pointermove', dragDrawing);
	window.removeEventListener('pointermove', dragDrawingPoint);
	if (coordinateSyncFrame !== null) cancelAnimationFrame(coordinateSyncFrame);
	resizeObserver?.disconnect();
	unsubscribe();
	chart?.remove();
});
</script>

<template>
	<section ref="chartPanel" class="alert-chart-panel panel">
		<header class="chart-toolbar">
			<select v-model="exchange" class="chart-exchange-select" aria-label="Chart exchange"><option v-for="item in exchanges" :key="item.value" :value="item.value">{{ item.label }}</option></select>
			<select v-model="candleType" class="chart-candle-select" aria-label="Candle type"><option v-for="item in candleTypes" :key="item.value" :value="item.value">{{ item.label }}</option></select>
			<div class="chart-symbol-control"><Search :size="14" /><input v-model="symbolInput" list="alert-chart-symbols" aria-label="Trading pair" @keydown.enter="applySymbol" @change="applySymbol"><datalist id="alert-chart-symbols"><option v-for="item in symbols" :key="item" :value="item" /></datalist></div>
			<div class="chart-timeframes"><button v-for="item in intervals" :key="item" :class="{ active: interval === item }" @click="interval = item">{{ item }}</button></div>
			<div class="drawing-tools" aria-label="Drawing tools"><button :class="{ active: drawingTool === 'horizontal_line' }" title="Horizontal line" @click="activateDrawing('horizontal_line')"><Minus :size="14" /></button><button :class="{ active: drawingTool === 'trendline' }" title="Trendline" @click="activateDrawing('trendline')"><TrendingUp :size="14" /></button><button :class="{ active: drawingTool === 'ray' }" title="Ray" @click="activateDrawing('ray')"><TrendingUp :size="14" /><small>R</small></button><button :class="{ active: drawingTool === 'rectangle' }" title="Price zone" @click="activateDrawing('rectangle')"><Square :size="14" /></button><button :class="{ active: drawingTool === 'parallel_channel' }" title="Parallel channel" @click="activateDrawing('parallel_channel')"><Waves :size="14" /></button></div>
			<button :class="['place-alert-button', { active: placing }]" @click="togglePricePlacement"><BellPlus :size="14" /> {{ placing ? 'Click chart…' : 'Place alert' }}</button>
			<button class="fullscreen-chart-button" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" :aria-label="isFullscreen ? 'Exit chart fullscreen' : 'Open chart fullscreen'" @click="toggleFullscreen"><Minimize2 v-if="isFullscreen" :size="14" /><Maximize2 v-else :size="14" /></button>
		</header>
		<div class="chart-quote-row"><div><strong>{{ symbol }}</strong><span><Radio :size="10" /> Live</span></div><strong>{{ formatPrice(livePrice || latestCandle?.close) }}</strong><small :class="priceChange >= 0 ? 'profit-text' : 'loss-text'">{{ priceChange >= 0 ? '+' : '' }}{{ priceChange.toFixed(2) }}%</small></div>
		<div ref="chartStage" class="chart-stage" @click="closeDrawingMenu">
			<div ref="chartHost" class="chart-host"></div>
			<svg class="drawing-overlay" :width="chartHost?.clientWidth || 0" :height="chartHost?.clientHeight || 0">
				<g v-for="shape in drawingShapes" :key="shape.drawing._id" :class="['chart-drawing', { selected: selectedDrawingId === shape.drawing._id || String(highlightDrawingId) === String(shape.drawing._id), alerted: drawingAlerts.has(String(shape.drawing._id)) }]">
					<polygon v-if="shape.polygon" :points="shape.polygon" class="drawing-fill" />
					<line v-for="(line, index) in shape.lines" :key="`visible-${index}`" v-bind="line" class="drawing-line" />
					<line v-for="(line, index) in shape.lines" :key="`hit-${index}`" v-bind="line" class="drawing-hit" @click="selectDrawing($event, shape.drawing)" @pointerdown="startDrawingDrag($event, shape.drawing)" @contextmenu="openDrawingMenu($event, shape.drawing)" />
					<polygon v-if="shape.polygon" :points="shape.polygon" class="drawing-area-hit" @click="selectDrawing($event, shape.drawing)" @pointerdown="startDrawingDrag($event, shape.drawing)" @contextmenu="openDrawingMenu($event, shape.drawing)" />
					<circle v-for="(point, index) in shape.controlPoints" v-show="String(selectedDrawingId) === String(shape.drawing._id)" :key="`control-${index}`" :cx="point.x" :cy="point.y" r="5" class="drawing-control-point" @pointerdown="startDrawingPointDrag($event, shape.drawing, index)" />
					<text v-if="drawingAlerts.get(String(shape.drawing._id))?.isActive" :x="shape.label.x" :y="shape.label.y" class="drawing-bell">🔔</text>
				</g>
				<g v-if="drawingPreview" class="drawing-preview">
					<polygon v-if="drawingPreview.shape?.polygon" :points="drawingPreview.shape.polygon" class="drawing-preview-fill" />
					<line v-for="(line, index) in drawingPreview.shape?.lines || []" :key="index" v-bind="line" class="drawing-preview-line" />
					<circle v-for="(point, index) in drawingPreview.points" :key="`point-${index}`" :cx="point.x" :cy="point.y" r="4" class="drawing-preview-point" />
				</g>
			</svg>
			<div v-if="drawingTool" class="drawing-instruction">{{ drawingLabel(drawingTool) }}: click {{ drawingTool === 'horizontal_line' ? 'once' : drawingTool === 'parallel_channel' ? `${3 - pendingPoints.length} more point(s)` : `${2 - pendingPoints.length} more point(s)` }}</div>
			<div v-if="contextMenu" class="drawing-context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop><button v-if="!drawingAlerts.has(String(contextMenu.drawing._id))" @click="addDrawingAlert(contextMenu.drawing)">Add Alert</button><template v-else><button @click="viewDrawingAlert(contextMenu.drawing)">View Alert</button><button @click="toggleDrawingAlert(contextMenu.drawing)">{{ drawingAlerts.get(String(contextMenu.drawing._id))?.isActive ? 'Pause Alert' : 'Enable Alert' }}</button><button @click="deleteDrawingAlert(contextMenu.drawing)">Delete Alert</button></template><button @click="editDrawing(contextMenu.drawing)">Edit</button><button @click="duplicateDrawing(contextMenu.drawing)">Duplicate</button><button class="danger" @click="deleteDrawing(contextMenu.drawing)">Delete Drawing</button></div>
			<div v-if="isLoading" class="chart-state">Loading candles…</div>
			<div v-else-if="isError" class="chart-state error">Could not load candle data.</div>
			<div v-if="isFetchingNextPage" class="chart-history-loading">Loading older candles…</div>
			<div v-for="item in matchingAlerts" :key="item._id" class="chart-alert-line" :style="lineTop(item)" @pointerdown="startDrag($event, item)"><span>{{ item.name }}</span><b>{{ formatPrice(dragPrices[item._id] ?? item.targetValue) }}</b></div>
		</div>
		<footer>Market data: {{ exchanges.find((item) => item.value === exchange)?.label }} · Charting by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a></footer>
	</section>
</template>
