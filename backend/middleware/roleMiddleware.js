const roleMiddleware = (...allowedRoles) => {

  return (req, res, next) => {

    // Check if user's role is allowed
    if (!allowedRoles.includes(req.user.role)) {

      return res.status(403).json({
        message: 'Access denied. You do not have permission.'
      })

    }

    next()
  }
}

module.exports = roleMiddleware