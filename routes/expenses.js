const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');

// Log model to verify import
console.log('Expense model:', typeof Expense, Expense);

router.get('/dashboard', auth, async (req, res) => {
  try {
    // Validate userId
    if (!req.user || !req.user.userId) {
      throw new Error('Invalid user authentication');
    }
    console.log('User ID:', req.user.userId);

    // Verify MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB not connected');
    }
    console.log('MongoDB connection state:', mongoose.connection.readyState);

    // Verify Expense model
    if (typeof Expense.find !== 'function') {
      throw new Error('Expense model is not properly defined');
    }

    // Fetch expenses
    const expenses = await Expense.find({ userId: req.user.userId }).sort({ date: -1 });
    console.log('Expenses fetched:', expenses.length);

    // Fetch current month's budget
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const budget = await Budget.findOne({ userId: req.user.userId, month: currentMonth });
    console.log('Budget fetched:', budget);

    // Monthly spend breakdown (current year)
    const monthlyData = await Expense.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.userId),
          date: { $gte: new Date(new Date().getFullYear(), 0, 1) },
        },
      },
      {
        $group: {
          _id: { $month: '$date' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id': 1 } },
    ]).catch(err => {
      console.error('Monthly aggregation error:', err.message);
      return [];
    });
    console.log('Monthly data:', monthlyData);

    // Category-wise breakdown
    const categoryData = await Expense.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.userId) } },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      },
    ]).catch(err => {
      console.error('Category aggregation error:', err.message);
      return [];
    });
    console.log('Category data:', categoryData);

    // Spending trends (last 6 months)
    const trendData = await Expense.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.userId),
          date: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id': 1 } },
    ]).catch(err => {
      console.error('Trend aggregation error:', err.message);
      return [];
    });
    console.log('Trend data:', trendData);

    res.render('dashboard', {
      expenses: expenses || [],
      budget: budget || null,
      expenseError: null,
      budgetError: null,
      monthlyData: JSON.stringify(monthlyData || []),
      categoryData: JSON.stringify(categoryData || []),
      trendData: JSON.stringify(trendData || []),
      user: req.user,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error.message);
    res.render('dashboard', {
      expenses: [],
      budget: null,
      expenseError: `Error fetching expenses: ${error.message}. Please try again.`,
      budgetError: null,
      monthlyData: JSON.stringify([]),
      categoryData: JSON.stringify([]),
      trendData: JSON.stringify([]),
      user: req.user,
    });
  }
});

router.post('/expenses', auth, async (req, res) => {
  const { description, amount, category } = req.body;
  try {
    if (!req.user || !req.user.userId) {
      throw new Error('Invalid user authentication');
    }
    if (typeof Expense !== 'function') {
      throw new Error('Expense model is not properly defined');
    }
    const expense = new Expense({
      userId: req.user.userId,
      description,
      amount: parseFloat(amount),
      category,
    });
    await expense.save();
    console.log('Expense saved:', { description, amount, category });
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error adding expense:', error.message);
    res.render('dashboard', {
      expenses: await Expense.find({ userId: req.user.userId }).sort({ date: -1 }) || [],
      budget: null,
      expenseError: `Error adding expense: ${error.message}. Please try again.`,
      budgetError: null,
      monthlyData: JSON.stringify([]),
      categoryData: JSON.stringify([]),
      trendData: JSON.stringify([]),
      user: req.user,
    });
  }
});

router.post('/expenses/delete/:id', auth, async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      throw new Error('Invalid user authentication');
    }
    if (typeof Expense.findOneAndDelete !== 'function') {
      throw new Error('Expense model is not properly defined');
    }
    const result = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    console.log('Expense deleted:', result);
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error deleting expense:', error.message);
    res.redirect('/dashboard');
  }
});

router.post('/expenses/set-budget', auth, async (req, res) => {
  const { budgetAmount } = req.body;
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    if (!req.user || !req.user.userId) {
      throw new Error('Invalid user authentication');
    }
    if (!budgetAmount || budgetAmount <= 0) {
      throw new Error('Invalid budget amount');
    }
    const budget = await Budget.findOneAndUpdate(
      { userId: req.user.userId, month: currentMonth },
      { amount: parseFloat(budgetAmount) },
      { upsert: true, new: true }
    );
    console.log('Budget set:', budget);
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error setting budget:', error.message);
    res.render('dashboard', {
      expenses: await Expense.find({ userId: req.user.userId }).sort({ date: -1 }) || [],
      budget: null,
      expenseError: null,
      budgetError: `Error setting budget: ${error.message}. Please enter a valid amount.`,
      monthlyData: JSON.stringify([]),
      categoryData: JSON.stringify([]),
      trendData: JSON.stringify([]),
      user: req.user,
    });
  }
});

module.exports = router;