const express = require('express')

const MasterData = require('../models/MasterData')
const authMiddleware = require('../middleware/authMiddleware')
const roleMiddleware = require('../middleware/roleMiddleware')

const router = express.Router()


// ======================================================
// 1. CREATE MASTER DATA
// ADMIN ONLY
// POST /api/master-data
// ======================================================

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


      // Basic required fields
      if (!category || !name || !value) {
        return res.status(400).json({
          message:
            'Category, name and value are required'
        })
      }


      // Instance types must have CPU and RAM
      if (category === 'instanceType') {

        if (
          cpu === undefined ||
          cpu === '' ||
          ram === undefined ||
          ram === ''
        ) {
          return res.status(400).json({
            message:
              'CPU and RAM are required for instance types'
          })
        }

      }


      const masterData = new MasterData({
        category,
        name,
        value,

        cpu:
          cpu !== undefined && cpu !== ''
            ? Number(cpu)
            : null,

        ram:
          ram !== undefined && ram !== ''
            ? Number(ram)
            : null,

        isActive:
          isActive !== undefined
            ? isActive
            : true
      })


      await masterData.save()


      res.status(201).json({
        message:
          'Master data created successfully',

        masterData
      })


    } catch (error) {

      console.log(error)


      // Duplicate category + value
      if (error.code === 11000) {
        return res.status(400).json({
          message:
            'This value already exists in this category'
        })
      }


      if (error.name === 'ValidationError') {
        return res.status(400).json({
          message: error.message
        })
      }


      res.status(500).json({
        message: 'Server error'
      })

    }
  }
)


// ======================================================
// 2. GET ALL MASTER DATA
// ANY LOGGED-IN USER
// GET /api/master-data
// ======================================================

router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {

      const masterData =
        await MasterData.find()
          .sort({
            category: 1,
            name: 1
          })


      res.json({
        message:
          'Master data fetched successfully',

        masterData
      })


    } catch (error) {

      console.log(error)

      res.status(500).json({
        message: 'Server error'
      })

    }
  }
)


// ======================================================
// 3. GET ACTIVE MASTER DATA BY CATEGORY
// ANY LOGGED-IN USER
//
// Examples:
//
// /api/master-data/category/region
// /api/master-data/category/service
// /api/master-data/category/instanceType
//
// ======================================================

router.get(
  '/category/:category',
  authMiddleware,
  async (req, res) => {
    try {

      const masterData =
        await MasterData.find({
          category:
            req.params.category,

          isActive: true
        }).sort({
          name: 1
        })


      res.json({
        message:
          'Master data fetched successfully',

        masterData
      })


    } catch (error) {

      console.log(error)

      res.status(500).json({
        message: 'Server error'
      })

    }
  }
)


// ======================================================
// 4. UPDATE MASTER DATA
// ADMIN ONLY
// PUT /api/master-data/:id
// ======================================================

router.put(
  '/:id',
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


      const masterData =
        await MasterData.findById(
          req.params.id
        )


      if (!masterData) {
        return res.status(404).json({
          message:
            'Master data not found'
        })
      }


      // Update category
      if (category !== undefined) {
        masterData.category =
          category
      }


      // Update name
      if (name !== undefined) {
        masterData.name =
          name
      }


      // Update value
      if (value !== undefined) {
        masterData.value =
          value
      }


      // Update CPU
      if (cpu !== undefined) {
        masterData.cpu =
          cpu === ''
            ? null
            : Number(cpu)
      }


      // Update RAM
      if (ram !== undefined) {
        masterData.ram =
          ram === ''
            ? null
            : Number(ram)
      }


      // Enable / Disable
      if (isActive !== undefined) {
        masterData.isActive =
          isActive
      }


      // If it is an instance type,
      // CPU and RAM must exist
      if (
        masterData.category ===
        'instanceType'
      ) {

        if (
          masterData.cpu === null ||
          masterData.ram === null
        ) {
          return res.status(400).json({
            message:
              'CPU and RAM are required for instance types'
          })
        }

      }


      await masterData.save()


      res.json({
        message:
          'Master data updated successfully',

        masterData
      })


    } catch (error) {

      console.log(error)


      if (error.code === 11000) {
        return res.status(400).json({
          message:
            'This value already exists in this category'
        })
      }


      if (error.name === 'CastError') {
        return res.status(400).json({
          message:
            'Invalid master data ID'
        })
      }


      if (error.name === 'ValidationError') {
        return res.status(400).json({
          message:
            error.message
        })
      }


      res.status(500).json({
        message: 'Server error'
      })

    }
  }
)


// ======================================================
// 5. DELETE MASTER DATA
// ADMIN ONLY
// DELETE /api/master-data/:id
// ======================================================

router.delete(
  '/:id',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {

      const masterData =
        await MasterData.findById(
          req.params.id
        )


      if (!masterData) {
        return res.status(404).json({
          message:
            'Master data not found'
        })
      }


      await masterData.deleteOne()


      res.json({
        message:
          'Master data deleted successfully'
      })


    } catch (error) {

      console.log(error)


      if (error.name === 'CastError') {
        return res.status(400).json({
          message:
            'Invalid master data ID'
        })
      }


      res.status(500).json({
        message: 'Server error'
      })

    }
  }
)


module.exports = router