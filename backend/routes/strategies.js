const express = require('express');
const router = express.Router();

const { createStrategy, getUserStrategies, deleteStrategy, updateStrategy } = require('../controllers/strategies');

router.post('/', createStrategy);
router.get('/', getUserStrategies);
router.delete('/:id', deleteStrategy);
router.put('/:id', updateStrategy);
// router.get('/', getStrategies);
// router.delete('/:id', deleteStrategy);
// router.put('/:id', updateStrategy);

module.exports = router;