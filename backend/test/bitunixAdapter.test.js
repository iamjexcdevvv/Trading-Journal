const test = require('node:test');
const assert = require('node:assert/strict');
const bitunix = require('../services/exchanges/bitunixAdapter');

test('Bitunix history response reads fills from data.tradeList', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            code: 0,
            data: {
                tradeList: [{
                    price: '60123.5', qty: '0.25', realizedPNL: '12.4', fee: '0.08',
                    ctime: 1700000000000, side: 'LONG'
                }],
                total: 1
            },
            msg: 'Success'
        })
    });

    const fills = await bitunix.getFillsSince(
        { apiKey: 'test-key', apiSecret: 'test-secret' },
        'BTCUSDT',
        1699999999000
    );

    assert.deepEqual(fills, [{
        price: 60123.5, qty: 0.25, pnl: 12.4, fee: 0.08,
        time: 1700000000000, side: 'Long'
    }]);
});

test('Bitunix closes a position from exact aggregate position history', async (t) => {
    const originalFetch = global.fetch;
    let requestedUrl;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async (url) => {
        requestedUrl = String(url);
        return {
            ok: true,
            json: async () => ({
                code: 0,
                data: {
                    positionList: [{
                        positionId: 'position-7', closePrice: '61200', maxQty: '0.25',
                        realizedPNL: '25', fee: '0.09', mtime: 1700000001000, side: 'LONG'
                    }]
                }
            })
        };
    };

    const fills = await bitunix.getFillsSince(
        { apiKey: 'test-key', apiSecret: 'test-secret' },
        'BTCUSDT',
        1699999999000,
        'position-7'
    );

    assert.match(requestedUrl, /get_history_positions/);
    assert.match(requestedUrl, /positionId=position-7/);
    assert.deepEqual(fills, [{
        price: 61200, qty: 0.25, pnl: 25, fee: 0.09,
        time: 1700000001000, side: 'Long'
    }]);
});
