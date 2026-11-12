const express = require('express')

const MasterData = require('../models/MasterData')
const {
  EC2Client,
  DescribeRegionsCommand,
  DescribeAvailabilityZonesCommand
} = require('@aws-sdk/client-ec2')
const authMiddleware = require('../middleware/authMiddleware')
const roleMiddleware = require('../middleware/roleMiddleware')

const router = express.Router()

const PROVIDERS = ['aws', 'azure', 'gcp']

const AWS_DEVELOPMENT_REGIONS = [
  'af-south-1',
  'ap-east-1',
  'ap-east-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ap-southeast-5',
  'ap-southeast-7',
  'ca-central-1',
  'ca-west-1',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'mx-central-1',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2'
]

const buildDevelopmentAvailabilityZones = (region) => [
  { zoneName: `${region}a`, state: 'sample' },
  { zoneName: `${region}b`, state: 'sample' },
  { zoneName: `${region}c`, state: 'sample' }
]

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

// 1. CREATE MASTER DATA - ADMIN

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

// 2. GET ALL MASTER DATA

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

// 3. GET AWS REGIONS

router.get(
  '/regions',
  authMiddleware,
  async (req, res) => {
    try {
      const client = new EC2Client({
        region: process.env.AWS_REGION || 'us-east-1'
      })

      const response = await client.send(
        new DescribeRegionsCommand({ AllRegions: true })
      )

      const regions = (response.Regions || [])
        .filter((item) =>
          ['opt-in-not-required', 'opted-in'].includes(item.OptInStatus)
        )
        .map((item) => ({
          name: item.RegionName,
          value: item.RegionName,
          optInStatus: item.OptInStatus
        }))
        .filter((item) => item.value)
        .sort((a, b) => a.value.localeCompare(b.value))

      return res.json({
        message: 'AWS Regions fetched successfully',
        cloudProvider: 'aws',
        source: 'aws-api',
        isLive: true,
        regions
      })

    } catch (error) {
      console.warn(
        'AWS Region discovery unavailable; using development catalogue:',
        error.name || error.message
      )

      const regions = AWS_DEVELOPMENT_REGIONS.map((region) => ({
        name: region,
        value: region,
        optInStatus: 'catalogue-only'
      }))

      return res.json({
        message: 'AWS credentials are unavailable. Showing a maintained development Region catalogue.',
        cloudProvider: 'aws',
        source: 'development-catalogue',
        isLive: false,
        warning: 'Region names are catalogue data and have not been verified against your AWS account.',
        regions
      })
    }
  }
)

// 4. GET AWS AVAILABILITY ZONES

router.get(
  '/availability-zones',
  authMiddleware,
  async (req, res) => {
    const region = String(req.query.region || '').trim()

    try {
      if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(region)) {
        return res.status(400).json({
          message: 'A valid AWS region is required'
        })
      }

      const client = new EC2Client({ region })

      const response = await client.send(
        new DescribeAvailabilityZonesCommand({
          AllAvailabilityZones: true
        })
      )

      const availabilityZones = (response.AvailabilityZones || [])
        .filter((zone) =>
          zone.ZoneName &&
          ['available', 'impaired', 'unavailable'].includes(
            String(zone.State || '').toLowerCase()
          )
        )
        .map((zone) => ({
          zoneName: zone.ZoneName,
          zoneId: zone.ZoneId || '',
          state: zone.State || 'unknown',
          zoneType: zone.ZoneType || 'availability-zone'
        }))
        .sort((a, b) => a.zoneName.localeCompare(b.zoneName))

      return res.json({
        message: 'AWS Availability Zones fetched successfully',
        cloudProvider: 'aws',
        region,
        source: 'aws-api',
        isLive: true,
        availabilityZones
      })

    } catch (error) {
      console.warn(
        `AWS Availability Zone discovery unavailable for ${region}; using development sample zones:`,
        error.name || error.message
      )

      return res.json({
        message: `AWS credentials are unavailable. Showing sample Availability Zones for ${region}.`,
        cloudProvider: 'aws',
        region,
        source: 'development-catalogue',
        isLive: false,
        warning: 'These AZ names are illustrative only. Verify actual Availability Zones in AWS before provisioning.',
        availabilityZones: buildDevelopmentAvailabilityZones(region)
      })
    }
  }
)

// 5. GET ACTIVE MASTER DATA BY CATEGORY AND PROVIDER

router.get(
  '/category/:category',
  authMiddleware,
  async (req, res) => {
    try {
      const cloudProvider = getProvider(req.query.cloudProvider)

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

// 6. UPDATE MASTER DATA - ADMIN

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

// 7. DELETE MASTER DATA - ADMIN

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