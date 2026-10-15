
const mongoose = require('mongoose')

const masterDataSchema = new mongoose.Schema(
  {
    cloudProvider: {
      type: String,
      enum: ['aws', 'azure', 'gcp'],
      default: 'aws',
      required: true
    },

    category: {
      type: String,
      required: true,
      trim: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    value: {
      type: String,
      required: true,
      trim: true
    },

    cpu: {
      type: Number,
      default: null,
      min: 0
    },

    ram: {
      type: Number,
      default: null,
      min: 0
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
)

// The same category/value can exist under
// different cloud providers.
masterDataSchema.index(
  {
    cloudProvider: 1,
    category: 1,
    value: 1
  },
  {
    unique: true
  }
)

const MasterData = mongoose.model(
  'MasterData',
  masterDataSchema
)

module.exports = MasterData
