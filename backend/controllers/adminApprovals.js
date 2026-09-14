const { getPendingUsers, approveUserById } = require('../models/users');

async function listPendingUsers(req, res) {
    const users = await getPendingUsers();
    res.status(200).json(users);
}

async function approveUser(req, res) {
    const user = await approveUserById(req.params.id, req.adminUser._id);
    if (!user) return res.status(404).json({ error: 'Pending user not found' });
    res.status(200).json(user);
}

module.exports = { listPendingUsers, approveUser };
