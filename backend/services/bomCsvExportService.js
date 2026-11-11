
const ExcelJS = require('exceljs')

const { getCloudPrice } = require('./pricingService')

const {
  getAwsStoragePrice,
  getAzureStoragePrice,
  getGcpStoragePrice
} = require('./storagePricingService')

function plainBom(bom) {
  return typeof bom?.toObject === 'function'
    ? bom.toObject({ depopulate: false })
    : bom
}

function isObjectId(value) {
  return value &&
    typeof value === 'object' &&
    (value._bsontype === 'ObjectId' ||
      value.constructor?.name === 'ObjectId') &&
    typeof value.toString === 'function'
}

function displayValue(value) {
  if (value === undefined || value === null || value === '') return ''

  if (isObjectId(value)) return value.toString()

  if (value instanceof Date) return value.toISOString()

  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    return value.length
      ? value.map(displayValue).join(', ')
      : 'No entries'
  }

  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

function hasValue(value) {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (isObjectId(value)) return true
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function addField(rows, resource, section, label, value) {
  rows.push({
    Resource: resource || '',
    Section: section || '',
    Setting: label,
    Value: hasValue(value) ? displayValue(value) : 'Not specified'
  })
}

function getResourceName(resource, index) {
  const service = String(resource.service || '').toUpperCase()

  return resource.resourceName ||
    resource.ec2Configuration?.instanceName ||
    resource.vpcConfiguration?.name ||
    `${service || 'Resource'} ${index + 1}`
}

function getSummaryRows(bom) {
  return [
    ['BOM ID', bom.ticketId],
    ['Project Name', bom.projectName],
    ['Environment', bom.environment],
    ['Cloud Provider', bom.cloudProvider],
    ['Default Region', bom.region],
    ['Request Status', bom.status],
    ['Created Date', bom.createdAt],
    ['Last Updated', bom.updatedAt],
    ['Business Justification', bom.justification],
    ['Created By ID', bom.createdBy],
    ['Reviewed By', bom.reviewedBy?.name || bom.reviewedBy],
    ['Engineer Remarks', bom.engineerRemarks],
    ['Estimated Cost Status', bom.estimatedCost?.status],
    ['Estimated Monthly Total', bom.estimatedCost?.monthlyTotal],
    ['Currency', bom.estimatedCost?.currency],
    ['Monthly Hours', bom.estimatedCost?.monthlyHours],
    ['Pricing Source', bom.estimatedCost?.pricingSource],
    ['Pricing Calculated At', bom.estimatedCost?.calculatedAt],
    ['Pricing Error', bom.estimatedCost?.errorMessage]
  ].filter(([, value]) => hasValue(value))
    .map(([Detail, Value]) => ({ Detail, Value: displayValue(Value) }))
}

function getResourceInventoryRows(bom) {
  const resources = Array.isArray(bom.resources) ? bom.resources : []

  return resources.map((resource, index) => ({
    'Resource Number': index + 1,
    'Resource Name': getResourceName(resource, index),
    'Resource Type': resource.service || '',
    'Cloud Provider': resource.cloudProvider || bom.cloudProvider || '',
    Region: resource.region || bom.region || '',
    'Resource Key': resource.resourceKey || '',
    'Instance Type': resource.instanceType || resource.ec2Configuration?.instanceType || '',
    CPU: resource.cpu ?? resource.ec2Configuration?.cpu ?? '',
    RAM: resource.ram ?? resource.ec2Configuration?.ram ?? '',
    Quantity: resource.quantity ?? resource.ec2Configuration?.quantity ?? 1,
    'Operating System': resource.operatingSystem || resource.ec2Configuration?.operatingSystem || '',
    'Billing Model': resource.billingModel || '',
    'Resource Status': bom.status || ''
  }))
}

function getResourceRows(bom) {
  const vpcRows = []
  const ec2Rows = []
  const storageRows = []
  const subnetRows = []
  const securityRows = []

  const resources = Array.isArray(bom.resources) ? bom.resources : []

  resources.forEach((resource, index) => {
    const service = String(resource.service || '').toUpperCase()
    const name = getResourceName(resource, index)
    const vpc = resource.vpcConfiguration || {}
    const ec2 = resource.ec2Configuration || {}
    const network = ec2.network || {}

    if (service === 'VPC') {
      const fields = [
        ['Resource Name', resource.resourceName],
        ['VPC Name', vpc.name],
        ['Region', resource.region || bom.region],
        ['VPC Mode', vpc.mode],
        ['Creation Experience', vpc.creationExperience],
        ['IPv4 CIDR Block', vpc.ipv4Cidr],
        ['Existing VPC ID', vpc.existingVpcId],
        ['First Public Subnet CIDR', vpc.publicFirstCidr],
        ['First Private Subnet CIDR', vpc.privateFirstCidr],
        ['Public Subnet Quantity', vpc.publicQuantity],
        ['Private Subnet Quantity', vpc.privateQuantity],
        ['Create Internet Gateway', vpc.createInternetGateway],
        ['NAT Gateway Mode', vpc.natGatewayMode],
        ['IPv6 Mode', vpc.ipv6Mode],
        ['Tenancy', vpc.tenancy],
        ['DNS Support', vpc.enableDnsSupport],
        ['DNS Hostnames', vpc.enableDnsHostnames],
        ['Existing Route Table ID', vpc.existingRouteTableId]
      ]

      fields.forEach(([label, value]) => {
        addField(vpcRows, name, 'VPC Configuration', label, value)
      })

      const subnets = vpc.mode === 'existing'
        ? (vpc.existingSubnets || [])
        : (vpc.subnets || [])

      if (!subnets.length) {
        subnetRows.push({
          Resource: name,
          'Subnet Number': '',
          'Subnet Name': 'No subnet entries saved',
          'Resource Key': '',
          'Subnet Type': '',
          'CIDR Block': '',
          'Subnet ID': '',
          'Availability Zone': '',
          'Map Public IP on Launch': ''
        })
      }

      subnets.forEach((subnet, subnetIndex) => {
        subnetRows.push({
          Resource: name,
          'Subnet Number': subnetIndex + 1,
          'Subnet Name': subnet.name || `Subnet ${subnetIndex + 1}`,
          'Resource Key': subnet.resourceKey || '',
          'Subnet Type': subnet.subnetType || '',
          'CIDR Block': subnet.ipv4Cidr || '',
          'Subnet ID': subnet.subnetId || '',
          'Availability Zone': subnet.availabilityZone || '',
          'Map Public IP on Launch': hasValue(subnet.mapPublicIpOnLaunch)
            ? displayValue(subnet.mapPublicIpOnLaunch)
            : ''
        })
      })

      const routeTables = Array.isArray(vpc.routeTables) ? vpc.routeTables : []

      routeTables.forEach((routeTable, routeIndex) => {
        const routeName = routeTable.name || `Route Table ${routeIndex + 1}`

        for (const [label, value] of [
          ['Route Table Name', routeName],
          ['Route Table ID', routeTable.routeTableId],
          ['Associated Subnets', routeTable.subnetIds || routeTable.subnets],
          ['Routes', routeTable.routes]
        ]) {
          addField(vpcRows, name, 'Route Table Configuration', label, value)
        }
      })
    }

    if (service === 'EC2') {
      const fields = [
        ['Resource Name', resource.resourceName],
        ['Instance Name', ec2.instanceName],
        ['Region', resource.region || bom.region],
        ['Instance Type', resource.instanceType || ec2.instanceType],
        ['Operating System', resource.operatingSystem || ec2.operatingSystem],
        ['CPU', resource.cpu ?? ec2.cpu],
        ['RAM', resource.ram ?? ec2.ram],
        ['Quantity', resource.quantity ?? ec2.quantity ?? 1],
        ['Root Storage Size (GB)', resource.storage ?? ec2.storage],
        ['Root Storage Type', resource.storageType ?? ec2.storageType],
        ['AMI ID', ec2.amiId],
        ['Key Pair Name', ec2.keyPairName],
        ['Instance Profile Mode', resource.instanceProfileMode || ec2.instanceProfileMode],
        ['Instance Profile Name', resource.instanceProfileName || ec2.instanceProfileName],
        ['IAM Role Name', resource.iamRoleName || ec2.iamRoleName],
        ['VPC Selection', network.vpcSource],
        ['VPC ID', network.vpcId],
        ['VPC Resource Key', network.vpcResourceKey],
        ['Subnet ID', network.subnetId],
        ['Subnet Resource Key', network.subnetResourceKey],
        ['Associate Public IP', network.associatePublicIpAddress],
        ['Security Group Mode', network.securityGroupMode],
        ['Security Group IDs', network.securityGroupIds]
      ]

      fields.forEach(([label, value]) => {
        addField(ec2Rows, name, 'EC2 Instance Configuration', label, value)
      })

      const securityGroup = network.securityGroup || {}

      for (const [label, value] of [
        ['Security Group Name', securityGroup.name],
        ['Security Group Description', securityGroup.description]
      ]) {
        addField(securityRows, name, 'Security Group', label, value)
      }

      for (const [ruleType, rules] of [
        ['Ingress', securityGroup.ingressRules],
        ['Egress', securityGroup.egressRules]
      ]) {
        ;(Array.isArray(rules) ? rules : []).forEach((rule, ruleIndex) => {
          securityRows.push({
            Resource: name,
            'Rule Type': ruleType,
            'Rule Number': ruleIndex + 1,
            Protocol: rule.protocol || '',
            'From Port': rule.fromPort ?? '',
            'To Port': rule.toPort ?? '',
            CIDR: rule.cidr || '',
            Description: rule.description || ''
          })
        })
      }

      const volumes = Array.isArray(resource.ebsVolumes)
        ? resource.ebsVolumes
        : []

      volumes.forEach((volume, volumeIndex) => {
        for (const [label, value] of [
          ['Volume Name', volume.name || `Additional Volume ${volumeIndex + 1}`],
          ['Device Name', volume.deviceName],
          ['Volume Type', volume.volumeType],
          ['Volume Size (GiB)', volume.sizeGiB],
          ['IOPS', volume.iops],
          ['Throughput (MiB/s)', volume.throughput],
          ['Encrypted', volume.encrypted],
          ['KMS Key ID', volume.kmsKeyId],
          ['Delete on Termination', volume.deleteOnTermination]
        ]) {
          addField(storageRows, name, 'Additional EBS Volume', label, value)
        }
      })

      const rootStorage = resource.storage ?? ec2.storage

      if (hasValue(rootStorage)) {
        addField(storageRows, name, 'Root Volume', 'Root Storage Size (GB)', rootStorage)
        addField(storageRows, name, 'Root Volume', 'Root Storage Type', resource.storageType || ec2.storageType)
      }
    }

    if (service !== 'VPC' && service !== 'EC2') {
      for (const [label, value] of [
        ['Resource Name', resource.resourceName],
        ['Resource Type', resource.service],
        ['Region', resource.region || bom.region],
        ['Resource Key', resource.resourceKey],
        ['Quantity', resource.quantity],
        ['CPU', resource.cpu],
        ['RAM', resource.ram],
        ['Storage', resource.storage],
        ['Storage Type', resource.storageType],
        ['Operating System', resource.operatingSystem],
        ['Billing Model', resource.billingModel],
        ['Subnet Type', resource.subnetType],
        ['Subnet ID', resource.subnetId],
        ['Public IP', resource.publicIp],
        ['Instance Profile Mode', resource.instanceProfileMode],
        ['Instance Profile Name', resource.instanceProfileName],
        ['IAM Role Name', resource.iamRoleName]
      ]) {
        addField(ec2Rows, name, 'Resource Configuration', label, value)
      }
    }
  })

  return { vpcRows, ec2Rows, storageRows, subnetRows, securityRows }
}

function flattenConfiguration(value, path, rows) {
  if (value === undefined || value === null) {
    rows.push({ 'Configuration Path': path, 'Saved Value': 'Not specified' })
    return
  }

  if (isObjectId(value)) {
    rows.push({ 'Configuration Path': path, 'Saved Value': value.toString() })
    return
  }

  if (value instanceof Date) {
    rows.push({ 'Configuration Path': path, 'Saved Value': value.toISOString() })
    return
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      rows.push({ 'Configuration Path': path, 'Saved Value': 'No entries' })
      return
    }

    value.forEach((item, index) => {
      flattenConfiguration(item, `${path}[${index + 1}]`, rows)
    })
    return
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)

    if (!entries.length) {
      rows.push({ 'Configuration Path': path, 'Saved Value': 'Empty object' })
      return
    }

    entries.forEach(([key, child]) => {
      flattenConfiguration(child, `${path}.${key}`, rows)
    })
    return
  }

  rows.push({ 'Configuration Path': path, 'Saved Value': displayValue(value) })
}

