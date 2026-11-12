

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

   const headers = [

      'Section',

      'Resource',

      'Region',

      'Service',

      'Component / Detail',

      'Value',

      'Currency',

      'Status'

   ]



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



function getCsvConfigurationSummary(resource) {

   const rows = []

   flattenConfiguration(resource, 'Resource', rows)



   return rows

      .filter((row) => row['Configuration Path'] !== 'Resource.service')

      .map((row) => `${row['Configuration Path'].replace(/^Resource\./, '')}: ${row['Saved Value']}`)

      .join('; ')

}



function getCsvResourceName(resource, index) {

   return getResourceName(resource, index)

}



function getCsvResourceIndex(pricingRow, resources) {

   if (Number.isInteger(pricingRow.resourceIndex)) {

      return pricingRow.resourceIndex

   }



   const numberedResource = String(pricingRow.Resource || '').match(/^Resource\s+(\d+)$/i)

   if (numberedResource) return Number(numberedResource[1]) - 1



   return resources.findIndex((resource, index) =>

      getCsvResourceName(resource, index) === pricingRow.Resource

   )

}



function getNumericCost(value) {

   if (value === undefined || value === null || value === '') return null

   const number = Number(value)

   return Number.isFinite(number) ? number : null

}



function formatCost(value) {

   return value === null ? '' : Number(value.toFixed(2))

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

   const resources = Array.isArray(data.resources) ? data.resources : []

   const pricingRows = await getPricingRows(data)

   const currency = data.estimatedCost?.currency ||

      pricingRows.find((row) => row.Currency)?.Currency || 'USD'

   const monthlyHours = Number(data.estimatedCost?.monthlyHours || 730)

   const generatedAt = new Date().toISOString()

   const headers = [

      'Group hierarchy',

      'Region',

      'Description',

      'Service',

      'Upfront cost',

      'Monthly cost',

      'First 12 months',

      'Currency',

      'Pricing status',

      'Configuration summary'

   ]

   const rows = []

   const add = (values = {}) => {

      rows.push(Object.fromEntries(headers.map((header) => [header, values[header] ?? ''])))

   }

   const numericCost = (value) => {

      if (value === undefined || value === null || value === '') return null

      const parsed = Number(value)

      return Number.isFinite(parsed) ? parsed : null

   }

   const money = (value) => value === null ? 'Not available' : Number(value.toFixed(2))

   const resourceName = (resource, index) => getResourceName(resource || {}, index)

   const getSubnetList = (vpc) => vpc.mode === 'existing'

      ? [...(vpc.existingSubnets || []), ...(vpc.createdSubnets || [])]

      : (vpc.subnets || [])

   const getSecurityRules = (securityGroup) => {

      const rules = []

      for (const [direction, entries] of [

         ['Inbound', securityGroup?.ingressRules],

         ['Outbound', securityGroup?.egressRules]

      ]) {

         ;(Array.isArray(entries) ? entries : []).forEach((rule) => {

            const protocol = String(rule.protocol || 'All').toLowerCase() === '-1'

               ? 'All protocols'

               : String(rule.protocol || 'All').toUpperCase()

            const from = rule.fromPort

            const to = rule.toPort

            const allPorts = (from === undefined || from === null || from === -1 || from === '-1') &&

               (to === undefined || to === null || to === -1 || to === '-1')

            const port = allPorts

               ? 'All ports'

               : from === to || to === undefined || to === null

                  ? `Port ${from}`

                  : `Ports ${from}-${to}`

            const destination = rule.cidr || rule.source || rule.destination || 'Not specified'

            rules.push(`${direction}: ${protocol}; ${port}; ${destination}${rule.description ? `; ${rule.description}` : ''}`)

         })

      }

      return rules

   }

   const configurationFor = (resource, index) => {

      const service = String(resource.service || '').toUpperCase()

      const ec2 = resource.ec2Configuration || {}

      const network = ec2.network || {}

      const vpc = resource.vpcConfiguration || {}

      const items = []

      const push = (label, value) => {

         if (hasValue(value)) items.push(`${label}: ${displayValue(value)}`)

      }



      if (service === 'EC2') {

         push('Instance type', resource.instanceType || ec2.instanceType)

         push('vCPU', resource.cpu ?? ec2.cpu)

         push('Memory', resource.ram ?? ec2.ram)

         push('Operating system', resource.operatingSystem || ec2.operatingSystem)

         push('Instance quantity', resource.quantity ?? ec2.quantity ?? 1)

         const rootSize = resource.storage ?? ec2.storage

         if (hasValue(rootSize)) push('Root volume', `${rootSize} GiB ${resource.storageType || ec2.storageType || ''}`.trim())

         const vpcResource = resources.find((candidate) =>

            String(candidate.service || '').toUpperCase() === 'VPC' &&

            candidate.resourceKey && candidate.resourceKey === network.vpcResourceKey

         )

         push('VPC', vpcResource ? getResourceName(vpcResource, resources.indexOf(vpcResource)) : (network.vpcId || network.vpcSource))

         const subnetResource = resources.find((candidate) =>

            String(candidate.service || '').toUpperCase() === 'VPC' &&

            getSubnetList(candidate.vpcConfiguration || {}).some((subnet) =>

               subnet.resourceKey === network.subnetResourceKey || subnet.subnetId === network.subnetId

            )

         )

         const matchedSubnet = subnetResource && getSubnetList(subnetResource.vpcConfiguration || {}).find((subnet) =>

            subnet.resourceKey === network.subnetResourceKey || subnet.subnetId === network.subnetId

         )

         const matchedSubnetIndex = matchedSubnet

            ? getSubnetList(subnetResource.vpcConfiguration || {}).indexOf(matchedSubnet)

            : -1

         const matchedSubnetLabel = matchedSubnet

            ? `${matchedSubnet.name || `Subnet ${matchedSubnetIndex + 1}`}${matchedSubnet.subnetType ? ` (${matchedSubnet.subnetType})` : ''}`

            : ''

         push('Subnet', matchedSubnetLabel || (network.subnetId ? `Subnet ID ${network.subnetId}` : (network.subnetResourceKey ? 'Selected subnet (name not available in saved configuration)' : '')))

         push('Public IP assignment', network.associatePublicIpAddress)

         const securityGroup = network.securityGroup || {}

         push('Security group', securityGroup.name || (Array.isArray(network.securityGroupIds) ? network.securityGroupIds.join(', ') : network.securityGroupIds))

         const securityRules = getSecurityRules(securityGroup)

         if (securityRules.length) items.push(`Security rules: ${securityRules.join(' | ')}`)

         ;(Array.isArray(resource.ebsVolumes) ? resource.ebsVolumes : []).forEach((volume, volumeIndex) => {

            items.push(`Additional volume ${volumeIndex + 1}: ${volume.name || volume.deviceName || 'EBS volume'}; ${volume.sizeGiB ?? 'Size not specified'} GiB; ${volume.volumeType || 'Type not specified'}${hasValue(volume.iops) ? `; ${volume.iops} IOPS` : ''}${hasValue(volume.throughput) ? `; ${volume.throughput} MiB/s` : ''}`)

         })

      } else if (service === 'VPC') {

         push('VPC mode', vpc.mode === 'existing' ? 'Existing VPC' : 'New VPC')

         push('VPC CIDR', vpc.ipv4Cidr || vpc.existingVpcCidr)

         push('Existing VPC ID', vpc.existingVpcId)

         push('DNS resolution', vpc.enableDnsSupport)

         push('DNS hostnames', vpc.enableDnsHostnames)

         push('Internet Gateway', vpc.createInternetGateway)

         push('NAT Gateway configuration', vpc.natGatewayMode)

         push('IPv6 configuration', vpc.ipv6Mode)

         const subnets = getSubnetList(vpc)

         subnets.forEach((subnet, subnetIndex) => {

            items.push(`Subnet ${subnetIndex + 1}: ${subnet.name || `Subnet ${subnetIndex + 1}`}; ${String(subnet.subnetType || 'type not specified').toLowerCase()}; CIDR ${subnet.ipv4Cidr || subnet.cidr || 'not specified'}${subnet.availabilityZone ? `; ${subnet.availabilityZone}` : ''}`)

         })

         ;(Array.isArray(vpc.routeTables) ? vpc.routeTables : []).forEach((routeTable, routeIndex) => {

            items.push(`Route table ${routeIndex + 1}: ${routeTable.name || 'Route table'}${routeTable.routes?.length ? `; ${routeTable.routes.map((route) => `${route.destination || route.cidr || 'Destination'} via ${route.target || route.gatewayId || 'target not specified'}`).join(', ')}` : ''}`)

         })

      } else {

         push('Quantity', resource.quantity)

         push('Configuration', resource.configuration)

      }

      return items.join(' | ') || 'No additional configuration details were saved.'

   }



   const monthlyCosts = pricingRows.map((row) => numericCost(row['Monthly Cost'])).filter((value) => value !== null)

   const computedMonthly = monthlyCosts.length

      ? Number(monthlyCosts.reduce((sum, value) => sum + value, 0).toFixed(2))

      : null

   const savedMonthly = numericCost(data.estimatedCost?.monthlyTotal)

   const monthlyTotal = savedMonthly ?? computedMonthly

   const upfrontCosts = pricingRows.map((row) => numericCost(row.UpfrontCost ?? row.upfrontCost ?? row['Upfront Cost'])).filter((value) => value !== null)

   const upfrontTotal = upfrontCosts.length

      ? Number(upfrontCosts.reduce((sum, value) => sum + value, 0).toFixed(2))

      : null

   const pricedRows = pricingRows.filter((row) => numericCost(row['Monthly Cost']) !== null)

   const unavailableRows = pricingRows.filter((row) => String(row.Status || '').toLowerCase() === 'unavailable')

   const pricedResourceIndexes = new Set(pricingRows.map((row) => getCsvResourceIndex(row, resources)).filter((index) => index >= 0))

   const hasUnpricedConfiguredResources = resources.some((resource, index) =>

      ['VPC', 'EC2'].includes(String(resource.service || '').toUpperCase()) && !pricedResourceIndexes.has(index)

   )

   const pricingStatus = !pricingRows.length || pricedRows.length === 0

      ? 'Pricing unavailable'

      : unavailableRows.length > 0 || pricedRows.length < pricingRows.length || hasUnpricedConfiguredResources

         ? 'Partially priced'

         : 'Calculated'

   const firstYearTotal = monthlyTotal === null ? null : Number((monthlyTotal * 12 + (upfrontTotal || 0)).toFixed(2))



   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Estimate name', 'Configuration summary': data.projectName || data.ticketId || 'Cloud infrastructure estimate' })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Estimate ID', 'Configuration summary': data.ticketId || '' })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Project', 'Configuration summary': data.projectName || '' })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Environment', 'Configuration summary': data.environment || '' })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Cloud provider', 'Configuration summary': data.cloudProvider || 'AWS' })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Region', 'Configuration summary': data.region || '' })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Generated on', 'Configuration summary': generatedAt })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Upfront cost', 'Upfront cost': upfrontTotal === null ? 'Not available in current pricing data' : money(upfrontTotal), Currency: currency })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Monthly cost', 'Monthly cost': money(monthlyTotal), Currency: currency })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'First 12 months', 'First 12 months': money(firstYearTotal), Currency: currency })

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Pricing status', 'Pricing status': pricingStatus })

   if (pricingStatus === 'Partially priced') {

      add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Pricing coverage', 'Configuration summary': 'Some configured resources or cost components do not have supported pricing data. Unpriced items are excluded from the displayed total and should not be interpreted as free.' })

   }

   add({ 'Group hierarchy': 'ESTIMATE SUMMARY', Description: 'Usage assumption', 'Configuration summary': `${monthlyHours} hours per month where hourly pricing applies` })



   add({ 'Group hierarchy': 'DETAILED ESTIMATE', Description: 'Resource cost breakdown', 'Configuration summary': 'Each row represents one priced component. Configuration details are listed once in the Configuration Summary section below.' })

   const resourcesWithPricing = new Set()

   pricingRows.forEach((pricingRow) => {

      const index = getCsvResourceIndex(pricingRow, resources)

      const resource = index >= 0 ? resources[index] : null

      if (index >= 0) resourcesWithPricing.add(index)

      const componentName = String(pricingRow.Component || 'Service component')

      const resourceService = String(resource?.service || pricingRow.Service || '').toUpperCase()

      const service = /storage|volume|disk/i.test(componentName) ? 'EBS' : resourceService

      const monthly = numericCost(pricingRow['Monthly Cost'])

      const upfront = numericCost(pricingRow.UpfrontCost ?? pricingRow.upfrontCost ?? pricingRow['Upfront Cost'])

      const first12 = monthly === null ? null : Number((monthly * 12 + (upfront || 0)).toFixed(2))

      const component = componentName

      const description = `${resource ? resourceName(resource, index) : (pricingRow.Resource || 'Cloud resource')} - ${component}`

      const unitRate = numericCost(pricingRow.UnitRate)

      const assumptions = [

         pricingRow.Quantity ? `Quantity: ${pricingRow.Quantity}` : '',

         unitRate !== null ? `Unit rate: ${unitRate} per ${pricingRow.Unit || 'unit'}` : '',

         pricingRow['Monthly Hours'] ? `Usage: ${pricingRow['Monthly Hours']} hours/month` : '',

         pricingRow.Details || ''

      ].filter(Boolean).join('; ')

      add({

         'Group hierarchy': service === 'EC2' ? 'Compute' : service === 'VPC' ? 'Networking' : service === 'EBS' ? 'Storage' : (service || 'Cloud services'),

         Region: resource?.region || pricingRow.Region || data.region || '',

         Description: description,

         Service: service,

         'Upfront cost': upfront === null ? 'Not included in available pricing' : money(upfront),

         'Monthly cost': money(monthly),

         'First 12 months': money(first12),

         Currency: pricingRow.Currency || currency,

         'Pricing status': pricingRow.Status || (monthly === null ? 'Unavailable' : 'Available'),

         'Configuration summary': assumptions

      })

   })



   add({ 'Group hierarchy': 'CONFIGURATION SUMMARY', Description: 'Resource configurations', 'Configuration summary': 'The following entries describe each resource once. Internal resource keys are intentionally omitted.' })

   resources.forEach((resource, index) => {

      const service = String(resource.service || '').toUpperCase()

      const group = service === 'EC2' ? 'Compute' : service === 'VPC' ? 'Networking' : service || 'Cloud resources'

      add({

         'Group hierarchy': group,

         Region: resource.region || data.region || '',

         Description: service === 'VPC' && resource.vpcConfiguration?.mode === 'existing' && resource.vpcConfiguration?.existingVpcId

            ? `Existing VPC - ${resource.vpcConfiguration.existingVpcId}`

            : resourceName(resource, index),

         Service: service,

         'Pricing status': resourcesWithPricing.has(index) ? 'See detailed estimate' : 'Configuration only - no supported price available',

         'Configuration summary': configurationFor(resource, index)

      })

   })



   add({ 'Group hierarchy': 'ACKNOWLEDGEMENT', Description: 'Pricing disclaimer', 'Configuration summary': 'This estimate is for planning purposes. Actual cloud charges may vary based on usage, selected configuration, region, pricing changes, discounts, taxes and other applicable fees. Only costs supported by the portal pricing data are included. A resource marked as not priced should not be interpreted as free.' })



   const escape = (value) => {

      let text = displayValue(value)

      if (/^[=+@-]/.test(text)) text = `'${text}`

      return `"${text.replace(/"/g, '""')}"`

   }



   return [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))]

      .map((row) => row.map(escape).join(','))

      .join('\r\n') + '\r\n'

}

