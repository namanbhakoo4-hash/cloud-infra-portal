const express = require('express')

const {
  getCloudPrice
} = require('../services/pricingService')

const {
  getAwsStoragePrice,
  getAzureStoragePrice,
  getGcpStoragePrice
} = require('../services/storagePricingService')

const router = express.Router()

// ======================================================
// POST /api/pricing/estimate
//
// Calculate cloud compute and optional storage costs.
//
// Supported storage pricing:
//
// AWS   -> EBS gp3
// Azure -> Standard SSD LRS Managed Disks
// GCP   -> Balanced Persistent Disk (pd-balanced)
//
// Missing or unverified prices must never be treated
// as zero.
// ======================================================

router.post('/estimate', async (req, res) => {
  try {
    const {
      cloudProvider,
      region,
      instanceType,
      operatingSystem = 'Linux',
      quantity = 1,
      storage,
      storageType
    } = req.body

    // ==================================================
    // VALIDATE CLOUD PROVIDER
    // ==================================================

    if (!['aws', 'azure', 'gcp'].includes(cloudProvider)) {
      return res.status(400).json({
        message: 'Invalid cloud provider'
      })
    }

    // ==================================================
    // VALIDATE REGION AND INSTANCE TYPE
    // ==================================================

    if (
      typeof region !== 'string' ||
      !region.trim() ||
      typeof instanceType !== 'string' ||
      !instanceType.trim()
    ) {
      return res.status(400).json({
        message: 'Region and instance type are required'
      })
    }

    const normalizedRegion = region.trim()
    const normalizedInstanceType = instanceType.trim()

    // ==================================================
    // VALIDATE OPERATING SYSTEM
    // ==================================================

    if (
      typeof operatingSystem !== 'string' ||
      !['Linux', 'Windows'].includes(operatingSystem)
    ) {
      return res.status(400).json({
        message: 'Operating system must be Linux or Windows'
      })
    }

    // ==================================================
    // VALIDATE QUANTITY
    // ==================================================

    const parsedQuantity = Number(quantity)

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 100
    ) {
      return res.status(400).json({
        message: 'Quantity must be between 1 and 100'
      })
    }

    // ==================================================
    // VALIDATE OPTIONAL STORAGE
    // ==================================================

    const storageRequested =
      storage !== undefined &&
      storage !== null &&
      storage !== ''

    const parsedStorage = storageRequested
      ? Number(storage)
      : null

    if (
      storageRequested &&
      (
        !Number.isFinite(parsedStorage) ||
        parsedStorage <= 0
      )
    ) {
      return res.status(400).json({
        message: 'Storage must be a positive number of GB'
      })
    }

    // ==================================================
    // SET DEFAULT STORAGE TYPE BY CLOUD PROVIDER
    //
    // AWS   -> gp3
    // Azure -> standard-ssd-lrs
    // GCP   -> pd-balanced
    // ==================================================

    const defaultStorageTypes = {
      aws: 'gp3',
      azure: 'standard-ssd-lrs',
      gcp: 'pd-balanced'
    }

    const normalizedStorageType =
      storageType === undefined ||
      storageType === null ||
      storageType === ''
        ? defaultStorageTypes[cloudProvider]
        : String(storageType).trim().toLowerCase()

    // ==================================================
    // GET CLOUD COMPUTE PRICING
    // ==================================================

    const pricing = await getCloudPrice({
      cloudProvider,
      region: normalizedRegion,
      instanceType: normalizedInstanceType,
      operatingSystem
    })

    // ==================================================
    // HANDLE UNAVAILABLE COMPUTE PRICING
    // ==================================================

    if (pricing.status !== 'Available') {
      return res.json({
        ...pricing,
        quantity: parsedQuantity
      })
    }

    // ==================================================
    // VALIDATE RETURNED COMPUTE PRICE
    // ==================================================

    const hourlyPrice = Number(pricing.hourlyPrice)
    const monthlyHours = Number(pricing.monthlyHours)

    if (
      !Number.isFinite(hourlyPrice) ||
      hourlyPrice < 0 ||
      !Number.isFinite(monthlyHours) ||
      monthlyHours <= 0
    ) {
      throw new Error(
        'Invalid compute pricing data received'
      )
    }

    // ==================================================
    // CALCULATE MONTHLY COMPUTE COST
    //
    // Hourly price × Monthly hours × VM quantity
    // ==================================================

    const totalMonthlyComputeCost = Number(
      (
        hourlyPrice *
        monthlyHours *
        parsedQuantity
      ).toFixed(2)
    )

    // ==================================================
    // CALCULATE STORAGE COST
    // ==================================================

    let storagePricing = null
    let totalMonthlyStorageCost = null
    let totalEstimatedMonthlyCost = null

    if (storageRequested) {

      // ================================================
      // AWS EBS gp3 STORAGE
      // ================================================

      if (cloudProvider === 'aws') {
        storagePricing = await getAwsStoragePrice({
          region: normalizedRegion,
          storageType: normalizedStorageType,
          storageGB: parsedStorage,
          quantity: parsedQuantity
        })
      }

      // ================================================
      // AZURE MANAGED DISK STORAGE
      // ================================================

      else if (cloudProvider === 'azure') {
        storagePricing = await getAzureStoragePrice({
          region: normalizedRegion,
          storageType: normalizedStorageType,
          storageGB: parsedStorage,
          quantity: parsedQuantity
        })
      }

      // ================================================
      // GCP BALANCED PERSISTENT DISK STORAGE
      //
      // Uses the officially sourced calculator-derived
      // price stored in gcp-storage-prices.json.
      //
      // Only verified region/storage combinations
      // return Available.
      // ================================================

      else if (cloudProvider === 'gcp') {
        storagePricing = await getGcpStoragePrice({
          region: normalizedRegion,
          storageType: normalizedStorageType,
          storageGB: parsedStorage,
          quantity: parsedQuantity
        })
      }

      // ================================================
      // COMBINE COMPUTE + STORAGE COSTS
      // ================================================

      if (storagePricing?.status === 'Available') {
        const calculatedStorageCost = Number(
          storagePricing.totalMonthlyStorageCost
        )

        if (
          !Number.isFinite(calculatedStorageCost) ||
          calculatedStorageCost < 0
        ) {
          throw new Error(
            'Invalid storage pricing data received'
          )
        }

        totalMonthlyStorageCost =
          calculatedStorageCost

        totalEstimatedMonthlyCost = Number(
          (
            totalMonthlyComputeCost +
            totalMonthlyStorageCost
          ).toFixed(2)
        )
      }
    }

    // ==================================================
    // IDENTIFY ESTIMATE TYPE
    // ==================================================

    let estimateType = 'Compute only'

    if (
      storageRequested &&
      storagePricing?.status === 'Available'
    ) {
      if (cloudProvider === 'aws') {
        estimateType =
          'Compute + EBS storage capacity'
      } else if (cloudProvider === 'azure') {
        estimateType =
          'Compute + Azure Managed Disk'
      } else if (cloudProvider === 'gcp') {
        estimateType =
          'Compute + GCP Balanced Persistent Disk'
      }
    }

    // ==================================================
    // CREATE ACCURATE DISCLAIMER
    // ==================================================

    let disclaimer =
      'Published retail compute estimate. Storage, networking, taxes, discounts and other charges are not included.'

    if (storageRequested) {
      if (storagePricing?.status !== 'Available') {
        disclaimer =
          'Compute estimate is available, but storage pricing is unavailable. The full monthly cost cannot be calculated.'
      } else if (cloudProvider === 'aws') {
        disclaimer =
          'Compute and EBS gp3 storage capacity estimate only. Additional provisioned IOPS, throughput, snapshots, networking, taxes, discounts and other charges are excluded.'
      } else if (cloudProvider === 'azure') {
        disclaimer =
          'Compute and Azure Standard SSD managed disk estimate only. Disk operations, applicable disk mount charges, snapshots, networking, taxes, discounts and other charges are excluded.'
      } else if (cloudProvider === 'gcp') {
        disclaimer =
          'Compute and GCP Balanced Persistent Disk capacity estimate only. The GCP storage rate was derived from official Google Cloud Pricing Calculator totals. Snapshots, networking, taxes, discounts and other charges are excluded.'
      }
    }

    // ==================================================
    // RETURN COMPLETE PRICING RESPONSE
    // ==================================================

    return res.json({
      ...pricing,

      quantity: parsedQuantity,

      totalMonthlyComputeCost,

      storageRequested,

      storageGBPerVM: storageRequested
        ? parsedStorage
        : null,

      storagePricing,

      totalMonthlyStorageCost,

      totalEstimatedMonthlyCost,

      estimateType,

      disclaimer
    })

  } catch (error) {
    console.error(
      'Pricing estimation error:',
      error
    )

    return res.status(500).json({
      status: 'Unavailable',

      message:
        'Unable to retrieve verified cloud pricing',

      details:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    })
  }
})

module.exports = router