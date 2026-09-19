function lineValue(points, timestamp) {
    const [first, second] = points || [];
    if (!first || !second || second.time === first.time) return null;
    return first.price + ((second.price - first.price) / (second.time - first.time)) * (timestamp - first.time);
}

function getDrawingValueAtTime(drawing, timestamp) {
    if (!drawing || !Number.isFinite(timestamp)) return null;
    if (drawing.drawingType === 'horizontal_line') return Number(drawing.geometry?.points?.[0]?.price);
    if (drawing.drawingType === 'trendline') return lineValue(drawing.geometry?.points, timestamp);
    if (drawing.drawingType === 'ray') {
        const points = drawing.geometry?.points || [];
        if (!points[0] || !points[1] || timestamp < points[0].time) return null;
        return lineValue(points, timestamp);
    }
    return null;
}

function getZoneBoundaries(drawing) {
    const prices = (drawing?.geometry?.points || []).map((point) => Number(point.price)).filter(Number.isFinite);
    if (prices.length < 2) return null;
    return { lower: Math.min(...prices), upper: Math.max(...prices) };
}

function getChannelBoundariesAtTime(drawing, timestamp) {
    const points = drawing?.geometry?.points || [];
    if (points.length < 3) return null;
    const baseline = lineValue(points.slice(0, 2), timestamp);
    const anchorBaseline = lineValue(points.slice(0, 2), points[2].time);
    if (![baseline, anchorBaseline].every(Number.isFinite)) return null;
    const parallel = baseline + (points[2].price - anchorBaseline);
    return { lower: Math.min(baseline, parallel), upper: Math.max(baseline, parallel) };
}

function relativePosition(price, lower, upper = lower) {
    if (price < lower) return 'below';
    if (price > upper) return 'above';
    return 'inside';
}

function evaluateDrawingCondition(drawing, condition, previous, current) {
    if (!drawing || !previous || !current) return { met: false, triggered: false, reason: 'Missing drawing market data' };
    let previousBoundary;
    let currentBoundary;
    let previousPosition;
    let currentPosition;
    if (['horizontal_line', 'trendline', 'ray'].includes(drawing.drawingType)) {
        previousBoundary = getDrawingValueAtTime(drawing, previous.time);
        currentBoundary = getDrawingValueAtTime(drawing, current.time);
        if (![previousBoundary, currentBoundary].every(Number.isFinite)) return { met: false, triggered: false, reason: 'Drawing is outside its valid time domain' };
        previousPosition = relativePosition(previous.price, previousBoundary);
        currentPosition = relativePosition(current.price, currentBoundary);
        const tolerance = Math.max(Math.abs(currentBoundary) * 0.0002, Number.EPSILON);
        const triggered = condition === 'crosses_above'
            ? previous.price <= previousBoundary && current.price > currentBoundary
            : condition === 'crosses_below'
                ? previous.price >= previousBoundary && current.price < currentBoundary
                : Math.abs(current.price - currentBoundary) <= tolerance || (previous.price - previousBoundary) * (current.price - currentBoundary) <= 0;
        return { met: condition === 'crosses_above' ? currentPosition === 'above' : condition === 'crosses_below' ? currentPosition === 'below' : triggered, triggered, drawingValue: currentBoundary, previousDrawingValue: previousBoundary, previousPosition, currentPosition };
    }
    const previousBounds = drawing.drawingType === 'parallel_channel' ? getChannelBoundariesAtTime(drawing, previous.time) : getZoneBoundaries(drawing);
    const currentBounds = drawing.drawingType === 'parallel_channel' ? getChannelBoundariesAtTime(drawing, current.time) : getZoneBoundaries(drawing);
    if (!previousBounds || !currentBounds) return { met: false, triggered: false, reason: 'Invalid drawing geometry' };
    previousPosition = relativePosition(previous.price, previousBounds.lower, previousBounds.upper);
    currentPosition = relativePosition(current.price, currentBounds.lower, currentBounds.upper);
    const triggered = condition === 'enters'
        ? previousPosition !== 'inside' && currentPosition === 'inside'
        : condition === 'exits'
            ? previousPosition === 'inside' && currentPosition !== 'inside'
            : condition === 'crosses_upper'
                ? previous.price <= previousBounds.upper && current.price > currentBounds.upper
                : previous.price >= previousBounds.lower && current.price < currentBounds.lower;
    const met = condition === 'enters' ? currentPosition === 'inside' : condition === 'exits' ? currentPosition !== 'inside' : condition === 'crosses_upper' ? currentPosition === 'above' : currentPosition === 'below';
    return { met, triggered, drawingValue: condition === 'crosses_lower' ? currentBounds.lower : condition === 'crosses_upper' ? currentBounds.upper : null, lower: currentBounds.lower, upper: currentBounds.upper, previousPosition, currentPosition };
}

module.exports = { lineValue, getDrawingValueAtTime, getZoneBoundaries, getChannelBoundariesAtTime, evaluateDrawingCondition };
