
const crypto = require('crypto')

function parseCidr(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(value || '').trim())

  if (!match) {
    throw new Error(`Invalid CIDR: ${value || '(empty)'}`)
  }

  const octets = match[1].split('.').map(Number)
  const prefix = Number(match[2])

  if (
    octets.some((octet) => octet < 0 || octet > 255) ||
    prefix < 0 ||
    prefix > 32
  ) {
    throw new Error(`Invalid CIDR: ${value}`)
  }

  const address = octets.reduce(
    (result, octet) => ((result * 256) + octet) >>> 0,
    0
  )

  const blockSize = 2 ** (32 - prefix)
  const start = Math.floor(address / blockSize) * blockSize

  if (start !== address) {
    throw new Error(`CIDR ${value} is not a network address.`)
  }

  return {
    start,
    end: start + blockSize - 1,
    prefix,
    blockSize
  }
}

function intToIp(value) {
  const number = Number(value) >>> 0

  return [24, 16, 8, 0]
    .map((shift) => (number >>> shift) & 255)
    .join('.')
}

function overlaps(first, second) {
  return first.start <= second.end && second.start <= first.end
}

function allocateSubnets({
  vpcCidr,
  publicFirstCidr,
  publicQuantity = 0,
  privateFirstCidr,
  privateQuantity = 0,
  region,
  availabilityZones = []
}) {
  const vpc = parseCidr(vpcCidr)
  const publicCount = Number(publicQuantity)
  const privateCount = Number(privateQuantity)

  for (const [label, quantity] of [
    ['Public', publicCount],
    ['Private', privateCount]
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

  const zones = Array.isArray(availabilityZones)
    ? availabilityZones
    : []

  const usedCidrs = []
  const subnets = []

  function addSubnetGroup(type, firstCidr, quantity) {
    if (quantity === 0) return

    if (!firstCidr) {
      throw new Error(`Enter the first ${type} subnet CIDR.`)
    }

    const first = parseCidr(firstCidr)

    if (first.start < vpc.start || first.end > vpc.end) {
      throw new Error(
        `${type} subnet CIDR ${firstCidr} must be inside VPC ${vpcCidr}.`
      )
    }

    const blockSize = first.blockSize
    let candidateStart = first.start

    for (let index = 0; index < quantity; index += 1) {
      let candidate = {
        start: candidateStart,
        end: candidateStart + blockSize - 1,
        prefix: first.prefix,
        blockSize
      }

      while (usedCidrs.some((used) => overlaps(candidate, used))) {
        candidateStart += blockSize

        candidate = {
          start: candidateStart,
          end: candidateStart + blockSize - 1,
          prefix: first.prefix,
          blockSize
        }
      }

      if (
        candidate.start < vpc.start ||
        candidate.end > vpc.end ||
        candidate.end > 0xffffffff
      ) {
        throw new Error(
          `Not enough address space in VPC ${vpcCidr} to allocate ${quantity} ${type} subnets.`
        )
      }

      usedCidrs.push(candidate)

      subnets.push({
        resourceKey: `subnet_${crypto.randomBytes(6).toString('hex')}`,
        name: `${type}-subnet-${index + 1}`,
        subnetType: type.toLowerCase(),
        availabilityZone:
          zones[index % Math.max(zones.length, 1)] ||
          `${region}a`,
        ipv4Cidr: `${intToIp(candidate.start)}/${candidate.prefix}`,
        mapPublicIpOnLaunch: false
      })

      candidateStart += blockSize
    }
  }

  addSubnetGroup('Public', publicFirstCidr, publicCount)
  addSubnetGroup('Private', privateFirstCidr, privateCount)

  return subnets
}

module.exports = { allocateSubnets }
