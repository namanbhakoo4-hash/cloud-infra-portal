const fs = require('fs')
const path = require('path')

// ======================================================
// STORAGE PRICING CATALOG FILES
// ======================================================

const AWS_STORAGE_CATALOG_FILE = path.join(
  __dirname,
  '..',
  'data',
  'aws-ebs-storage-prices.json'
)

const AZURE_STORAGE_CATALOG_FILE = path.join(
  __dirname,
  '..',
  'data',
  'azure-managed-disk-prices.json'
)

const GCP_STORAGE_CATALOG_FILE = path.join(
  __dirname,
  '..',
  'data',
  'gcp-storage-prices.json'
)

// ======================================================
// SHARED HELPERS
// ======================================================

const unavailable = (message) => ({
  status: 'Unavailable',
  message
})

const readCatalog = (filePath, provider) => {
  if (!fs.existsSync(filePath)) {
    return null
  }

  const catalog = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  )

  if (
    catalog.cloudProvider !== provider ||
    catalog.currency !== 'USD' ||
    !Array.isArray(catalog.prices) ||
    !catalog.sourceUrl
  ) {
    throw new Error(
      `Invalid ${provider.toUpperCase()} storage pricing catalog`
    )
  }

  return catalog
}

const validateStorageRequest = (storageGB, quantity) => {
  const size = Number(storageGB)
  const vmQuantity = Number(quantity)

  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isInteger(vmQuantity) ||
    vmQuantity < 1 ||
    vmQuantity > 100
  ) {
    return null
  }

  return {
    size,
    vmQuantity
  }
}

// ======================================================
// AWS EBS STORAGE PRICING
//
// Uses verified official AWS regional pricing.
//
// gp3 capacity is billed per GB-month.
//
// Missing rates must never be treated as $0.
// ======================================================

const getAwsStoragePrice = async ({
  region,
  storageType = 'gp3',
  storageGB,
  quantity = 1
}) => {
  const normalizedRegion = String(region || '').trim()

  const normalizedStorageType = String(storageType || '')
    .trim()
    .toLowerCase()

  const request = validateStorageRequest(storageGB, quantity)

  if (!/^[a-z]{2}-[a-z]+-\d+$/.test(normalizedRegion)) {
    return unavailable('Invalid AWS region code')
  }

  if (normalizedStorageType !== 'gp3') {
    return unavailable(
      'Only verified AWS gp3 storage is supported currently'
    )
  }

  if (!request) {
    return unavailable('Invalid storage size or VM quantity')
  }

  const catalog = readCatalog(
    AWS_STORAGE_CATALOG_FILE,
    'aws'
  )

  if (!catalog) {
    return unavailable(
      'AWS EBS storage pricing catalog is missing. Verify the official regional rate before adding it.'
    )
  }

  const matches = catalog.prices.filter(
    (item) =>
      item.region === normalizedRegion &&
      item.storageType === normalizedStorageType
  )

  if (matches.length !== 1) {
    return unavailable(
      matches.length === 0
        ? 'No verified AWS EBS storage rate is available for this region and storage type'
        : 'Multiple AWS EBS storage rates were found'
    )
  }

  const priceRecord = matches[0]

  if (
    typeof priceRecord.pricePerGBMonth !== 'number' ||
    !Number.isFinite(priceRecord.pricePerGBMonth) ||
    priceRecord.pricePerGBMonth < 0 ||
    !priceRecord.verifiedDate
  ) {
    return unavailable(
      'AWS EBS storage rate is not properly verified'
    )
  }

  const totalStorageGB =
    request.size * request.vmQuantity

  const monthlyStorageCost = Number(
    (
      totalStorageGB *
      priceRecord.pricePerGBMonth
    ).toFixed(2)
  )

  return {
    status: 'Available',
    cloudProvider: 'aws',
    region: normalizedRegion,
    storageType: normalizedStorageType,
    storageGBPerVM: request.size,
    quantity: request.vmQuantity,
    totalStorageGB,
    currency: 'USD',
    pricePerGBMonth: priceRecord.pricePerGBMonth,
    totalMonthlyStorageCost: monthlyStorageCost,
    pricingSource: 'AWS EBS published pricing',
    sourceUrl: catalog.sourceUrl,
    verifiedDate: priceRecord.verifiedDate,
    pricingDataType:
      'Locally verified official AWS storage pricing',
    disclaimer:
      'EBS gp3 capacity estimate only. Additional provisioned IOPS, throughput, snapshots and other charges are excluded.'
  }
}

