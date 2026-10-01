const { saveTag, getUserTagsById, deleteTagById, updateTagById } = require('../models/tags');
const Joi = require('joi');

const tagSchema = Joi.object({
    name: Joi.string().required()
});

async function createTag(req, res) {
    const user = req.user;

    if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { error } = tagSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    try {
        const { name } = req.body;
        const tag = await saveTag({ userId: user._id, name });
        res.status(201).json(tag);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getUserTags(req, res) {
    const user = req.user;

    if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const tags = await getUserTagsById(user._id);
        res.status(200).json(tags);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function deleteUserTag(req, res) {
    const {id} = req.params;

    try {
        const deletedData = await deleteTagById(id, req.user._id);
        if (!deletedData) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        res.status(200).json(deletedData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function updateUserTag(req, res) {
    const { error } = tagSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    
    const {id} = req.params;
    const {name} = req.body;
    
    try {
        const updatedData = await updateTagById(id, req.user._id, name);
        if (!updatedData) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        res.status(200).json(updatedData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    createTag,
    getUserTags,
    deleteUserTag,
    updateUserTag
}
