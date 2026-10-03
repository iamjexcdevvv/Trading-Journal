// Shared catalogue: never persisted as account-owned strategies or setups.
const required = label => ({ label, required: true });
const optional = label => ({ label, required: false });
const premadeStrategies = [
    { name: 'TRBO', direction: 'Long', items: [
        required('IS THE TRENDLINE RESISTANCE MULTI WEEK/MONTH/YEAR'),
        required('IS THERE RIGHT HAND?'),
        required('IS THERE CCC (W/MACD CONFIRMATIONS)'),
        required('IS IT ON KEY LEVEL SUPPORT (Historical levels, .382, .5, .618)'),
        optional('IS IT ON RSI 30@30'),
        optional('IS THERE REVERSAL PATTERN?'),
    ] },
    { name: 'Bounce Play', direction: 'Long', items: [
        required('IS IT UPTREND?'),
        required('IS THERE CCC?'),
        required('IS IT ON KEY LEVEL SUPPORT (Historical levels, .382, .5, .382)'),
        optional('IS IT ON OVERSOLD TERRITORY'),
        required('IS THERE BIG BUYING VOLUME ON HIGHER TF'),
    ] },
    { name: 'Tabo Paakyat', direction: 'Long', items: [
        'Is it uptrend?',
        'Is there a breakout happened?',
        'Is there a significant buying volume?',
    ].map(required) },
    { name: 'TLSBD', direction: 'Short', items: [
        required('IS THE TRENDLINE SUPPORT MULTI WEEK/MONTH/YEAR'),
        required('IS THERE LEFT HAND'),
        required('IS THERE CCC (W/MACD CONFIRMATIONS)'),
        required('IS IT ON KEY LEVEL RESISTANCE (Historical levels, .382, .5, .618)'),
        optional('IS THERE REVERSAL PATTERN?'),
        optional('IS IT ON RSI 70@30'),
    ] },
    { name: 'Correction Play', direction: 'Short', items: [
        required('IS IT DOWNTREND'),
        required('IS IT ON KEY LEVEL RESISTANCE (Historical levels, .382, .5, .618)'),
        required('IS THERE CCC'),
        optional('IS IT ON OVERBOUGHT TERRITORY'),
        required('IS THERE BIG SELLING VOLUME ON HIGHER TF'),
    ] },
    { name: 'Tabo Pababa', direction: 'Short', items: [
        'Is it downtrend?',
        'Is there a breakdown happened?',
        'Is there a significant selling volume?',
    ].map(required) },
];

function normalizedName(name) {
    const normalized = name.trim().toLowerCase();
    if (normalized === 'trendline breakout') return 'trbo';
    if (normalized === 'trendline breakdown') return 'tlsbd';
    return normalized;
}
const globalId = (type, name) => `global:${type}:${normalizedName(name).replaceAll(' ', '-')}`;
const isGlobalPlaybookId = id => typeof id === 'string' && id.startsWith('global:');

function withGlobalStrategies(personalStrategies) {
    const keys = new Set(personalStrategies.map(strategy =>
        `${normalizedName(strategy.name)}:${strategy.direction}`));
    const globals = premadeStrategies
        .filter(strategy => !keys.has(`${normalizedName(strategy.name)}:${strategy.direction}`))
        .map(({ name, direction }) => ({ _id: globalId('strategy', name), name, direction, isGlobal: true }));
    return [...personalStrategies, ...globals];
}

function withGlobalSetups(personalSetups, personalStrategies = []) {
    const names = new Set(personalSetups.map(setup => normalizedName(setup.name)));
    const strategyKeys = new Set(personalStrategies.map(strategy =>
        `${normalizedName(strategy.name)}:${strategy.direction}`));
    const globals = premadeStrategies
        .filter(strategy => !names.has(normalizedName(strategy.name)) &&
            !strategyKeys.has(`${normalizedName(strategy.name)}:${strategy.direction}`))
        .map(({ name, items }) => ({
            _id: globalId('setup', name),
            name,
            items: items.map(item => ({ ...item })),
            isGlobal: true,
        }));
    return [...personalSetups, ...globals];
}

module.exports = { premadeStrategies, withGlobalStrategies, withGlobalSetups, isGlobalPlaybookId, normalizedName };
