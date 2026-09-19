const indicators = require('./indicators');

function compare(previousLeft, currentLeft, previousRight, currentRight, operator) {
    if (![currentLeft, currentRight].every(Number.isFinite)) return false;
    if (operator === 'gt' || operator === 'above') return currentLeft > currentRight;
    if (operator === 'lt' || operator === 'below') return currentLeft < currentRight;
    if (![previousLeft, previousRight].every(Number.isFinite)) return false;
    if (operator === 'crosses_above') return previousLeft <= previousRight && currentLeft > currentRight;
    if (operator === 'crosses_below') return previousLeft >= previousRight && currentLeft < currentRight;
    return false;
}

function buildMarketContext(candles) {
    const currentCandles = candles;
    const previousCandles = candles.slice(0, -1);
    const cache = new Map();
    function value(source, condition, previous = false) {
        const list = previous ? previousCandles : currentCandles;
        const key = `${previous ? 'p' : 'c'}:${source}:${condition.period || ''}:${condition.fastPeriod || ''}:${condition.slowPeriod || ''}:${condition.signalPeriod || ''}:${condition.deviation || ''}`;
        if (cache.has(key)) return cache.get(key);
        const closes = list.map((candle) => candle.close);
        let result;
        if (source === 'price') result = closes.at(-1);
        else if (source === 'volume') result = list.at(-1)?.volume;
        else if (source === 'rsi') result = indicators.rsi(closes, condition.period || 14);
        else if (source === 'ema') result = indicators.ema(closes, condition.period);
        else if (source === 'sma') result = indicators.sma(closes, condition.period);
        else if (source.startsWith('macd_')) result = indicators.macd(closes, condition.fastPeriod || 12, condition.slowPeriod || 26, condition.signalPeriod || 9)?.[source.slice(5)] ?? null;
        else if (source.startsWith('bollinger_')) result = indicators.bollingerBands(closes, condition.period || 20, condition.deviation || 2)?.[source.slice(10)] ?? null;
        cache.set(key, result);
        return result;
    }
    return { candles, current: currentCandles.at(-1), previous: previousCandles.at(-1), value, cache };
}

function label(source, condition) {
    if (source === 'price') return 'Price';
    if (source === 'volume') return 'Volume';
    if (source.startsWith('macd_')) return `MACD ${source.slice(5)}`;
    if (source.startsWith('bollinger_')) return `Bollinger ${source.slice(10)}`;
    return `${source.toUpperCase()}(${condition.period})`;
}

function result(met, text, values = {}) { return { met, text: `${text} ${met ? '✓' : '✗'}`, values }; }

function evaluateCondition(condition, context) {
    if (!condition || !context.current) return result(false, 'Missing market data');
    if (condition.type === 'indicator') {
        const source = condition.indicator === 'macd' ? `macd_${condition.component || 'line'}` : condition.indicator;
        const current = context.value(source, condition);
        const previous = context.value(source, condition, true);
        const met = compare(previous, current, Number(condition.value), Number(condition.value), condition.operator);
        return result(met, `${label(source, condition)}: ${format(current)} ${symbol(condition.operator)} ${condition.value}`, { [source]: current });
    }
    if (condition.type === 'price_indicator') {
        const source = condition.indicator;
        const currentPrice = context.value('price', condition);
        const previousPrice = context.value('price', condition, true);
        const currentIndicator = context.value(source, condition);
        const previousIndicator = context.value(source, condition, true);
        const met = compare(previousPrice, currentPrice, previousIndicator, currentIndicator, condition.operator);
        return result(met, `Price ${symbol(condition.operator)} ${label(source, condition)}`, { price: currentPrice, [source]: currentIndicator });
    }
    if (condition.type === 'crossover') {
        const left = condition.leftIndicator;
        const right = condition.rightIndicator;
        const leftCondition = { ...condition, period: condition.leftPeriod };
        const rightCondition = { ...condition, period: condition.rightPeriod };
        const currentLeft = context.value(left, leftCondition);
        const previousLeft = context.value(left, leftCondition, true);
        const currentRight = context.value(right, rightCondition);
        const previousRight = context.value(right, rightCondition, true);
        const met = compare(previousLeft, currentLeft, previousRight, currentRight, condition.operator);
        return result(met, `${label(left, leftCondition)} ${symbol(condition.operator)} ${label(right, rightCondition)}`, { [left]: currentLeft, [right]: currentRight });
    }
    if (condition.type === 'candle') {
        const candle = context.current;
        if (condition.pattern) {
            const met = condition.pattern === 'bullish' ? candle.close > candle.open : condition.pattern === 'bearish' ? candle.close < candle.open : Math.abs(candle.close - candle.open) <= (candle.high - candle.low) * 0.1;
            return result(met, `${condition.pattern} candle`, { open: candle.open, close: candle.close });
        }
        const right = condition.comparison === 'level' ? Number(condition.value) : context.value(condition.indicator, condition);
        const operator = condition.operator === 'closes_above' ? 'above' : 'below';
        const met = compare(null, candle.close, null, right, operator);
        return result(met, `Close ${symbol(operator)} ${condition.comparison === 'level' ? condition.value : label(condition.indicator, condition)}`, { close: candle.close, comparison: right });
    }
    if (condition.type === 'volume') {
        const volume = context.current.volume;
        let comparison = Number(condition.value);
        if (condition.comparison === 'average_multiplier') {
            const prior = context.candles.slice(-(condition.period || 20) - 1, -1).map((candle) => candle.volume);
            comparison = indicators.sma(prior, condition.period || 20) * Number(condition.value);
        }
        const met = compare(null, volume, null, comparison, condition.operator);
        return result(met, `Volume ${symbol(condition.operator)} ${format(comparison)}`, { volume, comparison });
    }
    if (condition.type === 'trade') {
        const current = context.current.close;
        const previous = context.previous?.close;
        const target = Number(condition.value);
        let met;
        if (condition.level === 'stop_loss_warning') {
            met = Math.abs(current - target) / target * 100 <= Number(condition.warningPercent);
        } else if (condition.operator === 'reaches') {
            met = Math.min(previous, current) <= target && Math.max(previous, current) >= target;
        } else {
            met = compare(previous, current, target, target, condition.operator);
        }
        return result(met, `${condition.level.replaceAll('_', ' ')} at ${format(target)}`, { price: current, target, warningPercent: condition.warningPercent });
    }
    return result(false, 'Unsupported condition');
}

function evaluateGroup(group, context) {
    const evaluations = (group.conditions || []).map((condition) => evaluateCondition(condition, context));
    const met = group.operator === 'OR' ? evaluations.some((item) => item.met) : evaluations.length > 0 && evaluations.every((item) => item.met);
    return { met, evaluations, text: evaluations.map((item) => item.text).join(`\n${group.operator || 'AND'}\n`) };
}

function format(value) { return Number.isFinite(value) ? Number(value.toFixed(6)).toLocaleString() : 'n/a'; }
function symbol(operator) { return ({ gt: '>', lt: '<', above: '>', below: '<', crosses_above: 'crosses above', crosses_below: 'crosses below' })[operator] || operator; }

module.exports = { compare, buildMarketContext, evaluateCondition, evaluateGroup };
