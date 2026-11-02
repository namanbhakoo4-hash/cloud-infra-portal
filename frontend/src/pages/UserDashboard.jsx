
import { useEffect, useRef, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import './UserDashboard.css'

import './ExistingSubnetButtons.css'

const API = 'http://localhost:5000'

const PROVIDERS = {

  aws: 'Amazon Web Services (AWS)',

  azure: 'Microsoft Azure',

  gcp: 'Google Cloud Platform'

}

const CIDR_PREFIXES = Array.from({ length: 21 }, (_, index) => index + 8)

const EBS_TYPES = [

  ['gp3', 'General Purpose SSD (gp3)'],

  ['gp2', 'General Purpose SSD (gp2)'],

  ['standard', 'Magnetic (standard)']

]

const authHeaders = () => ({

  Authorization: `Bearer ${localStorage.getItem('token')}`

})

const awsId = (value, prefix) =>

  new RegExp(`^${prefix}-[a-fA-F0-9]{8}([a-fA-F0-9]{9})?$`).test(

    String(value || '')

  )

const newKey = () =>

  `resource_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

const newSubnet = (type = 'private', ipv4Cidr = '') => ({

  resourceKey: newKey(),

  name: '',

  availabilityZone: '',

  ipv4Cidr,

  usableIpCount: usableIpsForCidr(ipv4Cidr),

  subnetType: type,

  mapPublicIpOnLaunch: false

})

const newVpc = () => ({

  resourceKey: newKey(),

  service: 'VPC',

  resourceName: '',

  vpcConfiguration: {

    mode: 'new',


    name: '',

    ipv4Cidr: '10.0.0.0/16',

    ipv6Mode: 'none',

    tenancy: 'default',

    enableDnsSupport: true,

    enableDnsHostnames: true,

    subnets: [
      { ...newSubnet('public', '10.0.1.0/24'), availabilityZone: 'ap-south-1a' },
      { ...newSubnet('private', '10.0.2.0/24'), availabilityZone: 'ap-south-1b' }
    ],

    subnetConfiguration: 'public-private',

    createInternetGateway: false,

    natGatewayMode: 'none',

    existingVpcId: '',

    existingSubnets: [{ resourceKey: newKey(), subnetId: '', subnetType: 'private' }],

    existingRouteTableId: ''

  }

})

const newEc2 = () => ({

  resourceKey: newKey(),

  service: 'EC2',

  resourceName: '',

  cpu: '',

  ram: '',

  instanceType: '',

  operatingSystem: 'Linux',

  operatingSystemType: 'Ubuntu 22.04 LTS',

  storage: 20,

  storageType: 'gp3',

  quantity: 1,

  ec2Configuration: {

    instanceName: '',

    instanceType: '',

    keyPairName: '',

    operatingSystem: 'Linux',

    operatingSystemType: 'Ubuntu 22.04 LTS',

    quantity: 1,

    network: {

      vpcSource: 'existing',

      vpcResourceKey: '',

      vpcId: '',

      subnetResourceKey: '',

      subnetId: '',

      associatePublicIpAddress: false,

      securityGroupMode: 'existing',

      securityGroupIds: [],

      securityGroup: {

        name: '',

        description: '',

        ingressRules: [],

        egressRules: []

      }

    },

    instanceProfileMode: 'none',

    instanceProfileName: ''

  },

  ebsVolumes: []

})

const newBlankResource = () => ({

  resourceKey: newKey(),

  service: '',

  resourceName: ''

})

function parseCidr(value) {

  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(

    String(value || '')

  )

  if (!match) return null

  const octets = match[1].split('.').map(Number)

  const prefix = Number(match[2])

  if (

    octets.some((number) => number < 0 || number > 255) ||

    prefix < 0 ||

    prefix > 32

  ) {

    return null

  }

  const address = octets.reduce(

    (value, octet) => ((value << 8) | octet) >>> 0,

    0

  )

  const mask = prefix === 0

    ? 0

    : (0xffffffff << (32 - prefix)) >>> 0

  const start = (address & mask) >>> 0

  if (start !== address) return null

  return {

    start,

    end: (start | (~mask >>> 0)) >>> 0,

    prefix

  }

}

function intToIp(number) {
  return [24, 16, 8, 0]
    .map((shift) => (number >>> shift) & 255)
    .join('.')
}

function usableIpsForCidr(cidrValue) {
  const cidr = parseCidr(cidrValue)
  if (!cidr) return 251
  return Math.max(0, (2 ** (32 - cidr.prefix)) - 5)
}

function prefixForUsableIps(usableIps, vpcPrefix) {
  const requested = Number(usableIps)
  if (!Number.isInteger(requested) || requested < 11) return null

  for (let prefix = Math.max(8, Number(vpcPrefix) || 16); prefix <= 28; prefix += 1) {
    if ((2 ** (32 - prefix)) - 5 >= requested) return prefix
  }

  return null
}

function allocateSubnetCidr(vpcCidrValue, subnetList, prefix, excludeIndex = -1) {
  const vpc = parseCidr(vpcCidrValue)
  if (!vpc || !Number.isInteger(Number(prefix)) || Number(prefix) < vpc.prefix || Number(prefix) > 28) {
    return ''
  }

  const blockSize = 2 ** (32 - Number(prefix))
  const occupied = (subnetList || [])
    .filter((_, index) => index !== excludeIndex)
    .map((subnet) => parseCidr(subnet.ipv4Cidr))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  let candidate = Math.ceil(vpc.start / blockSize) * blockSize

  while (candidate + blockSize - 1 <= vpc.end) {
    const conflict = occupied.find((item) =>
      candidate <= item.end && item.start <= candidate + blockSize - 1
    )

    if (!conflict) {
      return `${intToIp(candidate >>> 0)}/${prefix}`
    }

    candidate = Math.ceil((conflict.end + 1) / blockSize) * blockSize
  }

  return ''
}

function validateResources(resources, region, instanceTypes) {

  const keys = new Set()

  const vpcs = new Map()

  const subnets = new Map()

  for (const [index, resource] of resources.entries()) {

    const label = `Resource ${index + 1}`

    if (!['VPC', 'EC2'].includes(resource.service)) {

      return `${label}: select Amazon VPC or Amazon EC2.`

    }

    if (keys.has(resource.resourceKey)) {

      return `${label}: duplicate resource key.`

    }

    keys.add(resource.resourceKey)

    if (resource.service !== 'VPC') continue

    const config = resource.vpcConfiguration

    if (config.mode === 'existing') {

      if (!awsId(config.existingVpcId, 'vpc')) {
        return `${label}: enter a valid existing VPC ID.`
      }

      if (!Array.isArray(config.existingSubnets) || config.existingSubnets.length === 0) {
        return `${label}: add at least one existing subnet ID.`
      }

      for (const [subnetIndex, subnet] of config.existingSubnets.entries()) {
        if (!awsId(subnet.subnetId, 'subnet')) {
          return `${label}: enter a valid subnet ID for existing subnet ${subnetIndex + 1}.`
        }
        if (!subnet.resourceKey) {
          return `${label}: an existing subnet is missing its resource key.`
        }
        if (subnets.has(subnet.resourceKey)) {
          return `${label}: duplicate existing subnet entry.`
        }
        subnets.set(subnet.resourceKey, {
          vpcKey: resource.resourceKey,
          type: subnet.subnetType || 'private'
        })
      }

      if (config.existingRouteTableId && !awsId(config.existingRouteTableId, 'rtb')) {
        return `${label}: enter a valid existing route table ID or leave it blank.`
      }

      vpcs.set(resource.resourceKey, resource)

      continue

    }

    const vpcCidr = parseCidr(config.ipv4Cidr)

    if (!vpcCidr || vpcCidr.prefix < 16 || vpcCidr.prefix > 28) {

      return `${label}: enter a valid VPC CIDR (/16 to /28).`

    }

    const subnetList = config.subnets || []
const previousCidrs = []

    let hasPublicSubnet = false

    for (const [subnetIndex, subnet] of subnetList.entries()) {

      const subnetLabel = `${label}, subnet ${subnetIndex + 1}`

      const cidr = parseCidr(subnet.ipv4Cidr)

      if (!cidr || cidr.prefix < vpcCidr.prefix || cidr.prefix > 28) {

        return `${subnetLabel}: enter a valid subnet CIDR within the VPC prefix range.`

      }

      const requestedUsableIps = Number(subnet.usableIpCount)

      if (
        !Number.isInteger(requestedUsableIps) ||
        requestedUsableIps < 11 ||
        requestedUsableIps > usableIpsForCidr(subnet.ipv4Cidr)
      ) {

        return `${subnetLabel}: enter a usable IP requirement between 11 and the capacity of its selected CIDR.`

      }

      if (

        cidr.start < vpcCidr.start ||

        cidr.end > vpcCidr.end

      ) {

        return `${subnetLabel}: CIDR must be inside the VPC.`

      }

      if (previousCidrs.some(

        (other) =>

          cidr.start <= other.end && other.start <= cidr.end

      )) {

        return `${subnetLabel}: subnet CIDRs overlap.`

      }

      previousCidrs.push(cidr)

      if (!new RegExp(`^${region}[a-z]$`).test(

        subnet.availabilityZone

      )) {

        return `${subnetLabel}: select an availability zone.`

      }

      if (subnets.has(subnet.resourceKey)) {

        return `${subnetLabel}: duplicate subnet key.`

      }

      if (subnet.subnetType === 'public') {

        hasPublicSubnet = true

      }

      subnets.set(subnet.resourceKey, {

        vpcKey: resource.resourceKey,

        type: subnet.subnetType

      })

    }

    if (hasPublicSubnet && !config.createInternetGateway) {

      return `${label}: public subnets require an internet gateway.`

    }

    if (

      config.natGatewayMode === 'single' &&

      (!hasPublicSubnet || !config.createInternetGateway)

    ) {

      return `${label}: NAT requires a public subnet and internet gateway.`

    }

    vpcs.set(resource.resourceKey, resource)

  }

  for (const [index, resource] of resources.entries()) {

    if (resource.service !== 'EC2') continue

    const label = `Resource ${index + 1}`

    const config = resource.ec2Configuration

    const network = config.network

    if (!instanceTypes.some(

      (item) => item.value === resource.instanceType

    )) {

      return `${label}: select an EC2 instance type.`

    }

    if (

      !Number.isInteger(Number(resource.quantity)) ||

      Number(resource.quantity) < 1 ||

      Number(resource.quantity) > 100

    ) {

      return `${label}: quantity must be between 1 and 100.`

    }

    if (

      !Number.isInteger(Number(resource.storage)) ||

      Number(resource.storage) < 1

    ) {

      return `${label}: enter a valid root EBS storage size.`

    }

    if (network.vpcSource === 'bom') {

      const vpc = vpcs.get(network.vpcResourceKey)

      const subnet = subnets.get(network.subnetResourceKey)

      if (!vpc) {
        return `${label}: select a VPC resource in this BOM.`
      }

      if (!subnet || subnet.vpcKey !== network.vpcResourceKey) {

        return `${label}: select a subnet belonging to that VPC.`

      }

      if (

        subnet.type === 'private' &&

        network.associatePublicIpAddress

      ) {

        return `${label}: public IP is disabled for private subnets.`

      }

    } else {

      if (!awsId(network.vpcId, 'vpc')) {

        return `${label}: enter an existing VPC ID.`

      }

      if (!awsId(network.subnetId, 'subnet')) {

        return `${label}: enter an existing subnet ID.`

      }

    }

    if (network.securityGroupMode === 'new') {

      const securityGroup = network.securityGroup || {}

      if (!/^[A-Za-z0-9._-]{1,255}$/.test(securityGroup.name || '')) {

        return `${label}: enter a valid security group name (letters, numbers, dots, underscores or hyphens).`

      }

      if (!String(securityGroup.description || '').trim()) {

        return `${label}: enter a security group description.`

      }

      for (const [direction, rules] of [

        ['inbound', securityGroup.ingressRules || []],

        ['outbound', securityGroup.egressRules || []]

      ]) {

        for (const [ruleIndex, rule] of rules.entries()) {

          const ruleLabel = `${label}: ${direction} rule ${ruleIndex + 1}`

          if (!rule.protocol || !String(rule.cidr || '').trim()) {

            return `${ruleLabel}: select a protocol and enter a CIDR destination/source.`

          }

          if (rule.protocol === 'tcp' || rule.protocol === 'udp') {

            const fromPort = Number(rule.fromPort)

            const toPort = Number(rule.toPort)

            if (

              !Number.isInteger(fromPort) ||

              !Number.isInteger(toPort) ||

              fromPort < 1 ||

              toPort > 65535 ||

              fromPort > toPort

            ) {

              return `${ruleLabel}: enter a valid port range between 1 and 65535.`

            }

          }

          if (!parseCidr(rule.cidr)) {

            return `${ruleLabel}: enter a valid IPv4 CIDR.`

          }

        }

      }

    } else if (

      (network.securityGroupIds || []).some(

        (id) => !awsId(id, 'sg')

      )

    ) {

      return `${label}: enter valid security group IDs.`

    }

    if (

      config.instanceProfileMode === 'existing' &&

      !/^[A-Za-z0-9+=,.@_-]+$/.test(

        config.instanceProfileName

      )

    ) {

      return `${label}: enter a valid IAM instance profile name.`

    }

  }

  return ''

}

function Field({ label, children }) {

  return (

    <div className="user-form-field">

      <label>{label}</label>

      {children}

    </div>

  )

}

function UserDashboard() {

  const navigate = useNavigate()

  const pricingRequest = useRef(0)

  const [user, setUser] = useState(null)

  const [boms, setBoms] = useState([])

  const [loading, setLoading] = useState(true)

  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  const [editingBomId, setEditingBomId] = useState(null)

  const [cloudProvider, setCloudProvider] = useState('aws')

  const [projectName, setProjectName] = useState('')

  const [environment, setEnvironment] = useState('Development')

  const [region, setRegion] = useState('')

  const [justification, setJustification] = useState('')

  const [regions, setRegions] = useState([])

  const [instanceTypes, setInstanceTypes] = useState([])

  const [masterDataLoading, setMasterDataLoading] = useState(false)

  const [resources, setResources] = useState([newBlankResource()])

  const [addedResourceKeys, setAddedResourceKeys] = useState([])

  const [activeIndex, setActiveIndex] = useState(0)

  const [pricing, setPricing] = useState({

    status: 'Idle',

    data: null,

    message: ''

  })

  const active = resources[activeIndex]

  const isEc2 = active?.service === 'EC2'

  const isVpc = active?.service === 'VPC'

  const vpcOptions = resources.filter(

    (item) =>

      item.service === 'VPC'

  )

  const selectedVpc = vpcOptions.find(

    (item) =>

      item.resourceKey ===

      active?.ec2Configuration?.network?.vpcResourceKey

  )

  const selectedSubnets = selectedVpc
    ? selectedVpc.vpcConfiguration?.mode === 'existing'
      ? (selectedVpc.vpcConfiguration.existingSubnets || []).map((subnet, index) => ({
          resourceKey: subnet.resourceKey,
          name: subnet.name || `Existing subnet ${index + 1}`,
          subnetType: subnet.subnetType || 'private'
        }))
      : selectedVpc.vpcConfiguration?.subnets || []
    : []

  const cpuOptions = [...new Set(

    instanceTypes.map((item) => Number(item.cpu))

      .filter((value) => value > 0)

  )].sort((a, b) => a - b)

  const ramOptions = [...new Set(

    instanceTypes.map((item) => Number(item.ram))

      .filter((value) => value > 0)

  )].sort((a, b) => a - b)

  const filteredMatchingInstances = instanceTypes.filter((item) =>

    (!active?.cpu || Number(item.cpu) === Number(active.cpu)) &&

    (!active?.ram || Number(item.ram) === Number(active.ram))

  )

  const matchingInstances = filteredMatchingInstances

  function updateActive(changes) {

    setResources((previous) =>

      previous.map((item, index) =>

        index === activeIndex ? { ...item, ...changes } : item

      )

    )

  }

  function updateVpc(changes) {

    updateActive({

      vpcConfiguration: {

        ...active.vpcConfiguration,

        ...changes

      }

    })

  }

  function updateEc2(changes) {

    updateActive({

      ec2Configuration: {

        ...active.ec2Configuration,

        ...changes

      }

    })

  }

  function updateEc2Network(changes) {

    updateEc2({

      network: {

        ...active.ec2Configuration.network,

        ...changes

      }

    })

  }

  function updateSubnet(index, changes) {
    const currentSubnets = active.vpcConfiguration.subnets || []
    const currentSubnet = currentSubnets[index]
    let updatedSubnet = { ...currentSubnet, ...changes }

    if (Object.prototype.hasOwnProperty.call(changes, 'usableIpCount')) {
      const requested = changes.usableIpCount
      const prefix = prefixForUsableIps(requested, parseCidr(active.vpcConfiguration.ipv4Cidr)?.prefix)

      if (prefix) {
        const ipv4Cidr = allocateSubnetCidr(
          active.vpcConfiguration.ipv4Cidr,
          currentSubnets,
          prefix,
          index
        )
        updatedSubnet = {
          ...updatedSubnet,
          ipv4Cidr
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'ipv4Cidr')) {
      updatedSubnet.usableIpCount = usableIpsForCidr(changes.ipv4Cidr)
    }

    updateVpc({
      subnets: currentSubnets.map((item, itemIndex) =>
        itemIndex === index ? updatedSubnet : item
      )
    })
  }

  function selectService(service) {

    const resourceKey = active.resourceKey

    const next = service === 'VPC'

      ? newVpc()

      : service === 'EC2'

        ? newEc2()

        : newBlankResource()

    updateActive({

      ...next,

      resourceKey

    })

  }

  function updatePreference(field, value) {

    const updated = { ...active, [field]: value }

    const matches = instanceTypes.filter((item) =>

      (!updated.cpu || Number(item.cpu) === Number(updated.cpu)) &&

      (!updated.ram || Number(item.ram) === Number(updated.ram))

    )

    const instanceType = matches[0]?.value || ''

    updateActive({

      [field]: value,

      instanceType,

      ec2Configuration: {

        ...active.ec2Configuration,

        instanceType

      }

    })

  }

  async function downloadBomCsv(bom) {
    try {
      setMessage('')

      const response = await fetch(
        `${API}/api/bom/${bom._id}/export.csv`,
        {
          headers: authHeaders()
        }
      )

      if (!response.ok) {
        let errorMessage = 'Unable to download BOM CSV.'

        try {
          const data = await response.json()
          errorMessage = data.message || errorMessage
        } catch {
          errorMessage = 'Unable to download BOM CSV.'
        }

        throw new Error(errorMessage)
      }

      const csvBlob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(csvBlob)
      const link = document.createElement('a')

      link.href = downloadUrl
      link.download = `BOM-${String(bom.ticketId || bom._id).replace(/[^A-Za-z0-9_-]/g, '_')}.csv`

      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      setMessage(error.message || 'Unable to download BOM CSV.')
    }
  }

  async function loadBoms() {

    try {

      const response = await fetch(`${API}/api/bom/my`, {

        headers: authHeaders()

      })

      const data = await response.json()

      if (!response.ok) {

        throw new Error(data.message || 'Unable to load BOMs.')

      }

      setBoms(Array.isArray(data) ? data : [])

    } catch (error) {

      setMessage(error.message)

    }

  }

  async function loadMasterData(

    provider = 'aws',

    selectedRegion = ''

  ) {

    setMasterDataLoading(true)

    try {

      const categories = ['region', 'instanceType']

      const results = await Promise.all(

        categories.map(async (category) => {

          const response = await fetch(

            `${API}/api/master-data/category/${category}?cloudProvider=${provider}`,

            { headers: authHeaders(), cache: 'no-store' }

          )

          const data = await response.json()

          if (!response.ok) {

            throw new Error(

              data.message || 'Unable to load master data.'

            )

          }

          return (data.masterData || []).filter(

            (item) => item.cloudProvider === provider

          )

        })

      )

      setRegions(results[0])

      setInstanceTypes(results[1])

      setRegion(

        results[0].some((item) => item.value === selectedRegion)

          ? selectedRegion

          : results[0][0]?.value || ''

      )

    } catch (error) {

      setMessage(error.message)

    } finally {

      setMasterDataLoading(false)

    }

  }

  useEffect(() => {

    async function initialize() {

      const token = localStorage.getItem('token')

      if (!token) {

        navigate('/', { replace: true })

        return

      }

      try {

        const response = await fetch(

          `${API}/api/auth/profile`,

          { headers: authHeaders() }

        )

        const data = await response.json()

        if (!response.ok || data.user?.role !== 'user') {

          localStorage.removeItem('token')

          navigate('/', { replace: true })

          return

        }

        setUser(data.user)

        await Promise.all([

          loadBoms(),

          loadMasterData('aws')

        ])

      } catch (error) {

        setMessage(error.message)

      } finally {

        setLoading(false)

      }

    }

    initialize()

  }, [])

  useEffect(() => {

    const requestId = ++pricingRequest.current

    if (

      !showForm ||

      !isEc2 ||

      !region ||

      !active.instanceType

    ) {

      setPricing({

        status: 'Idle',

        data: null,

        message: ''

      })

      return

    }

    const controller = new AbortController()

    setPricing({

      status: 'Loading',

      data: null,

      message: ''

    })

    const timer = setTimeout(async () => {

      try {

        const response = await fetch(

          `${API}/api/pricing/estimate`,

          {

            method: 'POST',

            headers: {

              'Content-Type': 'application/json'

            },

            body: JSON.stringify({

              cloudProvider,

              region,

              instanceType: active.instanceType,

              operatingSystem: active.operatingSystem,

              quantity: Number(active.quantity),

              storage: Number(active.storage),

              storageType: active.storageType

            }),

            signal: controller.signal

          }

        )

        const data = await response.json()

        if (requestId !== pricingRequest.current) return

        setPricing({

          status: response.ok &&

            data.status === 'Available'

              ? 'Available'

              : 'Unavailable',

          data: response.ok ? data : null,

          message: data.message || ''

        })

      } catch (error) {

        if (error.name !== 'AbortError') {

          setPricing({

            status: 'Unavailable',

            data: null,

            message: 'Pricing service unavailable.'

          })

        }

      }

    }, 350)

    return () => {

      clearTimeout(timer)

      controller.abort()

    }

  }, [

    showForm,

    activeIndex,

    active?.service,

    active?.instanceType,

    active?.operatingSystem,

    active?.quantity,

    active?.storage,

    active?.storageType,

    region,

    cloudProvider

  ])

  function resetForm() {

    setCloudProvider('aws')

    setProjectName('')

    setEnvironment('Development')

    setJustification('')

    setResources([newBlankResource()])

    setActiveIndex(0)

    setEditingBomId(null)

    setPricing({ status: 'Idle', data: null, message: '' })

    setMessage('')

  }

  function createNew() {

    resetForm()

    setShowForm(true)

    window.scrollTo({ top: 0, behavior: 'smooth' })

  }

  async function editBom(bom) {

    resetForm()

    const savedResources = (bom.resources || []).map(

      (resource) => {

        if (resource.service === 'VPC') {

          const defaults = newVpc()

          return {

            ...defaults,

            ...resource,

            vpcConfiguration: {

              ...defaults.vpcConfiguration,

              ...resource.vpcConfiguration,

              subnets: (resource.vpcConfiguration?.subnets || defaults.vpcConfiguration.subnets).map((subnet) => ({
                ...subnet,
                usableIpCount: subnet.usableIpCount ?? usableIpsForCidr(subnet.ipv4Cidr)
              }))

            }

          }

        }

        if (resource.service === 'EC2') {

          const defaults = newEc2()

          return {

            ...defaults,

            ...resource,

            ec2Configuration: {

              ...defaults.ec2Configuration,

              ...resource.ec2Configuration,

              operatingSystemType: resource.ec2Configuration?.operatingSystemType || resource.operatingSystemType || (resource.operatingSystem === 'Windows' ? 'Windows Server 2022' : 'Ubuntu 22.04 LTS'),

              network: {

                ...defaults.ec2Configuration.network,

                ...resource.ec2Configuration?.network

              }

            }

          }

        }

        return resource

      }

    )

    setProjectName(bom.projectName || '')

    setEnvironment(bom.environment || 'Development')

    setJustification(bom.justification || '')

    setCloudProvider(bom.cloudProvider || 'aws')

    setResources(savedResources.length

      ? savedResources

      : [newBlankResource()]

    )

    setEditingBomId(bom._id)

    setShowForm(true)

    await loadMasterData(bom.cloudProvider || 'aws', bom.region)

    window.scrollTo({ top: 0, behavior: 'smooth' })

  }

  function buildPayload() {

    return {

      cloudProvider,

      projectName: projectName.trim(),

      environment,

      region,

      justification: justification.trim(),

      resources: resources.filter((item) => addedResourceKeys.includes(item.resourceKey) && ['VPC', 'EC2'].includes(item.service)).map((item) => {

        if (item.service === 'VPC') {

          return {

            resourceKey: item.resourceKey,

            resourceName: item.vpcConfiguration?.name || item.vpcConfiguration?.existingVpcId || item.resourceName || 'VPC',

            service: 'VPC',

            vpcConfiguration: item.vpcConfiguration

          }

        }

        const instance = instanceTypes.find(

          (entry) => entry.value === item.instanceType

        )

        return {

          resourceKey: item.resourceKey,

          resourceName: item.resourceName,

          service: 'EC2',

          instanceType: item.instanceType,

          cpu: Number(instance.cpu),

          ram: Number(instance.ram),

          operatingSystem: item.operatingSystem,

          operatingSystemType: item.ec2Configuration.operatingSystemType || item.operatingSystemType || (item.operatingSystem === 'Windows' ? 'Windows Server 2022' : 'Ubuntu 22.04 LTS'),

          storage: Number(item.storage),

          storageType: item.storageType,

          quantity: Number(item.quantity),

          ec2Configuration: {

            ...item.ec2Configuration,

            instanceName:

              item.ec2Configuration.instanceName ||

              item.resourceName,

            instanceType: item.instanceType,

            operatingSystem: item.operatingSystem,

            operatingSystemType: item.ec2Configuration.operatingSystemType || item.operatingSystemType || (item.operatingSystem === 'Windows' ? 'Windows Server 2022' : 'Ubuntu 22.04 LTS'),

            quantity: Number(item.quantity)

          },

          ebsVolumes: []

        }

      })

    }

  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return

    setMessage('')

    try {
      if (cloudProvider !== 'aws') {
        throw new Error('Only AWS BOM submission is enabled.')
      }

      const missingProjectInformation = []
      if (!projectName.trim()) missingProjectInformation.push('Project Name')
      if (!region) missingProjectInformation.push('AWS Region')
      if (!justification.trim()) missingProjectInformation.push('Justification')

      if (missingProjectInformation.length > 0) {
        throw new Error(`Please complete the following required field${missingProjectInformation.length > 1 ? 's' : ''}: ${missingProjectInformation.join(', ')}.`)
      }

      const configuredResources = resources.filter(
        (item) => addedResourceKeys.includes(item.resourceKey) && ['VPC', 'EC2'].includes(item.service)
      )

      if (configuredResources.length === 0) {
        throw new Error('Add at least one configured VPC or EC2 resource before submitting the BOM.')
      }

      const validationError = validateResources(
        configuredResources,
        region,
        instanceTypes
      )

      if (validationError) {
        throw new Error(validationError)
      }

      setSubmitting(true)
      const editing = Boolean(editingBomId)
      const response = await fetch(
        editing
          ? `${API}/api/bom/${editingBomId}/resubmit`
          : `${API}/api/bom`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(buildPayload())
        }
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'BOM submission failed.')
      }

      const ticketId = data.bom?.ticketId
      resetForm()
      setShowForm(false)
      await loadBoms()
      setMessage(
        editing
          ? 'BOM updated and resubmitted successfully.'
          : `BOM submitted successfully. Ticket: ${ticketId || 'created'}`
      )
    } catch (error) {
      setMessage(error?.message || 'BOM submission failed. Check that the backend is running and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function renderVpcForm() {

    const config = active.vpcConfiguration

    return (

      <>

        <div className="user-form-section-title">

          Amazon VPC Configuration

        </div>

        <div className="user-form-grid">

          <Field label="VPC Option">

            <select

              value={config.mode}

              onChange={(e) =>

                updateVpc({ mode: e.target.value })

              }

            >

              <option value="new">Create New VPC</option>

              <option value="existing">Reference Existing VPC</option>

            </select>

          </Field>

          {config.mode === 'existing' ? (

            <>
              <Field label="Existing VPC ID *">
                <input
                  value={config.existingVpcId}
                  onChange={(e) => updateVpc({ existingVpcId: e.target.value })}
                  placeholder="vpc-0123456789abcdef0"
                />
              </Field>
              <Field label="Existing Route Table ID (Optional)">
                <input
                  value={config.existingRouteTableId || ''}
                  onChange={(e) => updateVpc({ existingRouteTableId: e.target.value })}
                  placeholder="rtb-0123456789abcdef0"
                />
              </Field>
              <div className="user-form-field existing-subnets-section" style={{ gridColumn: '1 / -1' }}>
                <label>Existing Subnets *</label>

                <div className="existing-subnets-list">
                  {(config.existingSubnets || []).map((subnet, index) => (
                    <div className="existing-subnet-item" key={subnet.resourceKey || index}>
                      <div className="user-form-grid">
                        <Field label={`Subnet ${index + 1} ID *`}>
                          <input
                            value={subnet.subnetId || ''}
                            onChange={(e) => updateVpc({
                              existingSubnets: (config.existingSubnets || []).map((item, itemIndex) =>
                                itemIndex === index ? { ...item, subnetId: e.target.value } : item
                              )
                            })}
                            placeholder="subnet-0123456789abcdef0"
                          />
                        </Field>

                        <Field label="Subnet Type">
                          <select
                            value={subnet.subnetType || 'private'}
                            onChange={(e) => updateVpc({
                              existingSubnets: (config.existingSubnets || []).map((item, itemIndex) =>
                                itemIndex === index ? { ...item, subnetType: e.target.value } : item
                              )
                            })}
                          >
                            <option value="private">Private</option>
                            <option value="public">Public</option>
                          </select>
                        </Field>
                      </div>

                      <div className="existing-subnet-item-actions">
                        <button
                          type="button"
                          className="existing-subnet-remove"
                          onClick={() => updateVpc({
                            existingSubnets: (config.existingSubnets || []).filter(
                              (_, itemIndex) => itemIndex !== index
                            )
                          })}
                        >
                          <span className="existing-subnet-button-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="m19 6-1 14H6L5 6" />
                              <path d="M10 11v5M14 11v5" />
                            </svg>
                          </span>
                          Remove subnet
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="existing-subnet-add"
                  onClick={() => updateVpc({
                    existingSubnets: [
                      ...(config.existingSubnets || []),
                      { resourceKey: newKey(), subnetId: '', subnetType: 'private' }
                    ]
                  })}
                >
                  <span className="existing-subnet-button-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  Add existing subnet
                </button>
              </div>
            </>

          ) : (

            <>

              <Field label="VPC Name">

                <input

                  value={config.name}

                  onChange={(e) =>

                    updateVpc({ name: e.target.value })

                  }

                  placeholder="my-vpc"

                />

              </Field>

                            <Field label="IPv4 CIDR Prefix *">

                <select

                  value={String(config.ipv4Cidr || '10.0.0.0/16').split('/')[1] || '16'}

                  onChange={(e) =>

                    updateVpc({ ipv4Cidr: `10.0.0.0/${e.target.value}` })

                  }

                  required

                >

                  {CIDR_PREFIXES.map((prefix) => (

                    <option key={prefix} value={prefix}>/{prefix}</option>

                  ))}

                </select>

                <small>Network address is generated automatically. AWS VPCs support /16 through /28.</small>

              </Field>




            </>

          )}

        </div>

        {config.mode === 'new' && (

          <>

            <div className="user-form-section-title">

              Subnet Configuration

            </div>

            <p>

              Choose how many subnets to create and how they should be configured.

              Each subnet must have a non-overlapping CIDR within the VPC.

            </p>

            <div className="user-form-grid">

              <Field label="Number of subnets">

                <select

                  value={String(config.subnets.length || 2)}

                  onChange={(e) => {

                    const count = Number(e.target.value)

                    const currentMode = config.subnetConfiguration || (config.subnets.some((subnet) => subnet.subnetType === 'public') &&

                      config.subnets.some((subnet) => subnet.subnetType === 'private')

                      ? 'public-private'

                      : config.subnets.every((subnet) => subnet.subnetType === 'public')

                        ? 'public'

                        : 'private')

                    const nextSubnets = Array.from({ length: count }, (_, index) => {

                      const existing = config.subnets[index]

                      const subnetType = currentMode === 'public'

                        ? 'public'

                        : currentMode === 'private'

                          ? 'private'

                          : index % 2 === 0 ? 'public' : 'private'

                      return existing

                        ? { ...existing, subnetType }

                        : {

                            ...newSubnet(
                              subnetType,
                              allocateSubnetCidr(config.ipv4Cidr, config.subnets, 24)
                            ),

                            availabilityZone: `${region || 'ap-south-1'}${String.fromCharCode(97 + (index % 26))}`

                          }

                    })

                    updateVpc({

                      subnetConfiguration: currentMode,

                      subnets: nextSubnets,

                      createInternetGateway: currentMode !== 'private' || config.createInternetGateway

                    })

                  }}

                >

                  {[1, 2, 3, 4].map((count) => (

                    <option key={count} value={count}>{count}</option>

                  ))}

                </select>

              </Field>

              <Field label="Subnet configuration">

                <select

                  value={config.subnetConfiguration || (config.subnets.length && config.subnets.every((subnet) => subnet.subnetType === 'public')

                    ? 'public'

                    : config.subnets.length && config.subnets.every((subnet) => subnet.subnetType === 'private')

                      ? 'private'

                      : 'public-private')}

                  onChange={(e) => {

                    const mode = e.target.value

                    updateVpc({

                      subnetConfiguration: mode,

                      subnets: config.subnets.map((subnet, index) => ({

                        ...subnet,

                        subnetType: mode === 'public'

                          ? 'public'

                          : mode === 'private'

                            ? 'private'

                            : index % 2 === 0 ? 'public' : 'private',

                        mapPublicIpOnLaunch: false

                      })),

                      createInternetGateway: mode !== 'private' || config.createInternetGateway,

                      natGatewayMode: mode === 'private' ? 'none' : config.natGatewayMode

                    })

                  }}

                >

                  <option value="public-private">Public and private subnets</option>

                  <option value="public">All public subnets</option>

                  <option value="private">All private subnets</option>

                </select>

              </Field>

            </div>

            <div className="user-form-section-title">

              Subnet details ({config.subnets.length})

            </div>

            {config.subnets.map((subnet, index) => (

              <div

                key={subnet.resourceKey}

                className="user-panel"

                style={{ padding: 18, marginBottom: 16 }}

              >

                <h3>Subnet {index + 1}</h3>

                <div className="user-form-grid">

                  <Field label="Subnet Name">

                    <input

                      value={subnet.name}

                      onChange={(e) =>

                        updateSubnet(index, {

                          name: e.target.value

                        })

                      }

                      placeholder="public-subnet-a"

                    />

                  </Field>

                  <Field label="Subnet Type">

                    <select

                      value={subnet.subnetType}

                      onChange={(e) => {

                        const subnetType = e.target.value

                        const nextSubnets = config.subnets.map((item, itemIndex) =>

                          itemIndex === index

                            ? { ...item, subnetType, mapPublicIpOnLaunch: false }

                            : item

                        )

                        const hasPublicSubnet = nextSubnets.some((item) => item.subnetType === 'public')

                        const hasPrivateSubnet = nextSubnets.some((item) => item.subnetType === 'private')

                        updateVpc({

                          subnets: nextSubnets,

                          subnetConfiguration: hasPublicSubnet && hasPrivateSubnet

                            ? 'public-private'

                            : hasPublicSubnet ? 'public' : 'private',

                          createInternetGateway: hasPublicSubnet || config.createInternetGateway,

                          natGatewayMode: hasPublicSubnet ? config.natGatewayMode : 'none'

                        })

                      }}

                    >

                      <option value="public">Public</option>

                      <option value="private">Private</option>

                    </select>

                  </Field>

                  <Field label="Availability Zone *">

                    <input

                      value={subnet.availabilityZone}

                      onChange={(e) =>

                        updateSubnet(index, {

                          availabilityZone: e.target.value

                        })

                      }

                      placeholder={`${region || 'ap-south-1'}a`}

                    />

                  </Field>

                                    <Field label="Required Usable IPv4 Addresses *">

                    <input
                      type="number"
                      min="11"
                      step="1"
                      value={subnet.usableIpCount ?? usableIpsForCidr(subnet.ipv4Cidr)}
                      onChange={(e) =>
                        updateSubnet(index, {
                          usableIpCount: e.target.value
                        })
                      }
                      required
                    />

                    <small>AWS reserves 5 IPv4 addresses in every subnet. Minimum: 11 usable addresses.</small>

                  </Field>

                  <Field label="Subnet CIDR Prefix *">

                    <select
                      value={String(subnet.ipv4Cidr || '').split('/')[1] || '24'}
                      onChange={(e) => {
                        const prefix = Number(e.target.value)
                        const ipv4Cidr = allocateSubnetCidr(
                          config.ipv4Cidr,
                          config.subnets,
                          prefix,
                          index
                        )
                        updateSubnet(index, { ipv4Cidr })
                      }}
                      required
                    >
                      {CIDR_PREFIXES
                        .filter((prefix) => prefix >= (parseCidr(config.ipv4Cidr)?.prefix || 16))
                        .map((prefix) => (
                          <option key={prefix} value={prefix}>/{prefix}</option>
                        ))}
                    </select>

                    <small>
                      Allocated CIDR: {subnet.ipv4Cidr || 'No available CIDR block'}
                      {' · '}
                      {subnet.ipv4Cidr ? `${usableIpsForCidr(subnet.ipv4Cidr)} usable IPs` : 'Usable IP capacity unavailable'}
                    </small>

                  </Field>

                  {subnet.subnetType === 'public' && (

                    <Field label="Auto-assign Public IPv4">

                      <select

                        value={String(

                          subnet.mapPublicIpOnLaunch

                        )}

                        onChange={(e) =>

                          updateSubnet(index, {

                            mapPublicIpOnLaunch:

                              e.target.value === 'true'

                          })

                        }

                      >

                        <option value="false">Disabled</option>

                        <option value="true">Enabled</option>

                      </select>

                    </Field>

                  )}

                </div>

              </div>

            ))}

            <div

              className="user-form-grid"

              style={{ marginTop: 20 }}

            >

              <Field label="Internet Gateway">

                <select

                  value={String(config.createInternetGateway)}

                  onChange={(e) =>

                    updateVpc({

                      createInternetGateway:

                        e.target.value === 'true',

                      natGatewayMode: 'none'

                    })

                  }

                >

                  <option value="false">Do Not Create</option>

                  <option value="true">Create Internet Gateway</option>

                </select>

              </Field>

              <Field label="NAT Gateway">

                <select

                  value={config.natGatewayMode}

                  onChange={(e) =>

                    updateVpc({

                      natGatewayMode: e.target.value

                    })

                  }

                  disabled={!config.createInternetGateway}

                >

                  <option value="none">No NAT Gateway</option>

                  <option value="single">Single NAT Gateway</option>

                </select>

              </Field>

            </div>

            <p style={{ color: '#92400e', fontSize: 13 }}>

              NAT gateways and public IPv4 addresses can incur AWS

              charges. VPC creation alone does not imply internet access.

            </p>

          </>

        )}

        {config.mode === 'new' && (

          <div style={{ marginTop: 16 }}>

            <button

              type="button"

              className="user-primary-btn"

              onClick={() => setAddedResourceKeys((previous) => previous.includes(active.resourceKey) ? previous : [...previous, active.resourceKey])}

            >

              {addedResourceKeys.includes(active.resourceKey) ? 'VPC Added to Resources' : 'Add VPC to Resources'}

            </button>

          </div>

        )}

      </>

    )

  }

  function renderEc2Form() {

    const config = active.ec2Configuration

    const network = config.network

    return (

      <>

        <div className="user-form-section-title">

          Amazon EC2 Configuration

        </div>

        <div className="user-form-grid">

          <Field label="EC2 Resource Name">

            <input

              value={active.resourceName}

              onChange={(e) =>

                updateActive({ resourceName: e.target.value })

              }

              placeholder="web-server"

            />

          </Field>

          <Field label="CPU Preference">

            <select

              value={active.cpu}

              onChange={(e) =>

                updatePreference('cpu', e.target.value)

              }

            >

              <option value="">Any CPU</option>

              {cpuOptions.map((value) => (

                <option key={value} value={value}>

                  {value} vCPU

                </option>

              ))}

            </select>

          </Field>

          <Field label="RAM Preference">

            <select

              value={active.ram}

              onChange={(e) =>

                updatePreference('ram', e.target.value)

              }

            >

              <option value="">Any RAM</option>

              {ramOptions.map((value) => (

                <option key={value} value={value}>

                  {value} GB

                </option>

              ))}

            </select>

          </Field>

          <Field label="EC2 Instance Type *">

            <select

              value={active.instanceType}

              onChange={(e) => {

                const value = e.target.value

                updateActive({

                  instanceType: value,

                  ec2Configuration: {

                    ...config,

                    instanceType: value

                  }

                })

              }}

            >

              <option value="">{matchingInstances.length ? 'Select Instance Type' : 'No instances match the selected CPU/RAM preferences'}</option>

              {matchingInstances.map((item) => (

                <option key={item.value} value={item.value}>

                  {item.name} — {item.cpu} vCPU / {item.ram} GB

                </option>

              ))}

            </select>

          </Field>

          <Field label="Operating System">

            <select

              value={active.operatingSystem}

              onChange={(e) => {

                const operatingSystem = e.target.value

                const operatingSystemType = operatingSystem === 'Windows'
                  ? 'Windows Server 2022'
                  : 'Ubuntu 22.04 LTS'

                updateActive({

                  operatingSystem,

                  operatingSystemType,

                  ec2Configuration: {

                    ...config,

                    operatingSystem,

                    operatingSystemType

                  }

                })

              }}

            >

              <option value="Linux">Linux</option>

              <option value="Windows">Windows</option>

            </select>

          </Field>

          <Field label="Type">

            <select

              value={config.operatingSystemType || active.operatingSystemType || (active.operatingSystem === 'Windows' ? 'Windows Server 2022' : 'Ubuntu 22.04 LTS')}

              onChange={(e) => {

                const operatingSystemType = e.target.value

                updateActive({

                  operatingSystemType,

                  ec2Configuration: {

                    ...config,

                    operatingSystemType

                  }

                })

              }}

            >

              {active.operatingSystem === 'Windows' ? (

                <>

                  <option value="Windows 10">Windows 10</option>

                  <option value="Windows 11">Windows 11</option>

                  <option value="Windows Server 2019">Windows Server 2019</option>

                  <option value="Windows Server 2022">Windows Server 2022</option>

                  <option value="Windows Server 2025">Windows Server 2025</option>

                </>

              ) : (

                <>

                  <option value="Ubuntu 22.04 LTS">Ubuntu 22.04 LTS</option>

                  <option value="Ubuntu 24.04 LTS">Ubuntu 24.04 LTS</option>

                  <option value="Kali Linux">Kali Linux</option>

                  <option value="Amazon Linux 2023">Amazon Linux 2023</option>

                  <option value="Amazon Linux 2">Amazon Linux 2</option>

                </>

              )}

            </select>

            {active.operatingSystem === 'Windows' && ['Windows 10', 'Windows 11'].includes(config.operatingSystemType || active.operatingSystemType) && (

              <small>Windows 10/11 requires an approved custom AMI. Standard AWS Windows Server images are selected automatically.</small>

            )}

          </Field>

          <Field label="EC2 Key Pair Name">

            <input

              value={config.keyPairName}

              onChange={(e) =>

                updateEc2({ keyPairName: e.target.value })

              }

              placeholder="Optional existing key pair"

            />

          </Field>

          <Field label="Root EBS Size (GiB)">

            <input

              type="number"

              min="1"

              value={active.storage}

              onChange={(e) =>

                updateActive({

                  storage: e.target.value

                })

              }

            />

          </Field>

          <Field label="Root EBS Type">

            <select

              value={active.storageType}

              onChange={(e) =>

                updateActive({

                  storageType: e.target.value

                })

              }

            >

              {EBS_TYPES.map(([value, name]) => (

                <option key={value} value={value}>

                  {name}

                </option>

              ))}

            </select>

          </Field>

          <Field label="Quantity">

            <input

              type="number"

              min="1"

              max="100"

              value={active.quantity}

              onChange={(e) =>

                updateActive({

                  quantity: e.target.value

                })

              }

            />

          </Field>

        </div>

        <div className="user-form-section-title">

          EC2 Networking

        </div>

        <p>

          EC2 must use a subnet from a VPC resource in this BOM

          or an existing AWS subnet.

        </p>

        <div className="user-form-grid">

          <Field label="VPC Source">

            <select

              value={network.vpcSource}

              onChange={(e) =>

                updateEc2Network({

                  vpcSource: e.target.value,

                  vpcResourceKey: '',

                  subnetResourceKey: '',

                  vpcId: '',

                  subnetId: '',

                  associatePublicIpAddress: false

                })

              }

            >

              <option value="existing">

                Existing AWS VPC and Subnet

              </option>

              <option value="bom">

                VPC Created in This BOM

              </option>

            </select>

          </Field>

          {network.vpcSource === 'bom' ? (

            <>

              <Field label="Select BOM VPC *">

                <select

                  value={network.vpcResourceKey}

                  onChange={(e) =>

                    updateEc2Network({

                      vpcResourceKey: e.target.value,

                      subnetResourceKey: '',

                      associatePublicIpAddress: false

                    })

                  }

                >

                  <option value="">Select VPC</option>

                  {vpcOptions.map((vpc) => (

                    <option

                      key={vpc.resourceKey}

                      value={vpc.resourceKey}

                    >

                      {vpc.vpcConfiguration?.name ||

                        vpc.vpcConfiguration?.existingVpcId ||

                        vpc.resourceName ||

                        vpc.resourceKey}

                    </option>

                  ))}

                </select>

              </Field>

              <Field label="Select BOM Subnet *">

                <select

                  value={network.subnetResourceKey}

                  onChange={(e) =>

                    updateEc2Network({

                      subnetResourceKey: e.target.value,

                      associatePublicIpAddress: false

                    })

                  }

                >

                  <option value="">Select Subnet</option>

                  {selectedSubnets.map((subnet) => (

                    <option

                      key={subnet.resourceKey}

                      value={subnet.resourceKey}

                    >

                      {subnet.name || subnet.resourceKey}

                      {' '}({subnet.subnetType})

                    </option>

                  ))}

                </select>

              </Field>

            </>

          ) : (

            <>

              <Field label="Existing VPC ID *">

                <input

                  value={network.vpcId}

                  onChange={(e) =>

                    updateEc2Network({

                      vpcId: e.target.value

                    })

                  }

                  placeholder="vpc-0123456789abcdef0"

                />

              </Field>

              <Field label="Existing Subnet ID *">

                <input

                  value={network.subnetId}

                  onChange={(e) =>

                    updateEc2Network({

                      subnetId: e.target.value

                    })

                  }

                  placeholder="subnet-0123456789abcdef0"

                />

              </Field>

            </>

          )}

          <Field label="Assign Public IPv4">

            <select

              value={String(

                network.associatePublicIpAddress

              )}

              onChange={(e) =>

                updateEc2Network({

                  associatePublicIpAddress:

                    e.target.value === 'true'

                })

              }

              disabled={

                network.vpcSource === 'bom' &&

                selectedSubnets.find(

                  (item) =>

                    item.resourceKey === network.subnetResourceKey

                )?.subnetType === 'private'

              }

            >

              <option value="false">No</option>

              <option value="true">Yes</option>

            </select>

          </Field>

          <Field label="Security Group Configuration">

            <select

              value={network.securityGroupMode || 'existing'}

              onChange={(e) =>

                updateEc2Network({

                  securityGroupMode: e.target.value,

                  securityGroupIds: e.target.value === 'existing'

                    ? network.securityGroupIds || []

                    : [],

                  securityGroup: network.securityGroup || {

                    name: '',

                    description: '',

                    ingressRules: [],

                    egressRules: []

                  }

                })

              }

            >

              <option value="existing">Use Existing Security Group</option>

              <option value="new">Create New Security Group</option>

            </select>

            <small>

              Choose an existing AWS security group or define a new one for this EC2 resource.

            </small>

          </Field>

          {(network.securityGroupMode || 'existing') === 'existing' ? (

            <Field label="Existing Security Group IDs">

              <input

                value={(network.securityGroupIds || []).join(', ')}

                onChange={(e) =>

                  updateEc2Network({

                    securityGroupIds: e.target.value

                      .split(',')

                      .map((item) => item.trim())

                      .filter(Boolean)

                  })

                }

                placeholder="sg-0123456789abcdef0"

              />

              <small>

                Enter one or more existing security group IDs, separated by commas.

              </small>

            </Field>

          ) : (

            <div className="user-panel" style={{ gridColumn: '1 / -1', padding: 18 }}>

              <div className="user-form-section-title">New Security Group Details</div>

              <div className="user-form-grid">

                <Field label="Security Group Name *">

                  <input

                    value={network.securityGroup?.name || ''}

                    maxLength="255"

                    onChange={(e) => updateEc2Network({

                      securityGroup: {

                        ...(network.securityGroup || {}),

                        name: e.target.value

                      }

                    })}

                    placeholder="web-application-sg"

                  />

                </Field>

                <Field label="Description *">

                  <input

                    value={network.securityGroup?.description || ''}

                    onChange={(e) => updateEc2Network({

                      securityGroup: {

                        ...(network.securityGroup || {}),

                        description: e.target.value

                      }

                    })}

                    placeholder="Security group for the web application"

                  />

                </Field>

              </div>

              {[

                ['ingressRules', 'Inbound Rules', 'Source'],

                ['egressRules', 'Outbound Rules', 'Destination']

              ].map(([field, title, endpointLabel]) => (

                <div key={field} style={{ marginTop: 18 }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>

                    <h3>{title}</h3>

                    <button

                      type="button"

                      className="user-secondary-btn"

                      onClick={() => updateEc2Network({

                        securityGroup: {

                          ...(network.securityGroup || {}),

                          [field]: [

                            ...(network.securityGroup?.[field] || []),

                            {

                              protocol: 'tcp',

                              fromPort: '443',

                              toPort: '443',

                              cidr: '',

                              description: ''

                            }

                          ]

                        }

                      })}

                    >

                      + Add Rule

                    </button>

                  </div>

                  {(network.securityGroup?.[field] || []).length === 0 ? (

                    <p style={{ color: '#64748b', fontSize: 13 }}>

                      No {title.toLowerCase()} configured. Add rules to define permitted traffic.

                    </p>

                  ) : null}

                  {(network.securityGroup?.[field] || []).map((rule, ruleIndex) => (

                    <div key={`${field}-${ruleIndex}`} className="user-panel" style={{ padding: 14, marginBottom: 12 }}>

                      <div className="user-form-grid">

                        <Field label="Protocol">

                          <select

                            value={rule.protocol}

                            onChange={(e) => {

                              const nextRules = [...(network.securityGroup?.[field] || [])]

                              nextRules[ruleIndex] = {

                                ...rule,

                                protocol: e.target.value,

                                fromPort: e.target.value === 'tcp' || e.target.value === 'udp' ? '443' : '',

                                toPort: e.target.value === 'tcp' || e.target.value === 'udp' ? '443' : ''

                              }

                              updateEc2Network({ securityGroup: { ...network.securityGroup, [field]: nextRules } })

                            }}

                          >

                            <option value="tcp">TCP</option>

                            <option value="udp">UDP</option>

                            <option value="icmp">ICMP</option>

                            <option value="-1">All traffic</option>

                          </select>

                        </Field>

                        {(rule.protocol === 'tcp' || rule.protocol === 'udp') && (

                          <>

                            <Field label="From Port">

                              <input type="number" min="1" max="65535" value={rule.fromPort} onChange={(e) => {

                                const nextRules = [...(network.securityGroup?.[field] || [])]

                                nextRules[ruleIndex] = { ...rule, fromPort: e.target.value }

                                updateEc2Network({ securityGroup: { ...network.securityGroup, [field]: nextRules } })

                              }} />

                            </Field>

                            <Field label="To Port">

                              <input type="number" min="1" max="65535" value={rule.toPort} onChange={(e) => {

                                const nextRules = [...(network.securityGroup?.[field] || [])]

                                nextRules[ruleIndex] = { ...rule, toPort: e.target.value }

                                updateEc2Network({ securityGroup: { ...network.securityGroup, [field]: nextRules } })

                              }} />

                            </Field>

                          </>

                        )}

                        <Field label={`${endpointLabel} IPv4 CIDR *`}>

                          <input value={rule.cidr} onChange={(e) => {

                            const nextRules = [...(network.securityGroup?.[field] || [])]

                            nextRules[ruleIndex] = { ...rule, cidr: e.target.value }

                            updateEc2Network({ securityGroup: { ...network.securityGroup, [field]: nextRules } })

                          }} placeholder="10.0.0.0/16" />

                        </Field>

                        <Field label="Rule Description">

                          <input value={rule.description || ''} onChange={(e) => {

                            const nextRules = [...(network.securityGroup?.[field] || [])]

                            nextRules[ruleIndex] = { ...rule, description: e.target.value }

                            updateEc2Network({ securityGroup: { ...network.securityGroup, [field]: nextRules } })

                          }} placeholder="Allow application traffic" />

                        </Field>

                      </div>

                      <button type="button" className="user-secondary-btn" style={{ marginTop: 10 }} onClick={() => updateEc2Network({

                        securityGroup: {

                          ...network.securityGroup,

                          [field]: (network.securityGroup?.[field] || []).filter((_, index) => index !== ruleIndex)

                        }

                      })}>

                        Remove Rule

                      </button>

                    </div>

                  ))}

                </div>

              ))}

              <small style={{ display: 'block', marginTop: 12, color: '#64748b' }}>

                Use restricted CIDR ranges. Avoid 0.0.0.0/0 for administrative ports such as SSH (22) and RDP (3389).

              </small>

            </div>

          )}

        </div>

        <div className="user-form-section-title">

          IAM Instance Profile

        </div>

        <div className="user-form-grid">

          <Field label="Instance Profile">

            <select

              value={config.instanceProfileMode}

              onChange={(e) =>

                updateEc2({

                  instanceProfileMode: e.target.value

                })

              }

            >

              <option value="none">No Instance Profile</option>

              <option value="existing">

                Attach Existing Instance Profile

              </option>

            </select>

          </Field>

          {config.instanceProfileMode === 'existing' && (

            <Field label="Instance Profile Name *">

              <input

                value={config.instanceProfileName}

                onChange={(e) =>

                  updateEc2({

                    instanceProfileName: e.target.value

                  })

                }

                placeholder="MyEC2InstanceProfile"

              />

            </Field>

          )}

        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="user-primary-btn"
            onClick={() =>
              setAddedResourceKeys((previous) =>
                previous.includes(active.resourceKey)
                  ? previous
                  : [...previous, active.resourceKey]
              )
            }
          >
            {addedResourceKeys.includes(active.resourceKey)
              ? 'EC2 Added to Resources'
              : 'Add EC2 to Resources'}
          </button>
        </div>

      </>

    )

  }

  const filteredBoms = boms.filter((bom) => {

    const query = search.toLowerCase()

    return [

      bom.ticketId,

      bom.projectName,

      bom.status

    ].some((value) =>

      String(value || '').toLowerCase().includes(query)

    )

  })

  function statusClass(status) {

    if (status === 'Approved') return 'status-approved'

    if (status === 'Pending Review') return 'status-pending'

    if (status === 'Changes Requested') return 'status-changes'

    if (['Rejected', 'Plan Failed'].includes(status)) {

      return 'status-rejected'

    }

    return 'status-neutral'

  }

  if (loading) {

    return (

      <div className="user-dashboard-loading">

        Loading your CloudOps workspace...

      </div>

    )

  }

  return (

    <div className="user-dashboard">

      <header className="user-topbar">

        <div className="user-brand">

          <div className="user-brand-icon">☁</div>

          <div>

            <div className="user-brand-name">

              CloudOps Portal

            </div>

            <div className="user-brand-subtitle">

              Infrastructure Management

            </div>

          </div>

        </div>

        <div className="user-header-actions">

          <span className="user-role-label">

            User Workspace

          </span>

          <div className="user-avatar">

            {user?.name?.charAt(0)?.toUpperCase() || 'U'}

          </div>

          <button

            className="user-logout"

            onClick={() => {

              localStorage.removeItem('token')

              navigate('/', { replace: true })

            }}

          >

            Logout

          </button>

        </div>

      </header>

      <main className="user-main">

        <div className="user-welcome">

          <div>

            <div className="user-page-eyebrow">

              CLOUD INFRASTRUCTURE

            </div>

            <h1>Welcome back, {user?.name || 'User'}</h1>

            <p>

              Manage infrastructure requests and track approvals.

            </p>

          </div>



        </div>

        <div className="user-stats-grid">

          {[

            ['Total Requests', boms.length, '▤', 'icon-blue'],

            [

              'Pending Review',

              boms.filter((bom) =>

                bom.status === 'Pending Review'

              ).length,

              '◷',

              'icon-orange'

            ],

            [

              'Approved',

              boms.filter((bom) =>

                bom.status === 'Approved'

              ).length,

              '✓',

              'icon-green'

            ],

            [

              'Changes Requested',

              boms.filter((bom) =>

                bom.status === 'Changes Requested'

              ).length,

              '↻',

              'icon-purple'

            ]

          ].map(([title, value, icon, color]) => (

            <div className="user-stat-card" key={title}>

              <div className="user-stat-top">

                <span>{title}</span>

                <span className={`user-stat-icon ${color}`}>

                  {icon}

                </span>

              </div>

              <div className="user-stat-value">{value}</div>

            </div>

          ))}

        </div>

        {message && (

          <div className="user-message" role="status">

            {message}

          </div>

        )}

        {!showForm && (

          <section className="user-create-banner">

            <div className="user-create-banner-icon">☁</div>

            <div className="user-create-banner-text">

              <h2>Create Infrastructure Request</h2>

              <p>

                Configure AWS resources and submit a Bill of

                Materials for Cloud Engineer approval.

              </p>

            </div>

            <button

              className="user-primary-btn"

              onClick={createNew}

            >

              + Create New BOM

            </button>

          </section>

        )}

        {showForm && (

          <section className="user-panel user-bom-panel">

            <div className="user-panel-heading">

              <div>

                <span className="user-section-label">

                  INFRASTRUCTURE REQUEST

                </span>

                <h2>

                  {editingBomId

                    ? 'Edit and Resubmit BOM'

                    : 'Create Bill of Materials'}

                </h2>

              </div>

              <button

                type="button"

                className="user-close-btn"

                onClick={() => {

                  resetForm()

                  setShowForm(false)

                }}

              >

                ✕

              </button>

            </div>

            <form

              className="user-bom-form"

              onSubmit={handleSubmit}

              noValidate

            >

              <div className="user-form-section-title">

                Project Information

              </div>

              <div className="user-form-grid">

                <Field label="Cloud Provider">

                  <select

                    value={cloudProvider}

                    disabled={Boolean(editingBomId)}

                    onChange={async (e) => {

                      const provider = e.target.value

                      setCloudProvider(provider)

                      setResources([newBlankResource()])

                      setActiveIndex(0)

                      await loadMasterData(provider)

                    }}

                  >

                    {Object.entries(PROVIDERS).map(

                      ([value, name]) => (

                        <option key={value} value={value}>

                          {name}

                        </option>

                      )

                    )}

                  </select>

                </Field>

                <Field label="Project Name *">

                  <input

                    value={projectName}

                    onChange={(e) =>

                      setProjectName(e.target.value)

                    }

                    placeholder="E-Commerce Application"

                  />

                </Field>

                <Field label="Environment">

                  <select

                    value={environment}

                    onChange={(e) =>

                      setEnvironment(e.target.value)

                    }

                  >

                    {[

                      'Development',

                      'Testing',

                      'Staging',

                      'Production'

                    ].map((value) => (

                      <option key={value} value={value}>

                        {value}

                      </option>

                    ))}

                  </select>

                </Field>

                <Field label="AWS Region *">

                  <select

                    value={region}

                    onChange={(e) => setRegion(e.target.value)}

                    disabled={masterDataLoading}

                  >

                    {!regions.length && (

                      <option value="">No regions loaded</option>

                    )}

                    {regions.map((item) => (

                      <option

                        key={item.value}

                        value={item.value}

                      >

                        {item.name} ({item.value})

                      </option>

                    ))}

                  </select>

                </Field>

              </div>

              <div className="user-form-section-title">

                Resource Configuration

              </div>

              <div

                style={{

                  display: 'flex',

                  flexWrap: 'wrap',

                  gap: 10,

                  marginBottom: 20

                }}

              >

                {resources.map((item, index) => (

                  <button

                    key={item.resourceKey}

                    type="button"

                    className={

                      activeIndex === index

                        ? 'user-primary-btn'

                        : 'user-secondary-btn'

                    }

                    onClick={() => setActiveIndex(index)}

                  >

                    Resource {index + 1}

                    {item.service ? ` (${item.service})` : ''}

                  </button>

                ))}

              </div>

              <div

                style={{

                  padding: 20,

                  border: '1px solid #e2e8f0',

                  borderRadius: 12,

                  background: '#f8fafc',

                  marginBottom: 20

                }}

              >

                <h3>Resource {activeIndex + 1}</h3>

                <div className="user-form-grid">

                  <Field label="Cloud Service *">

                    <select

                      value={active.service}

                      onChange={(e) =>

                        selectService(e.target.value)

                      }

                    >

                      <option value="">

                        Select Cloud Service

                      </option>

                      <option value="VPC" disabled={cloudProvider !== 'aws'}>

                        Amazon VPC

                      </option>

                      <option value="EC2" disabled={cloudProvider !== 'aws'}>

                        Amazon EC2

                      </option>

                      <option disabled>Amazon EBS (Coming Soon)</option>

                      <option disabled>Amazon S3 (Coming Soon)</option>

                      <option disabled>Amazon RDS (Coming Soon)</option>

                    </select>

                  </Field>

                </div>

                {isVpc && renderVpcForm()}

                {isEc2 && renderEc2Form()}

                {!active.service && (

                  <p>Select a service to configure this resource.</p>

                )}

              </div>

              <div

                style={{

                  display: 'flex',

                  gap: 12,

                  marginBottom: 24

                }}

              >

                <button

                  type="button"

                  className="user-primary-btn"

                  onClick={() => {

                    setResources((previous) => [

                      ...previous,

                      newBlankResource()

                    ])

                    setActiveIndex(resources.length)

                  }}

                >

                  + Add New Resource

                </button>

                {resources.length > 1 && (

                  <button

                    type="button"

                    className="user-secondary-btn"

                    onClick={() => {

                      setResources((previous) =>

                        previous.filter(

                          (_, index) => index !== activeIndex

                        )

                      )

                      setActiveIndex(0)

                    }}

                  >

                    Remove Resource

                  </button>

                )}

              </div>

              <div className="user-panel" style={{ padding: 18 }}>

                <h3>Resources Added ({resources.filter((item) => addedResourceKeys.includes(item.resourceKey)).length})</h3>

                {resources.filter((item) => addedResourceKeys.includes(item.resourceKey)).map((item, index) => (

                  <div key={item.resourceKey} style={{ marginBottom: 12 }}>

                    <p>{index + 1}. {item.service || 'Not selected'} — {item.service === 'VPC' ? (item.vpcConfiguration?.name || item.vpcConfiguration?.existingVpcId || 'Unnamed VPC') : (item.resourceName || 'Unnamed resource')}</p>

                    {item.service === 'VPC' && item.vpcConfiguration?.mode === 'new' && item.vpcConfiguration.subnets.map((subnet, subnetIndex) => (

                      <p key={subnet.resourceKey} style={{ margin: '6px 0 6px 24px' }}>

                        {index + 1}.{subnetIndex + 1}. Subnet — {subnet.name || `Subnet ${subnetIndex + 1}`} ({subnet.subnetType === 'public' ? 'Public' : 'Private'}) · {subnet.availabilityZone || 'AZ not set'} · {subnet.ipv4Cidr || 'CIDR not set'}

                      </p>

                    ))}

                  </div>

                ))}

                {addedResourceKeys.length === 0 && <p>No resources added yet. Configure a VPC or EC2 resource, then add it to Resources.</p>}

              </div>

              <div className="user-form-section-title">

                Business Justification

              </div>

              <Field label="Justification *">

                <textarea

                  rows="4"

                  value={justification}

                  onChange={(e) =>

                    setJustification(e.target.value)

                  }

                  placeholder="Explain why the infrastructure is required..."

                />

              </Field>

              {isEc2 && (

                <div className="user-panel" style={{ padding: 20 }}>

                  <div className="user-form-section-title">

                    Cloud Cost Estimation

                  </div>

                  {pricing.status === 'Loading' && (

                    <p>Fetching EC2 pricing...</p>

                  )}

                  {pricing.status === 'Idle' && (

                    <p>Select an EC2 instance type to estimate cost.</p>

                  )}

                  {pricing.status === 'Unavailable' && (

                    <p>{pricing.message || 'Pricing unavailable.'}</p>

                  )}

                  {pricing.status === 'Available' &&

                    pricing.data && (

                    <>

                      <h3>

                        {Number.isFinite(

                          pricing.data.totalEstimatedMonthlyCost

                        )

                          ? new Intl.NumberFormat('en-US', {

                              style: 'currency',

                              currency:

                                pricing.data.currency || 'USD'

                            }).format(

                              pricing.data.totalEstimatedMonthlyCost

                            )

                          : 'Total estimate unavailable'}

                        {' '}/ month

                      </h3>

                      <p>

                        Instance Type: {pricing.data.instanceType}

                      </p>

                      <p>

                        Pricing Source: {pricing.data.pricingSource}

                      </p>

                      <small>

                        This estimate covers only the selected EC2

                        resource. It does not include the full BOM,

                        NAT gateway charges, or all networking costs.

                      </small>

                    </>

                  )}

                </div>

              )}

              {message && (
                <div className="user-message" role="alert" style={{ margin: '16px 0' }}>
                  {message}
                </div>
              )}
              <div className="user-form-actions">

                <button

                  type="submit"

                  className="user-primary-btn"

                  disabled={

                    submitting ||

                    masterDataLoading ||

                    cloudProvider !== 'aws' ||

                    !region

                  }

                >

                  {submitting

                    ? 'Submitting...'

                    : editingBomId

                      ? 'Resubmit BOM →'

                      : 'Submit BOM →'}

                </button>

                <button

                  type="button"

                  className="user-secondary-btn"

                  onClick={() => {

                    resetForm()

                    setShowForm(false)

                  }}

                >

                  Cancel

                </button>

              </div>

            </form>

          </section>

        )}

        <section className="user-panel">

          <div className="user-panel-heading user-history-heading">

            <div>

              <span className="user-section-label">

                REQUEST MANAGEMENT

              </span>

              <h2>My BOM Requests</h2>

              <p>Track your submitted infrastructure requests.</p>

            </div>

            <input

              type="search"

              className="user-search"

              placeholder="Search requests..."

              value={search}

              onChange={(e) => setSearch(e.target.value)}

            />

          </div>

          {filteredBoms.length ? (

            <div className="user-table-wrapper">

              <table className="user-bom-table">

                <thead>

                  <tr>

                    <th>Ticket ID</th>

                    <th>Project</th>

                    <th>Environment</th>

                    <th>Provider</th>

                    <th>Region</th>

                    <th>Resources</th>

                    <th>Status</th>

                    <th>Engineer Remarks</th>

                    <th>Action</th>

                    <th>Submitted</th>

                  </tr>

                </thead>

                <tbody>

                  {filteredBoms.map((bom) => (

                    <tr key={bom._id}>

                      <td className="user-ticket">

                        {bom.ticketId}

                      </td>

                      <td>{bom.projectName}</td>

                      <td>{bom.environment}</td>

                      <td>

                        {(bom.cloudProvider || 'aws').toUpperCase()}

                      </td>

                      <td>{bom.region}</td>

                      <td>{bom.resources?.length || 0}</td>

                      <td>

                        <span

                          className={`user-status ${statusClass(

                            bom.status

                          )}`}

                        >

                          {bom.status}

                        </span>

                      </td>

                      <td>{bom.engineerRemarks || '—'}</td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <button
                            type="button"
                            className="user-secondary-btn"
                            onClick={() => downloadBomCsv(bom)}
                          >
                            Download CSV
                          </button>

                          {bom.status === 'Changes Requested' ? (
                            <button
                              type="button"
                              className="user-edit-btn"
                              onClick={() => editBom(bom)}
                            >
                              Edit / Resubmit
                            </button>
                          ) : null}
                        </div>
                      </td>

                      <td>

                        {bom.createdAt

                          ? new Date(

                              bom.createdAt

                            ).toLocaleDateString()

                          : '—'}

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          ) : (

            <div className="user-empty-state">

              <h3>

                {search

                  ? 'No matching requests'

                  : 'No BOM requests yet'}

              </h3>

              <button

                className="user-primary-btn"

                onClick={createNew}

              >

                + Create New BOM

              </button>

            </div>

          )}

        </section>

      </main>

    </div>

  )

}

export default UserDashboard
