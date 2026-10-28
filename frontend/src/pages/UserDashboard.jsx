

import { useEffect, useRef, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import './UserDashboard.css'

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

  subnetType: type,

  mapPublicIpOnLaunch: false

})

const newVpc = () => ({

  resourceKey: newKey(),

  service: 'VPC',

  resourceName: '',

  vpcConfiguration: {

    mode: 'new',

    creationExperience: 'vpc-only',

    name: '',

    ipv4Cidr: '10.0.0.0/16',

    ipv6Mode: 'none',

    tenancy: 'default',

    enableDnsSupport: true,

    enableDnsHostnames: true,

    subnets: [],

    createInternetGateway: false,

    natGatewayMode: 'none',

    existingVpcId: ''

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

      securityGroupIds: []

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

function cidrForSubnet(vpcCidr, subnetIndex, prefix = 24) {
  const vpc = parseCidr(vpcCidr)
  if (!vpc) return `10.0.${subnetIndex + 1}.0/${prefix}`

  const blockSize = 2 ** (32 - Number(prefix))
  const start = (vpc.start + blockSize * (subnetIndex + 1)) >>> 0
  const alignedStart = Math.floor(start / blockSize) * blockSize

  return `${intToIp(alignedStart >>> 0)}/${prefix}`
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

      vpcs.set(resource.resourceKey, resource)

      continue

    }

    const vpcCidr = parseCidr(config.ipv4Cidr)

    if (!vpcCidr || vpcCidr.prefix < 16 || vpcCidr.prefix > 28) {

      return `${label}: enter a valid VPC CIDR (/16 to /28).`

    }

    const subnetList = config.subnets || []

    if (

      config.creationExperience === 'vpc-only' &&

      subnetList.length

    ) {

      return `${label}: VPC-only mode cannot include subnets.`

    }

    const previousCidrs = []

    let hasPublicSubnet = false

    for (const [subnetIndex, subnet] of subnetList.entries()) {

      const subnetLabel = `${label}, subnet ${subnetIndex + 1}`

      const cidr = parseCidr(subnet.ipv4Cidr)

      if (!cidr || cidr.prefix < 16 || cidr.prefix > 28) {

        return `${subnetLabel}: enter a valid subnet CIDR.`

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

      if (!vpc || vpc.vpcConfiguration.mode !== 'new') {

        return `${label}: select a newly created VPC in this BOM.`

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

    if (

      network.securityGroupIds.some(

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

      item.service === 'VPC' &&

      item.vpcConfiguration?.mode === 'new'

  )

  const selectedVpc = vpcOptions.find(

    (item) =>

      item.resourceKey ===

      active?.ec2Configuration?.network?.vpcResourceKey

  )

  const selectedSubnets =

    selectedVpc?.vpcConfiguration?.subnets || []

  const cpuOptions = [...new Set(

    instanceTypes.map((item) => Number(item.cpu))

      .filter((value) => value > 0)

  )].sort((a, b) => a - b)

  const ramOptions = [...new Set(

    instanceTypes.map((item) => Number(item.ram))

      .filter((value) => value > 0)

  )].sort((a, b) => a - b)

  const matchingInstances = instanceTypes.filter((item) =>

    (!active?.cpu || Number(item.cpu) === Number(active.cpu)) &&

    (!active?.ram || Number(item.ram) === Number(active.ram))

  )

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

    updateVpc({

      subnets: active.vpcConfiguration.subnets.map(

        (item, itemIndex) =>

          itemIndex === index

            ? { ...item, ...changes }

            : item

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

              ...resource.vpcConfiguration

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

      resources: resources.map((item) => {

        if (item.service === 'VPC') {

          return {

            resourceKey: item.resourceKey,

            resourceName: item.resourceName,

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

    if (cloudProvider !== 'aws') {

      setMessage('Only AWS BOM submission is enabled.')

      return

    }

    if (!projectName.trim() || !region || !justification.trim()) {

      setMessage('Complete the project information.')

      return

    }

    const validationError = validateResources(

      resources,

      region,

      instanceTypes

    )

    if (validationError) {

      setMessage(validationError)

      return

    }

    setSubmitting(true)

    setMessage('')

    try {

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

          : `BOM submitted successfully. Ticket: ${ticketId}`

      )

    } catch (error) {

      setMessage(error.message)

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

          <Field label="VPC Resource Name">

            <input

              value={active.resourceName}

              onChange={(e) =>

                updateActive({ resourceName: e.target.value })

              }

              placeholder="production-network"

            />

          </Field>

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

            <Field label="Existing VPC ID *">

              <input

                value={config.existingVpcId}

                onChange={(e) =>

                  updateVpc({ existingVpcId: e.target.value })

                }

                placeholder="vpc-0123456789abcdef0"

              />

            </Field>

          ) : (

            <>

              <Field label="Creation Experience">

                <select

                  value={config.creationExperience}

                  onChange={(e) =>

                    updateVpc({

                      creationExperience: e.target.value,

                      subnets: [],

                      createInternetGateway: false,

                      natGatewayMode: 'none'

                    })

                  }

                >

                  <option value="vpc-only">VPC Only</option>

                  <option value="vpc-and-more">VPC and More</option>

                </select>

              </Field>

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

        {config.mode === 'new' &&

          config.creationExperience === 'vpc-and-more' && (

          <>

            <div className="user-form-section-title">

              Subnet Configuration

            </div>

            <p>

              Create one or more subnets. Each subnet must have a

              non-overlapping CIDR within the VPC.

            </p>

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

                      onChange={(e) =>

                        updateSubnet(index, {

                          subnetType: e.target.value,

                          mapPublicIpOnLaunch: false,

                          ipv4Cidr: subnet.ipv4Cidr || cidrForSubnet(

                            config.ipv4Cidr,

                            index,

                            24

                          )

                        })

                      }

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

                                    <Field label="Subnet CIDR Prefix *">

                    <select

                      value={String(subnet.ipv4Cidr || '10.0.1.0/24').split('/')[1] || '24'}

                      onChange={(e) =>

                        updateSubnet(index, {

                          ipv4Cidr: cidrForSubnet(

                            config.ipv4Cidr,

                            index,

                            Number(e.target.value)

                          )

                        })

                      }

                      required

                    >

                      {CIDR_PREFIXES.map((prefix) => (

                        <option key={prefix} value={prefix}>/{prefix}</option>

                      ))}

                    </select>

                    <small>Subnet network address is generated automatically. AWS subnets support /16 through /28.</small>

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

                <button

                  type="button"

                  className="user-secondary-btn"

                  onClick={() =>

                    updateVpc({

                      subnets: config.subnets.filter(

                        (_, itemIndex) => itemIndex !== index

                      )

                    })

                  }

                >

                  Remove Subnet

                </button>

              </div>

            ))}

            <button

              type="button"

              className="user-secondary-btn"

              onClick={() =>

                updateVpc({

                  subnets: [

                    ...config.subnets,

                    newSubnet(

                      'private',

                      cidrForSubnet(config.ipv4Cidr, config.subnets.length, 24)

                    )

                  ]

                })

              }

            >

              + Add Subnet

            </button>

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

          <Field label="Instance Name">

            <input

              value={config.instanceName}

              onChange={(e) =>

                updateEc2({ instanceName: e.target.value })

              }

              placeholder="web-server-01"

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

              <option value="">Select Instance Type</option>

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

                      {vpc.resourceName ||

                        vpc.vpcConfiguration.name ||

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

          <Field label="Security Group IDs">

            <input

              value={network.securityGroupIds.join(', ')}

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

              Separate multiple existing security group IDs

              with commas.

            </small>

          </Field>

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

          <button

            className="user-primary-btn"

            onClick={createNew}

          >

            + New BOM Request

          </button>

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

                <h3>Resources Added ({resources.length})</h3>

                {resources.map((item, index) => (

                  <p key={item.resourceKey}>

                    {index + 1}. {item.service || 'Not selected'}

                    {' — '}

                    {item.resourceName || 'Unnamed resource'}

                  </p>

                ))}

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

                        {bom.status === 'Changes Requested' ? (

                          <button

                            className="user-edit-btn"

                            onClick={() => editBom(bom)}

                          >

                            Edit / Resubmit

                          </button>

                        ) : '—'}

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
