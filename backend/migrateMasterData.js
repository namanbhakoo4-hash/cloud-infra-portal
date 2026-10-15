
require('dotenv').config()

const mongoose = require('mongoose')

// Connect to MongoDB and update existing master data
async function migrateMasterData() {
  try {
    // STEP 1: Connect to MongoDB Atlas
    await mongoose.connect(process.env.MONGO_URI)

    console.log('Connected to MongoDB successfully')

    // STEP 2: Access the masterdatas collection
    const collection = mongoose.connection.collection('masterdatas')

    // STEP 3: Find records without cloudProvider
    // and assign AWS as their provider
    const result = await collection.updateMany(
      {
        cloudProvider: { $exists: false }
      },
      {
        $set: {
          cloudProvider: 'aws'
        }
      }
    )

    // STEP 4: Display migration result
    console.log('Migration completed successfully!')
    console.log('Documents updated:', result.modifiedCount)

  } catch (error) {
    console.error('Migration failed:', error.message)
    process.exitCode = 1
  } finally {
    // STEP 5: Disconnect from MongoDB
    await mongoose.disconnect()
    console.log('MongoDB connection closed')
  }
}

migrateMasterData()
