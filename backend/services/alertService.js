const WebSocket = require('ws');
const { Alert } = require('../models/alerts');

let io = null;
let ws = null;
const activeAlertsCache = new Map(); // symbol -> Array of alerts
const lastPrices = new Map(); // symbol -> Number (last price)
const activeSubscriptions = new Set(); // Set of symbols

function initAlertService(ioInstance, wsInstance) {
    io = ioInstance;
    ws = wsInstance;
    console.log("Alert service initialized");
}

async function loadActiveAlerts() {
    try {
        // Find all active alerts in DB
        const activeAlerts = await Alert.find({ status: 'active' });
        
        // Clear current cache and subscriptions
        activeAlertsCache.clear();
        activeSubscriptions.clear();
        
        activeAlerts.forEach(alert => {
            const symbol = alert.symbol;
            if (!activeAlertsCache.has(symbol)) {
                activeAlertsCache.set(symbol, []);
            }
            
            const alertObj = alert.toObject();
            alertObj.lastEvaluatedTime = Date.now();
            activeAlertsCache.get(symbol).push(alertObj);
            
            // Track symbol subscription
            activeSubscriptions.add(symbol);
        });

        console.log(`Loaded ${activeAlerts.length} active alerts for symbols:`, [...activeSubscriptions]);
        
        // Subscribe to these symbols on Bitunix WS
        if (ws && ws.readyState === WebSocket.OPEN) {
            activeSubscriptions.forEach(symbol => {
                subscribeSymbol(symbol);
            });
        }
    } catch (err) {
        console.error("Error loading active alerts into service:", err);
    }
}

function subscribeSymbol(symbol) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const subMsg = {
        'op': 'subscribe',
        'args': [{ "symbol": symbol, "ch": "ticker" }]
    };
    ws.send(JSON.stringify(subMsg));
    console.log(`Subscribed to Bitunix WS for symbol: ${symbol}`);
}

function unsubscribeSymbol(symbol) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const unsubMsg = {
        'op': 'unsubscribe',
        'args': [{ "symbol": symbol, "ch": "ticker" }]
    };
    ws.send(JSON.stringify(unsubMsg));
    console.log(`Unsubscribed from Bitunix WS for symbol: ${symbol}`);
}

function addAlertToCache(alert) {
    const symbol = alert.symbol;
    if (!activeAlertsCache.has(symbol)) {
        activeAlertsCache.set(symbol, []);
    }
    
    // Check if alert is already in cache to prevent duplicate
    const exists = activeAlertsCache.get(symbol).some(a => a._id.toString() === alert._id.toString());
    if (!exists) {
        const alertObj = typeof alert.toObject === 'function' ? alert.toObject() : alert;
        alertObj.lastEvaluatedTime = Date.now();
        activeAlertsCache.get(symbol).push(alertObj);
        console.log(`Added alert ${alert._id} to cache for symbol: ${symbol}`);
    }
    
    // Subscribe to symbol if not already subscribed
    if (!activeSubscriptions.has(symbol)) {
        activeSubscriptions.add(symbol);
        subscribeSymbol(symbol);
    }
}

function removeAlertFromCache(alertId, symbol) {
    if (!activeAlertsCache.has(symbol)) return;
    
    const alerts = activeAlertsCache.get(symbol);
    const updatedAlerts = alerts.filter(a => a._id.toString() !== alertId.toString());
    
    if (updatedAlerts.length === 0) {
        activeAlertsCache.delete(symbol);
        activeSubscriptions.delete(symbol);
        unsubscribeSymbol(symbol);
        console.log(`Removed last alert for ${symbol}. Unsubscribing from WS.`);
    } else {
        activeAlertsCache.set(symbol, updatedAlerts);
        console.log(`Removed alert ${alertId} from cache for symbol: ${symbol}`);
    }
}

function getTrendlinePrice(alert, timeMs) {
    const t1 = new Date(alert.startTime).getTime();
    const t2 = new Date(alert.endTime).getTime();
    const p1 = alert.startPrice;
    const p2 = alert.endPrice;

    if (t2 === t1) return p1;
    return p1 + ((p2 - p1) * (timeMs - t1)) / (t2 - t1);
}

