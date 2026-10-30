const {
  getCloudPrice
} = require('./pricingService')

const {
  getAwsStoragePrice,
  getAzureStoragePrice,
  getGcpStoragePrice
} = require('./storagePricingService')

const CSV_COLUMNS = [
  'Record Type',
  'Ticket ID',
  'Project Name',
  'Environment',
  'Cloud Provider',
  'Region',
  'BOM Status',
  'Created At',
  'Justification',
  'Resource Number',
  'Resource Key',
  'Resource Name',
  'Service',
  'Instance Type',
  'Operating System',
  'CPU',
  'RAM',
  'Quantity',
  'Storage Size (GB)',
  'Storage Type',
  'VPC CIDR',
  'Subnet Name',
  'Subnet Type',
  'Subnet CIDR',
  'Availability Zone',
  'Internet Gateway',
  'NAT Gateway Mode',
  'DNS Support',
  'DNS Hostnames',
  'VPC Source',
  'VPC ID',
  'Subnet ID',
  'Public IP',
  'Security Group IDs',
  'AMI ID',
  'Key Pair Name',
  'IAM Instance Profile',
  'EBS Device Name',
  'EBS Volume Type',
  'EBS Volume Size (GiB)',
  'EBS Encrypted',
  'EBS Delete On Termination',
  'Pricing Component',
  'Pricing Status',
  'Currency',
  'Unit Rate',
  'Unit',
  'Monthly Hours',
  'Monthly Cost',
  'Pricing Source',
  'Pricing Details',
  'Engineer Remarks',
  'Reviewed By',
  'Terraform Generation',
  'Terraform Init',
  'Terraform Validate',
  'Terraform Plan',
  'Terraform Plan Type',
  'Terraform Folder',
  'Terraform Executed At'
]

function csvValue(value) {
  if (value === undefined || value === null) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'object') {
    value = JSON.stringify(value)
  }

  const text = String(value)

  return `"${text.replace(/"/g, '""')}"`
}

function createCsv(rows) {
  const header = CSV_COLUMNS.map(csvValue).join(',')

  const records = rows.map((row) =>
    CSV_COLUMNS.map((column) =>
      csvValue(row[column])
    ).join(',')
  )

  return [header, ...records].join('\r\n') + '\r\n'
}

function createBaseRow(bom, recordType) {
  return {
    'Record Type': recordType,
    'Ticket ID': bom.ticketId,
    'Project Name': bom.projectName,
    'Environment': bom.environment,
    'Cloud Provider': bom.cloudProvider,
    'Region': bom.region,
    'BOM Status': bom.status,
    'Created At': bom.createdAt,
    'Justification': bom.justification,
    'Engineer Remarks': bom.engineerRemarks,
    'Reviewed By': bom.reviewedBy?.name || '',
    'Terraform Generation': bom.terraformExecution?.generation,
    'Terraform Init': bom.terraformExecution?.init,
    'Terraform Validate': bom.terraformExecution?.validate,
    'Terraform Plan': bom.terraformExecution?.plan,
    'Terraform Plan Type': bom.terraformExecution?.planType,
    'Terraform Folder': bom.terraformExecution?.terraformFolder,
    'Terraform Executed At': bom.terraformExecution?.executedAt
  }
}

function normalizeOperatingSystem(value) {
  return String(value || '').toLowerCase().includes('windows')
    ? 'Windows'
    : 'Linux'
}

function getStoragePricingFunction(cloudProvider) {
  const pricingFunctions = {
    aws: getAwsStoragePrice,
    azure: getAzureStoragePrice,
    gcp: getGcpStoragePrice
  }

  return pricingFunctions[cloudProvider]
}

function getDefaultStorageType(cloudProvider) {
  const defaults = {
    aws: 'gp3',
    azure: 'standard-ssd-lrs',
    gcp: 'pd-balanced'
  }

  return defaults[cloudProvider] || ''
}

