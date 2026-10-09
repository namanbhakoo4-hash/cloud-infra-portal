
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './AdminDashboard.css'

const API_URL = 'http://localhost:5000'

function Dashboard() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [masterData, setMasterData] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')

  const [category, setCategory] = useState('region')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [cpu, setCpu] = useState('')
  const [ram, setRam] = useState('')

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  const getToken = () => localStorage.getItem('token')

  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`
  })

  // LOAD ADMIN PROFILE
  const getProfile = async () => {
    if (!getToken()) {
      navigate('/', { replace: true })
      return false
    }

    try {
      const response = await fetch(
        `${API_URL}/api/auth/profile`,
        { headers: getHeaders() }
      )

      const data = await response.json()

      if (response.ok && data.user?.role === 'admin') {
        setUser(data.user)
        return true
      }

      localStorage.removeItem('token')
      navigate('/', { replace: true })
      return false
    } catch (error) {
      console.error(error)
      setMessage('Unable to load admin profile')
      return false
    }
  }

  // LOAD MASTER DATA
  const getMasterData = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/master-data`,
        { headers: getHeaders() }
      )

      const data = await response.json()

      if (response.ok) {
        setMasterData(
          Array.isArray(data.masterData) ? data.masterData : []
        )
      } else {
        setMessage(data.message || 'Unable to load master data')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
    }
  }

  // INITIAL LOAD
  useEffect(() => {
    const loadDashboard = async () => {
      const valid = await getProfile()

      if (valid) {
        await getMasterData()
      }

      setLoading(false)
    }

    loadDashboard()
  }, [])

  // ADD MASTER DATA
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (processing) return

    setMessage('')

    const newMasterData = {
      category,
      name: name.trim(),
      value: value.trim()
    }

    if (category === 'instanceType') {
      newMasterData.cpu = Number(cpu)
      newMasterData.ram = Number(ram)
    }

    setProcessing(true)

    try {
      const response = await fetch(
        `${API_URL}/api/master-data`,
        {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newMasterData)
        }
      )

      const data = await response.json()

      if (response.ok) {
        setMessage('Master data created successfully')
        setName('')
        setValue('')
        setCpu('')
        setRam('')
        await getMasterData()
      } else {
        setMessage(data.message || 'Unable to create master data')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
    } finally {
      setProcessing(false)
    }
  }

  // ENABLE / DISABLE
  const handleToggleStatus = async (item) => {
    if (processing) return

    setProcessing(true)
    setMessage('')

    try {
      const response = await fetch(
        `${API_URL}/api/master-data/${item._id}`,
        {
          method: 'PUT',
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            isActive: !item.isActive
          })
        }
      )

      const data = await response.json()

      if (response.ok) {
        setMessage(
          `Master data ${
            item.isActive ? 'disabled' : 'enabled'
          } successfully`
        )
        await getMasterData()
      } else {
        setMessage(data.message || 'Unable to update master data')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
    } finally {
      setProcessing(false)
    }
  }

  // DELETE MASTER DATA
  const handleDelete = async (id) => {
    if (processing) return

    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this master data record?'
    )

    if (!confirmed) return

    setProcessing(true)
    setMessage('')

    try {
      const response = await fetch(
        `${API_URL}/api/master-data/${id}`,
        {
          method: 'DELETE',
          headers: getHeaders()
        }
      )

      const data = await response.json()

      if (response.ok) {
        setMessage('Master data deleted successfully')
        await getMasterData()
      } else {
        setMessage(data.message || 'Unable to delete master data')
      }
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
    } finally {
      setProcessing(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    navigate('/', { replace: true })
  }

  // STATISTICS
  const totalRecords = masterData.length

  const activeRecords = masterData.filter(
    (item) => item.isActive
  ).length

  const regions = masterData.filter(
    (item) => item.category === 'region'
  ).length

  const instanceTypes = masterData.filter(
    (item) => item.category === 'instanceType'
  ).length

  const categoryLabels = {
    region: 'AWS Region',
    service: 'AWS Service',
    instanceType: 'Instance Type',
    storageType: 'Storage Type'
  }

  // SEARCH AND FILTER
  const filteredData = masterData.filter((item) => {
    const query = search.toLowerCase().trim()

    const matchesSearch =
      (item.name || '').toLowerCase().includes(query) ||
      (item.value || '').toLowerCase().includes(query) ||
      (item.category || '').toLowerCase().includes(query)

    const matchesCategory =
      categoryFilter === 'All' ||
      item.category === categoryFilter

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active' && item.isActive) ||
      (statusFilter === 'Disabled' && !item.isActive)

    return matchesSearch && matchesCategory && matchesStatus
  })

  if (loading) {
    return (
      <div className="admin-loading">
        Loading Admin Dashboard...
      </div>
    )
  }

  return (
    <div className="admin-dashboard">

      {/* NAVBAR */}
      <header className="admin-topbar">
        <div className="admin-brand">
          <div className="admin-brand-icon">☁</div>

          <div>
            <div className="admin-brand-name">
              CloudOps Portal
            </div>
            <div className="admin-brand-subtitle">
              Infrastructure Management
            </div>
          </div>
        </div>

        <div className="admin-header-actions">
          <span className="admin-role-label">
            Admin Workspace
          </span>

          <div className="admin-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
          </div>

          <button
            className="admin-logout"
            onClick={handleLogout}
            disabled={processing}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="admin-main">

        {/* WELCOME */}
        <section className="admin-welcome">
          <div>
            <div className="admin-eyebrow">
              CLOUD INFRASTRUCTURE
            </div>

            <h1>
              Welcome back, {user?.name || 'Admin'}
            </h1>

            <p>
              Manage infrastructure configuration, AWS
              master data, and resource availability.
            </p>
          </div>

          <button
            className="admin-refresh"
            onClick={getMasterData}
            disabled={processing}
          >
            ↻ Refresh Data
          </button>
        </section>

        {/* SUMMARY CARDS */}
        <section className="admin-stats">
          <div className="admin-stat-card">
            <div className="admin-stat-top">
              <span>Total Records</span>
              <span className="admin-stat-icon blue">▤</span>
            </div>

            <strong>{totalRecords}</strong>
            <p>All master data entries</p>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-top">
              <span>Active Records</span>
              <span className="admin-stat-icon green">✓</span>
            </div>

            <strong>{activeRecords}</strong>
            <p>Available for BOM requests</p>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-top">
              <span>AWS Regions</span>
              <span className="admin-stat-icon orange">◎</span>
            </div>

            <strong>{regions}</strong>
            <p>Configured AWS regions</p>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-top">
              <span>Instance Types</span>
              <span className="admin-stat-icon purple">▣</span>
            </div>

            <strong>{instanceTypes}</strong>
            <p>Compute configurations</p>
          </div>
        </section>

        {message && (
          <div className="admin-message" role="status">
            {message}
          </div>
        )}

        {/* ADD MASTER DATA */}
        <section className="admin-panel">
          <div className="admin-panel-header">
            <span className="admin-section-label">
              INFRASTRUCTURE CONFIGURATION
            </span>

            <h2>Add Master Data</h2>

            <p>
              Configure AWS options that users can select
              when creating infrastructure BOM requests.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="admin-form-grid">

              <div className="admin-field">
                <label htmlFor="category">Category</label>

                <select
                  id="category"
                  value={category}
                  disabled={processing}
                  onChange={(e) => {
                    setCategory(e.target.value)
                    setCpu('')
                    setRam('')
                  }}
                >
                  <option value="region">AWS Region</option>
                  <option value="service">AWS Service</option>
                  <option value="instanceType">Instance Type</option>
                  <option value="storageType">Storage Type</option>
                </select>
              </div>

              <div className="admin-field">
                <label htmlFor="name">Name</label>

                <input
                  id="name"
                  type="text"
                  placeholder={
                    category === 'region'
                      ? 'Example: Mumbai'
                      : category === 'instanceType'
                        ? 'Example: t3.medium'
                        : 'Enter display name'
                  }
                  value={name}
                  disabled={processing}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="admin-field">
                <label htmlFor="value">Value</label>

                <input
                  id="value"
                  type="text"
                  placeholder={
                    category === 'region'
                      ? 'Example: ap-south-1'
                      : category === 'instanceType'
                        ? 'Example: t3.medium'
                        : 'Enter configuration value'
                  }
                  value={value}
                  disabled={processing}
                  onChange={(e) => setValue(e.target.value)}
                  required
                />
              </div>

              {category === 'instanceType' && (
                <>
                  <div className="admin-field">
                    <label htmlFor="cpu">CPU (vCPU)</label>

                    <input
                      id="cpu"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Example: 2"
                      value={cpu}
                      disabled={processing}
                      onChange={(e) => setCpu(e.target.value)}
                      required
                    />
                  </div>

                  <div className="admin-field">
                    <label htmlFor="ram">RAM (GB)</label>

                    <input
                      id="ram"
                      type="number"
                      min="1"
                      step="any"
                      placeholder="Example: 4"
                      value={ram}
                      disabled={processing}
                      onChange={(e) => setRam(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}
            </div>

            <button
              className="admin-add-btn"
              type="submit"
              disabled={processing}
            >
              {processing
                ? 'Processing...'
                : '+ Add Master Data'}
            </button>
          </form>
        </section>

        {/* MASTER DATA TABLE */}
        <section className="admin-panel">
          <div className="admin-table-header">
            <div className="admin-panel-header">
              <span className="admin-section-label">
                MASTER DATA MANAGEMENT
              </span>

              <h2>Master Data Records</h2>

              <p>
                Search, enable, disable, and delete
                infrastructure configuration options.
              </p>
            </div>

            <div className="admin-filters">
              <input
                type="search"
                placeholder="Search records..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value)
                }
                aria-label="Filter by category"
              >
                <option value="All">All Categories</option>
                <option value="region">AWS Region</option>
                <option value="service">AWS Service</option>
                <option value="instanceType">Instance Type</option>
                <option value="storageType">Storage Type</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value)
                }
                aria-label="Filter by status"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Disabled">Disabled</option>
              </select>
            </div>
          </div>

          {filteredData.length > 0 ? (
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Name</th>
                    <th>Value</th>
                    <th>CPU</th>
                    <th>RAM</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredData.map((item) => (
                    <tr key={item._id}>
                      <td>
                        <span className="admin-category">
                          {categoryLabels[item.category] ||
                            item.category}
                        </span>
                      </td>

                      <td className="admin-strong">
                        {item.name}
                      </td>

                      <td className="admin-value">
                        {item.value}
                      </td>

                      <td>{item.cpu ?? '—'}</td>

                      <td>
                        {item.ram == null
                          ? '—'
                          : `${item.ram} GB`}
                      </td>

                      <td>
                        <span
                          className={
                            item.isActive
                              ? 'admin-status active'
                              : 'admin-status disabled'
                          }
                        >
                          {item.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      <td>
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="admin-toggle"
                            disabled={processing}
                            onClick={() =>
                              handleToggleStatus(item)
                            }
                          >
                            {item.isActive
                              ? 'Disable'
                              : 'Enable'}
                          </button>

                          <button
                            type="button"
                            className="admin-delete"
                            disabled={processing}
                            onClick={() =>
                              handleDelete(item._id)
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty">
              <div className="admin-empty-icon">▤</div>

              <h3>
                {masterData.length === 0
                  ? 'No master data records yet'
                  : 'No matching records'}
              </h3>

              <p>
                {masterData.length === 0
                  ? 'Add your first infrastructure option above.'
                  : 'Try adjusting your search or filters.'}
              </p>
            </div>
          )}
        </section>

        <footer className="admin-footer">
          CloudOps Portal • Cloud Infrastructure Provisioning
        </footer>
      </main>
    </div>
  )
}

export default Dashboard
