const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: false, trim: true, lowercase: true },
    googleId: { type: String, trim: true },
    username: { type: String, required: false, trim: true, minlength: 3 },
    hashedPassword: {type: String, required: false},
    refreshToken: {type: String},
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    approvalStatus: { type: String, enum: ['pending', 'approved'] },
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, autoIndex: false });

// Index creation is performed only by the audited migration utility. Disabling
// autoIndex prevents an application deployment from mutating production indexes.
userSchema.index(
    { email: 1 },
    { unique: true, name: 'users_email_unique', partialFilterExpression: { email: { $type: 'string' } } }
);
userSchema.index(
    { googleId: 1 },
    { unique: true, name: 'users_google_id_unique', partialFilterExpression: { googleId: { $type: 'string' } } }
);
userSchema.index(
    { username: 1 },
    {
        unique: true,
        name: 'users_local_username_unique',
        partialFilterExpression: { username: { $type: 'string' }, hashedPassword: { $type: 'string' } }
    }
);

const User = mongoose.model('User', userSchema);

async function saveUser(userData) {
    const newUser = new User(userData);
    await newUser.save();
    return newUser;
}

async function getUser(username) {
    return await User.findOne({ username, hashedPassword: { $type: 'string' } });
}

async function getUserById(id) {
    return await User.findById(id);
}

async function getUserByGoogleId(googleId, email) {
    return await User.findOne({ $or: [{ googleId }, { email }] });
}

async function getUserByEmail(email) {
    return await User.findOne({ email: email.toLowerCase() });
}

async function getPendingUsers() {
    return await User.find({ approvalStatus: 'pending' }).select('_id username email createdAt approvalStatus').sort({ createdAt: 1 });
}

async function approveUserById(id, adminId) {
    return await User.findOneAndUpdate(
        { _id: id, approvalStatus: 'pending' },
        { $set: { approvalStatus: 'approved', approvedAt: new Date(), approvedBy: adminId } },
        { returnDocument: 'after' }
    ).select('_id username email createdAt approvalStatus approvedAt');
}

module.exports = { User, saveUser, getUser, getUserById, getUserByGoogleId, getUserByEmail, getPendingUsers, approveUserById };