function getCompleteConfigurationRows(bom) {
  const rows = []
  flattenConfiguration(bom, 'BOM', rows)
  return rows
}

function getStoragePricingFunction(provider) {
  return {
    aws: getAwsStoragePrice,
    azure: getAzureStoragePrice,
    gcp: getGcpStoragePrice
  }[String(provider || '').toLowerCase()]
}

function normalizeOperatingSystem(value) {
  return String(value || '').toLowerCase().includes('windows')
    ? 'Windows'
    : 'Linux'
}

async function getPricingRows(bom) {
  const rows = []
  const savedBreakdown = bom.estimatedCost?.breakdown || []

  if (savedBreakdown.length) {
    savedBreakdown.forEach((item, index) => {
      rows.push({
        Resource: item.resourceIndex !== undefined
          ? `Resource ${Number(item.resourceIndex) + 1}`
          : 'BOM',
        Component: item.category || `Component ${index + 1}`,
        Region: bom.region || '',
        Status: 'Saved Estimate',
        Currency: bom.estimatedCost?.currency || 'USD',
        Unit: item.unit || '',
        UnitRate: item.rate ?? '',
        'Monthly Hours': bom.estimatedCost?.monthlyHours ?? '',
        Quantity: '',
        'Monthly Cost': item.amount ?? '',
        Details: item.description || item.source || ''
      })
    })

    return rows
  }

  const resources = Array.isArray(bom.resources) ? bom.resources : []

  for (const [index, resource] of resources.entries()) {
    if (String(resource.service || '').toUpperCase() !== 'EC2') continue

    const ec2 = resource.ec2Configuration || {}
    const resourceName = getResourceName(resource, index)
    const region = resource.region || bom.region
    const instanceType = resource.instanceType || ec2.instanceType
    const quantity = Number(resource.quantity ?? ec2.quantity ?? 1)
    const operatingSystem = normalizeOperatingSystem(
      resource.operatingSystem || ec2.operatingSystem
    )

    let compute = null

    try {
      compute = await getCloudPrice({
        cloudProvider: bom.cloudProvider,
        region,
        instanceType,
        operatingSystem
      })
    } catch (error) {
      compute = { status: 'Unavailable', message: error.message }
    }

    if (compute?.status === 'Available') {
      const hourlyRate = Number(compute.hourlyPrice)
      const monthlyHours = Number(compute.monthlyHours)

      if (
        Number.isFinite(hourlyRate) &&
        hourlyRate >= 0 &&
        Number.isFinite(monthlyHours) &&
        monthlyHours > 0 &&
        Number.isInteger(quantity) &&
        quantity > 0
      ) {
        rows.push({
          Resource: resourceName,
          Component: 'Compute',
          Region: region,
          Status: 'Available',
          Currency: compute.currency || 'USD',
          Unit: 'hour',
          UnitRate: hourlyRate,
          'Monthly Hours': monthlyHours,
          Quantity: quantity,
          'Monthly Cost': Number((hourlyRate * monthlyHours * quantity).toFixed(2)),
          Details: compute.meterName || ''
        })
      } else {
        rows.push({
          Resource: resourceName,
          Component: 'Compute',
          Region: region,
          Status: 'Unavailable',
          Details: 'Returned compute pricing data is invalid'
        })
      }
    } else {
      rows.push({
        Resource: resourceName,
        Component: 'Compute',
        Region: region,
        Status: 'Unavailable',
        Details: compute?.message || 'Compute pricing unavailable'
      })
    }

    const storageSize = Number(resource.storage ?? ec2.storage)

    if (Number.isFinite(storageSize) && storageSize > 0) {
      const storageType = resource.storageType || ec2.storageType || 'gp3'
      const getStoragePrice = getStoragePricingFunction(bom.cloudProvider)
      let storage = null

      if (!getStoragePrice) {
        storage = { status: 'Unavailable', message: 'Unsupported storage provider' }
      } else {
        try {
          storage = await getStoragePrice({
            region,
            storageType,
            storageGB: storageSize,
            quantity
          })
        } catch (error) {
          storage = { status: 'Unavailable', message: error.message }
        }
      }

      if (
        storage?.status === 'Available' &&
        Number.isFinite(Number(storage.totalMonthlyStorageCost))
      ) {
        rows.push({
          Resource: resourceName,
          Component: 'Root Storage',
          Region: region,
          Status: 'Available',
          Currency: storage.currency || 'USD',
          Unit: 'month',
          UnitRate: storage.pricePerGBMonth ?? storage.pricePerDiskMonth ?? '',
          Quantity: quantity,
          'Monthly Cost': Number(storage.totalMonthlyStorageCost),
          Details: storage.disclaimer || `${storageSize} GB ${storageType}`
        })
      } else {
        rows.push({
          Resource: resourceName,
          Component: 'Root Storage',
          Region: region,
          Status: 'Unavailable',
          Details: storage?.message || 'Storage pricing unavailable'
        })
      }
    }
  }

  return rows
}

