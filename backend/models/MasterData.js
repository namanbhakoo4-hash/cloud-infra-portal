const mongoose = require('mongoose')

const masterDataSchema = new mongoose.Schema(
  {
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
      default: null
    },

    ram: {
      type: Number,
      default: null
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

masterDataSchema.index(
  {
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