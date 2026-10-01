function hasAdminRole(user) {
    return user?.role === 'admin';
}

function isApprovedUser(user) {
    return hasAdminRole(user) || !user?.approvalStatus || user.approvalStatus === 'approved';
}

function accessTokenPayload(user) {
    return {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: hasAdminRole(user) ? 'admin' : 'user'
    };
}

module.exports = { hasAdminRole, isApprovedUser, accessTokenPayload };
