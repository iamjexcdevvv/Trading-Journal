const path = require('node:path');
const dotenv = require('dotenv');

class ConfigurationError extends Error {}

function required(env, name, missing) {
    const value = env[name]?.trim();
    if (!value) missing.push(name);
    return value;
}

function isLocalHostname(hostname) {
    const normalized = hostname.toLowerCase();
    return normalized === 'localhost'
        || normalized.endsWith('.localhost')
        || normalized === '0.0.0.0'
        || normalized === '::'
        || normalized === '[::]'
        || normalized === '::1'
        || normalized === '[::1]'
        || normalized.startsWith('127.');
}

function parseUrl(value, name, { httpsOnly = false, rejectLocal = false } = {}) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new ConfigurationError(`${name} must be a valid absolute URL`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new ConfigurationError(`${name} must use HTTP or HTTPS`);
    if (httpsOnly && url.protocol !== 'https:') throw new ConfigurationError(`${name} must use HTTPS in production`);
    if (rejectLocal && isLocalHostname(url.hostname)) {
        throw new ConfigurationError(`${name} must not use a local address in production`);
    }
    if (url.username || url.password) throw new ConfigurationError(`${name} must not contain credentials`);
    return url.origin;
}

function validateEnvironment(env) {
    const mode = env.NODE_ENV;
    if (!['development', 'test', 'production'].includes(mode)) {
        throw new ConfigurationError('NODE_ENV must be supplied as development, test, or production');
    }

    const missing = [];
    const mongodbUri = required(env, 'MONGODB_URI', missing);
    const jwtSecret = required(env, 'JWT_SECRET', missing);
    const frontendUrl = required(env, 'FRONTEND_URL', missing);
    const productionOnly = ['BACKEND_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ENCRYPTION_KEY', 'EXCHANGE_WS_URL'];
    if (mode === 'production') productionOnly.forEach((name) => required(env, name, missing));
    if (missing.length) throw new ConfigurationError(`Missing required environment variables: ${missing.join(', ')}`);

    if (!/^mongodb(?:\+srv)?:\/\//.test(mongodbUri)) {
        throw new ConfigurationError('MONGODB_URI must use mongodb:// or mongodb+srv://');
    }
    if (mode === 'production' && jwtSecret.length < 32) {
        throw new ConfigurationError('JWT_SECRET must contain at least 32 characters in production');
    }

    const isProduction = mode === 'production';
    const validatedFrontendUrl = parseUrl(frontendUrl, 'FRONTEND_URL', { httpsOnly: isProduction, rejectLocal: isProduction });
    const backendUrl = env.BACKEND_URL
        ? parseUrl(env.BACKEND_URL, 'BACKEND_URL', { httpsOnly: isProduction, rejectLocal: isProduction })
        : undefined;

    if (isProduction && !/^[a-fA-F0-9]{64}$/.test(env.ENCRYPTION_KEY)) {
        throw new ConfigurationError('ENCRYPTION_KEY must be a 64-character hexadecimal value');
    }
    if (isProduction) {
        let exchangeWsUrl;
        try { exchangeWsUrl = new URL(env.EXCHANGE_WS_URL); }
        catch { throw new ConfigurationError('EXCHANGE_WS_URL must be a valid absolute URL'); }
        if (exchangeWsUrl.protocol !== 'wss:') throw new ConfigurationError('EXCHANGE_WS_URL must use WSS in production');
    }

    const port = Number(env.PORT || 3000);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigurationError('PORT must be an integer from 0 through 65535');
    const trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
    if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) throw new ConfigurationError('TRUST_PROXY_HOPS must be a non-negative integer');

    return Object.freeze({
        mode,
        isProduction,
        port,
        trustProxyHops,
        mongodbUri,
        frontendUrl: validatedFrontendUrl,
        backendUrl
    });
}

function loadAndValidateEnvironment() {
    const suppliedMode = process.env.NODE_ENV;
    if (suppliedMode === 'production' || suppliedMode === 'development') {
        dotenv.config({ path: path.join(__dirname, '..', `.env.${suppliedMode}`), quiet: true });
        process.env.NODE_ENV = suppliedMode;
    }
    return validateEnvironment(process.env);
}

module.exports = { ConfigurationError, validateEnvironment, loadAndValidateEnvironment };
