const { assertValidAdapter } = require('./baseAdapter');
const binanceAdapter = require('./binanceAdapter');
const okxAdapter = require('./okxAdapter');
const bitunixAdapter = require('./bitunixAdapter');

const adapters = {
    binance: binanceAdapter,
    okx: okxAdapter,
    bitunix: bitunixAdapter
};

Object.values(adapters).forEach(assertValidAdapter);

function getAdapter(exchange) {
    const adapter = adapters[exchange];
    if (!adapter) {
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
    return adapter;
}

module.exports = { adapters, getAdapter, supportedExchanges: Object.keys(adapters) };
