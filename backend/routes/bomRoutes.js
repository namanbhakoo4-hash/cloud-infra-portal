
const express = require('express')
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const router = express.Router()

const BOM = require('../models/BOM')
const authMiddleware = require('../middleware/authMiddleware')
const roleMiddleware = require('../middleware/roleMiddleware')

const {
  createTerraformFiles
} = require('../services/terraformService')

// =====================================================
// USER: CREATE BOM
// =====================================================

router.post(
  '/',
  authMiddleware,
  roleMiddleware('user'),
  async (req, res) => {
    try {
      const {
        projectName,
        environment,
        region,
        resources,
        justification
      } = req.body

      if (
        !projectName ||
        !environment ||
        !region ||
        !Array.isArray(resources) ||
        resources.length === 0 ||
        !justification
      ) {
        return res.status(400).json({
          message: 'Please provide all required BOM details'
        })
      }

      const ticketId =
        'BOM-' + crypto.randomUUID().slice(0, 8).toUpperCase()

      const bom = await BOM.create({
        createdBy: req.user.id,
        ticketId,
        projectName,
        environment,
        region,
        resources,
        justification,
        status: 'Pending Review'
      })

      return res.status(201).json({
        message: 'BOM submitted successfully',
        bom
      })
    } catch (error) {
      console.error('Create BOM error:', error)

      return res.status(500).json({
        message: 'Failed to create BOM'
      })
    }
  }
)

// =====================================================
// USER: VIEW OWN BOMS
// =====================================================

router.get(
  '/my',
  authMiddleware,
  roleMiddleware('user'),
  async (req, res) => {
    try {
      const boms = await BOM.find({
        createdBy: req.user.id
      }).sort({ createdAt: -1 })

      return res.json(boms)
    } catch (error) {
      console.error('Fetch user BOMs error:', error)

      return res.status(500).json({
        message: 'Failed to fetch BOMs'
      })
    }
  }
)

// =====================================================
// CLOUD ENGINEER: VIEW ALL BOMS
// =====================================================

router.get(
  '/all',
  authMiddleware,
  roleMiddleware('cloud_engineer'),
  async (req, res) => {
    try {
      const boms = await BOM.find()
        .populate('createdBy', 'name email')
        .populate('reviewedBy', 'name email')
        .sort({ createdAt: -1 })

      return res.json(boms)
    } catch (error) {
      console.error('Fetch all BOMs error:', error)

      return res.status(500).json({
        message: 'Failed to fetch BOMs'
      })
    }
  }
)

// =====================================================
// CLOUD ENGINEER: REVIEW BOM
// =====================================================

router.put(
  '/:id/review',
  authMiddleware,
  roleMiddleware('cloud_engineer'),
  async (req, res) => {
    try {
      const { status, engineerRemarks = '' } = req.body

      const allowedStatuses = [
        'Approved',
        'Changes Requested',
        'Rejected'
      ]

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message: 'Invalid review status'
        })
      }

      if (
        ['Changes Requested', 'Rejected'].includes(status) &&
        !engineerRemarks.trim()
      ) {
        return res.status(400).json({
          message: 'Engineer remarks are required'
        })
      }

      // =================================================
      // APPROVAL: ATOMIC CLAIM
      // =================================================

      if (status === 'Approved') {
        const bom = await BOM.findOneAndUpdate(
          {
            _id: req.params.id,
            status: 'Pending Review'
          },
          {
            $set: {
              status: 'Processing',
              engineerRemarks: engineerRemarks.trim(),
              reviewedBy: req.user.id
            }
          },
          {
            returnDocument: 'after',
            runValidators: true
          }
        )

        if (!bom) {
          return res.status(409).json({
            message:
              'This BOM is already being processed or has been reviewed.'
          })
        }

        console.log(
          'Cloud Engineer approved BOM:',
          bom.ticketId
        )

        try {
          const terraformResult = createTerraformFiles(bom)

          bom.status = 'Approved'

          bom.terraformExecution = {
            generation: 'Success',
            init: 'Success',
            validate: 'Success',
            plan: 'Success',
            planType: 'SIMULATED',
            terraformFolder: terraformResult.terraformFolder,
            executedAt: new Date()
          }

          await bom.save()

          console.log(
            'Terraform execution results saved in MongoDB:',
            bom.ticketId
          )

          return res.json({
            message:
              'BOM approved. Terraform generation, init, validate and simulated plan completed successfully.',
            bom,
            terraformFolder: terraformResult.terraformFolder,
            terraform: {
              generation: 'Success',
              init: 'Success',
              validate: 'Success',
              plan: 'Success',
              planType: 'SIMULATED',
              mockPlan: terraformResult.mockPlan
            }
          })
        } catch (error) {
          console.error('Terraform automation failed:', error)

          await BOM.findByIdAndUpdate(bom._id, {
            $set: {
              status: 'Plan Failed',
              'terraformExecution.plan': 'Failed',
              'terraformExecution.planType': 'SIMULATED',
              'terraformExecution.executedAt': new Date()
            }
          })

          return res.status(500).json({
            message:
              'Terraform automation failed. The BOM has been marked as Plan Failed.',
            error: error.message
          })
        }
      }

      // =================================================
      // CHANGES REQUESTED OR REJECTED
      // =================================================

      const bom = await BOM.findOneAndUpdate(
        {
          _id: req.params.id,
          status: 'Pending Review'
        },
        {
          $set: {
            status,
            engineerRemarks: engineerRemarks.trim(),
            reviewedBy: req.user.id
          }
        },
        {
          returnDocument: 'after',
          runValidators: true
        }
      )

      if (!bom) {
        return res.status(409).json({
          message:
            'This BOM is already being processed or has been reviewed.'
        })
      }

      return res.json({
        message: `BOM ${status.toLowerCase()} successfully`,
        bom
      })
    } catch (error) {
      console.error('Review BOM error:', error)

      if (error.name === 'CastError') {
        return res.status(400).json({
          message: 'Invalid BOM ID'
        })
      }

      return res.status(500).json({
        message: 'Failed to review BOM'
      })
    }
  }
)

