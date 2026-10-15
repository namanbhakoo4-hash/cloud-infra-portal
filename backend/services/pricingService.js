
const fs = require('fs')
const path = require('path')

// ==========================================
// COMMON CONFIGURATION
// ==========================================

const MONTHLY_HOURS = 730

const PRICING_DIRECTORY = path.join(
  __dirname,
  '..',
  'data'
)

// ==========================================
// AWS PRICING CONFIGURATION
// ==========================================

const AWS_PRICING_DIRECTORY = PRICING_DIRECTORY

const awsPricingCache = new Map()

// ==========================================
// AWS EC2 PRICING
// ==========================================

const getAwsVmPrice = async ({
  region,
  instanceType,
  operatingSystem = 'Linux'
}) => {
  if (!region || !instanceType) {
    throw new Error(
      'Region and instance type are required'
    )
  }

  const normalizedRegion = String(region).trim()
  const normalizedInstance = String(instanceType).trim()
  const normalizedOS = String(operatingSystem).trim()

  // Prevent arbitrary filenames from being passed.
  if (!/^[a-z]{2}-[a-z]+-\d+$/.test(normalizedRegion)) {
    return {
      status: 'Unavailable',
      cloudProvider: 'aws',
      region: normalizedRegion,
      instanceType: normalizedInstance,
      message: 'Invalid AWS region code'
    }
  }

  const filePath = path.join(
    AWS_PRICING_DIRECTORY,
    `aws-ec2-${normalizedRegion}-prices.json`
  )

  if (!fs.existsSync(filePath)) {
    return {
      status: 'Unavailable',
      cloudProvider: 'aws',
      region: normalizedRegion,
      instanceType: normalizedInstance,
      message:
        `Official AWS pricing data has not been synchronized for ${normalizedRegion}`
    }
  }

  let catalog = awsPricingCache.get(normalizedRegion)

  if (!catalog) {
    const fileContents = fs.readFileSync(
      filePath,
      'utf8'
    )

    catalog = JSON.parse(fileContents)

    if (
      catalog.cloudProvider !== 'aws' ||
      catalog.region !== normalizedRegion ||
      !Array.isArray(catalog.prices)
    ) {
      throw new Error(
        'AWS pricing cache has an invalid format'
      )
    }

    awsPricingCache.set(normalizedRegion, catalog)
  }

  const matchingPrices = catalog.prices.filter(
    (item) =>
      item.instanceType === normalizedInstance &&
      item.operatingSystem === normalizedOS &&
      item.tenancy === 'Shared' &&
      item.purchaseOption === 'On-Demand' &&
      item.currency === 'USD'
  )

  if (matchingPrices.length !== 1) {
    return {
      status: 'Unavailable',
      cloudProvider: 'aws',
      region: normalizedRegion,
      instanceType: normalizedInstance,
      operatingSystem: normalizedOS,
      message:
        matchingPrices.length === 0
          ? 'No verified AWS EC2 price is available for this configuration'
          : 'Multiple AWS prices were found for this configuration'
    }
  }

  const item = matchingPrices[0]
  const hourlyPrice = Number(item.hourlyPrice)

  if (
    !Number.isFinite(hourlyPrice) ||
    hourlyPrice < 0
  ) {
    throw new Error('Invalid AWS EC2 hourly price')
  }

  return {
    status: 'Available',
    cloudProvider: 'aws',
    region: normalizedRegion,
    instanceType: normalizedInstance,
    operatingSystem: normalizedOS,
    currency: 'USD',
    hourlyPrice,
    monthlyHours: MONTHLY_HOURS,
    estimatedMonthlyComputeCost: Number(
      (hourlyPrice * MONTHLY_HOURS).toFixed(2)
    ),
    pricingSource: 'AWS Public Price List',
    sku: item.sku,
    rateCode: item.rateCode,
    meterName: item.description,
    retrievedAt: catalog.extractedAt,
    pricingDataType: 'Cached official AWS pricing'
  }
}

