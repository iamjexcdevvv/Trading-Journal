const express = require('express');
const authMiddleware = require('../middleware/auth');
const { listDrawings, createDrawing, updateDrawing, deleteDrawing } = require('../controllers/chartDrawings');

const router = express.Router();
router.use(authMiddleware);
router.get('/', listDrawings);
router.post('/', createDrawing);
router.patch('/:id', updateDrawing);
router.delete('/:id', deleteDrawing);
module.exports = router;
