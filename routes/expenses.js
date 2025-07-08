const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');

// Log model imports for debugging
console.log('Expense model imported:', typeof Expense === 'function' ? 'Valid' : 'Invalid', Expense);
console.log('Budget model imported:', typeof Budget === 'function' ? 'Valid' : 'Invalid', Budget);

router.get('/dashboard', auth, async (req, res) => {
  try {
    // Validate user authentication
    if (!req.user || !req.user.userId) {
      throw new Error('Authentication failed: User ID not found');
    }
    const userId = req.user.userId;
    console.log('Authenticated User ID:', userId);

    // Verify MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection lost');
    }
    console.log('MongoDB connection state:', mongoose.connection.readyState);

    // Verify Expense model functionality
    if (typeof Expense.find !== 'function') {
      throw new Error('Expense model is not properly initialized');
    }

    // Fetch expenses
    const expenses = await Expense.find({ userId }).sort({ date: -1 }).lean();
    console.log('Expenses fetched:', expenses.length);

    // Fetch current month's budget
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const budget = await Budget.findOne({ userId, month: currentMonth }).lean() || { amount: 0 };
    console.log('Budget fetched:', budget);

    // Monthly spend breakdown (current year)
    const monthlyData = await Expense.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
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
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
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
          userId: new mongoose.Types.ObjectId(userId),
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
      budget: budget || { amount: 0 },
      expenseError: null,
      budgetError: null,
      monthlyData: JSON.stringify(monthlyData || []),
      categoryData: JSON.stringify(categoryData || []),
      trendData: JSON.stringify(trendData || []),
      user: req.user,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error.message, error.stack);
    res.render('dashboard', {
      expenses: [],
      budget: { amount: 0 },
      expenseError: 'An error occurred while loading the dashboard. Please try again later.',
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
      throw new Error('Authentication failed: User ID not found');
    }
    if (typeof Expense !== 'function') {
      throw new Error('Expense model is not properly initialized');
    }
    if (!description || !amount || !category) {
      throw new Error('Missing required fields');
    }
    const expense = new Expense({
      userId: req.user.userId,
      description,
      amount: parseFloat(amount),
      category,
      date: new Date(),
    });
    await expense.save();
    console.log('Expense saved:', { description, amount, category });
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error adding expense:', error.message, error.stack);
    const expenses = await Expense.find({ userId: req.user.userId }).sort({ date: -1 }).lean().catch(() => []);
    res.render('dashboard', {
      expenses: expenses || [],
      budget: null,
      expenseError: `Failed to add expense: ${error.message}. Please try again.`,
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
      throw new Error('Authentication failed: User ID not found');
    }
    if (typeof Expense.findOneAndDelete !== 'function') {
      throw new Error('Expense model is not properly initialized');
    }
    const result = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!result) {
      console.warn('No expense found to delete with ID:', req.params.id);
    } else {
      console.log('Expense deleted:', result);
    }
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error deleting expense:', error.message, error.stack);
    res.redirect('/dashboard'); // Redirect even on error to maintain state
  }
});

router.post('/expenses/set-budget', auth, async (req, res) => {
  const { budgetAmount } = req.body;
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    if (!req.user || !req.user.userId) {
      throw new Error('Authentication failed: User ID not found');
    }
    if (!budgetAmount || parseFloat(budgetAmount) <= 0) {
      throw new Error('Invalid budget amount');
    }
    const budget = await Budget.findOneAndUpdate(
      { userId: req.user.userId, month: currentMonth },
      { amount: parseFloat(budgetAmount), userId: req.user.userId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    console.log('Budget set:', budget);
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error setting budget:', error.message, error.stack);
    const expenses = await Expense.find({ userId: req.user.userId }).sort({ date: -1 }).lean().catch(() => []);
    res.render('dashboard', {
      expenses: expenses || [],
      budget: null,
      expenseError: null,
      budgetError: `Failed to set budget: ${error.message}. Please enter a valid amount.`,
      monthlyData: JSON.stringify([]),
      categoryData: JSON.stringify([]),
      trendData: JSON.stringify([]),
      user: req.user,
    });
  }
});

module.exports = router;