async function handlePriceUpdate(symbolData) {
    const symbol = symbolData.symbol;
    const currentAssetPrice = symbolData?.data?.la;
    if (currentAssetPrice === undefined || currentAssetPrice === null) return;
    
    const previousAssetPrice = lastPrices.get(symbol);
    lastPrices.set(symbol, currentAssetPrice);
    
    if (previousAssetPrice === undefined) {
        // Store first price tick and skip checking to avoid false triggers
        return;
    }
    
    const alerts = activeAlertsCache.get(symbol);
    if (!alerts || alerts.length === 0) return;
    
    const now = Date.now();
    const alertsToTrigger = [];
    const alertsToExpire = [];
    
    alerts.forEach(alert => {
        // Check trendline expiry
        if (alert.type === 'trendline') {
            const endTime = new Date(alert.endTime).getTime();
            if (now > endTime) {
                alertsToExpire.push(alert);
                return;
            }
        }
        
        let currentTargetPrice, previousTargetPrice;
        if (alert.type === 'trendline') {
            const prevTime = alert.lastEvaluatedTime || (now - 5000);
            currentTargetPrice = getTrendlinePrice(alert, now);
            previousTargetPrice = getTrendlinePrice(alert, prevTime);
            alert.lastEvaluatedTime = now;
        } else {
            currentTargetPrice = alert.price;
            previousTargetPrice = alert.price;
        }
        
        let triggered = false;
        let actionMessage = '';
        
        switch (alert.condition) {
            case 'crossing':
                if (
                    (previousAssetPrice < previousTargetPrice && currentAssetPrice >= currentTargetPrice) ||
                    (previousAssetPrice > previousTargetPrice && currentAssetPrice <= currentTargetPrice)
                ) {
                    triggered = true;
                    actionMessage = `crossing ${alert.type === 'trendline' ? 'trendline' : alert.price}`;
                }
                break;
            case 'crossing up':
                if (previousAssetPrice < previousTargetPrice && currentAssetPrice >= currentTargetPrice) {
                    triggered = true;
                    actionMessage = `crossing above ${alert.type === 'trendline' ? 'trendline' : alert.price}`;
                }
                break;
            case 'crossing down':
                if (previousAssetPrice > previousTargetPrice && currentAssetPrice <= currentTargetPrice) {
                    triggered = true;
                    actionMessage = `crossing below ${alert.type === 'trendline' ? 'trendline' : alert.price}`;
                }
                break;
        }
        
        if (triggered) {
            alertsToTrigger.push({ alert, actionMessage });
        }
    });
    
    // Process expirations
    for (const alert of alertsToExpire) {
        console.log(`Alert expired: ${alert.symbol} for user ${alert.userId}`);
        try {
            await Alert.findByIdAndUpdate(alert._id, { status: 'expired' });
            removeAlertFromCache(alert._id, alert.symbol);
            if (io) {
                io.to(`user:${alert.userId}`).emit('alert-expired', alert);
            }
        } catch (err) {
            console.error(`Failed to expire alert ${alert._id}:`, err);
        }
    }
    
    // Process triggers
    for (const { alert, actionMessage } of alertsToTrigger) {
        console.log(`Alert triggered: ${alert.symbol} ${actionMessage} for user ${alert.userId}`);
        try {
            await Alert.findByIdAndUpdate(alert._id, { status: 'triggered' });
            removeAlertFromCache(alert._id, alert.symbol);
            if (io) {
                io.to(`user:${alert.userId}`).emit('alert-triggered', {
                    alert,
                    actionMessage,
                    currentPrice: currentAssetPrice
                });
            }
        } catch (err) {
            console.error(`Failed to trigger alert ${alert._id}:`, err);
        }
    }
}

module.exports = {
    initAlertService,
    loadActiveAlerts,
    addAlertToCache,
    removeAlertFromCache,
    handlePriceUpdate,
    activeSubscriptions
};