function buildCsv(rows) {
  const headers = ['Section', 'Resource', 'Detail', 'Value']

  const escape = (value) => {
    let text = displayValue(value)

    if (/^[=+@-]/.test(text)) text = `'${text}`

    return `"${text.replace(/"/g, '""')}"`
  }

  return [
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? ''))
  ]
    .map((row) => row.map(escape).join(','))
    .join('\r\n') + '\r\n'
}

function addTitle(worksheet, title, subtitle, columnCount) {
  worksheet.mergeCells(1, 1, 1, columnCount)
  worksheet.mergeCells(2, 1, 2, columnCount)

  const titleCell = worksheet.getCell(1, 1)
  titleCell.value = title
  titleCell.font = {
    name: 'Aptos Display',
    size: 18,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  }
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF17365D' }
  }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  worksheet.getRow(1).height = 36

  const subtitleCell = worksheet.getCell(2, 1)
  subtitleCell.value = subtitle
  subtitleCell.font = {
    name: 'Aptos',
    size: 10,
    italic: true,
    color: { argb: 'FF52647A' }
  }
  subtitleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEAF0F7' }
  }
  subtitleCell.alignment = { vertical: 'middle', wrapText: true }
  worksheet.getRow(2).height = 27
}

function styleWorksheet(worksheet, title, headerRow = 4) {
  const lastColumn = worksheet.columnCount

  worksheet.views = [{ state: 'frozen', ySplit: headerRow }]

  if (worksheet.rowCount >= headerRow) {
    worksheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: lastColumn }
    }
  }

  const header = worksheet.getRow(headerRow)
  header.height = 32

  header.eachCell((cell) => {
    cell.font = {
      name: 'Aptos',
      bold: true,
      size: 10,
      color: { argb: 'FFFFFFFF' }
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF245A91' }
    }
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true
    }
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF9DBAD8' } }
    }
  })

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return

    row.height = 25

    row.eachCell((cell) => {
      cell.font = {
        name: 'Aptos',
        size: 10,
        color: { argb: 'FF243447' }
      }
      cell.alignment = { vertical: 'top', wrapText: true }

      if (rowNumber % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5FA' }
        }
      }

      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFDCE5EF' } }
      }
    })
  })

  worksheet.columns.forEach((column) => {
    let maxLength = 14

    column.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value?.text || cell.value || ''
      maxLength = Math.max(maxLength, String(value).length)
    })

    column.width = Math.min(Math.max(maxLength + 3, 16), 46)
  })

  worksheet.headerFooter.oddHeader = `&B${title}`
  worksheet.headerFooter.oddFooter = 'Confidential | Page &P of &N'
  worksheet.properties.defaultRowHeight = 22
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9
  }
}

