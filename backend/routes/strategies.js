const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

const { createStrategy, getUserStrategies, deleteStrategy, updateStrategy } = require('../controllers/strategies');

router.use(authMiddleware);

router.post('/', createStrategy);
router.get('/', getUserStrategies);
router.delete('/:id', deleteStrategy);
router.put('/:id', updateStrategy);

module.exports = router;