// ==========================================
// AZURE PRICING CONFIGURATION
// ==========================================

const AZURE_PRICING_API =
  'https://prices.azure.com/api/retail/prices'

const AZURE_REGIONS = {
  centralindia: 'centralindia',
  southindia: 'southindia',
  westindia: 'westindia',
  eastus: 'eastus',
  eastus2: 'eastus2',
  westus: 'westus',
  westeurope: 'westeurope',
  northeurope: 'northeurope'
}

const escapeOData = (value) =>
  String(value).replace(/'/g, "''")

// ==========================================
// AZURE VM PRICING
// ==========================================

const getAzureVmPrice = async ({
  region,
  instanceType,
  operatingSystem = 'Linux'
}) => {
  if (!region || !instanceType) {
    throw new Error(
      'Region and instance type are required'
    )
  }

  const azureRegion = AZURE_REGIONS[region] || region

  const filter = [
    "serviceName eq 'Virtual Machines'",
    `armRegionName eq '${escapeOData(azureRegion)}'`,
    `armSkuName eq '${escapeOData(instanceType)}'`,
    "priceType eq 'Consumption'"
  ].join(' and ')

  const url = new URL(AZURE_PRICING_API)

  url.searchParams.set('$filter', filter)

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(20000)
  })

  if (!response.ok) {
    throw new Error(
      `Azure Pricing API returned status ${response.status}`
    )
  }

  const data = await response.json()

  const isWindows =
    String(operatingSystem).toLowerCase() === 'windows'

  const matches = (data.Items || []).filter((item) => {
    const productName = String(
      item.productName || ''
    ).toLowerCase()

    const skuName = String(
      item.skuName || ''
    ).toLowerCase()

    const meterName = String(
      item.meterName || ''
    ).toLowerCase()

    if (item.unitOfMeasure !== '1 Hour') {
      return false
    }

    if (
      skuName.includes('spot') ||
      skuName.includes('low priority') ||
      meterName.includes('spot') ||
      meterName.includes('low priority')
    ) {
      return false
    }

    const productIsWindows =
      productName.includes('windows')

    return isWindows
      ? productIsWindows
      : !productIsWindows
  })

  if (matches.length === 0) {
    return {
      status: 'Unavailable',
      cloudProvider: 'azure',
      region: azureRegion,
      instanceType,
      operatingSystem,
      message:
        'No matching Azure VM price was found'
    }
  }

  const item =
    matches.find(
      (entry) =>
        !String(
          entry.meterName || ''
        ).toLowerCase().includes('promo')
    ) || matches[0]

  const hourlyPrice = Number(item.retailPrice)

  if (
    !Number.isFinite(hourlyPrice) ||
    hourlyPrice < 0
  ) {
    throw new Error(
      'Azure returned an invalid price'
    )
  }

  return {
    status: 'Available',
    cloudProvider: 'azure',
    region: azureRegion,
    instanceType,
    operatingSystem,
    currency: item.currencyCode,
    hourlyPrice,
    monthlyHours: MONTHLY_HOURS,
    estimatedMonthlyComputeCost: Number(
      (hourlyPrice * MONTHLY_HOURS).toFixed(2)
    ),
    pricingSource: 'Azure Retail Prices API',
    meterName: item.meterName,
    retrievedAt: new Date().toISOString()
  }
}

// ==========================================
// GCP PRICING CONFIGURATION
// ==========================================

const GCP_PRICING_FILE = path.join(
  PRICING_DIRECTORY,
  'gcp-compute-prices.json'
)

// ==========================================
// GCP COMPUTE ENGINE PRICING
// ==========================================

