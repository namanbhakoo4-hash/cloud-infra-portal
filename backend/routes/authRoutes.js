const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const authMiddleware = require('../middleware/authMiddleware')

const router = express.Router()


// =========================
// REGISTER
// =========================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email })

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists'
      })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create new user
    const user = new User({
      name,
      email,
      password: hashedPassword
    })

    // Save user in MongoDB
    await user.save()

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })

  } catch (error) {
    console.log(error)

    res.status(500).json({
      message: 'Server error'
    })
  }
})


// =========================
// LOGIN
// =========================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user
    const user = await User.findOne({ email })

    if (!user) {
      return res.status(400).json({
        message: 'User not found'
      })
    }

    // Check password
    const isMatch = await bcrypt.compare(
      password,
      user.password
    )

    if (!isMatch) {
      return res.status(400).json({
        message: 'Incorrect password'
      })
    }

    // Create JWT token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '1h'
      }
    )

    // Send token to frontend
    res.json({
      message: 'Login successful',
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    })

  } catch (error) {
    console.log(error)

    res.status(500).json({
      message: 'Server error'
    })
  }
})


// =========================
// PROTECTED PROFILE
// =========================
router.get('/profile', authMiddleware, async (req, res) => {
  try {

    // Get logged-in user
    // Do not return password
    const user = await User
      .findById(req.user.id)
      .select('-password')

    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      })
    }

    res.json({
      message: 'Profile accessed successfully',
      user: user
    })

  } catch (error) {
    console.log(error)

    res.status(500).json({
      message: 'Server error'
    })
  }
})


module.exports = router