// =====================================================
// USER: EDIT AND RESUBMIT BOM
// =====================================================

router.put(
  '/:id/resubmit',
  authMiddleware,
  roleMiddleware('user'),
  async (req, res) => {
    try {
      const {
        projectName,
        environment,
        region,
        resources,
        justification
      } = req.body

      if (
        !projectName ||
        !environment ||
        !region ||
        !Array.isArray(resources) ||
        resources.length === 0 ||
        !justification
      ) {
        return res.status(400).json({
          message: 'Please provide all required BOM details'
        })
      }

      const bom = await BOM.findOneAndUpdate(
        {
          _id: req.params.id,
          createdBy: req.user.id,
          status: 'Changes Requested'
        },
        {
          $set: {
            projectName,
            environment,
            region,
            resources,
            justification,
            status: 'Pending Review',
            engineerRemarks: '',
            reviewedBy: null,
            terraformExecution: {
              generation: 'Not Started',
              init: 'Not Started',
              validate: 'Not Started',
              plan: 'Not Started',
              planType: 'SIMULATED',
              terraformFolder: '',
              executedAt: null
            }
          }
        },
        {
          returnDocument: 'after',
          runValidators: true
        }
      )

      if (!bom) {
        return res.status(404).json({
          message:
            'BOM not found or not eligible for resubmission'
        })
      }

      return res.json({
        message: 'BOM resubmitted successfully',
        bom
      })
    } catch (error) {
      console.error('Resubmit BOM error:', error)

      return res.status(500).json({
        message: 'Failed to resubmit BOM'
      })
    }
  }
)

// =====================================================
// CLOUD ENGINEER: VIEW SIMULATED TERRAFORM PLAN
// =====================================================

router.get(
  '/:id/terraform-plan',
  authMiddleware,
  roleMiddleware('cloud_engineer'),
  async (req, res) => {
    try {
      const bom = await BOM.findById(req.params.id)

      if (!bom) {
        return res.status(404).json({
          message: 'BOM not found'
        })
      }

      if (
        bom.status !== 'Approved' ||
        bom.terraformExecution?.plan !== 'Success'
      ) {
        return res.status(400).json({
          message: 'Simulated Terraform plan is not available'
        })
      }

      if (!/^BOM-[A-Za-z0-9-]+$/.test(bom.ticketId)) {
        return res.status(400).json({
          message: 'Invalid BOM ticket ID'
        })
      }

      const planPath = path.join(
        __dirname,
        '..',
        '..',
        'terraform',
        'generated',
        bom.ticketId,
        'mock-plan.json'
      )

      const planContent = await fs.readFile(
        planPath,
        'utf8'
      )

      const plan = JSON.parse(planContent)

      if (
        plan.ticketId !== bom.ticketId ||
        plan.planType !== 'SIMULATED'
      ) {
        return res.status(500).json({
          message: 'Simulated plan data does not match this BOM'
        })
      }

      return res.json({
        message: 'Simulated Terraform plan retrieved successfully',
        plan
      })
    } catch (error) {
      console.error('Get Terraform plan error:', error)

      if (error.name === 'CastError') {
        return res.status(400).json({
          message: 'Invalid BOM ID'
        })
      }

      if (error.code === 'ENOENT') {
        return res.status(404).json({
          message: 'Simulated Terraform plan file not found'
        })
      }

      return res.status(500).json({
        message: 'Failed to retrieve simulated Terraform plan'
      })
    }
  }
)

module.exports = router
