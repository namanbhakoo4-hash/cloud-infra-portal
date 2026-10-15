
const mongoose = require('mongoose')

// =====================================================
// INDIVIDUAL RESOURCE SCHEMA
// =====================================================

const resourceSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      required: true
    },

    instanceType: {
      type: String
    },

    cpu: {
      type: Number,
      min: 0
    },

    ram: {
      type: Number,
      min: 0
    },

    storage: {
      type: Number,
      min: 0
    },

    storageType: {
      type: String,
      default: ''
    },

    operatingSystem: {
      type: String,
      default: 'Linux'
    },

    billingModel: {
      type: String,
      default: 'On-Demand'
    },

    quantity: {
      type: Number,
      min: 1,
      default: 1
    }
  },
  { _id: false }
)

// =====================================================
// PRICING SCHEMA
// =====================================================

const pricingComponentSchema = new mongoose.Schema(
  {
    resourceIndex: Number,

    category: {
      type: String
    },

    description: {
      type: String
    },

    amount: {
      type: Number,
      min: 0
    },

    unit: {
      type: String
    },

    rate: {
      type: Number,
      min: 0
    },

    source: {
      type: String
    }
  },
  { _id: false }
)

const estimatedCostSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['Not Calculated', 'Available', 'Unavailable'],
      default: 'Not Calculated'
    },

    monthlyTotal: {
      type: Number,
      default: null,
      min: 0
    },

    currency: {
      type: String,
      default: 'USD'
    },

    monthlyHours: {
      type: Number,
      default: 730,
      min: 0
    },

    pricingSource: {
      type: String,
      default: ''
    },

    calculatedAt: {
      type: Date,
      default: null
    },

    breakdown: {
      type: [pricingComponentSchema],
      default: []
    },

    errorMessage: {
      type: String,
      default: ''
    }
  },
  { _id: false }
)

// =====================================================
// MAIN BOM SCHEMA
// =====================================================

const bomSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    ticketId: {
      type: String,
      unique: true
    },

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

    // Existing BOMs without this field are treated as AWS.
    cloudProvider: {
      type: String,
      enum: ['aws', 'azure', 'gcp'],
      default: 'aws',
      required: true
    },

    region: {
      type: String,
      required: true
    },

    resources: {
      type: [resourceSchema],
      default: []
    },

    estimatedCost: {
      type: estimatedCostSchema,
      default: () => ({})
    },

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

    engineerRemarks: {
      type: String,
      default: ''
    },

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
