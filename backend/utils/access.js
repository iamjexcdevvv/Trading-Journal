const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'dublasandrei@gmail.com').toLowerCase();

function isAdminUser(user) {
    return user?.role === 'admin' || user?.email?.toLowerCase() === ADMIN_EMAIL;
}

function isApprovedUser(user) {
    return isAdminUser(user) || !user?.approvalStatus || user.approvalStatus === 'approved';
}

function accessTokenPayload(user) {
    return {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: isAdminUser(user) ? 'admin' : 'user'
    };
}

module.exports = { ADMIN_EMAIL, isAdminUser, isApprovedUser, accessTokenPayload };
