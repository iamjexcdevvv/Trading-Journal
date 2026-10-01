const REFRESH_COOKIE_PATH = '/api/auth';
const OAUTH_STATE_COOKIE_PATH = '/api/auth/google/callback';

function securityAttributes() {
    const production = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' : 'lax'
    };
}

function refreshCookieOptions() {
    return {
        ...securityAttributes(),
        path: REFRESH_COOKIE_PATH,
        maxAge: 7 * 24 * 60 * 60 * 1000
    };
}

function refreshCookieClearOptions() {
    return {
        ...securityAttributes(),
        path: REFRESH_COOKIE_PATH
    };
}

function oauthStateCookieOptions(maxAge) {
    return {
        ...securityAttributes(),
        sameSite: 'lax',
        path: OAUTH_STATE_COOKIE_PATH,
        maxAge
    };
}

function oauthStateCookieClearOptions() {
    return {
        ...securityAttributes(),
        sameSite: 'lax',
        path: OAUTH_STATE_COOKIE_PATH
    };
}

module.exports = {
    REFRESH_COOKIE_PATH,
    refreshCookieOptions,
    refreshCookieClearOptions,
    oauthStateCookieOptions,
    oauthStateCookieClearOptions
};
