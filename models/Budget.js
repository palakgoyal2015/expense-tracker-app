const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true }, // Format: YYYY-MM
  amount: { type: Number, required: true },
});

module.exports = mongoose.models.Budget || mongoose.model('Budget', budgetSchema);