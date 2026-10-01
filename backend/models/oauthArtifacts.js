const crypto = require('node:crypto');
const mongoose = require('mongoose');

const OAUTH_CODE_TTL_MS = 3 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

const oauthArtifactSchema = new mongoose.Schema({
    kind: { type: String, enum: ['code', 'state'], required: true },
    tokenHash: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true }
});

oauthArtifactSchema.index({ kind: 1, tokenHash: 1 }, { unique: true });
oauthArtifactSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OAuthArtifact = mongoose.model('OAuthArtifact', oauthArtifactSchema);

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueOAuthArtifact(kind, { userId, ttlMs } = {}) {
    const token = crypto.randomBytes(32).toString('base64url');
    await OAuthArtifact.create({
        kind,
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + ttlMs)
    });
    return token;
}

async function consumeOAuthArtifact(kind, token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return OAuthArtifact.findOneAndDelete({
        kind,
        tokenHash: hashToken(token),
        expiresAt: { $gt: new Date() }
    });
}

module.exports = {
    OAuthArtifact,
    OAUTH_CODE_TTL_MS,
    OAUTH_STATE_TTL_MS,
    issueOAuthArtifact,
    consumeOAuthArtifact
};
