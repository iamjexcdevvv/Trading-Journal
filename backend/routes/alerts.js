const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createAlert, getAlerts, deleteAlert } = require('../controllers/alerts');

router.use(authMiddleware);
router.post('/', createAlert);
router.get('/', getAlerts);
router.delete('/:id', deleteAlert);

module.exports = router;