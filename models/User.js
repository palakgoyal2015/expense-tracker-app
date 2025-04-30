const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true }, // Removed unique constraint
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);