// ======================================================
// AZURE MANAGED DISK STORAGE PRICING
//
// Uses verified official Azure Retail Prices API rates.
//
// IMPORTANT:
// Azure Standard SSD managed disks are priced by
// provisioned disk tier, not by requested GB.
//
// Currently verified:
// Central India - Standard SSD E10 LRS - 128 GiB.
//
// Requests above 128 GiB remain Unavailable until
// additional disk tiers are officially verified.
// ======================================================

const getAzureStoragePrice = async ({
  region,
  storageType = 'standard-ssd-lrs',
  storageGB,
  quantity = 1
}) => {
  const normalizedRegion = String(region || '')
    .trim()
    .toLowerCase()

  const normalizedStorageType = String(storageType || '')
    .trim()
    .toLowerCase()

  const request = validateStorageRequest(storageGB, quantity)

  if (!normalizedRegion) {
    return unavailable('Azure region is required')
  }

  if (normalizedStorageType !== 'standard-ssd-lrs') {
    return unavailable(
      'Only verified Azure Standard SSD LRS storage is currently supported'
    )
  }

  if (!request) {
    return unavailable('Invalid storage size or VM quantity')
  }

  const catalog = readCatalog(
    AZURE_STORAGE_CATALOG_FILE,
    'azure'
  )

  if (!catalog) {
    return unavailable(
      'Azure managed disk pricing catalog is missing'
    )
  }

  const matchingTiers = catalog.prices
    .filter(
      (item) =>
        item.region === normalizedRegion &&
        item.storageType === normalizedStorageType &&
        typeof item.diskCapacityGB === 'number' &&
        Number.isFinite(item.diskCapacityGB) &&
        item.diskCapacityGB >= request.size
    )
    .sort(
      (a, b) =>
        a.diskCapacityGB - b.diskCapacityGB
    )

  if (matchingTiers.length === 0) {
    return unavailable(
      'No verified Azure managed disk tier is available for this region, storage type and requested capacity'
    )
  }

  const selectedTier = matchingTiers[0]

  const sameCapacityTiers = matchingTiers.filter(
    (item) =>
      item.diskCapacityGB === selectedTier.diskCapacityGB
  )

  if (sameCapacityTiers.length !== 1) {
    return unavailable(
      'Multiple Azure disk pricing records match the selected tier'
    )
  }

  if (
    typeof selectedTier.pricePerDiskMonth !== 'number' ||
    !Number.isFinite(selectedTier.pricePerDiskMonth) ||
    selectedTier.pricePerDiskMonth < 0 ||
    selectedTier.unitOfMeasure !== '1/Month' ||
    !selectedTier.meterId ||
    !selectedTier.verifiedDate
  ) {
    return unavailable(
      'Azure managed disk price is not properly verified'
    )
  }

  const totalRequestedStorageGB =
    request.size * request.vmQuantity

  const totalProvisionedStorageGB =
    selectedTier.diskCapacityGB * request.vmQuantity

  const totalMonthlyStorageCost = Number(
    (
      selectedTier.pricePerDiskMonth *
      request.vmQuantity
    ).toFixed(2)
  )

  return {
    status: 'Available',
    cloudProvider: 'azure',
    region: normalizedRegion,
    storageType: normalizedStorageType,
    skuName: selectedTier.skuName,
    meterName: selectedTier.meterName,
    diskCapacityGB: selectedTier.diskCapacityGB,
    storageGBPerVM: request.size,
    quantity: request.vmQuantity,
    totalRequestedStorageGB,
    totalProvisionedStorageGB,
    totalStorageGB: totalRequestedStorageGB,
    currency: 'USD',
    pricePerDiskMonth: selectedTier.pricePerDiskMonth,
    totalMonthlyStorageCost,
    pricingSource: 'Azure Retail Prices API',
    sourceUrl: catalog.sourceUrl,
    meterId: selectedTier.meterId,
    effectiveDate: selectedTier.effectiveDate,
    verifiedDate: selectedTier.verifiedDate,
    pricingDataType:
      'Locally verified official Azure managed disk pricing',
    disclaimer:
      'Estimate covers the selected Standard SSD LRS disk tier only. Disk operations, applicable disk mount charges, snapshots, networking, taxes and other charges are excluded.'
  }
}

