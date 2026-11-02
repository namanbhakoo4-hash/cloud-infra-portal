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

function getAmiConfiguration(operatingSystem, operatingSystemType) {
  const family = String(operatingSystem || 'Linux').trim().toLowerCase()

  const selectedType = String(
    operatingSystemType || (family === 'windows' ? 'Windows Server 2022' : 'Ubuntu 22.04 LTS')
  ).trim()

  const type = selectedType.toLowerCase()

  if (family === 'windows') {
    if (type === 'windows 10' || type === 'windows 11') {
      throw new Error(
        `${selectedType} requires an approved custom AMI in your AWS account. Standard AWS-provided EC2 images are generally Windows Server images.`
      )
    }

    const windowsVersion = /^windows server (2019|2022|2025)$/.exec(type)

    if (!windowsVersion) {
      throw new Error(`Unsupported Windows type "${selectedType}".`)
    }

    const version = windowsVersion[1]

    return {
      name: `windows_server_${version}`,
      owners: ['amazon'],
      nameFilter: `Windows_Server-${version}-English-Full-Base-*`,
      description: `Windows Server ${version}, English, x86_64`
    }
  }

  if (family !== 'linux') {
    throw new Error(`Unsupported operating system "${operatingSystem}".`)
  }

  if (type === 'amazon linux 2023' || type === 'amazon linux' || type === 'al2023') {
    return {
      name: 'amazon_linux_2023',
      owners: ['amazon'],
      nameFilter: 'al2023-ami-*-x86_64',
      description: 'Amazon Linux 2023, x86_64'
    }
  }

  if (type === 'amazon linux 2' || type === 'al2') {
    return {
      name: 'amazon_linux_2',
      owners: ['amazon'],
      nameFilter: 'amzn2-ami-hvm-*-x86_64-gp2',
      description: 'Amazon Linux 2, x86_64'
    }
  }

  if (type === 'ubuntu 22.04 lts' || type === 'ubuntu' || type === 'ubuntu 22.04') {
    return {
      name: 'ubuntu_2204',
      owners: ['099720109477'],
      nameFilter: 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*',
      description: 'Ubuntu Server 22.04 LTS, x86_64'
    }
  }

  if (type === 'ubuntu 24.04 lts' || type === 'ubuntu 24.04') {
    return {
      name: 'ubuntu_2404',
      owners: ['099720109477'],
      nameFilter: 'ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*',
      description: 'Ubuntu Server 24.04 LTS, x86_64'
    }
  }

  if (type === 'kali linux' || type === 'kali') {
    return {
      name: 'kali_linux',
      owners: ['679593333241'],
      nameFilter: '*Kali*Linux*',
      description: 'Kali Linux, x86_64'
    }
  }

  throw new Error(
    `Unsupported Linux type "${selectedType}". Supported options: Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Kali Linux, Amazon Linux 2023, Amazon Linux 2.`
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
    let vpcRef

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
      vpcRef = vpcReferences.get(vpcKey)
    } else if (source === 'existing') {
      validateId(network.vpcId, 'vpc', 'existing VPC ID')
      vpcRef = hcl(network.vpcId)

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

    const securityGroupMode = network.securityGroupMode || 'existing'
    const groups = network.securityGroupIds || []
    let securityGroupIdsExpression = '[]'

    if (securityGroupMode === 'new') {
      const securityGroup = network.securityGroup || {}

      const securityGroupName = required(
        securityGroup.name,
        'Security group name'
      )

      const securityGroupDescription = required(
        securityGroup.description,
        'Security group description'
      )

      const securityGroupLabel = terraformName(`security_group_${index + 1}`)
      const ingressRules = securityGroup.ingressRules || []
      const egressRules = securityGroup.egressRules || []

      if (!/^[A-Za-z0-9._-]{1,255}$/.test(securityGroupName)) {
        throw new Error('Security group name must contain only letters, numbers, dots, underscores, or hyphens and be 1-255 characters long')
      }

      if (!Array.isArray(ingressRules) || !Array.isArray(egressRules)) {
        throw new Error('Security group inbound and outbound rules must be arrays')
      }

      function renderSecurityGroupRule(rule, direction, ruleIndex) {
        const protocol = String(rule.protocol || '').toLowerCase()

        if (!['tcp', 'udp', 'icmp', '-1'].includes(protocol)) {
          throw new Error(`Invalid ${direction} rule protocol at position ${ruleIndex + 1}`)
        }

        const cidr = required(
          rule.cidr,
          `${direction} rule ${ruleIndex + 1} CIDR`
        )

        parseCidr(cidr)

        let ports = ''

        if (protocol === 'tcp' || protocol === 'udp') {
          const fromPort = Number(rule.fromPort)
          const toPort = Number(rule.toPort)

          if (
            !Number.isInteger(fromPort) ||
            !Number.isInteger(toPort) ||
            fromPort < 1 ||
            fromPort > 65535 ||
            toPort < 1 ||
            toPort > 65535 ||
            fromPort > toPort
          ) {
            throw new Error(`${direction} rule ${ruleIndex + 1} must have a valid port range between 1 and 65535`)
          }

          ports = `
    from_port   = ${fromPort}
    to_port     = ${toPort}`
        } else if (protocol === 'icmp') {
          ports = `
    from_port   = -1
    to_port     = -1`
        } else if (protocol === '-1') {
          ports = `
    from_port   = 0
    to_port     = 0`
        }

        if (
          direction === 'inbound' &&
          protocol === 'tcp' &&
          cidr === '0.0.0.0/0'
        ) {
          const fromPort = Number(rule.fromPort)
          const toPort = Number(rule.toPort)

          if (fromPort <= 22 && toPort >= 22) {
            warnings.push(`${name}: inbound SSH is open to 0.0.0.0/0. Restrict access to trusted IP ranges.`)
          }

          if (fromPort <= 3389 && toPort >= 3389) {
            warnings.push(`${name}: inbound RDP is open to 0.0.0.0/0. Restrict access to trusted IP ranges.`)
          }
        }

        return `
  ${direction === 'inbound' ? 'ingress' : 'egress'} {
    protocol    = ${hcl(protocol)}${ports}
    cidr_blocks = [${hcl(cidr)}]${rule.description ? `
    description = ${hcl(rule.description)}` : ''}
  }`
      }

      const ingressBlocks = ingressRules
        .map((rule, ruleIndex) => renderSecurityGroupRule(rule, 'inbound', ruleIndex))
        .join('')

      const egressBlocks = egressRules
        .map((rule, ruleIndex) => renderSecurityGroupRule(rule, 'outbound', ruleIndex))
        .join('')

      if (egressRules.length === 0) {
        warnings.push(`${name}: no outbound rules were specified. AWS will retain its default allow-all outbound rule.`)
      }

      blocks.push(`
resource "aws_security_group" "${securityGroupLabel}" {
  name        = ${hcl(securityGroupName)}
  description = ${hcl(securityGroupDescription)}
  vpc_id      = ${vpcRef}
${ingressBlocks}
${egressBlocks}
  tags = {
    Name = ${hcl(securityGroupName)}
  }
}
`)

      addPlanned('aws_security_group', securityGroupLabel, {
        securityGroupName,
        vpcSource: source,
        ingressRules: ingressRules.length,
        egressRules: egressRules.length
      })

      securityGroupIdsExpression = `[aws_security_group.${securityGroupLabel}.id]`
    } else if (securityGroupMode === 'existing') {
      if (!Array.isArray(groups)) {
        throw new Error('Security groups must be an array')
      }

      groups.forEach(group => validateId(group, 'sg', 'security group ID'))
      securityGroupIdsExpression = tfList(groups)
    } else {
      throw new Error(`Unsupported security group mode: ${securityGroupMode}`)
    }

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

    const amiConfig = getAmiConfiguration(
      config.operatingSystem || resource.operatingSystem || 'Linux',
      config.operatingSystemType || resource.operatingSystemType
    )

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

    const amiReference = `data.aws_ami.${amiLabel}.id`

    warnings.push(
      `${name}: AMI will be looked up automatically for ${config.operatingSystemType || resource.operatingSystemType || config.operatingSystem || resource.operatingSystem} in ${region}.`
    )

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
  security_group_ids          = ${securityGroupIdsExpression}
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
        amiSource: 'automatic OS type and region lookup'
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