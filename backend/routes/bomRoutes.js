const express = require('express')
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const router = express.Router()

const BOM = require('../models/BOM')
const authMiddleware = require('../middleware/authMiddleware')
const roleMiddleware = require('../middleware/roleMiddleware')

const {
  allocateSubnets
} = require('../utils/subnetAllocator')

const {
  createTerraformFiles
} = require('../services/terraformService')

const {
  buildBomCsv
} = require('../services/bomCsvExportService')

// =====================================================
// REGION CONFIGURATION FOR SIMULATED WORKFLOW
//
// These are illustrative AZ names, not live discovery.
// Real account AZ discovery requires AWS credentials.
// =====================================================

function getConfiguredAvailabilityZones(region) {
  if (
    typeof region !== 'string' ||
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(region)
  ) {
    throw new Error('Please select a valid AWS region.')
  }

  return [
    `${region}a`,
    `${region}b`,
    `${region}c`
  ]
}

// =====================================================
// RESOURCE NORMALIZATION AND SUBNET GENERATION
// =====================================================

function normalizeResources(resources, region) {
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error('Add at least one resource to the BOM.')
  }

  const resourceKeys = new Set()
  const availabilityZones =
    getConfiguredAvailabilityZones(region)

  return resources.map((resource, index) => {
    if (!resource || typeof resource !== 'object') {
      throw new Error(`Resource ${index + 1} is invalid.`)
    }

    const service = String(resource.service || '')
      .trim()
      .toUpperCase()

    if (!['VPC', 'EC2'].includes(service)) {
      throw new Error(
        `Resource ${index + 1} has an unsupported service.`
      )
    }

    const resourceKey = String(
      resource.resourceKey || `resource_${index + 1}`
    ).trim()

    if (
      !/^[a-zA-Z0-9_-]+$/.test(resourceKey) ||
      resourceKeys.has(resourceKey)
    ) {
      throw new Error(
        `Resource ${index + 1} has an invalid or duplicate resource key.`
      )
    }

    resourceKeys.add(resourceKey)

    if (service === 'EC2') {
      const config = resource.ec2Configuration

      if (!config || typeof config !== 'object') {
        throw new Error(
          `EC2 configuration is required for resource ${index + 1}.`
        )
      }

      const quantity = Number(config.quantity ?? 1)

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        throw new Error(
          `EC2 quantity for resource ${index + 1} must be from 1 to 100.`
        )
      }

      // AMI is intentionally optional. The Terraform service
      // will resolve it from the selected OS and region later.
      return {
        ...resource,
        resourceKey,
        service,
        ec2Configuration: {
          ...config,
          quantity,
          amiId: String(config.amiId || '').trim()
        }
      }
    }

    const config = resource.vpcConfiguration

    if (!config || typeof config !== 'object') {
      throw new Error(
        `VPC configuration is required for resource ${index + 1}.`
      )
    }

    if ((config.mode || 'new') === 'existing') {
      const existingVpcId = String(config.existingVpcId || '').trim()
      const awsVpcIdPattern = /^vpc-[a-fA-F0-9]{8}([a-fA-F0-9]{9})?$/
      const awsSubnetIdPattern = /^subnet-[a-fA-F0-9]{8}([a-fA-F0-9]{9})?$/
      const awsRouteTableIdPattern = /^rtb-[a-fA-F0-9]{8}([a-fA-F0-9]{9})?$/

      if (!awsVpcIdPattern.test(existingVpcId)) {
        throw new Error(`Existing VPC ID for resource ${index + 1} is invalid.`)
      }

      if (!Array.isArray(config.existingSubnets) || config.existingSubnets.length === 0) {
        throw new Error(`Add at least one existing subnet to resource ${index + 1}.`)
      }

      const existingSubnets = config.existingSubnets.map((subnet, subnetIndex) => {
        const subnetId = String(subnet.subnetId || '').trim()
        const subnetKey = String(subnet.resourceKey || `${resourceKey}_existing_subnet_${subnetIndex + 1}`).trim()
        const subnetType = String(subnet.subnetType || 'private').toLowerCase()

        if (!awsSubnetIdPattern.test(subnetId)) {
          throw new Error(`Existing subnet ${subnetIndex + 1} for resource ${index + 1} has an invalid subnet ID.`)
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(subnetKey)) {
          throw new Error(`Existing subnet ${subnetIndex + 1} has an invalid resource key.`)
        }

        if (!['public', 'private'].includes(subnetType)) {
          throw new Error(`Existing subnet ${subnetIndex + 1} has an invalid subnet type.`)
        }

        return { resourceKey: subnetKey, subnetId, subnetType }
      })

      if (config.existingRouteTableId && !awsRouteTableIdPattern.test(String(config.existingRouteTableId).trim())) {
        throw new Error(`Existing route table ID for resource ${index + 1} is invalid.`)
      }

      const subnetKeys = new Set()
      for (const subnet of existingSubnets) {
        if (subnetKeys.has(subnet.resourceKey)) {
          throw new Error(`Duplicate existing subnet key: ${subnet.resourceKey}`)
        }
        subnetKeys.add(subnet.resourceKey)
      }

      return {
        ...resource,
        resourceKey,
        service,
        vpcConfiguration: {
          ...config,
          mode: 'existing',
          existingVpcId,
          existingSubnets,
          existingRouteTableId: String(config.existingRouteTableId || '').trim()
        }
      }
    }

    const ipv4Cidr = String(config.ipv4Cidr || '').trim()

    const publicQuantity = Number(config.publicQuantity ?? 0)
    const privateQuantity = Number(config.privateQuantity ?? 0)

    for (const [label, quantity] of [
      ['Public', publicQuantity],
      ['Private', privateQuantity]
    ]) {
      if (
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        quantity > 100
      ) {
        throw new Error(
          `${label} subnet quantity must be a whole number from 0 to 100.`
        )
      }
    }

    if (
      publicQuantity + privateQuantity > 0 &&
      !ipv4Cidr
    ) {
      throw new Error(
        'VPC CIDR is required when creating subnets.'
      )
    }

    const publicFirstCidr = String(
      config.publicFirstCidr || ''
    ).trim()

    const privateFirstCidr = String(
      config.privateFirstCidr || ''
    ).trim()

    if (publicQuantity > 0 && !publicFirstCidr) {
      throw new Error(
        'Enter the first public subnet CIDR when public subnet quantity is greater than zero.'
      )
    }

    if (privateQuantity > 0 && !privateFirstCidr) {
      throw new Error(
        'Enter the first private subnet CIDR when private subnet quantity is greater than zero.'
      )
    }

    const subnets = allocateSubnets({
      vpcCidr: ipv4Cidr,
      publicFirstCidr,
      publicQuantity,
      privateFirstCidr,
      privateQuantity,
      region,
      availabilityZones
    })

    const natGatewayMode = config.natGatewayMode || 'none'

    if (!['none', 'single', 'per-az'].includes(natGatewayMode)) {
      throw new Error(
        'Select a valid NAT Gateway option.'
      )
    }

    return {
      ...resource,
      resourceKey,
      service,
      vpcConfiguration: {
        ...config,
        mode: 'new',
        ipv4Cidr,
        publicFirstCidr,
        privateFirstCidr,
        publicQuantity,
        privateQuantity,
        creationExperience:
          subnets.length > 0 ? 'vpc-and-more' : 'vpc-only',
        subnets,
        createInternetGateway:
          config.createInternetGateway === true,
        natGatewayMode
      }
    }
  })
}

