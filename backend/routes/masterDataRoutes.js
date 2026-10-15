
const express = require('express')

const MasterData = require('../models/MasterData')
const authMiddleware = require('../middleware/authMiddleware')
const roleMiddleware = require('../middleware/roleMiddleware')

const router = express.Router()

const PROVIDERS = ['aws', 'azure', 'gcp']

const getProvider = (value) => {
  return value === undefined || value === ''
    ? 'aws'
    : value
}

const isValidProvider = (provider) => {
  return PROVIDERS.includes(provider)
}

const isValidInstanceSpecs = (cpu, ram) => {
  return (
    cpu !== null &&
    ram !== null &&
    cpu !== undefined &&
    ram !== undefined &&
    cpu !== '' &&
    ram !== '' &&
    Number.isFinite(Number(cpu)) &&
    Number.isFinite(Number(ram)) &&
    Number(cpu) > 0 &&
    Number(ram) > 0
  )
}

// =====================================================
// 1. CREATE MASTER DATA - ADMIN
// =====================================================

router.post(
  '/',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const {
        category,
        name,
        value,
        cpu,
        ram,
        isActive
      } = req.body

      const cloudProvider = getProvider(req.body.cloudProvider)

      if (!isValidProvider(cloudProvider)) {
        return res.status(400).json({
          message: 'Invalid cloud provider'
        })
      }

      if (
        typeof category !== 'string' ||
        !category.trim() ||
        typeof name !== 'string' ||
        !name.trim() ||
        typeof value !== 'string' ||
        !value.trim()
      ) {
        return res.status(400).json({
          message: 'Category, name and value are required'
        })
      }

      if (
        category === 'instanceType' &&
        !isValidInstanceSpecs(cpu, ram)
      ) {
        return res.status(400).json({
          message: 'Valid CPU and RAM are required for instance types'
        })
      }

      const masterData = new MasterData({
        cloudProvider,
        category: category.trim(),
        name: name.trim(),
        value: value.trim(),
        cpu: cpu === undefined || cpu === '' || cpu === null
          ? null
          : Number(cpu),
        ram: ram === undefined || ram === '' || ram === null
          ? null
          : Number(ram),
        isActive: isActive !== undefined ? isActive : true
      })

      await masterData.save()

      return res.status(201).json({
        message: 'Master data created successfully',
        masterData
      })

    } catch (error) {
      console.error('Create master data error:', error)

      if (error.code === 11000) {
        return res.status(400).json({
          message: 'This value already exists for this provider and category'
        })
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          message: error.message
        })
      }

      return res.status(500).json({
        message: 'Server error'
      })
    }
  }
)

// =====================================================
// 2. GET ALL MASTER DATA
// Optional cloudProvider query
// =====================================================

router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      const cloudProvider = getProvider(req.query.cloudProvider)

      if (!isValidProvider(cloudProvider)) {
        return res.status(400).json({
          message: 'Invalid cloud provider'
        })
      }

      // No query: preserve existing Admin behavior,
      // returning all providers.
      const filter = req.query.cloudProvider === undefined
        ? {}
        : { cloudProvider }

      const masterData = await MasterData.find(filter)
        .sort({
          cloudProvider: 1,
          category: 1,
          name: 1
        })

      return res.json({
        message: 'Master data fetched successfully',
        masterData
      })

    } catch (error) {
      console.error('Fetch master data error:', error)

      return res.status(500).json({
        message: 'Server error'
      })
    }
  }
)

// =====================================================
// 3. GET ACTIVE MASTER DATA BY CATEGORY AND PROVIDER
// =====================================================

router.get(
  '/category/:category',
  authMiddleware,
  async (req, res) => {
    try {
      const cloudProvider = getProvider(req.query.cloudProvider)

      // =============================================
      // TEMPORARY DEBUGGING - NEWLY ADDED
      // =============================================
      console.log('Requested provider:', cloudProvider)
      console.log('Requested category:', req.params.category)
      console.log('Full request URL:', req.originalUrl)

      if (!isValidProvider(cloudProvider)) {
        return res.status(400).json({
          message: 'Invalid cloud provider'
        })
      }

      const masterData = await MasterData.find({
        cloudProvider,
        category: req.params.category,
        isActive: true
      }).sort({
        name: 1
      })

      // TEMPORARY DEBUGGING
      console.log('Records found:', masterData.length)
      console.log('-----------------------------------')

      return res.json({
        message: 'Master data fetched successfully',
        cloudProvider,
        masterData
      })

    } catch (error) {
      console.error('Fetch category error:', error)

      return res.status(500).json({
        message: 'Server error'
      })
    }
  }
)

// =====================================================
// 4. UPDATE MASTER DATA - ADMIN
// =====================================================

router.put(
  '/:id',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const masterData = await MasterData.findById(req.params.id)

      if (!masterData) {
        return res.status(404).json({
          message: 'Master data not found'
        })
      }

      const {
        category,
        name,
        value,
        cpu,
        ram,
        isActive,
        cloudProvider
      } = req.body

      if (cloudProvider !== undefined) {
        if (!isValidProvider(cloudProvider)) {
          return res.status(400).json({
            message: 'Invalid cloud provider'
          })
        }

        masterData.cloudProvider = cloudProvider
      }

      if (category !== undefined) {
        masterData.category = category
      }

      if (name !== undefined) {
        masterData.name = name
      }

      if (value !== undefined) {
        masterData.value = value
      }

      if (cpu !== undefined) {
        masterData.cpu = cpu === '' || cpu === null
          ? null
          : Number(cpu)
      }

      if (ram !== undefined) {
        masterData.ram = ram === '' || ram === null
          ? null
          : Number(ram)
      }

      if (isActive !== undefined) {
        masterData.isActive = isActive
      }

      if (
        masterData.category === 'instanceType' &&
        !isValidInstanceSpecs(masterData.cpu, masterData.ram)
      ) {
        return res.status(400).json({
          message: 'Valid CPU and RAM are required for instance types'
        })
      }

      await masterData.save()

      return res.json({
        message: 'Master data updated successfully',
        masterData
      })

    } catch (error) {
      console.error('Update master data error:', error)

      if (error.code === 11000) {
        return res.status(400).json({
          message: 'This value already exists for this provider and category'
        })
      }

      if (error.name === 'CastError') {
        return res.status(400).json({
          message: 'Invalid master data ID'
        })
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          message: error.message
        })
      }

      return res.status(500).json({
        message: 'Server error'
      })
    }
  }
)

// =====================================================
// 5. DELETE MASTER DATA - ADMIN
// =====================================================

router.delete(
  '/:id',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {
      const masterData = await MasterData.findById(req.params.id)

      if (!masterData) {
        return res.status(404).json({
          message: 'Master data not found'
        })
      }

      await masterData.deleteOne()

      return res.json({
        message: 'Master data deleted successfully'
      })

    } catch (error) {
      console.error('Delete master data error:', error)

      if (error.name === 'CastError') {
        return res.status(400).json({
          message: 'Invalid master data ID'
        })
      }

      return res.status(500).json({
        message: 'Server error'
      })
    }
  }
)

module.exports = router
