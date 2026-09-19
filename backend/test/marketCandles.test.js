const test = require('node:test');
const assert = require('node:assert/strict');
const bitunix = require('../services/exchanges/publicMarketData/bitunix');
const binance = require('../services/exchanges/publicMarketData/binance');
const bybit = require('../services/exchanges/publicMarketData/bybit');
const { getCandles } = require('../controllers/market');

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test('Bitunix candles normalize numbers and ascending timestamps', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => ({
        ok: true,
        json: async () => ({ code: 0, data: [
            { time: '1789471800000', open: '101', high: '103', low: '99', close: '102', quoteVol: '12.5' },
            { time: '1789470900000', open: '100', high: '102', low: '98', close: '101', quoteVol: '10.5' }
        ] })
    });
    const candles = await bitunix.getCandles('BTCUSDT', '15m', 2);
    assert.equal(candles[0].time, 1789470900);
    assert.deepEqual(candles[1], { time: 1789471800, open: 101, high: 103, low: 99, close: 102, volume: 12.5 });
});

test('Binance and Bybit candles normalize provider payloads', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async (url) => url.includes('binance')
        ? { ok: true, json: async () => [[1789470900000, '100', '102', '98', '101', '10.5']] }
        : { ok: true, json: async () => ({ retCode: 0, result: { list: [['1789470900000', '100', '102', '98', '101', '10.5']] } }) };
    assert.deepEqual((await binance.getCandles('BTCUSDT', '15m', 1))[0], { time: 1789470900, open: 100, high: 102, low: 98, close: 101, volume: 10.5 });
    assert.deepEqual((await bybit.getCandles('BTCUSDT', '15m', 1))[0], { time: 1789470900, open: 100, high: 102, low: 98, close: 101, volume: 10.5 });
});

test('candle providers pass backward-pagination boundary', async (t) => {
    const originalFetch = global.fetch;
    const urls = [];
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async (url) => {
        urls.push(String(url));
        if (String(url).includes('binance')) return { ok: true, json: async () => [] };
        if (String(url).includes('bybit')) return { ok: true, json: async () => ({ retCode: 0, result: { list: [] } }) };
        return { ok: true, json: async () => ({ code: 0, data: [] }) };
    };
    await binance.getCandles('BTCUSDT', '15m', 200, 1789470899999);
    await bybit.getCandles('BTCUSDT', '15m', 200, 1789470899999);
    await bitunix.getCandles('BTCUSDT', '15m', 200, 1789470899999);
    assert.match(urls[0], /endTime=1789470899999/);
    assert.match(urls[1], /end=1789470899999/);
    assert.match(urls[2], /endTime=1789470899999/);
});

test('candle endpoint rejects invalid symbol, interval, and limit', async () => {
    const invalidSymbol = response();
    await getCandles({ params: { exchange: 'bitunix' }, query: { symbol: '../BTC', interval: '15m', limit: '200' } }, invalidSymbol);
    assert.equal(invalidSymbol.statusCode, 400);

    const invalidInterval = response();
    await getCandles({ params: { exchange: 'bitunix' }, query: { symbol: 'BTCUSDT', interval: '2m', limit: '200' } }, invalidInterval);
    assert.equal(invalidInterval.statusCode, 400);

    const invalidLimit = response();
    await getCandles({ params: { exchange: 'bitunix' }, query: { symbol: 'BTCUSDT', interval: '15m', limit: '201' } }, invalidLimit);
    assert.equal(invalidLimit.statusCode, 400);

    const invalidEndTime = response();
    await getCandles({ params: { exchange: 'bitunix' }, query: { symbol: 'BTCUSDT', interval: '15m', limit: '200', endTime: 'nope' } }, invalidEndTime);
    assert.equal(invalidEndTime.statusCode, 400);
});