function createTableSheet(workbook, name, title, subtitle, columns, rows) {
  const worksheet = workbook.addWorksheet(name)

  worksheet.columns = columns.map((column) => ({
    key: column.key,
    width: column.width || 20
  }))

  addTitle(worksheet, title, subtitle, columns.length)
  worksheet.addRow([])
  worksheet.addRow(columns.map((column) => column.header))

  if (rows.length) {
    rows.forEach((row) => {
      worksheet.addRow(columns.map((column) => row[column.key] ?? ''))
    })
  } else {
    worksheet.mergeCells(5, 1, 5, columns.length)
    const cell = worksheet.getCell(5, 1)
    cell.value = 'No matching resources or configuration entries were saved for this request.'
    cell.font = {
      name: 'Aptos',
      size: 11,
      italic: true,
      color: { argb: 'FF52647A' }
    }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5FA' }
    }
    cell.alignment = { vertical: 'middle', wrapText: true }
    worksheet.getRow(5).height = 38
  }

  styleWorksheet(worksheet, title, 4)

  return worksheet
}

function createOverviewSheet(workbook, bom) {
  const worksheet = workbook.addWorksheet('Executive Overview')

  worksheet.columns = [
    { key: 'Detail', width: 34 },
    { key: 'Value', width: 62 }
  ]

  addTitle(
    worksheet,
    'CLOUD INFRASTRUCTURE REQUEST',
    `Detailed Bill of Materials | ${bom.ticketId || 'BOM'}`,
    2
  )

  worksheet.addRow([])
  worksheet.addRow(['REQUEST INFORMATION', 'SAVED VALUE'])

  getSummaryRows(bom).forEach((row) => {
    worksheet.addRow([row.Detail, row.Value])
  })

  const resourceCount = (bom.resources || []).length
  const vpcCount = (bom.resources || []).filter(
    (resource) => String(resource.service).toUpperCase() === 'VPC'
  ).length
  const ec2Count = (bom.resources || []).filter(
    (resource) => String(resource.service).toUpperCase() === 'EC2'
  ).length

  worksheet.addRow([])
  worksheet.addRow(['RESOURCE SUMMARY', 'COUNT'])
  worksheet.addRow(['Total Resources', resourceCount])
  worksheet.addRow(['VPC Resources', vpcCount])
  worksheet.addRow(['EC2 Resources', ec2Count])

  worksheet.addRow([])
  worksheet.addRow(['EXPORT INFORMATION', 'VALUE'])
  worksheet.addRow(['Report Generated', new Date().toISOString()])
  worksheet.addRow(['Workbook Purpose', 'Infrastructure request configuration report'])
  worksheet.addRow(['Data Source', 'Saved BOM record'])

  ;[4, 4 + getSummaryRows(bom).length + 2, 4 + getSummaryRows(bom).length + 7]
    .forEach((rowNumber) => {
      worksheet.getRow(rowNumber).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF245A91' }
        }
      })
    })

  worksheet.eachRow((row, rowNumber) => {
    if ([1, 2, 3].includes(rowNumber)) return

    row.eachCell((cell, columnNumber) => {
      cell.font = {
        name: 'Aptos',
        size: 11,
        bold: columnNumber === 1 && rowNumber !== 4,
        color: { argb: 'FF243447' }
      }
      cell.alignment = { vertical: 'top', wrapText: true }

      if (rowNumber % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5FA' }
        }
      }
    })
  })

  worksheet.views = [{ state: 'frozen', ySplit: 4 }]
  worksheet.headerFooter.oddFooter = 'Confidential | Page &P of &N'

  return worksheet
}

