const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

const { createSetup, getUserSetups, deleteSetup, updateSetup } = require('../controllers/setups');

router.use(authMiddleware);

router.post('/', createSetup);
router.get('/', getUserSetups);
router.delete('/:id', deleteSetup);
router.put('/:id', updateSetup);

module.exports = router;