async function addComputePricing(rows, bom, resource, resourceIndex) {
  const config = resource.ec2Configuration || {}

  const instanceType =
    resource.instanceType ||
    config.instanceType ||
    ''

  const quantity = Number(
    resource.quantity ?? config.quantity ?? 1
  )

  const operatingSystem = normalizeOperatingSystem(
    resource.operatingSystem ||
    config.operatingSystemType ||
    config.operatingSystem
  )

  const base = {
    ...createBaseRow(bom, 'Pricing'),
    'Resource Number': resourceIndex + 1,
    'Resource Key': resource.resourceKey,
    'Resource Name': resource.resourceName || config.instanceName,
    'Service': resource.service,
    'Instance Type': instanceType,
    'Operating System': operatingSystem,
    'Quantity': quantity,
    'Pricing Component': 'Compute'
  }

  let computePricing

  try {
    computePricing = await getCloudPrice({
      cloudProvider: bom.cloudProvider,
      region: bom.region,
      instanceType,
      operatingSystem
    })
  } catch (error) {
    computePricing = {
      status: 'Unavailable',
      message: error.message
    }
  }

  if (computePricing?.status !== 'Available') {
    rows.push({
      ...base,
      'Pricing Status': 'Unavailable',
      'Pricing Details':
        computePricing?.message ||
        'Verified compute pricing is unavailable'
    })

    return {
      computeCost: null,
      computeAvailable: false
    }
  }

  const hourlyRate = Number(computePricing.hourlyPrice)
  const monthlyHours = Number(computePricing.monthlyHours)

  if (
    !Number.isFinite(hourlyRate) ||
    hourlyRate < 0 ||
    !Number.isFinite(monthlyHours) ||
    monthlyHours <= 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    rows.push({
      ...base,
      'Pricing Status': 'Unavailable',
      'Pricing Details': 'Returned compute pricing data is invalid'
    })

    return {
      computeCost: null,
      computeAvailable: false
    }
  }

  const monthlyCost = Number(
    (hourlyRate * monthlyHours * quantity).toFixed(2)
  )

  rows.push({
    ...base,
    'Pricing Status': 'Available',
    'Currency': computePricing.currency || 'USD',
    'Unit Rate': hourlyRate,
    'Unit': 'hour',
    'Monthly Hours': monthlyHours,
    'Monthly Cost': monthlyCost,
    'Pricing Source': computePricing.pricingSource || '',
    'Pricing Details': computePricing.meterName || ''
  })

  return {
    computeCost: monthlyCost,
    computeAvailable: true
  }
}

async function addStoragePricing(rows, bom, resource, resourceIndex) {
  const storageSize = Number(resource.storage)
  const quantity = Number(resource.quantity ?? 1)

  if (
    !Number.isFinite(storageSize) ||
    storageSize <= 0
  ) {
    return {
      storageCost: null,
      storageAvailable: true
    }
  }

  const storageType =
    resource.storageType ||
    getDefaultStorageType(bom.cloudProvider)

  const base = {
    ...createBaseRow(bom, 'Pricing'),
    'Resource Number': resourceIndex + 1,
    'Resource Key': resource.resourceKey,
    'Resource Name': resource.resourceName,
    'Service': resource.service,
    'Quantity': quantity,
    'Storage Size (GB)': storageSize,
    'Storage Type': storageType,
    'Pricing Component': 'Root Storage'
  }

  const getStoragePrice = getStoragePricingFunction(
    bom.cloudProvider
  )

  if (!getStoragePrice) {
    rows.push({
      ...base,
      'Pricing Status': 'Unavailable',
      'Pricing Details': 'Storage pricing provider is unsupported'
    })

    return {
      storageCost: null,
      storageAvailable: false
    }
  }

  let storagePricing

  try {
    storagePricing = await getStoragePrice({
      region: bom.region,
      storageType,
      storageGB: storageSize,
      quantity
    })
  } catch (error) {
    storagePricing = {
      status: 'Unavailable',
      message: error.message
    }
  }

  if (storagePricing?.status !== 'Available') {
    rows.push({
      ...base,
      'Pricing Status': 'Unavailable',
      'Pricing Details':
        storagePricing?.message ||
        'Verified storage pricing is unavailable'
    })

    return {
      storageCost: null,
      storageAvailable: false
    }
  }

  const monthlyCost = Number(
    storagePricing.totalMonthlyStorageCost
  )

  if (
    !Number.isFinite(monthlyCost) ||
    monthlyCost < 0
  ) {
    rows.push({
      ...base,
      'Pricing Status': 'Unavailable',
      'Pricing Details': 'Returned storage pricing data is invalid'
    })

    return {
      storageCost: null,
      storageAvailable: false
    }
  }

  rows.push({
    ...base,
    'Pricing Status': 'Available',
    'Currency': storagePricing.currency || 'USD',
    'Unit Rate':
      storagePricing.pricePerGBMonth ??
      storagePricing.pricePerDiskMonth ??
      '',
    'Unit': 'month',
    'Monthly Cost': monthlyCost,
    'Pricing Source': storagePricing.pricingSource || '',
    'Pricing Details': storagePricing.disclaimer || ''
  })

  return {
    storageCost: monthlyCost,
    storageAvailable: true
  }
}

function addBomSummary(rows, bom) {
  rows.push(
    createBaseRow(bom, 'BOM Summary')
  )
}

