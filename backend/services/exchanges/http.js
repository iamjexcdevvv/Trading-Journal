const REQUEST_TIMEOUT_MS = 10_000;

async function fetchJson(url, options, exchange) {
    let response;
    try {
        response = await fetch(url, {
            ...options,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch (error) {
        if (error.name === 'TimeoutError') throw new Error(`${exchange} API request timed out`);
        throw new Error(`${exchange} API request failed`);
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`${exchange} API returned an invalid response`);
    }

    return { response, data };
}

module.exports = { fetchJson, REQUEST_TIMEOUT_MS };
