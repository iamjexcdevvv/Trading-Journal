const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { listPendingUsers, approveUser } = require('../controllers/adminApprovals');

const router = express.Router();
router.use(authMiddleware, adminMiddleware);
router.get('/', listPendingUsers);
router.patch('/:id/approve', approveUser);

module.exports = router;
