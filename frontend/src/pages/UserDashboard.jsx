
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './UserDashboard.css'

const API = 'http://localhost:5000'

function UserDashboard() {
  const navigate = useNavigate()

  // USER / DASHBOARD DATA
  const [user, setUser] = useState(null)
  const [boms, setBoms] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [editingBomId, setEditingBomId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // MASTER DATA
  const [regions, setRegions] = useState([])
  const [services, setServices] = useState([])
  const [instanceTypes, setInstanceTypes] = useState([])

  // FORM DATA
  const [projectName, setProjectName] = useState('')
  const [environment, setEnvironment] = useState('Development')
  const [region, setRegion] = useState('')
  const [service, setService] = useState('')
  const [cpu, setCpu] = useState('')
  const [ram, setRam] = useState('')
  const [instanceType, setInstanceType] = useState('')
  const [storage, setStorage] = useState(20)
  const [quantity, setQuantity] = useState(1)
  const [justification, setJustification] = useState('')

  const getToken = () => localStorage.getItem('token')

  const authHeaders = () => ({
    Authorization: `Bearer ${getToken()}`
  })

  // GET PROFILE
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

  // GET MY BOM REQUESTS
  const getBoms = async () => {
    try {
      const response = await fetch(`${API}/api/bom/my`, {
        headers: authHeaders()
      })

      const data = await response.json()

      if (response.ok) {
        setBoms(Array.isArray(data) ? data : [])
      } else {
        setMessage(data.message || 'Unable to load BOM requests')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to load BOM requests')
    }
  }

  // GET MASTER DATA
  const getMasterData = async () => {
    try {
      const categories = ['region', 'service', 'instanceType']

      const responses = await Promise.all(
        categories.map((category) =>
          fetch(`${API}/api/master-data/category/${category}`, {
            headers: authHeaders()
          })
        )
      )

      const data = await Promise.all(
        responses.map((response) => response.json())
      )

      const regionList = responses[0].ok
        ? data[0].masterData || []
        : []

      const serviceList = responses[1].ok
        ? data[1].masterData || []
        : []

      const instanceList = responses[2].ok
        ? data[2].masterData || []
        : []

      setRegions(regionList)
      setServices(serviceList)
      setInstanceTypes(instanceList)

      setRegion(regionList[0]?.value || '')
      setService(serviceList[0]?.value || '')
      setInstanceType(instanceList[0]?.value || '')
      setCpu('')
      setRam('')

      if (responses.some((response) => !response.ok)) {
        setMessage('Some master data could not be loaded')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to load master data')
    }
  }

  // INITIAL LOAD
  useEffect(() => {
    const loadDashboard = async () => {
      if (!getToken()) {
        navigate('/', { replace: true })
        return
      }

      try {
        await getProfile()
        await Promise.all([getBoms(), getMasterData()])
      } catch (error) {
        console.error(error)
        setMessage('Unable to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  // CPU AND RAM OPTIONS
  const cpuOptions = [
    ...new Set(
      instanceTypes
        .map((item) => item.cpu)
        .filter((value) => value !== null && value !== undefined)
    )
  ].sort((a, b) => a - b)

  const ramOptions = [
    ...new Set(
      instanceTypes
        .map((item) => item.ram)
        .filter((value) => value !== null && value !== undefined)
    )
  ].sort((a, b) => a - b)

  // MATCHING INSTANCES
  const matchingInstances = instanceTypes.filter((item) => {
    const cpuMatches =
      cpu === '' || Number(item.cpu) === Number(cpu)

    const ramMatches =
      ram === '' || Number(item.ram) === Number(ram)

    return cpuMatches && ramMatches
  })

  const handleCpuChange = (e) => {
    const selectedCpu = e.target.value
    setCpu(selectedCpu)

    const matches = instanceTypes.filter((item) => {
      const cpuMatches =
        selectedCpu === '' ||
        Number(item.cpu) === Number(selectedCpu)

      const ramMatches =
        ram === '' || Number(item.ram) === Number(ram)

      return cpuMatches && ramMatches
    })

    setInstanceType(matches[0]?.value || '')
  }

  const handleRamChange = (e) => {
    const selectedRam = e.target.value
    setRam(selectedRam)

    const matches = instanceTypes.filter((item) => {
      const cpuMatches =
        cpu === '' || Number(item.cpu) === Number(cpu)

      const ramMatches =
        selectedRam === '' ||
        Number(item.ram) === Number(selectedRam)

      return cpuMatches && ramMatches
    })

    setInstanceType(matches[0]?.value || '')
  }

  const selectedInstance = instanceTypes.find(
    (item) => item.value === instanceType
  )

  // RESET FORM
  const resetForm = () => {
    setProjectName('')
    setEnvironment('Development')
    setRegion(regions[0]?.value || '')
    setService(services[0]?.value || '')
    setCpu('')
    setRam('')
    setInstanceType(instanceTypes[0]?.value || '')
    setStorage(20)
    setQuantity(1)
    setJustification('')
    setEditingBomId(null)
  }

  const handleCreateNew = () => {
    resetForm()
    setMessage('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // EDIT EXISTING BOM
  const handleEditBom = (bom) => {
    const resource = bom.resources?.[0]

    setProjectName(bom.projectName || '')
    setEnvironment(bom.environment || 'Development')
    setRegion(bom.region || '')
    setService(resource?.service || '')
    setCpu(resource?.cpu ?? '')
    setRam(resource?.ram ?? '')
    setInstanceType(resource?.instanceType || '')
    setStorage(resource?.storage || 20)
    setQuantity(resource?.quantity || 1)
    setJustification(bom.justification || '')
    setEditingBomId(bom._id)
    setMessage('')
    setShowForm(true)

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // SUBMIT / RESUBMIT BOM
  const handleSubmitBOM = async (e) => {
    e.preventDefault()

    if (submitting) return

    if (!region || !service || !instanceType) {
      setMessage('Please select a valid AWS region, service and instance')
      return
    }

    const actualInstance = instanceTypes.find(
      (item) => item.value === instanceType
    )

    if (!actualInstance) {
      setMessage('Selected instance type is not available')
      return
    }

    const bomData = {
      projectName,
      environment,
      region,
      resources: [
        {
          service,
          instanceType: actualInstance.value,
          cpu: Number(actualInstance.cpu),
          ram: Number(actualInstance.ram),
          storage: Number(storage),
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

      if (response.ok) {
        const ticketId = data.bom?.ticketId || data.ticketId

        setMessage(
          isEditing
            ? 'BOM updated and resubmitted successfully'
            : ticketId
              ? `BOM submitted successfully. Ticket: ${ticketId}`
              : 'BOM submitted successfully'
        )

        resetForm()
        setShowForm(false)
        await getBoms()
      } else {
        setMessage(data.message || 'Unable to submit BOM')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
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

  // DASHBOARD COUNTS
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
      (bom.status || '').toLowerCase().includes(query)
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

  if (loading) {
    return (
      <div className="user-dashboard-loading">
        Loading your CloudOps workspace...
      </div>
    )
  }

  return (
    <div className="user-dashboard">

      {/* HEADER */}
      <header className="user-topbar">
        <div className="user-brand">
          <div className="user-brand-icon">☁</div>

          <div>
            <div className="user-brand-name">CloudOps Portal</div>
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

      {/* MAIN */}
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

        {/* SUMMARY CARDS */}
        <div className="user-stats-grid">
          <div className="user-stat-card">
            <div className="user-stat-top">
              <span>Total Requests</span>
              <span className="user-stat-icon icon-blue">▤</span>
            </div>

            <div className="user-stat-value">{totalRequests}</div>
            <div className="user-stat-footer">
              All submitted requests
            </div>
          </div>

          <div className="user-stat-card">
            <div className="user-stat-top">
              <span>Pending Review</span>
              <span className="user-stat-icon icon-orange">◷</span>
            </div>

            <div className="user-stat-value">{pendingRequests}</div>
            <div className="user-stat-footer">
              Awaiting engineer review
            </div>
          </div>

          <div className="user-stat-card">
            <div className="user-stat-top">
              <span>Approved</span>
              <span className="user-stat-icon icon-green">✓</span>
            </div>

            <div className="user-stat-value">{approvedRequests}</div>
            <div className="user-stat-footer">
              Approved infrastructure requests
            </div>
          </div>

          <div className="user-stat-card">
            <div className="user-stat-top">
              <span>Changes Requested</span>
              <span className="user-stat-icon icon-purple">↻</span>
            </div>

            <div className="user-stat-value">{changesRequested}</div>
            <div className="user-stat-footer">
              Requests needing updates
            </div>
          </div>
        </div>

        {/* MESSAGE */}
        {message && (
          <div className="user-message" role="status">
            {message}
          </div>
        )}

        {/* CREATE REQUEST BANNER */}
        {!showForm && (
          <section className="user-create-banner">
            <div className="user-create-banner-icon">☁</div>

            <div className="user-create-banner-text">
              <h2>Create Infrastructure Request</h2>
              <p>
                Configure AWS resources and submit a
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
                    ? 'Update the configuration based on the engineer remarks.'
                    : 'Fill in the details to request AWS infrastructure.'}
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
              <div className="user-form-section-title">
                Project Information
              </div>

              <div className="user-form-grid">
                <div className="user-form-field">
                  <label htmlFor="bom-project">Project Name</label>
                  <input
                    id="bom-project"
                    type="text"
                    placeholder="E-Commerce Application"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                  />
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-environment">Environment</label>
                  <select
                    id="bom-environment"
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                  >
                    <option value="Development">Development</option>
                    <option value="Testing">Testing</option>
                    <option value="Staging">Staging</option>
                    <option value="Production">Production</option>
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-region">AWS Region</label>
                  <select
                    id="bom-region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    required
                  >
                    {regions.length === 0 && (
                      <option value="">No regions available</option>
                    )}

                    {regions.map((item) => (
                      <option key={item._id} value={item.value}>
                        {item.name} ({item.value})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-service">AWS Service</label>
                  <select
                    id="bom-service"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    required
                  >
                    {services.length === 0 && (
                      <option value="">No services available</option>
                    )}

                    {services.map((item) => (
                      <option key={item._id} value={item.value}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="user-form-section-title">
                Resource Configuration
              </div>

              <div className="user-form-grid">
                <div className="user-form-field">
                  <label htmlFor="bom-cpu">CPU Preference</label>
                  <select
                    id="bom-cpu"
                    value={cpu}
                    onChange={handleCpuChange}
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
                  <label htmlFor="bom-ram">RAM Preference</label>
                  <select
                    id="bom-ram"
                    value={ram}
                    onChange={handleRamChange}
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
                  <label htmlFor="bom-instance">Matching Instance Type</label>
                  <select
                    id="bom-instance"
                    value={instanceType}
                    onChange={(e) => setInstanceType(e.target.value)}
                    required
                  >
                    {matchingInstances.length === 0 && (
                      <option value="">No matching instances</option>
                    )}

                    {matchingInstances.map((item) => (
                      <option key={item._id} value={item.value}>
                        {item.name} — {item.cpu} vCPU / {item.ram} GB RAM
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
                  <label htmlFor="bom-storage">Storage (GB)</label>
                  <select
                    id="bom-storage"
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                  >
                    <option value="20">20 GB</option>
                    <option value="50">50 GB</option>
                    <option value="100">100 GB</option>
                    <option value="200">200 GB</option>
                  </select>
                </div>

                <div className="user-form-field">
                  <label htmlFor="bom-quantity">Quantity</label>
                  <select
                    id="bom-quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="user-form-field user-field-full">
                  <label htmlFor="bom-justification">Justification</label>
                  <textarea
                    id="bom-justification"
                    rows="4"
                    placeholder="Explain why this infrastructure is required..."
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="user-form-actions">
                <button
                  type="submit"
                  className="user-primary-btn"
                  disabled={submitting}
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
              <p>View and track your infrastructure requests.</p>
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

                      <td>{bom.createdBy?.name || user?.name || 'You'}</td>
                      <td className="user-project-name">
                        {bom.projectName}
                      </td>
                      <td>{bom.environment}</td>
                      <td>{bom.region}</td>

                      <td>
                        <span
                          className={`user-status ${getStatusClass(bom.status)}`}
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
                          ? new Date(bom.createdAt).toLocaleDateString()
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
                {search ? 'No matching requests' : 'No BOM requests yet'}
              </h3>
              <p>
                {search
                  ? 'Try searching with another ticket ID or project name.'
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

        <footer className="user-footer">
          CloudOps Portal • Cloud Infrastructure Provisioning
        </footer>
      </main>
    </div>
  )
}

export default UserDashboard
