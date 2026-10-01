const WebSocket = require('ws');
const { Alert } = require('../models/alerts');
const { AlertEvent } = require('../models/alertEvents');
const { Trade } = require('../models/trades');
const { ChartDrawing } = require('../models/chartDrawings');
const marketData = require('./exchanges/publicMarketData');
const { buildMarketContext, evaluateGroup } = require('./smartAlertEvaluator');
const { evaluateDrawingCondition } = require('./drawingGeometry');

let io = null;
let legacyBitunixSocket = null;
const activeAlertsCache = new Map();
const smartAlertsCache = new Map();
const activeSubscriptions = new Set();
const tickerConnections = new Map();
const lastPrices = new Map();
const smartGroupTimers = new Map();
let backgroundEvaluationEnabled = false;

function marketKey(exchange, symbol) { return `${exchange}:${symbol}`; }
function smartKey(exchange, symbol, timeframe) { return `${exchange}:${symbol}:${timeframe}`; }
function plainAlert(alert) { return typeof alert.toObject === 'function' ? alert.toObject() : alert; }
function isSmart(alert) {
    if (!alert.alertType || alert.alertType === 'price') return false;
    return !(alert.alertType === 'drawing' && alert.triggerMode === 'realtime');
}

function initAlertService(ioInstance, wsInstance) {
    io = ioInstance;
    legacyBitunixSocket = wsInstance;
    backgroundEvaluationEnabled = true;
}

function evaluateCondition(alert, previousPrice, currentPrice) {
    const target = Number(alert.targetValue);
    const previous = Number(previousPrice);
    const current = Number(currentPrice);
    let met = false;
    let triggered = false;
    let change;
    if (alert.condition === 'crosses_above') {
        met = current >= target;
        triggered = previous < target && met;
    } else if (alert.condition === 'crosses_below') {
        met = current <= target;
        triggered = previous > target && met;
    } else if (alert.condition === 'price_gte') {
        met = current >= target;
        triggered = met && !alert.conditionMet;
    } else if (alert.condition === 'price_lte') {
        met = current <= target;
        triggered = met && !alert.conditionMet;
    } else if (alert.condition === 'percentage_increase' || alert.condition === 'percentage_decrease') {
        const reference = Number(alert.referencePrice);
        change = alert.condition === 'percentage_increase'
            ? ((current - reference) / reference) * 100
            : ((reference - current) / reference) * 100;
        met = Number.isFinite(change) && change >= target;
        triggered = met && !alert.conditionMet;
    }
    return { met, triggered, ...(change === undefined ? {} : { change }) };
}

function shouldTrigger(alert, evaluation, candleTime) {
    if (alert.frequency === 'once_per_candle') return evaluation.met && alert.lastTriggeredCandle !== candleTime;
    return evaluation.triggered;
}

function isExpired(alert, now = new Date()) {
    return Boolean(alert.expiresAt) && new Date(alert.expiresAt).getTime() <= now.getTime();
}

function subscribeTicker(exchange, symbol) {
    const key = marketKey(exchange, symbol);
    if (activeSubscriptions.has(key)) return;
    activeSubscriptions.add(key);
    if (exchange === 'bitunix' && legacyBitunixSocket?.readyState === WebSocket.OPEN) {
        legacyBitunixSocket.send(JSON.stringify({ op: 'subscribe', args: [{ symbol, ch: 'ticker' }] }));
        return;
    }
    const provider = marketData[exchange];
    if (!provider) return;
    tickerConnections.set(key, provider.connectTicker(
        symbol,
        (price) => processRealtimePrice(exchange, symbol, Number(price), new Date()).catch((error) => console.error('Alert evaluation failed:', error.message)),
        (error) => console.error(`${exchange} ticker failed:`, error.message)
    ));
}

function unsubscribeTicker(exchange, symbol) {
    const key = marketKey(exchange, symbol);
    if (!activeSubscriptions.delete(key)) return;
    if (exchange === 'bitunix' && legacyBitunixSocket?.readyState === WebSocket.OPEN) {
        legacyBitunixSocket.send(JSON.stringify({ op: 'unsubscribe', args: [{ symbol, ch: 'ticker' }] }));
    }
    tickerConnections.get(key)?.stop();
    tickerConnections.delete(key);
    lastPrices.delete(key);
}

