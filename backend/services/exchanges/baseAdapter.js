// Every exchange adapter is a plain object implementing this contract:
//   id, requiresPassphrase, supportsRealtime
//   assertReadOnly(creds) -> throws if detectable write permissions are enabled (optional)
//   testConnection(creds) -> throws if credentials are invalid
//   getOpenPositions(creds) -> [{ externalId, symbol, direction, entryPrice, qty, leverage, openedAt? }]
//   getFillsSince(creds, symbol, sinceMs, externalId) -> [{ price, qty, pnl, fee, time, side }]
//   getClosedTrades(creds, sinceMs, untilMs) -> completed position records with stable
//     historyId, sourceExternalId, symbol, direction, openedAt, closedAt, prices, qty, pnl, fee.
//     side is 'Long' | 'Short' | null (null when the exchange doesn't distinguish, e.g. one-way mode)
//   connectStream(creds, { onPositionUpdate, onError }) -> { stop() }   -- only if supportsRealtime
//     onPositionUpdate receives one position at a time; qty === 0 means that position just closed.
const REQUIRED_METHODS = ['testConnection', 'getOpenPositions', 'getFillsSince'];

function assertValidAdapter(adapter) {
    for (const method of REQUIRED_METHODS) {
        if (typeof adapter[method] !== 'function') {
            throw new Error(`Exchange adapter "${adapter.id}" is missing required method "${method}"`);
        }
    }
    if (adapter.supportsRealtime && typeof adapter.connectStream !== 'function') {
        throw new Error(`Exchange adapter "${adapter.id}" declares supportsRealtime but has no connectStream`);
    }
}

module.exports = { assertValidAdapter };
