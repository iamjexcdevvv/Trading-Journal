const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createTag, getUserTags, deleteUserTag, updateUserTag } = require('../controllers/tags');

router.use(authMiddleware);
router.post('/', createTag);
router.get('/', getUserTags);
router.delete('/:id', deleteUserTag);
router.patch('/:id', updateUserTag);

module.exports = router;