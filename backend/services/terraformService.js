
const fs = require('fs')
const path = require('path')
const os = require('os')
const net = require('net')
const { execFileSync } = require('child_process')

const terraformRoot = path.resolve(__dirname, '../../terraform')
const generatedRoot = path.join(terraformRoot, 'generated')

const providerCache = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.terraform'),
  'terraform',
  'plugin-cache'
)

const hcl = value => JSON.stringify(String(value))
const tfBool = value => value ? 'true' : 'false'
const tfList = items => `[${items.map(hcl).join(', ')}]`

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`)
  }

  return value.trim()
}

function terraformName(value) {
  const result = String(value || 'resource')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z_]/, '_')

  return result || 'resource'
}

function parseCidr(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(
    String(value || '').trim()
  )

  if (!match || net.isIP(match[1]) !== 4) {
    throw new Error(`Invalid IPv4 CIDR: ${value}`)
  }

  const octets = match[1].split('.').map(Number)

  if (octets.some(octet => octet < 0 || octet > 255)) {
    throw new Error(`Invalid IPv4 address: ${value}`)
  }

  const prefix = Number(match[2])

  if (prefix < 0 || prefix > 32) {
    throw new Error(`Invalid CIDR prefix: ${value}`)
  }

  const address = octets.reduce(
    (acc, octet) => ((acc << 8) | octet) >>> 0,
    0
  )

  const mask = prefix === 0
    ? 0
    : (0xffffffff << (32 - prefix)) >>> 0

  const start = (address & mask) >>> 0
  const end = (start | (~mask >>> 0)) >>> 0

  if (address !== start) {
    throw new Error(`CIDR must use its network address: ${value}`)
  }

  return { start, end, prefix }
}

function validateAwsCidr(value, label) {
  const cidr = parseCidr(value)

  if (cidr.prefix < 16 || cidr.prefix > 28) {
    throw new Error(`${label} CIDR must use a prefix between /16 and /28`)
  }

  return cidr
}

function containsCidr(parent, child) {
  const a = parseCidr(parent)
  const b = parseCidr(child)

  return b.start >= a.start && b.end <= a.end
}

function overlapsCidr(first, second) {
  const a = parseCidr(first)
  const b = parseCidr(second)

  return a.start <= b.end && b.start <= a.end
}

function validateId(value, prefix, label) {
  const pattern = new RegExp(
    `^${prefix}-[a-fA-F0-9]{8}([a-fA-F0-9]{9})?$`
  )

  if (!pattern.test(String(value || ''))) {
    throw new Error(`Invalid ${label}`)
  }

  return value
}

function normalizeResourceKey(resource, index) {
  return String(resource.resourceKey || `resource_${index + 1}`)
}

function getAmiConfiguration(operatingSystem) {
  const osName = String(operatingSystem || 'Amazon Linux 2023')
    .trim()
    .toLowerCase()

  if (
    osName === 'amazon linux 2023' ||
    osName === 'amazon linux' ||
    osName === 'al2023'
  ) {
    return {
      name: 'amazon_linux_2023',
      owners: ['amazon'],
      nameFilter: 'al2023-ami-*-x86_64',
      description: 'Amazon Linux 2023, x86_64'
    }
  }

  if (osName === 'amazon linux 2' || osName === 'al2') {
    return {
      name: 'amazon_linux_2',
      owners: ['amazon'],
      nameFilter: 'amzn2-ami-hvm-*-x86_64-gp2',
      description: 'Amazon Linux 2, x86_64'
    }
  }

  if (osName === 'ubuntu' || osName.startsWith('ubuntu ')) {
    return {
      name: 'ubuntu',
      owners: ['099720109477'],
      nameFilter: 'ubuntu/images/hvm-ssd*/ubuntu-*-22.04-amd64-server-*',
      description: 'Ubuntu Server 22.04 LTS, x86_64'
    }
  }

  if (
    osName === 'windows' ||
    osName === 'windows server' ||
    osName.startsWith('windows server ')
  ) {
    return {
      name: 'windows_server',
      owners: ['amazon'],
      nameFilter: 'Windows_Server-2022-English-Full-Base-*',
      description: 'Windows Server 2022, English, x86_64'
    }
  }

  throw new Error(
    `Unsupported operating system "${operatingSystem}". ` +
    'Supported options: Amazon Linux 2023, Amazon Linux 2, Ubuntu, Windows Server.'
  )
}

function createTerraformFiles(bom) {
  if (!bom || !bom.ticketId) {
    throw new Error('A BOM with a ticket ID is required')
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(bom.ticketId)) {
    throw new Error('Invalid BOM ticket ID')
  }

  const region = required(bom.region, 'AWS region')

  if (!/^([a-z]{2}(?:-gov)?-[a-z]+-\d+)$/.test(region)) {
    throw new Error('Invalid AWS region format')
  }

  const resources = bom.resources || []

  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error('BOM must contain at least one resource')
  }

  const terraformFolder = path.join(generatedRoot, bom.ticketId)
  const blocks = []
  const plannedResources = []
  const warnings = []
  const vpcReferences = new Map()
  const subnetReferences = new Map()
  const seenKeys = new Set()
  const amiConfigurations = new Map()

  function addPlanned(type, name, details = {}) {
    plannedResources.push({
      action: 'create',
      type,
      name,
      ...details
    })
  }

  resources.forEach((resource, index) => {
    const key = normalizeResourceKey(resource, index)

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate resource key: ${key}`)
    }

    seenKeys.add(key)
  })

  // PASS 1: Generate independent VPC resources and their subnets.
  resources.forEach((resource, index) => {
    const service = String(resource.service || '').toUpperCase()

    if (service !== 'VPC') return

    const config = resource.vpcConfiguration

    if (!config) {
      throw new Error(`VPC configuration missing at resource ${index + 1}`)
    }

    const key = normalizeResourceKey(resource, index)
    const label = `vpc_${index + 1}`

    if ((config.mode || 'new') !== 'new') {
      throw new Error(
        'Only creation of a new VPC is supported by this BOM workflow.'
      )
    }

    const cidr = required(config.ipv4Cidr, 'VPC IPv4 CIDR')
    validateAwsCidr(cidr, 'VPC')

    const vpcName = resource.resourceName || `vpc-${index + 1}`

    blocks.push(`
resource "aws_vpc" "${label}" {
  cidr_block = ${hcl(cidr)}

  tags = {
    Name = ${hcl(vpcName)}
  }
}
`)

    addPlanned('aws_vpc', label, { cidr })

    const vpcRef = `aws_vpc.${label}.id`
    vpcReferences.set(key, vpcRef)

    const subnets = config.subnets || []

    if (!Array.isArray(subnets)) {
      throw new Error('VPC subnets must be an array')
    }

    const publicSubnets = []
    const privateSubnets = []
    const usedSubnetCidrs = []

    subnets.forEach((subnet, subnetIndex) => {
      const subnetKey = String(
        subnet.resourceKey || `${key}_subnet_${subnetIndex + 1}`
      )

      if (subnetReferences.has(subnetKey)) {
        throw new Error(`Duplicate subnet key: ${subnetKey}`)
      }

      const subnetCidr = required(
        subnet.ipv4Cidr,
        `Subnet ${subnetIndex + 1} CIDR`
      )

      validateAwsCidr(subnetCidr, 'Subnet')

      if (!containsCidr(cidr, subnetCidr)) {
        throw new Error(
          `Subnet ${subnetCidr} must be inside VPC ${cidr}`
        )
      }

      for (const previous of usedSubnetCidrs) {
        if (overlapsCidr(previous, subnetCidr)) {
          throw new Error(
            `Subnet CIDRs overlap: ${previous} and ${subnetCidr}`
          )
        }
      }

      usedSubnetCidrs.push(subnetCidr)

      const subnetType = String(subnet.subnetType || 'private').toLowerCase()

      if (!['public', 'private'].includes(subnetType)) {
        throw new Error(`Invalid subnet type: ${subnetType}`)
      }

      const subnetLabel = `${label}_subnet_${subnetIndex + 1}`
      const availabilityZone = required(
        subnet.availabilityZone,
        'Subnet availability zone'
      )

      if (!new RegExp(`^${region}[a-z]$`).test(availabilityZone)) {
        throw new Error(
          `Availability zone ${availabilityZone} does not match ${region}`
        )
      }

      // This validates the AZ format only. It does not confirm live
      // availability in an AWS account.
      blocks.push(`
resource "aws_subnet" "${subnetLabel}" {
  vpc_id                  = ${vpcRef}
  cidr_block              = ${hcl(subnetCidr)}
  availability_zone       = ${hcl(availabilityZone)}
  map_public_ip_on_launch = ${tfBool(
    subnetType === 'public' && subnet.mapPublicIpOnLaunch === true
  )}

  tags = {
    Name = ${hcl(`${vpcName}-${subnetType}-${subnetIndex + 1}`)}
  }
}
`)

      addPlanned('aws_subnet', subnetLabel, {
        cidr: subnetCidr,
        subnetType,
        availabilityZone
      })

      const subnetRef = `aws_subnet.${subnetLabel}.id`

      subnetReferences.set(subnetKey, {
        subnetRef,
        vpcKey: key,
        subnetType
      })

      const item = { label: subnetLabel, ref: subnetRef }

      if (subnetType === 'public') {
        publicSubnets.push(item)
      } else {
        privateSubnets.push(item)
      }
    })

    const createIgw = config.createInternetGateway === true
    const natMode = config.natGatewayMode || 'none'

    if (!['none', 'single', 'per-az'].includes(natMode)) {
      throw new Error(`Unsupported NAT gateway mode: ${natMode}`)
    }

    if (natMode !== 'none' && privateSubnets.length === 0) {
      throw new Error('A NAT Gateway requires at least one private subnet')
    }

    if (natMode !== 'none' && publicSubnets.length === 0) {
      throw new Error(
        'A NAT Gateway requires a subnet in which it can be created. ' +
        'For internet access, this must be a public subnet.'
      )
    }

    if (natMode !== 'none' && !createIgw) {
      throw new Error(
        'A NAT Gateway configured for internet access requires an ' +
        'Internet Gateway and a public subnet. Enable the Internet Gateway ' +
        'or disable the NAT Gateway. A private NAT Gateway does not provide internet access.'
      )
    }

    if (publicSubnets.length > 0 && !createIgw) {
      warnings.push(
        `${label}: public subnets were requested without an Internet Gateway. ` +
        'They will not have a route to the internet.'
      )
    }

    if (createIgw) {
      const igwLabel = `${label}_igw`
      const publicRouteLabel = `${label}_public_routes`

      blocks.push(`
resource "aws_internet_gateway" "${igwLabel}" {
  vpc_id = ${vpcRef}

  tags = {
    Name = ${hcl(`${vpcName}-igw`)}
  }
}

resource "aws_route_table" "${publicRouteLabel}" {
  vpc_id = ${vpcRef}

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.${igwLabel}.id
  }

  tags = {
    Name = ${hcl(`${vpcName}-public-routes`)}
  }
}
`)

      addPlanned('aws_internet_gateway', igwLabel)
      addPlanned('aws_route_table', publicRouteLabel)

      publicSubnets.forEach((subnet, subnetIndex) => {
        const associationLabel = `${label}_public_assoc_${subnetIndex + 1}`

        blocks.push(`
resource "aws_route_table_association" "${associationLabel}" {
  subnet_id      = ${subnet.ref}
  route_table_id = aws_route_table.${publicRouteLabel}.id
}
`)

        addPlanned('aws_route_table_association', associationLabel)
      })
    }

    if (natMode !== 'none') {
      const natSubnets = natMode === 'per-az'
        ? publicSubnets
        : [publicSubnets[0]]

      natSubnets.forEach((publicSubnet, natIndex) => {
        const suffix = natIndex + 1
        const eipLabel = `${label}_nat_eip_${suffix}`
        const natLabel = `${label}_nat_${suffix}`

        blocks.push(`
resource "aws_eip" "${eipLabel}" {
  domain = "vpc"

  tags = {
    Name = ${hcl(`${vpcName}-nat-eip-${suffix}`)}
  }
}

resource "aws_nat_gateway" "${natLabel}" {
  allocation_id = aws_eip.${eipLabel}.id
  subnet_id     = ${publicSubnet.ref}

  depends_on = [aws_internet_gateway.${label}_igw]

  tags = {
    Name = ${hcl(`${vpcName}-nat-${suffix}`)}
  }
}
`)

        addPlanned('aws_eip', eipLabel)
        addPlanned('aws_nat_gateway', natLabel, {
          connectivityType: 'public'
        })
      })

      const privateRouteLabel = `${label}_private_routes`

      blocks.push(`
resource "aws_route_table" "${privateRouteLabel}" {
  vpc_id = ${vpcRef}

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.${label}_nat_1.id
  }

  tags = {
    Name = ${hcl(`${vpcName}-private-routes`)}
  }
}
`)

      addPlanned('aws_route_table', privateRouteLabel)

      privateSubnets.forEach((subnet, subnetIndex) => {
        const associationLabel = `${label}_private_assoc_${subnetIndex + 1}`

        blocks.push(`
resource "aws_route_table_association" "${associationLabel}" {
  subnet_id      = ${subnet.ref}
  route_table_id = aws_route_table.${privateRouteLabel}.id
}
`)

        addPlanned('aws_route_table_association', associationLabel)
      })
    }
  })

  // PASS 2: Generate EC2 resources after VPC and subnet references exist.
  resources.forEach((resource, index) => {
    const service = String(resource.service || '').toUpperCase()

    if (service === 'VPC') return

    if (service !== 'EC2') {
      throw new Error(`Unsupported cloud service: ${resource.service}`)
    }

    const config = resource.ec2Configuration

    if (!config) {
      throw new Error(`EC2 configuration missing at resource ${index + 1}`)
    }

    const network = config.network || {}
    const source = network.vpcSource || 'bom'
    let subnetRef

    if (source === 'bom') {
      const vpcKey = required(
        network.vpcResourceKey,
        'BOM VPC resource key'
      )

      const subnetKey = required(
        network.subnetResourceKey,
        'BOM subnet resource key'
      )

      if (!vpcReferences.has(vpcKey)) {
        throw new Error(`VPC not found in BOM: ${vpcKey}`)
      }

      const subnet = subnetReferences.get(subnetKey)

      if (!subnet) {
        throw new Error(`Subnet not found in BOM: ${subnetKey}`)
      }

      if (subnet.vpcKey !== vpcKey) {
        throw new Error(`Subnet ${subnetKey} does not belong to VPC ${vpcKey}`)
      }

      subnetRef = subnet.subnetRef
    } else if (source === 'existing') {
      validateId(network.vpcId, 'vpc', 'existing VPC ID')
      subnetRef = hcl(
        validateId(network.subnetId, 'subnet', 'existing subnet ID')
      )
    } else {
      throw new Error('EC2 must select a BOM-created or existing VPC and subnet')
    }

    const instanceType = required(
      config.instanceType || resource.instanceType,
      'EC2 instance type'
    )

    const quantity = Number(config.quantity ?? resource.quantity ?? 1)

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error('EC2 quantity must be between 1 and 100')
    }

    const name = config.instanceName ||
      resource.resourceName ||
      `ec2-${index + 1}`

    const groups = network.securityGroupIds || []

    if (!Array.isArray(groups)) {
      throw new Error('Security groups must be an array')
    }

    groups.forEach(group => validateId(group, 'sg', 'security group ID'))

    const rootVolume = (resource.ebsVolumes || [])
      .find(volume => volume.deviceName === 'root') ||
      (resource.ebsVolumes || [])[0]

    const storageSize = Number(
      rootVolume?.sizeGiB ?? resource.storage ?? 20
    )

    const storageType = rootVolume?.volumeType ||
      resource.storageType ||
      'gp3'

    if (!Number.isInteger(storageSize) || storageSize < 1) {
      throw new Error('Root EBS storage size must be a positive integer')
    }

    if (!['gp3', 'gp2', 'io1', 'io2', 'standard'].includes(storageType)) {
      throw new Error(`Unsupported root EBS type: ${storageType}`)
    }

    if ((resource.ebsVolumes || []).length > 1) {
      throw new Error(
        'Additional EBS volumes are not supported by this EC2 generator.'
      )
    }

    const profileMode =
      config.instanceProfileMode || resource.instanceProfileMode || 'none'

    let profileRef = 'null'

    if (profileMode === 'existing') {
      profileRef = hcl(
        required(
          config.instanceProfileName || resource.instanceProfileName,
          'IAM instance profile name'
        )
      )
    } else if (profileMode !== 'none') {
      throw new Error(
        'This generator supports existing IAM instance profiles or none.'
      )
    }

    // Legacy AMI IDs remain accepted, but are not required.
    // When omitted, Terraform looks up an image by OS and region.
    const amiId = String(config.amiId || '').trim()
    let amiReference

    if (amiId) {
      if (!/^ami-[a-fA-F0-9]{8}([a-fA-F0-9]{9})?$/.test(amiId)) {
        throw new Error('Invalid EC2 AMI ID format')
      }

      amiReference = hcl(amiId)
    } else {
      const amiConfig = getAmiConfiguration(config.operatingSystem)
      const amiLabel = `ami_${terraformName(amiConfig.name)}`

      if (!amiConfigurations.has(amiLabel)) {
        amiConfigurations.set(amiLabel, amiConfig)

        blocks.push(`
data "aws_ami" "${amiLabel}" {
  most_recent = true
  owners      = ${tfList(amiConfig.owners)}

  filter {
    name   = "name"
    values = [${hcl(amiConfig.nameFilter)}]
  }

  filter {
    name   = "state"
    values = ["available"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}
`)
      }

      amiReference = `data.aws_ami.${amiLabel}.id`

      warnings.push(
        `${name}: AMI will be looked up from AWS when Terraform queries the selected region.`
      )
    }

    for (let instance = 1; instance <= quantity; instance++) {
      const moduleLabel = terraformName(`ec2_${index + 1}_${instance}`)
      const instanceName = quantity === 1 ? name : `${name}-${instance}`

      blocks.push(`
module "${moduleLabel}" {
  source = "../../modules/ec2"

  ami_id                      = ${amiReference}
  instance_type               = ${hcl(instanceType)}
  instance_name               = ${hcl(instanceName)}
  subnet_id                   = ${subnetRef}
  associate_public_ip_address = ${tfBool(
    network.associatePublicIpAddress === true
  )}
  security_group_ids          = ${tfList(groups)}
  key_pair_name               = ${
    config.keyPairName ? hcl(config.keyPairName) : 'null'
  }
  iam_instance_profile        = ${profileRef}
  storage_size                = ${storageSize}
  storage_type                = ${hcl(storageType)}
  root_volume_encrypted       = ${tfBool(rootVolume?.encrypted !== false)}
}
`)

      addPlanned('aws_instance', moduleLabel, {
        instanceName,
        instanceType,
        amiSource: amiId ? 'provided AMI ID' : 'automatic OS and region lookup'
      })
    }
  })

  const providerTf = `
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = ${hcl(region)}
}
`

  fs.mkdirSync(terraformFolder, { recursive: true })
  fs.mkdirSync(providerCache, { recursive: true })

  fs.writeFileSync(
    path.join(terraformFolder, 'provider.tf'),
    providerTf
  )

  fs.writeFileSync(
    path.join(terraformFolder, 'main.tf'),
    blocks.join('\n')
  )

  const env = {
    ...process.env,
    TF_PLUGIN_CACHE_DIR: providerCache
  }

  function runTerraform(args) {
    return execFileSync('terraform', args, {
      cwd: terraformFolder,
      env,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    })
  }

  let initOutput
  let validateOutput

  try {
    initOutput = runTerraform([
      'init',
      '-input=false',
      '-no-color'
    ])

    validateOutput = runTerraform([
      'validate',
      '-no-color'
    ])
  } catch (error) {
    throw new Error(
      `Terraform initialization or validation failed:\n${
        error.stderr?.toString() ||
        error.stdout?.toString() ||
        error.message
      }`
    )
  }

  const mockPlan = {
    ticketId: bom.ticketId,
    projectName: bom.projectName,
    cloudProvider: 'AWS',
    region,
    planType: 'SIMULATED',
    disclaimer:
      'This is an application-generated resource summary, not the output of terraform plan. No AWS resources were created.',
    summary: {
      toAdd: plannedResources.length,
      toChange: 0,
      toDestroy: 0
    },
    resources: plannedResources,
    warnings,
    generatedAt: new Date().toISOString()
  }

  fs.writeFileSync(
    path.join(terraformFolder, 'mock-plan.json'),
    JSON.stringify(mockPlan, null, 2)
  )

  return {
    terraformFolder,
    initOutput,
    validateOutput,
    mockPlan
  }
}

module.exports = {
  createTerraformFiles
}
