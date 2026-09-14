const { getUserById } = require('../models/users');
const { isAdminUser } = require('../utils/access');

module.exports = async function adminMiddleware(req, res, next) {
    try {
        const user = await getUserById(req.user._id);
        if (!user || !isAdminUser(user)) return res.status(403).json({ error: 'Administrator access required' });
        req.adminUser = user;
        next();
    } catch (error) {
        next(error);
    }
};
