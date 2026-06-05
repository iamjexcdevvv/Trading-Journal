const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    name: {type: String, required: true},
})

const Tag = mongoose.model('Tag', tagSchema)

async function saveTag(tagData) {
    const tag = new Tag(tagData);
    await tag.save();
    return tag;
}

async function getUserTagsById(userId) {
    return await Tag.find({ userId });
}

async function deleteTagById(id) {
    return await Tag.findByIdAndDelete(id);
}

async function updateTagById(id, name) {
    return await Tag.findByIdAndUpdate(id, { $set: { name } }, { returnDocument: 'after', runValidators: true });
}

module.exports = {
    saveTag,
    getUserTagsById,
    deleteTagById,
    updateTagById
}
