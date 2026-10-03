export function normalizeStrategyName(name) {
    const normalized = name.trim().toLowerCase();
    if (normalized === 'trendline breakout') return 'trbo';
    if (normalized === 'trendline breakdown') return 'tlsbd';
    return normalized;
}
