
const mongoose = require('mongoose')

const bomSchema = new mongoose.Schema(
  {
    // User who created the BOM
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Unique BOM ticket number
    ticketId: {
      type: String,
      unique: true
    },

    // Project information
    projectName: {
      type: String,
      required: true
    },

    environment: {
      type: String,
      enum: [
        'Development',
        'Testing',
        'Staging',
        'Production'
      ],
      required: true
    },

    region: {
      type: String,
      required: true
    },

    // AWS resources requested by the user
    resources: [
      {
        service: {
          type: String,
          required: true
        },

        instanceType: {
          type: String
        },

        cpu: {
          type: Number
        },

        ram: {
          type: Number
        },

        storage: {
          type: Number
        },

        quantity: {
          type: Number,
          default: 1
        }
      }
    ],

    // Reason for requesting infrastructure
    justification: {
      type: String,
      required: true
    },

    // =====================================================
    // BOM STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        'Pending Review',
        'Processing',
        'Approved',
        'Changes Requested',
        'Rejected',
        'Terraform Generated',
        'Plan Completed',
        'Plan Failed'
      ],
      default: 'Pending Review'
    },

    // Cloud Engineer remarks
    engineerRemarks: {
      type: String,
      default: ''
    },

    // Cloud Engineer who reviewed the BOM
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // =====================================================
    // TERRAFORM EXECUTION RESULTS
    // =====================================================

    terraformExecution: {
      generation: {
        type: String,
        enum: ['Not Started', 'Success', 'Failed'],
        default: 'Not Started'
      },

      init: {
        type: String,
        enum: ['Not Started', 'Success', 'Failed'],
        default: 'Not Started'
      },

      validate: {
        type: String,
        enum: ['Not Started', 'Success', 'Failed'],
        default: 'Not Started'
      },

      plan: {
        type: String,
        enum: ['Not Started', 'Success', 'Failed'],
        default: 'Not Started'
      },

      planType: {
        type: String,
        enum: ['SIMULATED', 'REAL'],
        default: 'SIMULATED'
      },

      terraformFolder: {
        type: String,
        default: ''
      },

      executedAt: {
        type: Date,
        default: null
      }
    }
  },
  {
    timestamps: true
  }
)

const BOM = mongoose.model('BOM', bomSchema)

module.exports = BOM
