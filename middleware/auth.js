const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.cookies.token; // Check for token in cookies instead of Authorization header
  if (!token) {
    return res.status(401).send('Access denied. No token provided.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).send('Invalid token.');
  }
};

module.exports = auth;