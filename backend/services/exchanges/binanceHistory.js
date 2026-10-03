// Reconstruct completed position cycles from fills and the ending account inventory.
// Binance has no closed-position history endpoint. Realized PnL supplies the actual
// weighted entry cost of each closed quantity, including positions opened earlier.
function completedPositions(fills, endingPositions) {
    const groups = new Map();
    for (const fill of fills) {
        if (!fill.symbol || !['BOTH', 'LONG', 'SHORT'].includes(fill.positionSide) ||
            !['BUY', 'SELL'].includes(fill.side) || !Number.isSafeInteger(fill.id) ||
            !Number.isFinite(Number(fill.time)) || !(Number(fill.qty) > 0) ||
            !(Number(fill.price) > 0) || !Number.isFinite(Number(fill.realizedPnl)) ||
            !Number.isFinite(Number(fill.commission))) throw new Error('Invalid Binance history fill');
        const key = `${fill.symbol}-${fill.positionSide}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(fill);
    }
    const completed = [];
    for (const [sourceExternalId, rows] of groups) {
        rows.sort((a, b) => Number(a.time) - Number(b.time) || a.id - b.id);
        const final = endingPositions.find(position => position.externalId === sourceExternalId);
        if (final && (!Number.isFinite(final.qty) || final.qty < 0 ||
            !['Long', 'Short'].includes(final.direction))) throw new Error('Invalid Binance ending inventory');
        const finalQty = final ? final.qty * (final.direction === 'Long' ? 1 : -1) : 0;
        let inventory = finalQty - rows.reduce((sum, row) =>
            sum + Number(row.qty) * (row.side === 'BUY' ? 1 : -1), 0);
        const tolerance = Math.max(Number.EPSILON, ...rows.map(row => Number(row.qty) * 1e-9));
        if (Math.abs(inventory) < tolerance) inventory = 0;
        let cycle = null;
        for (const row of rows) {
            const qty = Number(row.qty);
            const change = row.side === 'BUY' ? qty : -qty;
            const closing = inventory && Math.sign(inventory) !== Math.sign(change)
                ? Math.min(Math.abs(inventory), qty) : 0;
            if (!cycle) cycle = { openedAt: inventory ? null : Number(row.time),
                qty: 0, entryCost: 0, exitCost: 0, pnl: 0, fee: 0 };
            if (closing) {
                const sign = Math.sign(inventory);
                cycle.direction = sign > 0 ? 'Long' : 'Short';
                cycle.qty += closing;
                cycle.entryCost += Number(row.price) * closing - sign * Number(row.realizedPnl);
                cycle.exitCost += Number(row.price) * closing;
                cycle.pnl += Number(row.realizedPnl);
                cycle.fee += Number(row.commission) * closing / qty;
                inventory += Math.sign(change) * closing;
                if (Math.abs(inventory) < tolerance) {
                    inventory = 0;
                    completed.push({ historyId: `${sourceExternalId}:${row.id}`, sourceExternalId,
                        symbol: row.symbol, direction: cycle.direction, openedAt: cycle.openedAt,
                        closedAt: Number(row.time), entryPrice: cycle.entryCost / cycle.qty,
                        exitPrice: cycle.exitCost / cycle.qty, qty: cycle.qty,
                        pnl: cycle.pnl, fee: cycle.fee, leverage: null });
                    cycle = null;
                }
            } else if (Number(row.realizedPnl) !== 0) {
                throw new Error('Binance history inventory changed during import; retry');
            }
            const opening = qty - closing;
            if (opening > tolerance) {
                if (!cycle) cycle = { openedAt: Number(row.time), qty: 0,
                    entryCost: 0, exitCost: 0, pnl: 0, fee: 0 };
                inventory += Math.sign(change) * opening;
                cycle.fee += Number(row.commission) * opening / qty;
            }
            if ((row.positionSide === 'LONG' && inventory < -tolerance) ||
                (row.positionSide === 'SHORT' && inventory > tolerance)) {
                throw new Error('Invalid Binance history inventory');
            }
        }
    }
    return completed;
}

module.exports = { completedPositions };
