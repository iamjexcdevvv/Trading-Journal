function numbers(values) {
    return values.map(Number).filter(Number.isFinite);
}

function sma(values, period) {
    const data = numbers(values);
    if (period <= 0 || data.length < period) return null;
    return data.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function emaSeries(values, period) {
    const data = numbers(values);
    if (period <= 0 || data.length < period) return [];
    const seed = data.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    const result = Array(period - 1).fill(null);
    result.push(seed);
    const multiplier = 2 / (period + 1);
    for (let index = period; index < data.length; index += 1) {
        result.push((data[index] - result[result.length - 1]) * multiplier + result[result.length - 1]);
    }
    return result;
}

function ema(values, period) {
    return emaSeries(values, period).at(-1) ?? null;
}

function rsi(values, period = 14) {
    const data = numbers(values);
    if (period <= 0 || data.length <= period) return null;
    let gain = 0;
    let loss = 0;
    for (let index = 1; index <= period; index += 1) {
        const change = data[index] - data[index - 1];
        gain += Math.max(change, 0);
        loss += Math.max(-change, 0);
    }
    let averageGain = gain / period;
    let averageLoss = loss / period;
    for (let index = period + 1; index < data.length; index += 1) {
        const change = data[index] - data[index - 1];
        averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
        averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
    }
    if (averageLoss === 0) return 100;
    return 100 - (100 / (1 + averageGain / averageLoss));
}

function macd(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const data = numbers(values);
    if (data.length < slowPeriod + signalPeriod - 1) return null;
    const fast = emaSeries(data, fastPeriod);
    const slow = emaSeries(data, slowPeriod);
    const lineSeries = data.map((_, index) => fast[index] == null || slow[index] == null ? null : fast[index] - slow[index]);
    const usable = lineSeries.filter((value) => value != null);
    const signalSeries = emaSeries(usable, signalPeriod);
    const line = usable.at(-1);
    const signal = signalSeries.at(-1);
    if (line == null || signal == null) return null;
    return { line, signal, histogram: line - signal };
}

function bollingerBands(values, period = 20, deviation = 2) {
    const data = numbers(values);
    if (period <= 0 || data.length < period) return null;
    const sample = data.slice(-period);
    const middle = sma(sample, period);
    const variance = sample.reduce((sum, value) => sum + ((value - middle) ** 2), 0) / period;
    const width = Math.sqrt(variance) * deviation;
    return { lower: middle - width, middle, upper: middle + width };
}

module.exports = { sma, ema, emaSeries, rsi, macd, bollingerBands };