async function buildBomXlsx(bom) {

   if (!bom) throw new Error('A BOM record is required for Excel export')



   const data = plainBom(bom)

   const resources = Array.isArray(data.resources) ? data.resources : []

   const pricingRows = await getPricingRows(data)

   const workbook = new ExcelJS.Workbook()



   workbook.creator = 'Cloud Infrastructure Portal'

   workbook.subject = 'AWS Pricing Calculator-style estimate'

   workbook.title = `My Estimate - ${data.ticketId || data.projectName || 'Cloud Infrastructure'}`

   workbook.company = 'Cloud Infrastructure Portal'

   workbook.created = new Date()

   workbook.modified = new Date()

   workbook.description = 'Single-sheet cloud cost estimate following the AWS Pricing Calculator export flow'



   const worksheet = workbook.addWorksheet('My Estimate', {

      properties: { defaultRowHeight: 21 },

      pageSetup: {

         orientation: 'landscape',

         fitToPage: true,

         fitToWidth: 1,

         fitToHeight: 0,

         paperSize: 9,

         margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }

      }

   })



   worksheet.views = [{ state: 'normal', showGridLines: false, zoomScale: 85 }]

   worksheet.columns = [

      { width: 22 },

      { width: 20 },

      { width: 30 },

      { width: 21 },

      { width: 17 },

      { width: 17 },

      { width: 12 },

      { width: 66 }

   ]



   const navy = 'FF232F3E'

   const awsOrange = 'FFFF9900'

   const blue = 'FF1F5B85'

   const paleBlue = 'FFEAF3F8'

   const lightGray = 'FFF3F5F7'

   const border = 'FFD5DCE3'

   const text = 'FF202B36'

   const white = 'FFFFFFFF'

   const green = 'FFE6F4EA'

   const amber = 'FFFFF3D6'



   const borderBottom = { style: 'thin', color: { argb: border } }

   const setSection = (rowNumber, title) => {

      worksheet.mergeCells(rowNumber, 1, rowNumber, 8)

      const cell = worksheet.getCell(rowNumber, 1)

      cell.value = title

      cell.font = { name: 'Aptos', size: 12, bold: true, color: { argb: white } }

      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }

      cell.alignment = { vertical: 'middle', horizontal: 'left' }

      cell.border = { bottom: { style: 'medium', color: { argb: awsOrange } } }

      worksheet.getRow(rowNumber).height = 27

   }



   const safeText = (value) => {

      if (value === undefined || value === null || value === '') return ''

      return displayValue(value)

   }

   const numeric = (value) => {

      if (value === undefined || value === null || value === '' || value === 'Not available in current pricing data') return null

      const parsed = Number(value)

      return Number.isFinite(parsed) ? parsed : null

   }

   const money = (value) => value === null ? 'Not available' : Number(value.toFixed(2))

   const currency = data.estimatedCost?.currency ||

      pricingRows.find((row) => row.Currency)?.Currency || 'USD'

   const monthlyHours = Number(data.estimatedCost?.monthlyHours || 730)



   const getSubnetList = (vpc) => vpc.mode === 'existing'

      ? [...(vpc.existingSubnets || []), ...(vpc.createdSubnets || [])]

      : (vpc.subnets || [])



   const securityRuleText = (securityGroup) => {

      const rules = []

      for (const [direction, entries] of [

         ['Inbound', securityGroup?.ingressRules],

         ['Outbound', securityGroup?.egressRules]

      ]) {

         ;(Array.isArray(entries) ? entries : []).forEach((rule) => {

            const protocol = String(rule.protocol || 'All').toLowerCase() === '-1'

               ? 'All protocols'

               : String(rule.protocol || 'All').toUpperCase()

            const from = rule.fromPort

            const to = rule.toPort

            const allPorts = (from === undefined || from === null || from === -1 || from === '-1') &&

               (to === undefined || to === null || to === -1 || to === '-1')

            const ports = allPorts

               ? 'All ports'

               : from === to || to === undefined || to === null

                  ? `Port ${from}`

                  : `Ports ${from}-${to}`

            rules.push(`${direction}: ${protocol}; ${ports}; ${rule.cidr || rule.source || rule.destination || 'Not specified'}${rule.description ? `; ${rule.description}` : ''}`)

         })

      }

      return rules

   }



   const configurationFor = (resource, index) => {

      const service = String(resource.service || '').toUpperCase()

      const ec2 = resource.ec2Configuration || {}

      const network = ec2.network || {}

      const vpc = resource.vpcConfiguration || {}

      const details = []

      const push = (label, value) => {

         if (hasValue(value)) details.push(`${label}: ${displayValue(value)}`)

      }



      if (service === 'EC2') {

         push('Instance type', resource.instanceType || ec2.instanceType)

         push('vCPU', resource.cpu ?? ec2.cpu)

         push('Memory', resource.ram ?? ec2.ram)

         push('Operating system', resource.operatingSystem || ec2.operatingSystem)

         push('Instance quantity', resource.quantity ?? ec2.quantity ?? 1)

         const rootSize = resource.storage ?? ec2.storage

         if (hasValue(rootSize)) push('Root volume', `${rootSize} GiB ${resource.storageType || ec2.storageType || ''}`.trim())



         const vpcResource = resources.find((candidate) =>

            String(candidate.service || '').toUpperCase() === 'VPC' &&

            candidate.resourceKey && candidate.resourceKey === network.vpcResourceKey

         )

         push('VPC', vpcResource

            ? getResourceName(vpcResource, resources.indexOf(vpcResource))

            : (network.vpcId || network.vpcSource))



         const subnetResource = resources.find((candidate) =>

            String(candidate.service || '').toUpperCase() === 'VPC' &&

            getSubnetList(candidate.vpcConfiguration || {}).some((subnet) =>

               subnet.resourceKey === network.subnetResourceKey || subnet.subnetId === network.subnetId

            )

         )

         const subnetList = subnetResource ? getSubnetList(subnetResource.vpcConfiguration || {}) : []

         const matchedSubnet = subnetList.find((subnet) =>

            subnet.resourceKey === network.subnetResourceKey || subnet.subnetId === network.subnetId

         )

         if (matchedSubnet) {

            const subnetIndex = subnetList.indexOf(matchedSubnet)

            push('Subnet', `${matchedSubnet.name || `Subnet ${subnetIndex + 1}`}${matchedSubnet.subnetType ? ` (${matchedSubnet.subnetType})` : ''}`)

         } else if (network.subnetId) {

            push('Subnet ID', network.subnetId)

         } else if (network.subnetResourceKey) {

            push('Subnet', 'Selected subnet (name not available in saved configuration)')

         }



         push('Public IP assignment', network.associatePublicIpAddress)

         const securityGroup = network.securityGroup || {}

         push('Security group', securityGroup.name || (Array.isArray(network.securityGroupIds) ? network.securityGroupIds.join(', ') : network.securityGroupIds))

         const rules = securityRuleText(securityGroup)

         if (rules.length) push('Security group rules', rules.join(' | '))



         ;(Array.isArray(resource.ebsVolumes) ? resource.ebsVolumes : []).forEach((volume, volumeIndex) => {

            details.push(`Additional EBS volume ${volumeIndex + 1}: ${volume.name || volume.deviceName || 'EBS volume'}; ${volume.sizeGiB ?? 'Size not specified'} GiB; ${volume.volumeType || 'Type not specified'}${hasValue(volume.iops) ? `; ${volume.iops} IOPS` : ''}${hasValue(volume.throughput) ? `; ${volume.throughput} MiB/s` : ''}`)

         })

      } else if (service === 'VPC') {

         push('VPC mode', vpc.mode === 'existing' ? 'Existing VPC' : 'New VPC')

         push('VPC CIDR', vpc.ipv4Cidr || vpc.existingVpcCidr)

         push('Existing VPC ID', vpc.existingVpcId)

         push('DNS resolution', vpc.enableDnsSupport)

         push('DNS hostnames', vpc.enableDnsHostnames)

         push('Internet Gateway', vpc.createInternetGateway)

         push('NAT Gateway configuration', vpc.natGatewayMode)

         push('IPv6 configuration', vpc.ipv6Mode)

         getSubnetList(vpc).forEach((subnet, subnetIndex) => {

            details.push(`Subnet ${subnetIndex + 1}: ${subnet.name || `Subnet ${subnetIndex + 1}`}; ${String(subnet.subnetType || 'type not specified').toLowerCase()}; CIDR ${subnet.ipv4Cidr || subnet.cidr || 'not specified'}${subnet.availabilityZone ? `; ${subnet.availabilityZone}` : ''}`)

         })

         ;(Array.isArray(vpc.routeTables) ? vpc.routeTables : []).forEach((routeTable, routeIndex) => {

            details.push(`Route table ${routeIndex + 1}: ${routeTable.name || 'Route table'}${routeTable.routes?.length ? `; ${routeTable.routes.map((route) => `${route.destination || route.cidr || 'Destination'} via ${route.target || route.gatewayId || 'target not specified'}`).join(', ')}` : ''}`)

         })

      } else {

         push('Quantity', resource.quantity)

         push('Configuration', resource.configuration)

         push('Storage', resource.storage)

         push('Storage type', resource.storageType)

      }



      return details.length ? details.join('\n') : 'No additional configuration details were saved.'

   }



   // AWS Pricing Calculator flow: estimate summary first.

   worksheet.mergeCells('A1:H1')

   worksheet.getCell('A1').value = 'My Estimate'

   worksheet.getCell('A1').font = { name: 'Aptos Display', size: 21, bold: true, color: { argb: white } }

   worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }

   worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' }

   worksheet.getRow(1).height = 39



   worksheet.mergeCells('A2:H2')

   worksheet.getCell('A2').value = `Cloud Infrastructure Portal | ${data.projectName || data.ticketId || 'Cloud infrastructure estimate'} | Generated ${new Date().toLocaleString()}`

   worksheet.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: text } }

   worksheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: paleBlue } }

   worksheet.getCell('A2').alignment = { vertical: 'middle' }

   worksheet.getRow(2).height = 25



   setSection(4, 'Estimate summary')

   const monthlyValues = pricingRows.map((row) => numeric(row['Monthly Cost'])).filter((value) => value !== null)

   const computedMonthly = monthlyValues.length

      ? Number(monthlyValues.reduce((sum, value) => sum + value, 0).toFixed(2))

      : null

   const monthlyTotal = numeric(data.estimatedCost?.monthlyTotal) ?? computedMonthly

   const upfrontValues = pricingRows.map((row) => numeric(row.UpfrontCost ?? row.upfrontCost ?? row['Upfront Cost'])).filter((value) => value !== null)

   const upfrontTotal = upfrontValues.length

      ? Number(upfrontValues.reduce((sum, value) => sum + value, 0).toFixed(2))

      : null

   const firstYearTotal = monthlyTotal === null ? null : Number((monthlyTotal * 12 + (upfrontTotal || 0)).toFixed(2))

   const pricedRows = pricingRows.filter((row) => numeric(row['Monthly Cost']) !== null)

   const unavailableRows = pricingRows.filter((row) => String(row.Status || '').toLowerCase() === 'unavailable')

   const pricedResourceIndexes = new Set(pricingRows.map((row) => getCsvResourceIndex(row, resources)).filter((index) => index >= 0))

   const hasUnpricedConfiguredResources = resources.some((resource, index) =>

      ['VPC', 'EC2'].includes(String(resource.service || '').toUpperCase()) && !pricedResourceIndexes.has(index)

   )

   const pricingStatus = !pricingRows.length || pricedRows.length === 0

      ? 'Pricing unavailable'

      : unavailableRows.length > 0 || pricedRows.length < pricingRows.length || hasUnpricedConfiguredResources

         ? 'Partially priced'

         : 'Calculated'



   const summaryHeaders = ['Upfront cost', 'Monthly cost', 'Total 12 months cost', 'Currency']

   summaryHeaders.forEach((header, index) => {

      const cell = worksheet.getCell(5, index + 1)

      cell.value = header

      cell.font = { bold: true, color: { argb: white }, size: 10 }

      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }

      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

      cell.border = { bottom: { style: 'medium', color: { argb: awsOrange } } }

   })

   worksheet.getRow(5).height = 30

   const summaryValues = [

      upfrontTotal === null ? 'Not available' : upfrontTotal,

      monthlyTotal === null ? 'Not available' : monthlyTotal,

      firstYearTotal === null ? 'Not available' : firstYearTotal,

      currency

   ]

   summaryValues.forEach((value, index) => {

      const cell = worksheet.getCell(6, index + 1)

      cell.value = value

      cell.font = { bold: true, size: 13, color: { argb: text } }

      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 2 ? green : paleBlue } }

      cell.alignment = { vertical: 'middle', horizontal: index === 3 ? 'center' : 'right' }

      cell.border = { bottom: borderBottom }

      if (index < 3 && typeof value === 'number') cell.numFmt = '#,##0.00;[Red](#,##0.00);-'

   })

   worksheet.getRow(6).height = 31



   worksheet.mergeCells('A7:H7')

   worksheet.getCell('A7').value = '* Includes upfront cost in the first 12 months total. Unpriced resources and components are excluded from the displayed estimate.'

   worksheet.getCell('A7').font = { italic: true, size: 9, color: { argb: 'FF596675' } }

   worksheet.getCell('A7').alignment = { wrapText: true, vertical: 'middle' }

   worksheet.getRow(7).height = 27



   worksheet.mergeCells('A8:H8')

   worksheet.getCell('A8').value = `Pricing status: ${pricingStatus}   |   Usage assumption: ${monthlyHours} hours per month where hourly pricing applies`

   worksheet.getCell('A8').font = { bold: true, size: 10, color: { argb: text } }

   worksheet.getCell('A8').fill = { type: 'pattern', pattern: 'solid', fgColor: pricingStatus === 'Calculated' ? green : amber }

   worksheet.getCell('A8').alignment = { wrapText: true, vertical: 'middle' }

   worksheet.getRow(8).height = 25



   // Detailed estimate follows the same ten-column order and labels as AWS CSV.

   setSection(10, 'Detailed Estimate')

   const detailHeaders = [

      'Group hierarchy', 'Region', 'Description', 'Service', 'Upfront',

      'Monthly', 'Currency', 'Configuration summary'

   ]

   detailHeaders.forEach((header, index) => {

      const cell = worksheet.getCell(11, index + 1)

      cell.value = header

      cell.font = { bold: true, color: { argb: white }, size: 10 }

      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }

      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

      cell.border = { bottom: { style: 'medium', color: { argb: awsOrange } } }

   })

   worksheet.getRow(11).height = 34



   let rowNumber = 12

   const addDetailRow = (values, options = {}) => {

      const row = worksheet.getRow(rowNumber)

      values.forEach((value, index) => {

         const cell = row.getCell(index + 1)

         cell.value = value ?? ''

         cell.font = {

            name: 'Aptos',

            size: 10,

            bold: Boolean(options.bold),

            color: { argb: options.color || text }

         }

         cell.alignment = {

            vertical: 'top',

            horizontal: [4, 5, 6].includes(index + 1) ? 'right' : 'left',

            wrapText: true

         }

         cell.border = { bottom: borderBottom }

         if (options.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } }

         else if (rowNumber % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }

         if ([5, 6].includes(index + 1) && typeof value === 'number') {

            cell.numFmt = '#,##0.00;[Red](#,##0.00);-'

         }

      })

      const configLength = String(values[7] || '').length

      row.height = Math.min(110, Math.max(30, 22 * Math.ceil(configLength / 95)))

      rowNumber += 1

   }



   const resourcesWithPricing = new Set()

   pricingRows.forEach((pricingRow) => {

      const index = getCsvResourceIndex(pricingRow, resources)

      const resource = index >= 0 ? resources[index] : null

      if (index >= 0) resourcesWithPricing.add(index)

      const component = String(pricingRow.Component || 'Service component')

      const resourceService = String(resource?.service || pricingRow.Service || '').toUpperCase()

      const service = /storage|volume|disk/i.test(component) ? 'EBS' : resourceService

      const monthly = numeric(pricingRow['Monthly Cost'])

      const upfront = numeric(pricingRow.UpfrontCost ?? pricingRow.upfrontCost ?? pricingRow['Upfront Cost'])

      const first12 = monthly === null ? null : Number((monthly * 12 + (upfront || 0)).toFixed(2))

      const description = `${resource ? getResourceName(resource, index) : (pricingRow.Resource || 'Cloud resource')} - ${component}`

      const unitRate = numeric(pricingRow.UnitRate)

      const pricingAssumptions = [

         pricingRow.Quantity ? `Pricing quantity: ${pricingRow.Quantity}` : '',

         unitRate !== null ? `Unit rate: ${unitRate} per ${pricingRow.Unit || 'unit'}` : '',

         pricingRow['Monthly Hours'] ? `Usage assumption: ${pricingRow['Monthly Hours']} hours/month` : '',

         pricingRow.Details || ''

      ].filter(Boolean)



      const resourceConfiguration = resource

         ? service === 'EBS' && resourceService === 'EC2'

            ? [

                  hasValue(resource.storage ?? resource.ec2Configuration?.storage)

                     ? `Root volume size: ${displayValue(resource.storage ?? resource.ec2Configuration?.storage)} GiB`

                     : '',

                  hasValue(resource.storageType ?? resource.ec2Configuration?.storageType)

                     ? `Root volume type: ${displayValue(resource.storageType ?? resource.ec2Configuration?.storageType)}`

                     : '',

                  hasValue(resource.quantity ?? resource.ec2Configuration?.quantity)

                     ? `Attached to EC2 instances: ${displayValue(resource.quantity ?? resource.ec2Configuration?.quantity)}`

                     : ''

               ].filter(Boolean).join('\n') || 'Root volume configuration details were not saved.'

            : configurationFor(resource, index)

         : ''

      const config = [

         resourceConfiguration,

         pricingAssumptions.length ? `Pricing assumptions:\n${pricingAssumptions.join('\n')}` : ''

      ].filter(Boolean).join('\n\n')



      addDetailRow([

         service === 'EC2' ? 'Compute' : service === 'VPC' ? 'Networking' : service === 'EBS' ? 'Storage' : (service || 'Cloud services'),

         resource?.region || pricingRow.Region || data.region || '',

         description,

         service,

         upfront === null ? 'Not available' : upfront,

         monthly === null ? 'Not available' : monthly,

         pricingRow.Currency || currency,

         config

      ])

   })



   // Keep configuration-only resources visible in the Detailed Estimate hierarchy.

   resources.forEach((resource, index) => {

      if (resourcesWithPricing.has(index)) return

      const service = String(resource.service || '').toUpperCase()

      const group = service === 'EC2' ? 'Compute' : service === 'VPC' ? 'Networking' : service || 'Cloud services'

      const description = service === 'VPC' && resource.vpcConfiguration?.mode === 'existing' && resource.vpcConfiguration?.existingVpcId

         ? `Existing VPC - ${resource.vpcConfiguration.existingVpcId}`

         : getResourceName(resource, index)

      addDetailRow([

         group,

         resource.region || data.region || '',

         description,

         service,

         'Not available',

         'Not available',

         currency,

         configurationFor(resource, index)

      ], { fill: amber })

   })



   if (rowNumber === 12) {

      addDetailRow(['My Estimate', data.region || '', 'No priced components available', data.cloudProvider || 'AWS', 'Not available', 'Not available', currency, 'No pricing rows were available for this BOM.'])

   }



   // Acknowledgement is the final section, as in the AWS export.

   rowNumber += 1

   setSection(rowNumber, 'Acknowledgement')

   rowNumber += 1

   worksheet.mergeCells(rowNumber, 1, rowNumber + 1, 8)

   const acknowledgement = worksheet.getCell(rowNumber, 1)

   acknowledgement.value = 'This estimate is for planning purposes only and does not represent a quote or guarantee of actual cloud charges. Actual fees depend on service usage, selected configuration, region, pricing changes, discounts, taxes and other applicable fees. Only costs supported by the portal pricing data are included. Resources or components marked as not priced are excluded from the displayed totals and should not be interpreted as free.'

   acknowledgement.font = { name: 'Aptos', size: 10, color: { argb: text } }

   acknowledgement.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGray } }

   acknowledgement.alignment = { vertical: 'middle', wrapText: true }

   acknowledgement.border = {

      top: borderBottom,

      bottom: borderBottom,

      left: borderBottom,

      right: borderBottom

   }

   worksheet.getRow(rowNumber).height = 38

   worksheet.getRow(rowNumber + 1).height = 28



   worksheet.autoFilter = {

      from: { row: 11, column: 1 },

      to: { row: Math.max(11, rowNumber - 2), column: 8 }

   }

   worksheet.views = [{ state: 'normal', showGridLines: false, zoomScale: 85 }]

   worksheet.freezePanes = 'A12'

   worksheet.printArea = `A1:H${rowNumber + 1}`

   worksheet.pageSetup = {

      orientation: 'landscape',

      fitToPage: true,

      fitToWidth: 1,

      fitToHeight: 0,

      paperSize: 9,

      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }

   }

   worksheet.headerFooter.oddHeader = '&BMy Estimate | Cloud Infrastructure Portal'

   worksheet.headerFooter.oddFooter = 'Estimate for planning purposes | Page &P of &N'



   return workbook.xlsx.writeBuffer()

}



module.exports = {

   buildBomCsv,

   buildBomXlsx

}