function addAlertToCache(source) {
    const alert = plainAlert(source);
    alert.exchange ||= 'bitunix';
    alert.symbol = String(alert.symbol).toUpperCase();
    if (isSmart(alert)) {
        const key = smartKey(alert.exchange, alert.symbol, alert.timeframe || '15m');
        const group = smartAlertsCache.get(key) || [];
        if (!group.some((item) => String(item._id) === String(alert._id))) group.push(alert);
        smartAlertsCache.set(key, group);
        if (backgroundEvaluationEnabled) ensureSmartGroupTimer(key);
        return;
    }
    const key = marketKey(alert.exchange, alert.symbol);
    const group = activeAlertsCache.get(key) || [];
    if (!group.some((item) => String(item._id) === String(alert._id))) group.push(alert);
    activeAlertsCache.set(key, group);
    subscribeTicker(alert.exchange, alert.symbol);
}

function removeAlertFromCache(alertId, exchange, symbol, timeframe = '15m') {
    // Legacy two-argument callers used (id, symbol).
    if (symbol === undefined) { symbol = exchange; exchange = 'bitunix'; }
    const realtimeKey = marketKey(exchange || 'bitunix', String(symbol).toUpperCase());
    const realtime = (activeAlertsCache.get(realtimeKey) || []).filter((item) => String(item._id) !== String(alertId));
    if (realtime.length) activeAlertsCache.set(realtimeKey, realtime);
    else {
        activeAlertsCache.delete(realtimeKey);
        unsubscribeTicker(exchange || 'bitunix', String(symbol).toUpperCase());
    }
    const groupKey = smartKey(exchange || 'bitunix', String(symbol).toUpperCase(), timeframe || '15m');
    const smart = (smartAlertsCache.get(groupKey) || []).filter((item) => String(item._id) !== String(alertId));
    if (smart.length) smartAlertsCache.set(groupKey, smart);
    else {
        smartAlertsCache.delete(groupKey);
        clearInterval(smartGroupTimers.get(groupKey));
        smartGroupTimers.delete(groupKey);
    }
}

async function claimTrigger(alert, evaluation, price, now, candleTime) {
    const once = alert.frequency === 'once';
    const update = {
        $set: {
            previousPrice: price,
            conditionMet: evaluation.met,
            lastTriggeredAt: now,
            lastCheckedAt: now,
            ...(candleTime === undefined ? {} : { lastTriggeredCandle: candleTime }),
            ...(once ? { isActive: false, status: 'triggered' } : {})
        },
        $inc: { triggerCount: 1 }
    };
    return Alert.findOneAndUpdate({ _id: alert._id, isActive: true, status: 'active' }, update, { new: true });
}

async function recordEvent(alert, claimed, price, now, details = {}) {
    const event = await AlertEvent.create({
        alertId: alert._id, userId: alert.userId, exchange: alert.exchange, symbol: alert.symbol,
        triggerPrice: price, message: `${alert.name || alert.symbol} triggered`, alertType: alert.alertType || 'price',
        alertName: alert.name || '', timeframe: alert.timeframe || null, conditionSummary: details.text || '',
        triggerContext: details.context || null, tradeId: alert.tradeId || null, journalEntryId: alert.tradeId || null,
        drawingId: alert.drawingId || null, drawingType: alert._drawing?.drawingType || null,
        drawingValueAtTrigger: details.drawingValue ?? null, drawingCondition: alert.drawingCondition || null,
        triggerSequence: claimed.triggerCount, triggeredAt: now
    });
    if (io && (alert.notificationMethods || []).includes('in_app')) io.to(`user:${alert.userId}`).emit('alert-triggered', { alert: claimed, event });
    return event;
}