// ======================================================
// GCP BALANCED PERSISTENT DISK PRICING
//
// Uses Google Cloud Pricing Calculator-derived rates.
//
// Verified configuration:
// Region: Mumbai (asia-south1)
// Storage: Balanced Persistent Disk (pd-balanced)
//
// Calculator observations:
// 100 GiB configuration = $70.75/month
// 200 GiB configuration = $82.75/month
//
// Difference = $12.00 for 100 additional GiB
// Derived rate = $0.12 per GiB-month
//
// IMPORTANT:
// The rate is derived from official calculator totals,
// not directly retrieved from a published unit-price API.
//
// Other regions and storage types must return Unavailable
// until their prices are independently verified.
// ======================================================

const getGcpStoragePrice = async ({
  region,
  storageType = 'pd-balanced',
  storageGB,
  quantity = 1
}) => {
  const normalizedRegion = String(region || '')
    .trim()
    .toLowerCase()

  const normalizedStorageType = String(storageType || '')
    .trim()
    .toLowerCase()

  const request = validateStorageRequest(storageGB, quantity)

  // Validate region

  if (!/^[a-z]+-[a-z]+\d+$/.test(normalizedRegion)) {
    return unavailable('Invalid GCP region code')
  }

  // Validate storage type

  if (normalizedStorageType !== 'pd-balanced') {
    return unavailable(
      'Only GCP Balanced Persistent Disk (pd-balanced) is currently supported'
    )
  }

  // Validate requested storage and VM quantity

  if (!request) {
    return unavailable('Invalid storage size or VM quantity')
  }

  // Read locally verified GCP pricing catalog

  const catalog = readCatalog(
    GCP_STORAGE_CATALOG_FILE,
    'gcp'
  )

  if (!catalog) {
    return unavailable(
      'GCP storage pricing catalog is missing'
    )
  }

  // Find exact region and storage type

  const matches = catalog.prices.filter(
    (item) =>
      item.region === normalizedRegion &&
      item.storageType === normalizedStorageType
  )

  if (matches.length !== 1) {
    return unavailable(
      matches.length === 0
        ? 'No verified GCP Balanced Persistent Disk price is available for this region'
        : 'Multiple GCP storage pricing records match this region and storage type'
    )
  }

  const priceRecord = matches[0]

  // Validate pricing record

  if (
    priceRecord.verificationStatus !== 'verified' ||
    typeof priceRecord.pricePerGBMonth !== 'number' ||
    !Number.isFinite(priceRecord.pricePerGBMonth) ||
    priceRecord.pricePerGBMonth < 0 ||
    !priceRecord.skuId ||
    !priceRecord.verifiedDate ||
    !priceRecord.sourceUrl ||
    !priceRecord.sourceUrl.startsWith(
      'https://cloud.google.com/'
    )
  ) {
    return unavailable(
      'GCP storage price has not been properly verified'
    )
  }

  // Calculate provisioned storage

  const totalStorageGB =
    request.size * request.vmQuantity

  // Calculate monthly storage cost

  const totalMonthlyStorageCost = Number(
    (
      totalStorageGB *
      priceRecord.pricePerGBMonth
    ).toFixed(2)
  )

  return {
    status: 'Available',
    cloudProvider: 'gcp',
    region: normalizedRegion,
    storageType: normalizedStorageType,
    storageGBPerVM: request.size,
    quantity: request.vmQuantity,
    totalStorageGB,
    currency: 'USD',
    pricePerGBMonth: priceRecord.pricePerGBMonth,
    totalMonthlyStorageCost,
    pricingSource: 'Google Cloud Pricing Calculator',
    sourceUrl: priceRecord.sourceUrl,
    skuId: priceRecord.skuId,
    verifiedDate: priceRecord.verifiedDate,
    verificationMethod: priceRecord.verificationMethod,
    pricingDataType:
      'Official calculator-derived GCP storage pricing',
    disclaimer:
      'Balanced Persistent Disk provisioned capacity estimate derived from official Google Cloud Pricing Calculator totals. Snapshots, networking, taxes and other charges are excluded.'
  }
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getAwsStoragePrice,
  getAzureStoragePrice,
  getGcpStoragePrice
}