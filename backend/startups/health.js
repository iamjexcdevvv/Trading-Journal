function createReadinessState() {
    let ready = false;
    return {
        markReady() { ready = true; },
        markNotReady() { ready = false; },
        health(req, res) { return res.status(200).json({ status: 'ok' }); },
        ready(req, res) {
            return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
        }
    };
}

module.exports = { createReadinessState };