// =====================================================
// SHARED BOM INPUT VALIDATION
// =====================================================

function validateBomInput(body) {
  const {
    projectName,
    environment,
    region,
    resources,
    justification
  } = body

  if (
    typeof projectName !== 'string' ||
    !projectName.trim() ||
    typeof environment !== 'string' ||
    ![
      'Development',
      'Testing',
      'Staging',
      'Production'
    ].includes(environment) ||
    typeof region !== 'string' ||
    !region.trim() ||
    !Array.isArray(resources) ||
    resources.length === 0 ||
    typeof justification !== 'string' ||
    !justification.trim()
  ) {
    throw new Error(
      'Please provide a project name, valid environment, AWS region, at least one resource, and business justification.'
    )
  }

  return {
    projectName: projectName.trim(),
    environment,
    region: region.trim(),
    resources: normalizeResources(resources, region.trim()),
    justification: justification.trim()
  }
}

function sendInputError(res, error) {
  return res.status(400).json({
    message: error.message || 'Invalid BOM configuration'
  })
}

// =====================================================
// USER: CREATE BOM
// =====================================================

router.post(
  '/',
  authMiddleware,
  roleMiddleware('user'),
  async (req, res) => {
    try {
      let input

      try {
        input = validateBomInput(req.body)
      } catch (error) {
        return sendInputError(res, error)
      }

      const ticketId =
        'BOM-' + crypto.randomUUID().slice(0, 8).toUpperCase()

      const bom = await BOM.create({
        createdBy: req.user.id,
        ticketId,
        projectName: input.projectName,
        environment: input.environment,
        region: input.region,
        cloudProvider: 'aws',
        resources: input.resources,
        justification: input.justification,
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
// USER AND CLOUD ENGINEER: EXPORT BOM CSV
// =====================================================

router.get(
  '/:id/export.csv',
  authMiddleware,
  roleMiddleware('user', 'cloud_engineer'),
  async (req, res) => {
    try {
      const bom = await BOM.findById(req.params.id)
        .populate('reviewedBy', 'name')

      if (!bom) {
        return res.status(404).json({
          message: 'BOM not found'
        })
      }

      if (
        req.user.role === 'user' &&
        String(bom.createdBy) !== String(req.user.id)
      ) {
        return res.status(403).json({
          message: 'You do not have permission to export this BOM.'
        })
      }

      const csv = await buildBomCsv(bom)

      const safeTicketId = String(bom.ticketId || 'BOM')
        .replace(/[^a-zA-Z0-9_-]/g, '_')

      const filename = `${safeTicketId}.csv`

      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8'
      )

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      )

      res.setHeader(
        'Cache-Control',
        'no-store'
      )

      return res.send('\uFEFF' + csv)
    } catch (error) {
      console.error('BOM CSV export error:', error)

      if (error.name === 'CastError') {
        return res.status(400).json({
          message: 'Invalid BOM ID'
        })
      }

      return res.status(500).json({
        message: 'Failed to export BOM CSV'
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
        typeof engineerRemarks !== 'string' ||
        (
          ['Changes Requested', 'Rejected'].includes(status) &&
          !engineerRemarks.trim()
        )
      ) {
        return res.status(400).json({
          message: 'Engineer remarks are required'
        })
      }

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
              'terraformExecution.generation': 'Failed',
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
      let input

      try {
        input = validateBomInput(req.body)
      } catch (error) {
        return sendInputError(res, error)
      }

      const bom = await BOM.findOneAndUpdate(
        {
          _id: req.params.id,
          createdBy: req.user.id,
          status: 'Changes Requested'
        },
        {
          $set: {
            projectName: input.projectName,
            environment: input.environment,
            region: input.region,
            cloudProvider: 'aws',
            resources: input.resources,
            justification: input.justification,
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

      if (error.name === 'CastError') {
        return res.status(400).json({
          message: 'Invalid BOM ID'
        })
      }

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