import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './UserDashboard.css'

const API = 'http://localhost:5000'

const PROVIDER_NAMES = {
  aws: 'Amazon Web Services (AWS)',
  azure: 'Microsoft Azure',
  gcp: 'Google Cloud Platform (GCP)'
}

const STORAGE_DEFAULTS = {
  aws: 'gp3',
  azure: 'standard-ssd-lrs',
  gcp: 'pd-balanced'
}

const INITIAL_PRICING = {
  status: 'Idle',
  data: null,
  message: ''
}

const money = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value))

const preciseMoney = (value, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 4,
    maximumFractionDigits: 8
  }).format(Number(value))

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`
})

function UserDashboard() {
  const navigate = useNavigate()

  const masterRequest = useRef(0)
  const pricingRequest = useRef(0)

  const [user, setUser] = useState(null)
  const [boms, setBoms] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingBomId, setEditingBomId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [cloudProvider, setCloudProvider] = useState('aws')
  const [masterDataLoading, setMasterDataLoading] = useState(false)

  const [regions, setRegions] = useState([])
  const [services, setServices] = useState([])
  const [instanceTypes, setInstanceTypes] = useState([])

  const [projectName, setProjectName] = useState('')
  const [environment, setEnvironment] = useState('Development')
  const [region, setRegion] = useState('')
  const [service, setService] = useState('')
  const [cpu, setCpu] = useState('')
  const [ram, setRam] = useState('')
  const [instanceType, setInstanceType] = useState('')
  const [operatingSystem, setOperatingSystem] = useState('Linux')
  const [storage, setStorage] = useState(20)
  const [storageType, setStorageType] = useState('gp3')
  const [quantity, setQuantity] = useState(1)
  const [justification, setJustification] = useState('')

  const [pricing, setPricing] = useState(INITIAL_PRICING)

  // ======================================================
  // USER PROFILE
  // ======================================================

  const getProfile = async () => {
    const response = await fetch(`${API}/api/auth/profile`, {
      headers: authHeaders()
    })

    const data = await response.json()

    if (!response.ok || data.user?.role !== 'user') {
      localStorage.removeItem('token')
      navigate('/', { replace: true })
      return
    }

    setUser(data.user)
  }

  // ======================================================
  // BOM HISTORY
  // ======================================================

  const getBoms = async () => {
    try {
      const response = await fetch(`${API}/api/bom/my`, {
        headers: authHeaders()
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load BOMs')
      }

      setBoms(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error)
      setMessage(error.message)
    }
  }

  // ======================================================
  // MASTER DATA
  // ======================================================

  const clearMasterData = () => {
    setRegions([])
    setServices([])
    setInstanceTypes([])
    setRegion('')
    setService('')
    setInstanceType('')
    setCpu('')
    setRam('')
  }

  const getMasterData = async (
    provider = 'aws',
    selectedValues = null
  ) => {
    const currentRequest = ++masterRequest.current

    setMasterDataLoading(true)
    clearMasterData()

    try {
      const categories = ['region', 'service', 'instanceType']

      const results = await Promise.all(
        categories.map(async (category) => {
          const response = await fetch(
            `${API}/api/master-data/category/${category}?cloudProvider=${encodeURIComponent(provider)}`,
            {
              headers: authHeaders(),
              cache: 'no-store'
            }
          )

          const data = await response.json()

          if (!response.ok) {
            throw new Error(
              data.message || 'Failed to load master data'
            )
          }

          return (
            Array.isArray(data.masterData)
              ? data.masterData
              : []
          ).filter((item) => item.cloudProvider === provider)
        })
      )

      if (currentRequest !== masterRequest.current) return

      const [regionList, serviceList, instanceList] = results

      setRegions(regionList)
      setServices(serviceList)
      setInstanceTypes(instanceList)

      const chosenRegion = regionList.some(
        (item) => item.value === selectedValues?.region
      )
        ? selectedValues.region
        : regionList[0]?.value || ''

      const chosenService = serviceList.some(
        (item) => item.value === selectedValues?.service
      )
        ? selectedValues.service
        : serviceList[0]?.value || ''

      const chosenInstance = instanceList.find(
        (item) => item.value === selectedValues?.instanceType
      )

      setRegion(chosenRegion)
      setService(chosenService)
      setInstanceType(
        chosenInstance?.value || instanceList[0]?.value || ''
      )

      if (chosenInstance) {
        setCpu(
          Number(selectedValues?.cpu) === Number(chosenInstance.cpu)
            ? String(selectedValues.cpu)
            : ''
        )

        setRam(
          Number(selectedValues?.ram) === Number(chosenInstance.ram)
            ? String(selectedValues.ram)
            : ''
        )
      } else {
        setCpu('')
        setRam('')
      }

      if (
        !regionList.length ||
        !serviceList.length ||
        !instanceList.length
      ) {
        setMessage(
          `Incomplete master data for ${PROVIDER_NAMES[provider]}. ` +
          'Please configure regions, services and instances in Admin.'
        )
      } else {
        setMessage('')
      }
    } catch (error) {
      if (currentRequest !== masterRequest.current) return

      console.error(error)
      clearMasterData()
      setMessage(error.message)
    } finally {
      if (currentRequest === masterRequest.current) {
        setMasterDataLoading(false)
      }
    }
  }

  // ======================================================
  // INITIAL DASHBOARD LOAD
  // ======================================================

  useEffect(() => {
    const load = async () => {
      if (!localStorage.getItem('token')) {
        navigate('/', { replace: true })
        return
      }

      try {
        await getProfile()

        await Promise.all([
          getBoms(),
          getMasterData('aws')
        ])
      } catch (error) {
        console.error(error)
        setMessage('Unable to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => {
      masterRequest.current += 1
    }
  }, [])

  // ======================================================
  // LIVE AWS + AZURE + GCP PRICING
  //
  // All providers send storageType to the backend.
  //
  // AWS   -> gp3
  // Azure -> standard-ssd-lrs
  // GCP   -> pd-balanced
  // ======================================================

  useEffect(() => {
    const currentRequest = ++pricingRequest.current

    if (
      !showForm ||
      masterDataLoading ||
      !region ||
      !instanceType ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 1 ||
      !Number.isFinite(Number(storage)) ||
      Number(storage) <= 0
    ) {
      setPricing(INITIAL_PRICING)
      return
    }

    const controller = new AbortController()

    setPricing({
      status: 'Loading',
      data: null,
      message: 'Fetching published cloud pricing...'
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
              instanceType,
              operatingSystem,
              quantity: Number(quantity),
              storage: Number(storage),
              storageType:
                storageType || STORAGE_DEFAULTS[cloudProvider]
            }),
            signal: controller.signal
          }
        )

        const result = await response.json()

        if (currentRequest !== pricingRequest.current) return

        if (
          response.ok &&
          result.status === 'Available' &&
          typeof result.totalMonthlyComputeCost === 'number' &&
          Number.isFinite(result.totalMonthlyComputeCost)
        ) {
          setPricing({
            status: 'Available',
            data: result,
            message: ''
          })
        } else {
          setPricing({
            status: 'Unavailable',
            data: null,
            message:
              result.message ||
              'Pricing is unavailable for this configuration.'
          })
        }
      } catch (error) {
        if (
          error.name === 'AbortError' ||
          currentRequest !== pricingRequest.current
        ) {
          return
        }

        console.error('Pricing request failed:', error)

        setPricing({
          status: 'Unavailable',
          data: null,
          message: 'Unable to connect to the pricing service.'
        })
      }
    }, 350)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    showForm,
    cloudProvider,
    masterDataLoading,
    region,
    instanceType,
    operatingSystem,
    quantity,
    storage,
    storageType
  ])

  // ======================================================
  // INSTANCE FILTERING
  // ======================================================

  const cpuOptions = [
    ...new Set(
      instanceTypes
        .map((item) => Number(item.cpu))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ].sort((a, b) => a - b)

  const ramOptions = [
    ...new Set(
      instanceTypes
        .map((item) => Number(item.ram))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ].sort((a, b) => a - b)

  const matchingInstances = instanceTypes.filter((item) => {
    const cpuMatches =
      cpu === '' || Number(item.cpu) === Number(cpu)

    const ramMatches =
      ram === '' || Number(item.ram) === Number(ram)

    return cpuMatches && ramMatches
  })

  const selectedInstance = instanceTypes.find(
    (item) => item.value === instanceType
  )

  const handleCpuChange = (e) => {
    const value = e.target.value

    setCpu(value)

    const matches = instanceTypes.filter(
      (item) =>
        (value === '' || Number(item.cpu) === Number(value)) &&
        (ram === '' || Number(item.ram) === Number(ram))
    )

    setInstanceType(matches[0]?.value || '')
  }

  const handleRamChange = (e) => {
    const value = e.target.value

    setRam(value)

    const matches = instanceTypes.filter(
      (item) =>
        (cpu === '' || Number(item.cpu) === Number(cpu)) &&
        (value === '' || Number(item.ram) === Number(value))
    )

    setInstanceType(matches[0]?.value || '')
  }

  const handleCloudProviderChange = async (e) => {
    const provider = e.target.value

    setCloudProvider(provider)
    setStorageType(STORAGE_DEFAULTS[provider])
    setMessage('')
    setPricing(INITIAL_PRICING)

    await getMasterData(provider)
  }

  // ======================================================
  // FORM MANAGEMENT
  // ======================================================

  const resetForm = () => {
    setProjectName('')
    setEnvironment('Development')
    setCloudProvider('aws')
    setOperatingSystem('Linux')
    setStorage(20)
    setStorageType('gp3')
    setQuantity(1)
    setJustification('')
    setEditingBomId(null)
    setMessage('')
    setPricing(INITIAL_PRICING)

    clearMasterData()
    getMasterData('aws')
  }

  const handleCreateNew = () => {
    resetForm()
    setShowForm(true)

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  const handleEditBom = async (bom) => {
    const resource = bom.resources?.[0]
    const provider = bom.cloudProvider || 'aws'

    setProjectName(bom.projectName || '')
    setEnvironment(bom.environment || 'Development')
    setCloudProvider(provider)
    setOperatingSystem(resource?.operatingSystem || 'Linux')
    setStorage(resource?.storage ?? 20)
    setStorageType(
      resource?.storageType || STORAGE_DEFAULTS[provider]
    )
    setQuantity(resource?.quantity ?? 1)
    setJustification(bom.justification || '')
    setEditingBomId(bom._id)
    setMessage('')
    setPricing(INITIAL_PRICING)
    setShowForm(true)

    await getMasterData(provider, {
      region: bom.region,
      service: resource?.service,
      instanceType: resource?.instanceType,
      cpu: resource?.cpu,
      ram: resource?.ram
    })

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // ======================================================
  // BOM SUBMISSION
  //
  // Only AWS submission is currently enabled.
  // Azure and GCP support pricing exploration only.
  // ======================================================

  const handleSubmitBOM = async (e) => {
    e.preventDefault()

    if (submitting) return

    if (cloudProvider !== 'aws') {
      setMessage(
        'Azure and GCP BOM submissions are not enabled yet.'
      )
      return
    }

    if (!projectName.trim()) {
      setMessage('Please enter a project name.')
      return
    }

    if (!region || !service || !instanceType) {
      setMessage(
        'Please select a valid region, service and instance.'
      )
      return
    }

    const actualInstance = instanceTypes.find(
      (item) => item.value === instanceType
    )

    if (!actualInstance) {
      setMessage('Selected instance is unavailable.')
      return
    }

    if (
      !Number.isFinite(Number(storage)) ||
      Number(storage) <= 0 ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 1
    ) {
      setMessage('Please select valid storage and quantity.')
      return
    }

    const bomData = {
      cloudProvider,
      projectName: projectName.trim(),
      environment,
      region,
      resources: [
        {
          service,
          instanceType: actualInstance.value,
          cpu: Number(actualInstance.cpu),
          ram: Number(actualInstance.ram),
          storage: Number(storage),
          storageType,
          operatingSystem,
          quantity: Number(quantity)
        }
      ],
      justification
    }

    setSubmitting(true)
    setMessage('')

    try {
      const isEditing = Boolean(editingBomId)

      const endpoint = isEditing
        ? `${API}/api/bom/${editingBomId}/resubmit`
        : `${API}/api/bom`

      const response = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bomData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to submit BOM')
      }

      const ticketId = data.bom?.ticketId || data.ticketId

      resetForm()
      setShowForm(false)
      await getBoms()

      setMessage(
        isEditing
          ? 'BOM updated and resubmitted successfully.'
          : ticketId
            ? `BOM submitted successfully. Ticket: ${ticketId}`
            : 'BOM submitted successfully.'
      )
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Unable to connect to server.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    resetForm()
    setShowForm(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/', { replace: true })
  }

  // ======================================================
  // DASHBOARD STATISTICS
  // ======================================================

  const totalRequests = boms.length

  const pendingRequests = boms.filter(
    (bom) => bom.status === 'Pending Review'
  ).length

  const approvedRequests = boms.filter(
    (bom) => bom.status === 'Approved'
  ).length

  const changesRequested = boms.filter(
    (bom) => bom.status === 'Changes Requested'
  ).length

  const filteredBoms = boms.filter((bom) => {
    const query = search.toLowerCase()

    return (
      (bom.ticketId || '').toLowerCase().includes(query) ||
      (bom.projectName || '').toLowerCase().includes(query) ||
      (bom.status || '').toLowerCase().includes(query) ||
      (bom.cloudProvider || 'aws').toLowerCase().includes(query)
    )
  })

  const getStatusClass = (status) => {
    switch (status) {
      case 'Approved':
      case 'Plan Completed':
        return 'status-approved'

      case 'Pending Review':
        return 'status-pending'

      case 'Changes Requested':
        return 'status-changes'

      case 'Rejected':
      case 'Plan Failed':
        return 'status-rejected'

      default:
        return 'status-neutral'
    }
  }

  // ======================================================
  // PRICING BREAKDOWN
  // ======================================================

  const renderPricing = () => {
    if (pricing.status === 'Loading') {
      return (
        <p role="status">
          Fetching published {cloudProvider.toUpperCase()} pricing...
        </p>
      )
    }

    if (pricing.status === 'Idle') {
      return (
        <p>
          Select a region, instance type and storage
          configuration to calculate costs.
        </p>
      )
    }

    if (pricing.status === 'Unavailable') {
      return (
        <div role="status">
          <strong>Pricing unavailable</strong>
          <p>{pricing.message}</p>

          {cloudProvider === 'aws' && (
            <p style={{ fontSize: '12px' }}>
              AWS compute pricing requires a matching entry
              in the locally cached official catalog.
            </p>
          )}

          {cloudProvider === 'gcp' && (
            <p style={{ fontSize: '12px' }}>
              GCP pricing currently supports verified configurations
              in the local catalog. Try Mumbai, e2-standard-2, Linux.
            </p>
          )}
        </div>
      )
    }

    if (pricing.status !== 'Available' || !pricing.data) {
      return null
    }

    const data = pricing.data
    const currency = data.currency || 'USD'
    const disk = data.storagePricing

    const hasStorage =
      disk?.status === 'Available' &&
      typeof data.totalMonthlyStorageCost === 'number'

    const hasTotal =
      typeof data.totalEstimatedMonthlyCost === 'number'

    const isAwsDisk =
      cloudProvider === 'aws' && hasStorage

    const isAzureDisk =
      cloudProvider === 'azure' && hasStorage

    const isGcpDisk =
      cloudProvider === 'gcp' && hasStorage

    const storageLabel = isAwsDisk
      ? 'EBS gp3 Storage'
      : isAzureDisk
        ? `Azure Standard SSD ${disk.skuName}`
        : isGcpDisk
          ? 'GCP Balanced Persistent Disk'
          : 'Storage'

    return (
      <div>
        <p style={{ color: '#64748b', fontSize: '14px' }}>
          {hasTotal
            ? 'Estimated Monthly Compute + Storage Cost'
            : 'Estimated Monthly Compute Cost'}
        </p>

        <h2
          style={{
            fontSize: '32px',
            color: '#0f172a',
            margin: '8px 0'
          }}
        >
          {money(
            hasTotal
              ? data.totalEstimatedMonthlyCost
              : data.totalMonthlyComputeCost,
            currency
          )}

          <span
            style={{
              fontSize: '14px',
              fontWeight: 400,
              marginLeft: '8px'
            }}
          >
            / month
          </span>
        </h2>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '18px',
            margin: '18px 0'
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            Monthly Cost Breakdown
          </h3>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '12px'
            }}
          >
            <span>
              Compute ({data.quantity} VM
              {data.quantity !== 1 ? 's' : ''})
            </span>

            <strong>
              {money(data.totalMonthlyComputeCost, currency)}
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '12px'
            }}
          >
            <span>
              {storageLabel} (
              {Number(storage) * Number(quantity)} GiB requested)
            </span>

            <strong>
              {hasStorage
                ? money(data.totalMonthlyStorageCost, currency)
                : 'Unavailable'}
            </strong>
          </div>

          {isAwsDisk && (
            <p
              style={{
                fontSize: '12px',
                color: '#64748b'
              }}
            >
              {preciseMoney(disk.pricePerGBMonth, currency)}
              {' '}per GB-month
            </p>
          )}

          {isAzureDisk && (
            <div
              style={{
                background: '#f8fafc',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '12px',
                fontSize: '13px'
              }}
            >
              <p>
                <strong>Selected Disk Tier:</strong>{' '}
                {disk.skuName}
              </p>

              <p>
                <strong>Requested Storage:</strong>{' '}
                {disk.totalRequestedStorageGB} GiB
              </p>

              <p>
                <strong>Provisioned Storage:</strong>{' '}
                {disk.totalProvisionedStorageGB} GiB
              </p>

              <p>
                <strong>Capacity per Disk:</strong>{' '}
                {disk.diskCapacityGB} GiB
              </p>

              <p>
                <strong>Price per Disk:</strong>{' '}
                {money(disk.pricePerDiskMonth, currency)}
                {' '}/ month
              </p>

              <p style={{ color: '#64748b' }}>
                Azure bills this managed disk by its provisioned
                tier, not by the exact requested storage amount.
              </p>
            </div>
          )}

          {isGcpDisk && (
            <div
              style={{
                background: '#f8fafc',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '12px',
                fontSize: '13px'
              }}
            >
              <p>
                <strong>Storage Type:</strong>{' '}
                Balanced Persistent Disk (pd-balanced)
              </p>

              <p>
                <strong>Storage per VM:</strong>{' '}
                {disk.storageGBPerVM} GiB
              </p>

              <p>
                <strong>Total Provisioned Storage:</strong>{' '}
                {disk.totalStorageGB} GiB
              </p>

              <p>
                <strong>Price per GiB-month:</strong>{' '}
                {money(disk.pricePerGBMonth, currency)}
              </p>

              <p>
                <strong>Monthly Storage Cost:</strong>{' '}
                {money(disk.totalMonthlyStorageCost, currency)}
              </p>

              <p style={{ color: '#64748b' }}>
                The GCP storage rate was derived from official
                Google Cloud Pricing Calculator totals for
                Mumbai (asia-south1).
              </p>
            </div>
          )}

          <hr
            style={{
              border: 0,
              borderTop: '1px solid #e2e8f0',
              margin: '16px 0'
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '18px',
              fontWeight: 700
            }}
          >
            <span>Total Estimated Monthly Cost</span>

            <span style={{ color: '#15803d' }}>
              {hasTotal
                ? money(data.totalEstimatedMonthlyCost, currency)
                : 'Unavailable'}
            </span>
          </div>

          {!hasTotal && (
            <p
              style={{
                color: '#64748b',
                fontSize: '12px',
                marginBottom: 0
              }}
            >
              The compute estimate is available, but the
              full total cannot be calculated until a verified
              storage price is available.
              {' '}{disk?.message || ''}
            </p>
          )}
        </div>

        <p>
          Cloud Provider:{' '}
          <strong>{PROVIDER_NAMES[cloudProvider]}</strong>
        </p>

        <p>
          Region: <strong>{data.region}</strong>
        </p>

        <p>
          Instance Type:{' '}
          <strong>{data.instanceType}</strong>
        </p>

        <p>
          Operating System:{' '}
          <strong>{data.operatingSystem}</strong>
        </p>

        <p>
          Hourly price per VM:{' '}
          <strong>
            {preciseMoney(data.hourlyPrice, currency)}
          </strong>
        </p>

        <p>
          Quantity: <strong>{data.quantity}</strong>
        </p>

        <p>
          Monthly usage:{' '}
          <strong>{data.monthlyHours} hours</strong>
        </p>

        {cloudProvider === 'aws' && (
          <>
            <p>
              Purchase Option: <strong>On-Demand</strong>
            </p>

            {data.sku && (
              <p>
                AWS Compute SKU:{' '}
                <strong>{data.sku}</strong>
              </p>
            )}

            {data.meterName && (
              <p>
                AWS pricing description:{' '}
                <strong>{data.meterName}</strong>
              </p>
            )}
          </>
        )}

        {cloudProvider === 'azure' && data.meterName && (
          <p>
            Azure compute pricing meter:{' '}
            <strong>{data.meterName}</strong>
          </p>
        )}

        {isAzureDisk && (
          <>
            <p>
              Azure storage pricing meter:{' '}
              <strong>{disk.meterName}</strong>
            </p>

            <p>
              Azure storage meter ID:{' '}
              <strong>{disk.meterId}</strong>
            </p>
          </>
        )}

        {cloudProvider === 'gcp' && (
          <>
            <p>
              Pricing model:{' '}
              <strong>
                {data.pricingModel || 'Default'}
              </strong>
            </p>

            {data.vcpu != null && (
              <p>
                vCPUs: <strong>{data.vcpu}</strong>
              </p>
            )}

            {data.memoryGiB != null && (
              <p>
                Memory:{' '}
                <strong>{data.memoryGiB} GiB</strong>
              </p>
            )}

            {isGcpDisk && (
              <>
                {disk.skuId && (
                  <p>
                    GCP Storage SKU:{' '}
                    <strong>{disk.skuId}</strong>
                  </p>
                )}

                <p>
                  Storage pricing method:{' '}
                  <strong>
                    Official calculator-derived rate
                  </strong>
                </p>
              </>
            )}
          </>
        )}

        <p>
          Compute pricing source:{' '}
          <strong>{data.pricingSource}</strong>
        </p>

        {data.pricingDataType && (
          <p>
            Pricing data:{' '}
            <strong>{data.pricingDataType}</strong>
          </p>
        )}

        {data.sourceUrl && (
          <p>
            Compute price source:{' '}
            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View official source
            </a>
          </p>
        )}

        {disk?.sourceUrl && (
          <p>
            Storage price source:{' '}
            <a
              href={disk.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {cloudProvider === 'aws'
                ? 'View AWS official price list'
                : cloudProvider === 'azure'
                  ? 'View Azure Retail Prices API'
                  : 'View Google Cloud Pricing Calculator'}
            </a>
          </p>
        )}

        {disk?.verifiedDate && (
          <p>
            Storage price verified:{' '}
            <strong>{disk.verifiedDate}</strong>
          </p>
        )}

        {data.retrievedAt && (
          <p>
            Pricing retrieved:{' '}
            <strong>
              {cloudProvider === 'gcp'
                ? data.retrievedAt
                : new Date(data.retrievedAt).toLocaleString()}
            </strong>
          </p>
        )}

        <p
          style={{
            fontSize: '12px',
            color: '#64748b',
            marginTop: '14px'
          }}
        >
          {data.disclaimer ||
            'Published retail pricing estimate. Taxes, networking, discounts and other charges may be excluded.'}
        </p>

        {disk?.disclaimer && (
          <p
            style={{
              fontSize: '12px',
              color: '#64748b'
            }}
          >
            {disk.disclaimer}
          </p>
        )}
      </div>
    )
  }

  // ======================================================
  // LOADING SCREEN
  // ======================================================

  if (loading) {
    return (
      <div className="user-dashboard-loading">
        Loading your CloudOps workspace...
      </div>
    )
  }

  // ======================================================
  // MAIN DASHBOARD
  // ======================================================

  return (
    <div className="user-dashboard">

      {/* HEADER */}

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
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="user-main">

        {/* WELCOME */}

        <div className="user-welcome">
          <div>
            <div className="user-page-eyebrow">
              CLOUD INFRASTRUCTURE
            </div>

            <h1>
              Welcome back, {user?.name || 'User'}
            </h1>

            <p>
              Manage your infrastructure requests and
              track their approval status.
            </p>
          </div>

          <button
            className="user-primary-btn"
            onClick={handleCreateNew}
          >
            + New BOM Request
          </button>
        </div>

        {/* STATISTICS */}

        <div className="user-stats-grid">
          {[
            {
              title: 'Total Requests',
              value: totalRequests,
              icon: '▤',
              className: 'icon-blue',
              footer: 'All submitted requests'
            },
            {
              title: 'Pending Review',
              value: pendingRequests,
              icon: '◷',
              className: 'icon-orange',
              footer: 'Awaiting engineer review'
            },
            {
              title: 'Approved',
              value: approvedRequests,
              icon: '✓',
              className: 'icon-green',
              footer: 'Approved infrastructure requests'
            },
            {
              title: 'Changes Requested',
              value: changesRequested,
              icon: '↻',
              className: 'icon-purple',
              footer: 'Requests needing updates'
            }
          ].map((stat) => (
            <div className="user-stat-card" key={stat.title}>
              <div className="user-stat-top">
                <span>{stat.title}</span>

                <span
                  className={`user-stat-icon ${stat.className}`}
                >
                  {stat.icon}
                </span>
              </div>

              <div className="user-stat-value">
                {stat.value}
              </div>

              <div className="user-stat-footer">
                {stat.footer}
              </div>
            </div>
          ))}
        </div>

        {message && (
          <div className="user-message" role="status">
            {message}
          </div>
        )}

        {/* CREATE BANNER */}

        {!showForm && (
          <section className="user-create-banner">
            <div className="user-create-banner-icon">
              ☁
            </div>

            <div className="user-create-banner-text">
              <h2>Create Infrastructure Request</h2>

              <p>
                Configure cloud resources and submit a
                Bill of Materials for cloud engineer approval.
              </p>
            </div>

            <button
              className="user-primary-btn"
              onClick={handleCreateNew}
            >
              + Create New BOM
            </button>
          </section>
        )}

        {/* BOM FORM */}

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

                <p>
                  {editingBomId
                    ? 'Update the configuration based on engineer remarks.'
                    : 'Fill in the details to request cloud infrastructure.'}
                </p>
              </div>

              <button
                type="button"
                className="user-close-btn"
                onClick={handleCancel}
              >
                ✕
              </button>
            </div>

            <form
              className="user-bom-form"
              onSubmit={handleSubmitBOM}
            >

              {/* PROJECT INFORMATION */}

              <div className="user-form-section-title">
                Project Information
              </div>

              <div className="user-form-grid">

                <div className="user-form-field">
                  <label htmlFor="bom-provider">
                    Cloud Provider
                  </label>

                  <select
                    id="bom-provider"
                    value={cloudProvider}
                    onChange={handleCloudProviderChange}
                    disabled={Boolean(editingBomId)}
                    required
                  >
                    {Object.entries(PROVIDER_NAMES).map(
                      ([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-project">
                    Project Name
                  </label>

                  <input
                    id="bom-project"
                    type="text"
                    placeholder="E-Commerce Application"
                    value={projectName}
                    onChange={(e) =>
                      setProjectName(e.target.value)
                    }
                    required
                  />
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-environment">
                    Environment
                  </label>

                  <select
                    id="bom-environment"
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
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-region">
                    Cloud Region
                  </label>

                  <select
                    id="bom-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    disabled={
                      masterDataLoading || regions.length === 0
                    }
                    required
                  >
                    {regions.length === 0 && (
                      <option value="">
                        {masterDataLoading
                          ? 'Loading regions...'
                          : 'No regions available'}
                      </option>
                    )}

                    {regions.map((item) => (
                      <option
                        key={item._id}
                        value={item.value}
                      >
                        {item.name} ({item.value})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-service">
                    Cloud Service
                  </label>

                  <select
                    id="bom-service"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    disabled={
                      masterDataLoading || services.length === 0
                    }
                    required
                  >
                    {services.length === 0 && (
                      <option value="">
                        {masterDataLoading
                          ? 'Loading services...'
                          : 'No services available'}
                      </option>
                    )}

                    {services.map((item) => (
                      <option
                        key={item._id}
                        value={item.value}
                      >
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* RESOURCE CONFIGURATION */}

              <div className="user-form-section-title">
                Resource Configuration
              </div>

              <div className="user-form-grid">

                <div className="user-form-field">
                  <label htmlFor="bom-cpu">
                    CPU Preference
                  </label>

                  <select
                    id="bom-cpu"
                    value={cpu}
                    onChange={handleCpuChange}
                    disabled={masterDataLoading}
                  >
                    <option value="">Any CPU</option>

                    {cpuOptions.map((value) => (
                      <option key={value} value={value}>
                        {value} vCPU
                      </option>
                    ))}
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-ram">
                    RAM Preference
                  </label>

                  <select
                    id="bom-ram"
                    value={ram}
                    onChange={handleRamChange}
                    disabled={masterDataLoading}
                  >
                    <option value="">Any RAM</option>

                    {ramOptions.map((value) => (
                      <option key={value} value={value}>
                        {value} GB
                      </option>
                    ))}
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-instance">
                    Matching Instance Type
                  </label>

                  <select
                    id="bom-instance"
                    value={instanceType}
                    onChange={(e) =>
                      setInstanceType(e.target.value)
                    }
                    disabled={
                      masterDataLoading ||
                      matchingInstances.length === 0
                    }
                    required
                  >
                    {matchingInstances.length === 0 && (
                      <option value="">
                        {masterDataLoading
                          ? 'Loading instances...'
                          : 'No matching instances'}
                      </option>
                    )}

                    {matchingInstances.map((item) => (
                      <option
                        key={item._id}
                        value={item.value}
                      >
                        {item.name} — {item.cpu} vCPU /
                        {' '}{item.ram} GB RAM
                      </option>
                    ))}
                  </select>
                </div>

                <div className="user-form-field">
                  <label>Selected Configuration</label>

                  <input
                    type="text"
                    value={
                      selectedInstance
                        ? `${selectedInstance.name} | ${selectedInstance.cpu} vCPU | ${selectedInstance.ram} GB RAM`
                        : 'Select an instance type'
                    }
                    readOnly
                  />
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-os">
                    Operating System for Pricing
                  </label>

                  <select
                    id="bom-os"
                    value={operatingSystem}
                    onChange={(e) =>
                      setOperatingSystem(e.target.value)
                    }
                  >
                    <option value="Linux">Linux</option>
                    <option value="Windows">Windows</option>
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-storage">
                    Storage per VM
                  </label>

                  <select
                    id="bom-storage"
                    value={storage}
                    onChange={(e) =>
                      setStorage(Number(e.target.value))
                    }
                  >
                    {[20, 50, 100, 200].map((value) => (
                      <option key={value} value={value}>
                        {value} GiB
                      </option>
                    ))}
                  </select>
                </div>

                {/* AWS STORAGE TYPE */}

                {cloudProvider === 'aws' && (
                  <div className="user-form-field">
                    <label htmlFor="bom-storage-type">
                      EBS Storage Type
                    </label>

                    <select
                      id="bom-storage-type"
                      value={storageType}
                      onChange={(e) =>
                        setStorageType(e.target.value)
                      }
                    >
                      <option value="gp3">
                        General Purpose SSD (gp3)
                      </option>
                    </select>
                  </div>
                )}

                {/* AZURE STORAGE TYPE */}

                {cloudProvider === 'azure' && (
                  <div className="user-form-field">
                    <label htmlFor="bom-azure-storage-type">
                      Azure Managed Disk Type
                    </label>

                    <select
                      id="bom-azure-storage-type"
                      value={storageType}
                      onChange={(e) =>
                        setStorageType(e.target.value)
                      }
                    >
                      <option value="standard-ssd-lrs">
                        Standard SSD LRS
                      </option>
                    </select>
                  </div>
                )}

                {/* GCP STORAGE TYPE */}

                {cloudProvider === 'gcp' && (
                  <div className="user-form-field">
                    <label htmlFor="bom-gcp-storage-type">
                      GCP Persistent Disk Type
                    </label>

                    <select
                      id="bom-gcp-storage-type"
                      value={storageType}
                      onChange={(e) =>
                        setStorageType(e.target.value)
                      }
                    >
                      <option value="pd-balanced">
                        Balanced Persistent Disk (pd-balanced)
                      </option>
                    </select>
                  </div>
                )}

                <div className="user-form-field">
                  <label htmlFor="bom-quantity">
                    Quantity
                  </label>

                  <select
                    id="bom-quantity"
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Number(e.target.value))
                    }
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="user-form-field user-field-full">
                  <label htmlFor="bom-justification">
                    Justification
                  </label>

                  <textarea
                    id="bom-justification"
                    rows="4"
                    placeholder="Explain why this infrastructure is required..."
                    value={justification}
                    onChange={(e) =>
                      setJustification(e.target.value)
                    }
                    required
                  />
                </div>
              </div>

              {/* CLOUD COST ESTIMATION */}

              <div
                className="user-panel"
                style={{
                  marginTop: '24px',
                  padding: '24px',
                  border: '1px solid #dbe5f0',
                  borderRadius: '14px',
                  background: '#f8fbff'
                }}
              >
                <div className="user-form-section-title">
                  Cloud Cost Estimation
                </div>

                {renderPricing()}
              </div>

              {/* MULTI-CLOUD NOTICE */}

              {cloudProvider !== 'aws' && (
                <div
                  className="user-message"
                  role="status"
                  style={{ marginTop: '20px' }}
                >
                  {PROVIDER_NAMES[cloudProvider]} pricing
                  exploration is available. BOM submission
                  is currently enabled only for AWS.

                  {cloudProvider === 'azure'
                    ? ' Verified Standard SSD LRS pricing is currently available for the E10 tier in Central India; other disk sizes or regions may be unavailable.'
                    : ' Verified GCP Balanced Persistent Disk pricing is currently available for Mumbai (asia-south1). Other regions or storage types may be unavailable.'}
                </div>
              )}

              {/* FORM ACTIONS */}

              <div className="user-form-actions">
                <button
                  type="submit"
                  className="user-primary-btn"
                  disabled={
                    submitting ||
                    masterDataLoading ||
                    cloudProvider !== 'aws' ||
                    !region ||
                    !service ||
                    !instanceType
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
                  onClick={handleCancel}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* BOM REQUEST HISTORY */}

        <section className="user-panel">
          <div className="user-panel-heading user-history-heading">
            <div>
              <span className="user-section-label">
                REQUEST MANAGEMENT
              </span>

              <h2>My BOM Requests</h2>

              <p>
                View and track your infrastructure requests.
              </p>
            </div>

            <input
              type="search"
              className="user-search"
              placeholder="Search requests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredBoms.length > 0 ? (
            <div className="user-table-wrapper">
              <table className="user-bom-table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>Requested By</th>
                    <th>Project</th>
                    <th>Environment</th>
                    <th>Cloud Provider</th>
                    <th>Region</th>
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

                      <td>
                        {bom.createdBy?.name ||
                          user?.name ||
                          'You'}
                      </td>

                      <td className="user-project-name">
                        {bom.projectName}
                      </td>

                      <td>{bom.environment}</td>

                      <td>
                        {(bom.cloudProvider || 'aws').toUpperCase()}
                      </td>

                      <td>{bom.region}</td>

                      <td>
                        <span
                          className={`user-status ${getStatusClass(
                            bom.status
                          )}`}
                        >
                          {bom.status}
                        </span>
                      </td>

                      <td className="user-remarks">
                        {bom.engineerRemarks || '—'}
                      </td>

                      <td>
                        {bom.status === 'Changes Requested' ? (
                          <button
                            className="user-edit-btn"
                            onClick={() => handleEditBom(bom)}
                          >
                            Edit / Resubmit
                          </button>
                        ) : (
                          '—'
                        )}
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
              <div className="user-empty-icon">▤</div>

              <h3>
                {search
                  ? 'No matching requests'
                  : 'No BOM requests yet'}
              </h3>

              <p>
                {search
                  ? 'Try another ticket ID or project name.'
                  : 'Create your first infrastructure request to get started.'}
              </p>

              {!search && (
                <button
                  className="user-primary-btn"
                  onClick={handleCreateNew}
                >
                  + Create New BOM
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default UserDashboard