const express = require('express')
const Resource = require('../models/Resource')
const authMiddleware = require('../middleware/authMiddleware')
const roleMiddleware = require('../middleware/roleMiddleware')

const router = express.Router()


// =========================
// CREATE RESOURCE
// cloud_engineer + admin
// =========================
router.post(
  '/',
  authMiddleware,
  roleMiddleware('cloud_engineer', 'admin'),
  async (req, res) => {
    try {
      const { name, provider, type, region, status } = req.body

      const resource = new Resource({
        name,
        provider,
        type,
        region,
        status,
        createdBy: req.user.id
      })

      await resource.save()

      res.status(201).json({
        message: 'Resource created successfully',
        resource: resource
      })

    } catch (error) {
      console.log(error)

      res.status(500).json({
        message: 'Server error'
      })
    }
  }
)


// =========================
// GET RESOURCES
// all logged-in users
// =========================
router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {

      const resources = await Resource.find({
        createdBy: req.user.id
      })

      res.json({
        message: 'Resources fetched successfully',
        resources: resources
      })

    } catch (error) {
      console.log(error)

      res.status(500).json({
        message: 'Server error'
      })
    }
  }
)


// =========================
// START / STOP RESOURCE
// cloud_engineer + admin
// =========================
router.put(
  '/:id/status',
  authMiddleware,
  roleMiddleware('cloud_engineer', 'admin'),
  async (req, res) => {
    try {

      const { status } = req.body

      if (!['Running', 'Stopped'].includes(status)) {
        return res.status(400).json({
          message: 'Invalid status'
        })
      }

      const resource = await Resource.findOne({
        _id: req.params.id,
        createdBy: req.user.id
      })

      if (!resource) {
        return res.status(404).json({
          message: 'Resource not found'
        })
      }

      resource.status = status

      await resource.save()

      res.json({
        message: `Resource ${status.toLowerCase()} successfully`,
        resource: resource
      })

    } catch (error) {
      console.log(error)

      res.status(500).json({
        message: 'Server error'
      })
    }
  }
)


// =========================
// DELETE RESOURCE
// admin only
// =========================
router.delete(
  '/:id',
  authMiddleware,
  roleMiddleware('admin'),
  async (req, res) => {
    try {

      const resource = await Resource.findOneAndDelete({
        _id: req.params.id,
        createdBy: req.user.id
      })

      if (!resource) {
        return res.status(404).json({
          message: 'Resource not found'
        })
      }

      res.json({
        message: 'Resource deleted successfully'
      })

    } catch (error) {
      console.log(error)

      res.status(500).json({
        message: 'Server error'
      })
    }
  }
)


module.exports = router