function addResourceRows(rows, bom) {
  const resources = Array.isArray(bom.resources)
    ? bom.resources
    : []

  resources.forEach((resource, index) => {
    const ec2 = resource.ec2Configuration || {}
    const network = ec2.network || {}
    const vpc = resource.vpcConfiguration || {}

    rows.push({
      ...createBaseRow(bom, 'Resource'),
      'Resource Number': index + 1,
      'Resource Key': resource.resourceKey,
      'Resource Name':
        resource.resourceName ||
        ec2.instanceName ||
        vpc.name,
      'Service': resource.service,
      'Instance Type':
        resource.instanceType ||
        ec2.instanceType,
      'Operating System':
        resource.operatingSystem ||
        ec2.operatingSystemType ||
        ec2.operatingSystem,
      'CPU': resource.cpu,
      'RAM': resource.ram,
      'Quantity':
        resource.quantity ??
        ec2.quantity,
      'Storage Size (GB)': resource.storage,
      'Storage Type': resource.storageType,
      'VPC CIDR': vpc.ipv4Cidr,
      'Internet Gateway': vpc.createInternetGateway,
      'NAT Gateway Mode': vpc.natGatewayMode,
      'DNS Support': vpc.enableDnsSupport,
      'DNS Hostnames': vpc.enableDnsHostnames,
      'VPC Source': network.vpcSource,
      'VPC ID': network.vpcId || vpc.existingVpcId,
      'Subnet ID': network.subnetId,
      'Public IP': network.associatePublicIpAddress,
      'Security Group IDs': network.securityGroupIds,
      'AMI ID': ec2.amiId,
      'Key Pair Name': ec2.keyPairName,
      'IAM Instance Profile': ec2.instanceProfileName
    })

    const subnets = Array.isArray(vpc.subnets)
      ? vpc.subnets
      : []

    subnets.forEach((subnet) => {
      rows.push({
        ...createBaseRow(bom, 'Subnet'),
        'Resource Number': index + 1,
        'Resource Key': resource.resourceKey,
        'Resource Name': resource.resourceName || vpc.name,
        'Service': 'VPC',
        'VPC CIDR': vpc.ipv4Cidr,
        'Subnet Name': subnet.name,
        'Subnet Type': subnet.subnetType,
        'Subnet CIDR': subnet.ipv4Cidr,
        'Availability Zone': subnet.availabilityZone,
        'Public IP': subnet.mapPublicIpOnLaunch
      })
    })

    const volumes = Array.isArray(resource.ebsVolumes)
      ? resource.ebsVolumes
      : []

    volumes.forEach((volume) => {
      rows.push({
        ...createBaseRow(bom, 'EBS Volume'),
        'Resource Number': index + 1,
        'Resource Key': resource.resourceKey,
        'Resource Name': resource.resourceName,
        'Service': resource.service,
        'EBS Device Name': volume.deviceName,
        'EBS Volume Type': volume.volumeType,
        'EBS Volume Size (GiB)': volume.sizeGiB,
        'EBS Encrypted': volume.encrypted,
        'EBS Delete On Termination': volume.deleteOnTermination
      })
    })
  })
}

async function addPricingRows(rows, bom) {
  const resources = Array.isArray(bom.resources)
    ? bom.resources
    : []

  for (const [index, resource] of resources.entries()) {
    if (resource.service !== 'EC2') {
      continue
    }

    const compute = await addComputePricing(
      rows,
      bom,
      resource,
      index
    )

    const storage = await addStoragePricing(
      rows,
      bom,
      resource,
      index
    )

    const totalAvailable =
      compute.computeAvailable &&
      storage.storageAvailable

    const totalCost = totalAvailable
      ? Number(
          (
            compute.computeCost +
            (storage.storageCost || 0)
          ).toFixed(2)
        )
      : null

    rows.push({
      ...createBaseRow(bom, 'Pricing Summary'),
      'Resource Number': index + 1,
      'Resource Key': resource.resourceKey,
      'Resource Name': resource.resourceName,
      'Service': resource.service,
      'Pricing Component': 'Compute + Root Storage',
      'Pricing Status': totalAvailable
        ? 'Available'
        : 'Partially Unavailable',
      'Currency': 'USD',
      'Monthly Cost': totalCost,
      'Pricing Details': totalAvailable
        ? 'Combined compute and root storage estimate'
        : 'One or more pricing components are unavailable'
    })
  }
}

async function buildBomCsv(bom) {
  if (!bom) {
    throw new Error('A BOM record is required for CSV export')
  }

  // Convert Mongoose documents to plain objects before reading schema fields.
  // This is important because Mongoose documents already have a validate()
  // method, which can conflict with the terraformExecution.validate field.
  const bomData =
    typeof bom.toObject === 'function'
      ? bom.toObject({ depopulate: false })
      : bom

  const rows = []

  addBomSummary(rows, bomData)
  addResourceRows(rows, bomData)

  await addPricingRows(rows, bomData)

  return createCsv(rows)
}

module.exports = {
  buildBomCsv
}