async function processPriceAlert(alert, previousPrice, price, now) {
    if (isExpired(alert, now)) {
        await Alert.updateOne({ _id: alert._id }, { $set: { isActive: false, status: 'expired' } });
        removeAlertFromCache(alert._id, alert.exchange, alert.symbol, alert.timeframe);
        return;
    }
    const evaluation = evaluateCondition(alert, previousPrice, price);
    alert.previousPrice = price;
    alert.conditionMet = evaluation.met;
    if (!shouldTrigger(alert, evaluation)) {
        await Alert.updateOne({ _id: alert._id }, { $set: { previousPrice: price, conditionMet: evaluation.met, lastCheckedAt: now } });
        return;
    }
    const claimed = await claimTrigger(alert, evaluation, price, now);
    if (!claimed) return;
    await recordEvent(alert, claimed, price, now, { context: evaluation });
    if (alert.frequency === 'once') removeAlertFromCache(alert._id, alert.exchange, alert.symbol, alert.timeframe);
}

async function processDrawingEvaluation(alert, previous, current, now, candleTime) {
    const evaluation = evaluateDrawingCondition(alert._drawing, alert.drawingCondition, previous, current);
    alert.previousPrice = current.price;
    alert.previousEvaluationTime = current.time;
    alert.conditionMet = evaluation.met;
    if (!shouldTrigger(alert, evaluation, candleTime)) {
        await Alert.updateOne({ _id: alert._id }, { $set: { previousPrice: current.price, previousEvaluationTime: current.time, conditionMet: evaluation.met, lastCheckedAt: now } });
        return false;
    }
    const claimed = await claimTrigger(alert, evaluation, current.price, now, candleTime);
    if (!claimed) return false;
    await recordEvent(alert, claimed, current.price, now, {
        drawingValue: evaluation.drawingValue,
        context: { previousPosition: evaluation.previousPosition, currentPosition: evaluation.currentPosition, lower: evaluation.lower, upper: evaluation.upper }
    });
    if (alert.frequency === 'once') removeAlertFromCache(alert._id, alert.exchange, alert.symbol, alert.timeframe);
    return true;
}

async function processDrawingRealtime(alert, price, now = new Date()) {
    const currentTime = Math.floor(now.getTime() / 1000);
    const previous = { time: alert.previousEvaluationTime ?? currentTime - 1, price: Number(alert.previousPrice) };
    return processDrawingEvaluation(alert, previous, { time: currentTime, price: Number(price) }, now);
}

async function processRealtimePrice(exchange, symbol, price, now) {
    const key = marketKey(exchange, symbol);
    const previous = lastPrices.get(key);
    lastPrices.set(key, price);
    const alerts = activeAlertsCache.get(key) || [];
    for (const alert of [...alerts]) {
        if (alert.alertType === 'drawing') await processDrawingRealtime(alert, price, now);
        else if (previous !== undefined || alert.previousPrice != null) await processPriceAlert(alert, alert.previousPrice ?? previous, price, now);
        else {
            alert.previousPrice = price;
            await Alert.updateOne({ _id: alert._id }, { $set: { previousPrice: price, lastCheckedAt: now } });
        }
    }
}