async function buildBomCsv(bom) {
  if (!bom) throw new Error('A BOM record is required for CSV export')

  const data = plainBom(bom)
  const rows = []

  for (const row of getSummaryRows(data)) {
    rows.push({
      Section: 'Request Summary',
      Resource: '',
      Detail: row.Detail,
      Value: row.Value
    })
  }

  const { vpcRows, ec2Rows, storageRows } = getResourceRows(data)

  for (const row of [...vpcRows, ...ec2Rows, ...storageRows]) {
    rows.push({
      Section: row.Section,
      Resource: row.Resource,
      Detail: row.Setting,
      Value: row.Value
    })
  }

  const pricingRows = await getPricingRows(data)

  for (const row of pricingRows) {
    rows.push({
      Section: 'Pricing',
      Resource: row.Resource,
      Detail: `${row.Component} - ${row.Status}`,
      Value: [
        row.Region,
        row.Currency,
        row.UnitRate,
        row.Unit,
        row['Monthly Hours'],
        row.Quantity,
        row['Monthly Cost'],
        row.Details
      ].filter(hasValue).join(' | ')
    })
  }

  return buildCsv(rows)
}

async function buildBomXlsx(bom) {
  if (!bom) throw new Error('A BOM record is required for Excel export')

  const data = plainBom(bom)
  const workbook = new ExcelJS.Workbook()

  workbook.creator = 'Cloud Infrastructure Portal'
  workbook.subject = 'Detailed Infrastructure Bill of Materials'
  workbook.title = `Infrastructure Request ${data.ticketId || ''}`
  workbook.company = 'Cloud Infrastructure Portal'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.description = 'Detailed infrastructure configuration report'

  createOverviewSheet(workbook, data)

  const inventoryColumns = [
    { header: 'Resource Number', key: 'Resource Number' },
    { header: 'Resource Name', key: 'Resource Name' },
    { header: 'Resource Type', key: 'Resource Type' },
    { header: 'Cloud Provider', key: 'Cloud Provider' },
    { header: 'Region', key: 'Region' },
    { header: 'Resource Key', key: 'Resource Key' },
    { header: 'Instance Type', key: 'Instance Type' },
    { header: 'CPU', key: 'CPU' },
    { header: 'RAM', key: 'RAM' },
    { header: 'Quantity', key: 'Quantity' },
    { header: 'Operating System', key: 'Operating System' },
    { header: 'Billing Model', key: 'Billing Model' },
    { header: 'Resource Status', key: 'Resource Status' }
  ]

  createTableSheet(
    workbook,
    'Resource Inventory',
    'RESOURCE INVENTORY',
    'All infrastructure resources included in this request',
    inventoryColumns,
    getResourceInventoryRows(data)
  )

  const {
    vpcRows,
    ec2Rows,
    storageRows,
    subnetRows,
    securityRows
  } = getResourceRows(data)

  const detailColumns = [
    { header: 'Resource', key: 'Resource' },
    { header: 'Configuration Area', key: 'Section' },
    { header: 'Setting', key: 'Setting' },
    { header: 'Selected Value', key: 'Value' }
  ]

  createTableSheet(
    workbook,
    'VPC & Networking',
    'VPC & NETWORKING CONFIGURATION',
    'VPC settings, gateway configuration, DNS, tenancy and route table details',
    detailColumns,
    vpcRows
  )

  const subnetColumns = [
    { header: 'VPC Resource', key: 'Resource' },
    { header: 'Subnet Number', key: 'Subnet Number' },
    { header: 'Subnet Name', key: 'Subnet Name' },
    { header: 'Resource Key', key: 'Resource Key' },
    { header: 'Subnet Type', key: 'Subnet Type' },
    { header: 'CIDR Block', key: 'CIDR Block' },
    { header: 'Subnet ID', key: 'Subnet ID' },
    { header: 'Availability Zone', key: 'Availability Zone' },
    { header: 'Map Public IP on Launch', key: 'Map Public IP on Launch' }
  ]

  createTableSheet(
    workbook,
    'Subnets',
    'SUBNET CONFIGURATION',
    'Individual subnet settings and network allocation details',
    subnetColumns,
    subnetRows
  )

  createTableSheet(
    workbook,
    'EC2 & Security',
    'COMPUTE & SECURITY CONFIGURATION',
    'EC2 specifications, instance networking, IAM and security group settings',
    detailColumns,
    ec2Rows
  )

  const securityColumns = [
    { header: 'Resource', key: 'Resource' },
    { header: 'Rule Type', key: 'Rule Type' },
    { header: 'Rule Number', key: 'Rule Number' },
    { header: 'Protocol', key: 'Protocol' },
    { header: 'From Port', key: 'From Port' },
    { header: 'To Port', key: 'To Port' },
    { header: 'CIDR', key: 'CIDR' },
    { header: 'Description', key: 'Description' }
  ]

  createTableSheet(
    workbook,
    'Security Group Rules',
    'SECURITY GROUP RULES',
    'Ingress and egress rules saved for EC2 security groups',
    securityColumns,
    securityRows
  )

  createTableSheet(
    workbook,
    'Storage',
    'STORAGE CONFIGURATION',
    'Root storage and additional EBS volume settings',
    detailColumns,
    storageRows
  )

  const pricingRows = await getPricingRows(data)

  const pricingColumns = [
    { header: 'Resource', key: 'Resource' },
    { header: 'Component', key: 'Component' },
    { header: 'Region', key: 'Region' },
    { header: 'Status', key: 'Status' },
    { header: 'Currency', key: 'Currency' },
    { header: 'Unit', key: 'Unit' },
    { header: 'Unit Rate', key: 'UnitRate' },
    { header: 'Monthly Hours', key: 'Monthly Hours' },
    { header: 'Quantity', key: 'Quantity' },
    { header: 'Estimated Monthly Cost', key: 'Monthly Cost' },
    { header: 'Details', key: 'Details' }
  ]

  const pricingWorksheet = createTableSheet(
    workbook,
    'Pricing',
    'COST & PRICING DETAILS',
    'Saved pricing breakdown or pricing lookup results, with calculation status',
    pricingColumns,
    pricingRows
  )

  pricingWorksheet.getColumn(7).numFmt = '#,##0.000000'
  pricingWorksheet.getColumn(10).numFmt = '#,##0.00'

  const terraform = data.terraformExecution || {}

  const workflowRows = [
    { Detail: 'Request Status', Value: data.status },
    { Detail: 'Engineer Remarks', Value: data.engineerRemarks },
    { Detail: 'Reviewed By', Value: data.reviewedBy?.name || data.reviewedBy },
    { Detail: 'Terraform Generation', Value: terraform.generation },
    { Detail: 'Terraform Init', Value: terraform.init },
    { Detail: 'Terraform Validation', Value: terraform.validation },
    { Detail: 'Terraform Plan', Value: terraform.plan },
    { Detail: 'Terraform Plan Type', Value: terraform.planType },
    { Detail: 'Terraform Folder', Value: terraform.terraformFolder },
    { Detail: 'Terraform Executed At', Value: terraform.executedAt }
  ].filter((row) => hasValue(row.Value))
    .map((row) => ({
      Detail: row.Detail,
      Value: displayValue(row.Value)
    }))

  createTableSheet(
    workbook,
    'Approval & Terraform',
    'APPROVAL & TERRAFORM EXECUTION',
    'Approval workflow and Terraform execution status',
    [
      { header: 'Workflow Detail', key: 'Detail' },
      { header: 'Saved Value', key: 'Value' }
    ],
    workflowRows
  )

  createTableSheet(
    workbook,
    'Complete Configuration',
    'COMPLETE SAVED CONFIGURATION',
    'All saved BOM fields and nested configuration values in readable paths',
    [
      { header: 'Configuration Path', key: 'Configuration Path' },
      { header: 'Saved Value', key: 'Saved Value' }
    ],
    getCompleteConfigurationRows(data)
  )

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && cell.value.length > 500) {
          cell.alignment = { vertical: 'top', wrapText: true }
          row.height = 45
        }
      })
    })
  })

  return workbook.xlsx.writeBuffer()
}

module.exports = {
  buildBomCsv,
  buildBomXlsx
}