const getGcpVmPrice = async ({
  region,
  instanceType,
  operatingSystem = 'Linux'
}) => {
  if (!region || !instanceType) {
    throw new Error(
      'Region and instance type are required'
    )
  }

  const normalizedRegion = String(region).trim()
  const normalizedInstance = String(instanceType).trim()
  const normalizedOS = String(operatingSystem).trim()

  if (!fs.existsSync(GCP_PRICING_FILE)) {
    return {
      status: 'Unavailable',
      cloudProvider: 'gcp',
      region: normalizedRegion,
      instanceType: normalizedInstance,
      operatingSystem: normalizedOS,
      message:
        'Official GCP pricing catalog has not been created'
    }
  }

  // Read catalog from disk so changes are picked up
  // without needing to restart the backend.
  const fileContents = fs.readFileSync(
    GCP_PRICING_FILE,
    'utf8'
  )

  const catalog = JSON.parse(fileContents)

  if (
    catalog.cloudProvider !== 'gcp' ||
    catalog.currency !== 'USD' ||
    !Array.isArray(catalog.prices) ||
    !Number.isFinite(catalog.monthlyHours) ||
    catalog.monthlyHours <= 0 ||
    !catalog.pricingSource ||
    !catalog.verifiedDate
  ) {
    throw new Error(
      'GCP pricing catalog has an invalid format'
    )
  }

  const matchingPrices = catalog.prices.filter(
    (item) =>
      item.region === normalizedRegion &&
      item.instanceType === normalizedInstance &&
      item.operatingSystem === normalizedOS
  )

  if (matchingPrices.length !== 1) {
    return {
      status: 'Unavailable',
      cloudProvider: 'gcp',
      region: normalizedRegion,
      instanceType: normalizedInstance,
      operatingSystem: normalizedOS,
      message:
        matchingPrices.length === 0
          ? 'No verified GCP price is available for this region, instance type and operating system'
          : 'Multiple GCP prices were found for this configuration'
    }
  }

  const item = matchingPrices[0]

  if (
    typeof item.hourlyPrice !== 'number' ||
    !Number.isFinite(item.hourlyPrice) ||
    item.hourlyPrice < 0
  ) {
    return {
      status: 'Unavailable',
      cloudProvider: 'gcp',
      region: normalizedRegion,
      instanceType: normalizedInstance,
      operatingSystem: normalizedOS,
      message:
        'The GCP pricing record contains an invalid hourly price'
    }
  }

  const hourlyPrice = item.hourlyPrice
  const monthlyHours = catalog.monthlyHours

  return {
    status: 'Available',
    cloudProvider: 'gcp',
    region: normalizedRegion,
    instanceType: normalizedInstance,
    operatingSystem: normalizedOS,
    currency: catalog.currency,
    hourlyPrice,
    monthlyHours,
    estimatedMonthlyComputeCost: Number(
      (hourlyPrice * monthlyHours).toFixed(2)
    ),
    pricingSource: catalog.pricingSource,
    sourceUrl: catalog.sourceUrl,
    pricingModel: catalog.pricingModel,
    meterName:
      `${normalizedInstance} - Default hourly compute price`,
    retrievedAt: catalog.verifiedDate,
    pricingDataType:
      'Locally verified official GCP pricing',
    vcpu: item.vcpu,
    memoryGiB: item.memoryGiB
  }
}

// ==========================================
// COMMON MULTI-CLOUD PRICING FUNCTION
// ==========================================

const getCloudPrice = async (options) => {
  if (!options || typeof options !== 'object') {
    throw new Error('Pricing options are required')
  }

  const provider = String(
    options.cloudProvider || ''
  ).trim().toLowerCase()

  if (provider === 'aws') {
    return getAwsVmPrice(options)
  }

  if (provider === 'azure') {
    return getAzureVmPrice(options)
  }

  if (provider === 'gcp') {
    return getGcpVmPrice(options)
  }

  throw new Error('Invalid cloud provider')
}

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

module.exports = {
  getCloudPrice,
  getAwsVmPrice,
  getAzureVmPrice,
  getGcpVmPrice
}
