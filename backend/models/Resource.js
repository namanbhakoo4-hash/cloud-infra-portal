const mongoose = require('mongoose')

const resourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },

    provider: {
      type: String,
      enum: ['AWS', 'Azure', 'GCP'],
      required: true
    },

    type: {
      type: String,
      required: true
    },

    region: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ['Running', 'Stopped'],
      default: 'Stopped'
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
)

const Resource = mongoose.model('Resource', resourceSchema)

module.exports = Resource