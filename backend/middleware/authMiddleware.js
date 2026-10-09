const jwt = require('jsonwebtoken')

const authMiddleware = (req, res, next) => {
  try {

    // Get token from request header
    const token = req.header('Authorization')

    if (!token) {
      return res.status(401).json({
        message: 'Access denied. No token provided.'
      })
    }

    // Remove "Bearer " from the token
    const actualToken = token.replace('Bearer ', '')

    // Verify token
    const decoded = jwt.verify(
      actualToken,
      process.env.JWT_SECRET
    )

    // Store decoded user information
    req.user = decoded

    next()

  } catch (error) {
    res.status(401).json({
      message: 'Invalid or expired token'
    })
  }
}

module.exports = authMiddleware