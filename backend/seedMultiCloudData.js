
require('dotenv').config()

const mongoose = require('mongoose')
const MasterData = require('./models/MasterData')

const masterDataItems = [
  // =====================================================
  // MICROSOFT AZURE - REGIONS
  // =====================================================
  {
    cloudProvider: 'azure',
    category: 'region',
    name: 'Central India',
    value: 'centralindia'
  },
  {
    cloudProvider: 'azure',
    category: 'region',
    name: 'South India',
    value: 'southindia'
  },
  {
    cloudProvider: 'azure',
    category: 'region',
    name: 'East US',
    value: 'eastus'
  },
  {
    cloudProvider: 'azure',
    category: 'region',
    name: 'West Europe',
    value: 'westeurope'
  },

  // =====================================================
  // MICROSOFT AZURE - SERVICES
  // =====================================================
  {
    cloudProvider: 'azure',
    category: 'service',
    name: 'Azure Virtual Machines',
    value: 'VirtualMachine'
  },

  // =====================================================
  // MICROSOFT AZURE - INSTANCE TYPES
  // =====================================================
  {
    cloudProvider: 'azure',
    category: 'instanceType',
    name: 'Standard_B2s',
    value: 'Standard_B2s',
    cpu: 2,
    ram: 4
  },
  {
    cloudProvider: 'azure',
    category: 'instanceType',
    name: 'Standard_D2s_v5',
    value: 'Standard_D2s_v5',
    cpu: 2,
    ram: 8
  },
  {
    cloudProvider: 'azure',
    category: 'instanceType',
    name: 'Standard_D4s_v5',
    value: 'Standard_D4s_v5',
    cpu: 4,
    ram: 16
  },
  {
    cloudProvider: 'azure',
    category: 'instanceType',
    name: 'Standard_D8s_v5',
    value: 'Standard_D8s_v5',
    cpu: 8,
    ram: 32
  },

  // =====================================================
  // MICROSOFT AZURE - STORAGE TYPES
  // =====================================================
  {
    cloudProvider: 'azure',
    category: 'storageType',
    name: 'Standard HDD',
    value: 'Standard_LRS'
  },
  {
    cloudProvider: 'azure',
    category: 'storageType',
    name: 'Standard SSD',
    value: 'StandardSSD_LRS'
  },
  {
    cloudProvider: 'azure',
    category: 'storageType',
    name: 'Premium SSD',
    value: 'Premium_LRS'
  },

  // =====================================================
  // GOOGLE CLOUD - REGIONS
  // =====================================================
  {
    cloudProvider: 'gcp',
    category: 'region',
    name: 'Mumbai',
    value: 'asia-south1'
  },
  {
    cloudProvider: 'gcp',
    category: 'region',
    name: 'Delhi',
    value: 'asia-south2'
  },
  {
    cloudProvider: 'gcp',
    category: 'region',
    name: 'Iowa',
    value: 'us-central1'
  },
  {
    cloudProvider: 'gcp',
    category: 'region',
    name: 'Belgium',
    value: 'europe-west1'
  },

  // =====================================================
  // GOOGLE CLOUD - SERVICES
  // =====================================================
  {
    cloudProvider: 'gcp',
    category: 'service',
    name: 'Google Compute Engine',
    value: 'ComputeEngine'
  },

  // =====================================================
  // GOOGLE CLOUD - INSTANCE TYPES
  // =====================================================
  {
    cloudProvider: 'gcp',
    category: 'instanceType',
    name: 'e2-medium',
    value: 'e2-medium',
    cpu: 2,
    ram: 4
  },
  {
    cloudProvider: 'gcp',
    category: 'instanceType',
    name: 'e2-standard-2',
    value: 'e2-standard-2',
    cpu: 2,
    ram: 8
  },
  {
    cloudProvider: 'gcp',
    category: 'instanceType',
    name: 'e2-standard-4',
    value: 'e2-standard-4',
    cpu: 4,
    ram: 16
  },
  {
    cloudProvider: 'gcp',
    category: 'instanceType',
    name: 'e2-standard-8',
    value: 'e2-standard-8',
    cpu: 8,
    ram: 32
  },

  // =====================================================
  // GOOGLE CLOUD - STORAGE TYPES
  // =====================================================
  {
    cloudProvider: 'gcp',
    category: 'storageType',
    name: 'Standard Persistent Disk',
    value: 'pd-standard'
  },
  {
    cloudProvider: 'gcp',
    category: 'storageType',
    name: 'Balanced Persistent Disk',
    value: 'pd-balanced'
  },
  {
    cloudProvider: 'gcp',
    category: 'storageType',
    name: 'SSD Persistent Disk',
    value: 'pd-ssd'
  }
]

async function seedMultiCloudData() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing from the .env file')
    }

    await mongoose.connect(process.env.MONGO_URI)

    console.log('Connected to MongoDB successfully')

    let inserted = 0
    let existing = 0

    for (const item of masterDataItems) {
      const result = await MasterData.updateOne(
        {
          cloudProvider: item.cloudProvider,
          category: item.category,
          value: item.value
        },
        {
          $setOnInsert: {
            ...item,
            isActive: true
          }
        },
        {
          upsert: true,
          runValidators: true
        }
      )

      if (result.upsertedCount > 0) {
        inserted++
        console.log(
          `Added: ${item.cloudProvider} | ${item.category} | ${item.name}`
        )
      } else {
        existing++
        console.log(
          `Already exists: ${item.cloudProvider} | ${item.category} | ${item.name}`
        )
      }
    }

    console.log('\n====================================')
    console.log('Multi-cloud seed completed!')
    console.log('New records added:', inserted)
    console.log('Existing records skipped:', existing)
    console.log('====================================')

    const azureCount = await MasterData.countDocuments({
      cloudProvider: 'azure'
    })

    const gcpCount = await MasterData.countDocuments({
      cloudProvider: 'gcp'
    })

    console.log('Total Azure records:', azureCount)
    console.log('Total GCP records:', gcpCount)

  } catch (error) {
    console.error('Seeding failed:', error.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
    console.log('MongoDB connection closed')
  }
}

seedMultiCloudData()