async function fetchClosedCandles(provider, symbol, timeframe, limit, now = new Date()) {
    const seconds = ({ '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 })[timeframe];
    const currentOpen = Math.floor(now.getTime() / 1000 / seconds) * seconds;
    const collected = [];
    let endTime;
    while (collected.length < limit) {
        const requested = Math.min(200, limit - collected.length + 1);
        const batch = await provider.getCandles(symbol, timeframe, requested, endTime);
        const closed = batch.filter((candle) => candle.time < currentOpen);
        collected.unshift(...closed.filter((candle) => !collected.some((item) => item.time === candle.time)));
        if (batch.length < requested || !batch.length) break;
        endTime = Math.min(...batch.map((candle) => candle.time)) * 1000 - 1;
    }
    return collected.sort((a, b) => a.time - b.time).slice(-limit);
}

async function processSmartAlert(alert, context, candleTime, now = new Date()) {
    if (alert.tradeId && !await Trade.exists({ _id: alert.tradeId, userId: alert.userId })) return false;
    const claimedCandle = await Alert.findOneAndUpdate(
        { _id: alert._id, isActive: { $ne: false }, status: { $ne: 'expired' }, lastEvaluatedCandleTime: { $ne: candleTime } },
        { $set: { lastEvaluatedCandleTime: candleTime, lastCheckedAt: now } },
        { new: true }
    );
    if (!claimedCandle) return false;
    const evaluation = alert.alertType === 'drawing'
        ? null
        : evaluateGroup({ operator: alert.conditionLogic || 'AND', conditions: alert.conditions }, context);
    if (!evaluation?.met) {
        alert.conditionMet = false;
        await Alert.updateOne({ _id: alert._id }, { $set: { conditionMet: false } });
        return false;
    }
    const simpleEvaluation = { met: true, triggered: !alert.conditionMet };
    if (!shouldTrigger(alert, simpleEvaluation, candleTime)) return false;
    const price = context.current.close;
    const claimed = await claimTrigger(alert, simpleEvaluation, price, now, candleTime);
    if (!claimed) return false;
    alert.conditionMet = true;
    alert.lastTriggeredCandle = candleTime;
    await recordEvent(alert, claimed, price, now, { text: evaluation.text, context: { evaluations: evaluation.evaluations } });
    return true;
}

async function evaluateSmartGroup(key, now = new Date()) {
    const alerts = smartAlertsCache.get(key) || [];
    if (!alerts.length) return;
    const [exchange, symbol, timeframe] = key.split(':');
    const candles = await fetchClosedCandles(marketData[exchange], symbol, timeframe, 200, now);
    if (candles.length < 2) return;
    const current = candles.at(-1);
    const previous = candles.at(-2);
    const context = buildMarketContext(candles);
    for (const alert of [...alerts]) {
        if (alert.alertType === 'drawing') {
            await processDrawingEvaluation(
                alert,
                { time: previous.time, price: previous.close },
                { time: current.time, price: current.close },
                now,
                current.time
            );
        } else {
            await processSmartAlert(alert, context, current.time, now);
        }
    }
}

function ensureSmartGroupTimer(key) {
    if (smartGroupTimers.has(key)) return;
    const evaluate = () => evaluateSmartGroup(key).catch((error) => console.error('Smart alert evaluation failed:', error.message));
    const timer = setInterval(evaluate, 60_000);
    timer.unref?.();
    smartGroupTimers.set(key, timer);
    evaluate();
}

function refreshDrawingInCache(drawingSource) {
    const drawing = plainAlert(drawingSource);
    for (const cache of [activeAlertsCache, smartAlertsCache]) {
        for (const alerts of cache.values()) {
            for (const alert of alerts) if (String(alert.drawingId) === String(drawing._id)) alert._drawing = drawing;
        }
    }
}

async function loadActiveAlerts() {
    activeAlertsCache.clear();
    smartAlertsCache.clear();
    for (const connection of tickerConnections.values()) connection.stop();
    tickerConnections.clear();
    activeSubscriptions.clear();
    for (const timer of smartGroupTimers.values()) clearInterval(timer);
    smartGroupTimers.clear();
    const alerts = await Alert.find({ isActive: true, status: 'active' }).lean();
    const drawingIds = alerts.filter((alert) => alert.drawingId).map((alert) => alert.drawingId);
    const drawings = drawingIds.length ? await ChartDrawing.find({ _id: { $in: drawingIds } }).lean() : [];
    const byId = new Map(drawings.map((drawing) => [String(drawing._id), drawing]));
    for (const alert of alerts) addAlertToCache({ ...alert, ...(alert.drawingId ? { _drawing: byId.get(String(alert.drawingId)) } : {}) });
}

async function handlePriceUpdate(symbolData) {
    const symbol = symbolData?.symbol;
    const price = Number(symbolData?.data?.la);
    if (!symbol || !Number.isFinite(price)) return;
    await processRealtimePrice('bitunix', symbol, price, new Date());
}

module.exports = {
    initAlertService, loadActiveAlerts, addAlertToCache, removeAlertFromCache, handlePriceUpdate,
    evaluateCondition, shouldTrigger, isExpired, fetchClosedCandles, processSmartAlert,
    evaluateSmartGroup,
    processDrawingRealtime, processDrawingEvaluation, refreshDrawingInCache,
    activeAlertsCache, smartAlertsCache, activeSubscriptions
};
