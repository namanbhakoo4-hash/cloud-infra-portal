const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/authRoutes')
const resourceRoutes = require('./routes/resourceRoutes')
const bomRoutes = require('./routes/bomRoutes')
const masterDataRoutes = require('./routes/masterDataRoutes')

const app = express()


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(cors())

app.use(express.json())


// ======================================================
// TEST ROUTE
// ======================================================

app.get('/', (req, res) => {

  res.send(
    'Cloud Infrastructure Provisioning Portal Backend is running'
  )

})


// ======================================================
// API ROUTES
// ======================================================

app.use(
  '/api/auth',
  authRoutes
)

app.use(
  '/api/resources',
  resourceRoutes
)

app.use(
  '/api/bom',
  bomRoutes
)

app.use(
  '/api/master-data',
  masterDataRoutes
)


// ======================================================
// CONNECT TO MONGODB
// ======================================================

mongoose
  .connect(process.env.MONGO_URI)

  .then(() => {

    console.log(
      'MongoDB connected successfully'
    )


    // Start server only after
    // MongoDB connection succeeds

    app.listen(
      process.env.PORT || 5000,
      () => {

        console.log(
          `Server running on port ${
            process.env.PORT || 5000
          }`
        )

      }
    )

  })

  .catch((error) => {

    console.log(
      'MongoDB connection failed'
    )

    console.log(
      error.message
    )

  })