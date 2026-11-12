import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './CloudEngineerDashboard.css'

const API_URL = 'http://localhost:5000'

function CloudEngineerDashboard() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [boms, setBoms] = useState([])
  const [selectedBom, setSelectedBom] = useState(null)
  const [engineerRemarks, setEngineerRemarks] = useState('')
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Prevent duplicate review submissions
  const reviewInProgress = useRef(false)

  const getToken = () => localStorage.getItem('token')

  const getHeaders = () => ({
    Authorization: `Bearer ${getToken()}`
  })

  // GET PROFILE
  const getProfile = async () => {
    const token = getToken()

    if (!token) {
      navigate('/', { replace: true })
      return false
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        headers: getHeaders()
      })

      const data = await response.json()

      if (response.ok && data.user?.role === 'cloud_engineer') {
        setUser(data.user)
        return true
      }

      localStorage.removeItem('token')
      navigate('/', { replace: true })
      return false
    } catch (error) {
      console.error(error)
      setMessage('Unable to load profile')
      return false
    }
  }

  // GET ALL BOMS
  const getBoms = async () => {
    try {
      const response = await fetch(`${API_URL}/api/bom/all`, {
        headers: getHeaders()
      })

      const data = await response.json()

      if (response.ok) {
        const bomList = Array.isArray(data) ? data : []
        setBoms(bomList)
        return bomList
      }

      setMessage(data.message || 'Unable to load BOM requests')
      return []
    } catch (error) {
      console.error(error)
      setMessage('Unable to connect to server')
      return []
    }
  }

  // DOWNLOAD BOM CSV
  const handleDownloadCsv = async (bom) => {
    try {
      setMessage(`Preparing CSV export for ${bom.ticketId || 'this BOM'}...`)

      const response = await fetch(
        `${API_URL}/api/bom/${bom._id}/export.csv`,
        {
          method: 'GET',
          headers: getHeaders()
        }
      )

      if (!response.ok) {
        let errorMessage = 'Unable to download BOM CSV'

        try {
          const data = await response.json()
          errorMessage = data.message || errorMessage
        } catch (error) {
          console.error('CSV export error response:', error)
        }

        throw new Error(errorMessage)
      }

      const csvBlob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(csvBlob)
      const link = document.createElement('a')
      const safeTicketId = String(bom.ticketId || bom._id)
        .replace(/[^a-zA-Z0-9_-]/g, '_')

      link.href = downloadUrl
      link.download = `${safeTicketId}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)

      setMessage(`CSV exported successfully for ${bom.ticketId || 'the selected BOM'}.`)
    } catch (error) {
      console.error('BOM CSV download error:', error)
      setMessage(error.message || 'Unable to download BOM CSV')
    }
  }

  // INITIAL LOAD
  useEffect(() => {
    const loadDashboard = async () => {
      const validProfile = await getProfile()

      if (validProfile) {
        await getBoms()
      }

      setLoading(false)
    }

    loadDashboard()
  }, [])

  // VIEW BOM
  const handleViewBom = (bom) => {
    if (reviewInProgress.current) return

    setSelectedBom(bom)
    setEngineerRemarks(bom.engineerRemarks || '')
    setMessage('')

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  const handleCloseBom = () => {
    if (reviewInProgress.current) return

    setSelectedBom(null)
    setEngineerRemarks('')
    setMessage('')
  }

  // REVIEW BOM
  const handleReview = async (status) => {
    if (reviewInProgress.current) return

    if (!selectedBom) {
      setMessage('Please select a BOM first')
      return
    }

    if (selectedBom.status !== 'Pending Review') {
      setMessage('This BOM has already been reviewed')
      return
    }

    if (
      (status === 'Changes Requested' || status === 'Rejected') &&
      !engineerRemarks.trim()
    ) {
      setMessage(
        'Please enter remarks before requesting changes or rejecting the BOM'
      )
      return
    }

    reviewInProgress.current = true
    setProcessing(true)

    setMessage(
      status === 'Approved'
        ? 'Running Terraform automation. Please wait...'
        : 'Submitting review. Please wait...'
    )

    try {
      const response = await fetch(
        `${API_URL}/api/bom/${selectedBom._id}/review`,
        {
          method: 'PUT',
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status,
            engineerRemarks
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setMessage(data.message || 'Unable to review BOM')
        return
      }

      const updatedBoms = await getBoms()

      const updatedBom = updatedBoms.find(
        (bom) => bom._id === selectedBom._id
      )

      // Keep the reviewed request open
      setSelectedBom(updatedBom || data.bom || null)

      setMessage(
        data.message || `BOM ${status} successfully`
      )
    } catch (error) {
      console.error(error)
      setMessage(
        'Unable to connect to server. Check the BOM status before retrying.'
      )
    } finally {
      reviewInProgress.current = false
      setProcessing(false)
    }
  }

  // TERRAFORM STATUS
  const getTerraformStatus = (bom, field) => {
    if (!bom?.terraformExecution?.executedAt) {
      return 'Not Recorded'
    }

    return bom.terraformExecution[field] || 'Not Recorded'
  }

  const getTerraformStatusClass = (status) => {
    if (status === 'Success') return 'ce-status-approved'
    if (status === 'Failed') return 'ce-status-rejected'
    return 'ce-status-neutral'
  }

  const getBomStatusClass = (status) => {
    switch (status) {
      case 'Approved':
        return 'ce-status-approved'

      case 'Pending Review':
        return 'ce-status-pending'

      case 'Changes Requested':
        return 'ce-status-changes'

      case 'Rejected':
      case 'Plan Failed':
        return 'ce-status-rejected'

      default:
        return 'ce-status-neutral'
    }
  }

  const renderTerraformResults = (bom) => {
    const execution = bom.terraformExecution

    const steps = [
      {
        label: 'Terraform File Generation',
        field: 'generation'
      },
      {
        label: 'Terraform Init',
        field: 'init'
      },
      {
        label: 'Terraform Validate',
        field: 'validate'
      },
      {
        label: 'Simulated Plan',
        field: 'plan'
      }
    ]

    return (
      <div className="ce-terraform-panel">
        <div className="ce-subsection-heading">
          <div>
            <h3>Terraform Execution Results</h3>
            <p>
              Infrastructure configuration and validation workflow
            </p>
          </div>

          <span className="ce-simulation-label">
            SIMULATED PLAN
          </span>
        </div>

        <div className="ce-terraform-steps">
          {steps.map((step) => {
            const status = getTerraformStatus(bom, step.field)

            return (
              <div className="ce-terraform-step" key={step.field}>
                <span>{step.label}</span>

                <span
                  className={`ce-status ${getTerraformStatusClass(status)}`}
                >
                  {status}
                </span>
              </div>
            )
          })}
        </div>

        <div className="ce-terraform-meta">
          <p>
            <strong>Plan Type:</strong>{' '}
            {execution?.executedAt
              ? execution.planType || 'SIMULATED'
              : 'Not Recorded'}
          </p>

          {execution?.terraformFolder && (
            <p>
              <strong>Terraform Folder:</strong>{' '}
              <span className="ce-break-text">
                {execution.terraformFolder}
              </span>
            </p>
          )}

          {execution?.executedAt && (
            <p>
              <strong>Executed At:</strong>{' '}
              {new Date(execution.executedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="ce-info-note">
          This workflow generates Terraform files and records validation
          results. The plan is simulated, not a real Terraform plan.
          No AWS infrastructure has been deployed.
        </div>
      </div>
    )
  }

  const handleLogout = () => {
    if (reviewInProgress.current) return

    localStorage.removeItem('token')
    navigate('/', { replace: true })
  }

  // SUMMARY COUNTS
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

  // SEARCH AND FILTER
  const filteredBoms = boms.filter((bom) => {
    const query = search.toLowerCase().trim()

    const matchesSearch =
      (bom.ticketId || '').toLowerCase().includes(query) ||
      (bom.projectName || '').toLowerCase().includes(query) ||
      (bom.createdBy?.name || '').toLowerCase().includes(query) ||
      (bom.region || '').toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'All' || bom.status === statusFilter

    return matchesSearch && matchesStatus
  })

  if (loading) {
    return (
      <div className="ce-loading">
        Loading Cloud Engineer Workspace...
      </div>
    )
  }

  return (
    <div className="ce-dashboard">

      {/* HEADER */}
      <header className="ce-topbar">
        <div className="ce-brand">
          <div className="ce-brand-icon">☁</div>

          <div>
            <div className="ce-brand-name">CloudOps Portal</div>
            <div className="ce-brand-subtitle">
              Infrastructure Management
            </div>
          </div>
        </div>

        <div className="ce-header-actions">
          <span className="ce-role-label">
            Cloud Engineer Workspace
          </span>

          <div className="ce-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'E'}
          </div>

          <button
            className="ce-logout"
            onClick={handleLogout}
            disabled={processing}
          >
            Logout
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="ce-main">

        <div className="ce-welcome">
          <div>
            <div className="ce-page-eyebrow">
              CLOUD INFRASTRUCTURE
            </div>

            <h1>
              Welcome back, {user?.name || 'Engineer'}
            </h1>

            <p>
              Review infrastructure requests, manage approvals,
              and monitor Terraform validation results.
            </p>
          </div>

          <button
            className="ce-refresh-btn"
            onClick={getBoms}
            disabled={processing}
          >
            ↻ Refresh Requests
          </button>
        </div>

        {/* SUMMARY CARDS */}
        <div className="ce-stats-grid">
          <div className="ce-stat-card">
            <div className="ce-stat-top">
              <span>Total Requests</span>
              <span className="ce-stat-icon ce-icon-blue">▤</span>
            </div>

            <div className="ce-stat-value">{totalRequests}</div>
            <div className="ce-stat-footer">
              All infrastructure requests
            </div>
          </div>

          <div className="ce-stat-card">
            <div className="ce-stat-top">
              <span>Pending Review</span>
              <span className="ce-stat-icon ce-icon-orange">◷</span>
            </div>

            <div className="ce-stat-value">{pendingRequests}</div>
            <div className="ce-stat-footer">
              Awaiting engineer action
            </div>
          </div>

          <div className="ce-stat-card">
            <div className="ce-stat-top">
              <span>Approved</span>
              <span className="ce-stat-icon ce-icon-green">✓</span>
            </div>

            <div className="ce-stat-value">{approvedRequests}</div>
            <div className="ce-stat-footer">
              Approved BOM requests
            </div>
          </div>

          <div className="ce-stat-card">
            <div className="ce-stat-top">
              <span>Changes Requested</span>
              <span className="ce-stat-icon ce-icon-purple">↻</span>
            </div>

            <div className="ce-stat-value">{changesRequested}</div>
            <div className="ce-stat-footer">
              Awaiting user updates
            </div>
          </div>
        </div>

        {/* MESSAGE */}
        {message && (
          <div className="ce-message" role="status">
            {message}
          </div>
        )}

        {/* SELECTED BOM DETAILS */}
        {selectedBom && (
          <section className="ce-panel ce-review-panel">
            <div className="ce-panel-heading">
              <div>
                <span className="ce-section-label">
                  INFRASTRUCTURE REVIEW
                </span>

                <h2>
                  {selectedBom.status === 'Pending Review'
                    ? 'Review BOM Request'
                    : 'BOM Request Details'}
                </h2>

                <p>
                  Ticket: {selectedBom.ticketId || 'N/A'}
                </p>
              </div>

              <button
                className="ce-close-btn"
                onClick={handleCloseBom}
                disabled={processing}
                aria-label="Close BOM details"
              >
                ✕
              </button>
            </div>

            {/* REQUEST DETAILS */}
            <div className="ce-subsection-heading">
              <h3>Request Information</h3>
            </div>

            <div className="ce-detail-grid">
              <div className="ce-detail-item">
                <span>Ticket ID</span>
                <strong>{selectedBom.ticketId || '—'}</strong>
              </div>

              <div className="ce-detail-item">
                <span>Requested By</span>
                <strong>
                  {selectedBom.createdBy?.name || 'Unknown User'}
                </strong>
              </div>

              <div className="ce-detail-item">
                <span>Email</span>
                <strong>
                  {selectedBom.createdBy?.email || '—'}
                </strong>
              </div>

              <div className="ce-detail-item">
                <span>Project</span>
                <strong>{selectedBom.projectName}</strong>
              </div>

              <div className="ce-detail-item">
                <span>Environment</span>
                <strong>{selectedBom.environment}</strong>
              </div>

              <div className="ce-detail-item">
                <span>AWS Region</span>
                <strong>{selectedBom.region}</strong>
              </div>

              <div className="ce-detail-item">
                <span>Status</span>
                <span
                  className={`ce-status ${getBomStatusClass(selectedBom.status)}`}
                >
                  {selectedBom.status}
                </span>
              </div>

              <div className="ce-detail-item ce-detail-full">
                <span>Business Justification</span>
                <strong>
                  {selectedBom.justification || '—'}
                </strong>
              </div>
            </div>

            {/* RESOURCE DETAILS */}
            <div className="ce-subsection-heading ce-resource-heading">
              <h3>Resource Configuration</h3>
              <p>Requested AWS infrastructure resources</p>
            </div>

            {selectedBom.resources?.length > 0 ? (
              <div className="ce-table-wrapper">
                <table className="ce-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Instance Type</th>
                      <th>CPU</th>
                      <th>RAM</th>
                      <th>Storage</th>
                      <th>Quantity</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedBom.resources.map((resource, index) => (
                      <tr key={resource._id || index}>
                        <td>{resource.service || '—'}</td>
                        <td className="ce-table-strong">
                          {resource.instanceType || '—'}
                        </td>
                        <td>
                          {resource.cpu == null
                            ? '—'
                            : `${resource.cpu} vCPU`}
                        </td>
                        <td>
                          {resource.ram == null
                            ? '—'
                            : `${resource.ram} GB`}
                        </td>
                        <td>
                          {resource.storage == null
                            ? '—'
                            : `${resource.storage} GB`}
                        </td>
                        <td>{resource.quantity ?? 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No resource information available.</p>
            )}

            {/* REVIEW ACTIONS */}
            {selectedBom.status === 'Pending Review' ? (
              <div className="ce-review-actions-section">
                <div className="ce-subsection-heading">
                  <h3>Engineer Review</h3>
                  <p>
                    Add remarks and select the appropriate review action.
                  </p>
                </div>

                <div className="ce-form-field">
                  <label htmlFor="ce-remarks">
                    Engineer Remarks
                  </label>

                  <textarea
                    id="ce-remarks"
                    rows="4"
                    placeholder="Enter remarks if changes are required or the request is rejected..."
                    value={engineerRemarks}
                    disabled={processing}
                    onChange={(e) =>
                      setEngineerRemarks(e.target.value)
                    }
                  />

                  <small>
                    Remarks are required for rejection and change requests.
                  </small>
                </div>

                <div className="ce-action-buttons">
                  <button
                    className="ce-approve-btn"
                    disabled={processing}
                    onClick={() => handleReview('Approved')}
                  >
                    {processing ? 'Processing...' : '✓ Approve BOM'}
                  </button>

                  <button
                    className="ce-changes-btn"
                    disabled={processing}
                    onClick={() => handleReview('Changes Requested')}
                  >
                    ↻ Request Changes
                  </button>

                  <button
                    className="ce-reject-btn"
                    disabled={processing}
                    onClick={() => handleReview('Rejected')}
                  >
                    ✕ Reject BOM
                  </button>

                  <button
                    className="ce-secondary-btn"
                    disabled={processing}
                    onClick={handleCloseBom}
                  >
                    Cancel
                  </button>
                </div>

                {processing && (
                  <div className="ce-processing-note">
                    Processing request. Please do not refresh or submit
                    again until the operation finishes.
                  </div>
                )}
              </div>
            ) : (
              <div className="ce-reviewed-section">
                <div className="ce-subsection-heading">
                  <h3>Engineer Review</h3>
                </div>

                <p>
                  <strong>Engineer Remarks:</strong>{' '}
                  {selectedBom.engineerRemarks || '—'}
                </p>

                <p>
                  This BOM is not currently pending review.
                </p>
              </div>
            )}

            {/* TERRAFORM RESULTS */}
            {(selectedBom.status === 'Approved' ||
              selectedBom.terraformExecution?.executedAt) &&
              renderTerraformResults(selectedBom)}

            {selectedBom.status !== 'Pending Review' && (
              <button
                className="ce-secondary-btn ce-bottom-close"
                onClick={handleCloseBom}
              >
                Close Details
              </button>
            )}
          </section>
        )}

        {/* BOM REQUESTS TABLE */}
        <section className="ce-panel">
          <div className="ce-panel-heading ce-history-heading">
            <div>
              <span className="ce-section-label">
                REQUEST MANAGEMENT
              </span>

              <h2>BOM Requests</h2>
              <p>
                Review, approve and track submitted infrastructure requests.
              </p>
            </div>

            <div className="ce-table-filters">
              <input
                type="search"
                className="ce-search"
                placeholder="Search requests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="ce-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Pending Review">Pending Review</option>
                <option value="Approved">Approved</option>
                <option value="Changes Requested">
                  Changes Requested
                </option>
                <option value="Rejected">Rejected</option>
                <option value="Plan Failed">Plan Failed</option>
              </select>
            </div>
          </div>

          {filteredBoms.length > 0 ? (
            <div className="ce-table-wrapper">
              <table className="ce-table ce-requests-table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>Requested By</th>
                    <th>Project</th>
                    <th>Environment</th>
                    <th>Region</th>
                    <th>Status</th>
                    <th>Terraform</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredBoms.map((bom) => (
                    <tr key={bom._id}>
                      <td className="ce-ticket">
                        {bom.ticketId || '—'}
                      </td>

                      <td>
                        {bom.createdBy?.name || 'Unknown User'}
                      </td>

                      <td className="ce-table-strong">
                        {bom.projectName}
                      </td>

                      <td>{bom.environment}</td>
                      <td>{bom.region}</td>

                      <td>
                        <span
                          className={`ce-status ${getBomStatusClass(bom.status)}`}
                        >
                          {bom.status}
                        </span>
                      </td>

                      <td>
                        {bom.terraformExecution?.executedAt
                          ? (
                            <span
                              className={`ce-status ${getTerraformStatusClass(
                                getTerraformStatus(bom, 'validate')
                              )}`}
                            >
                              {getTerraformStatus(bom, 'validate')}
                            </span>
                          )
                          : 'Not Started'}
                      </td>

                      <td>
                        <div className="ce-action-buttons">
                          <button
                            className="ce-view-btn"
                            disabled={processing}
                            onClick={() => handleViewBom(bom)}
                          >
                            {bom.status === 'Pending Review'
                              ? 'View / Review'
                              : 'View Details'}
                          </button>

                          <button
                            className="ce-secondary-btn"
                            onClick={() => handleDownloadCsv(bom)}
                          >
                            Download CSV
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ce-empty-state">
              <div className="ce-empty-icon">▤</div>

              <h3>
                {boms.length === 0
                  ? 'No BOM requests yet'
                  : 'No matching requests'}
              </h3>

              <p>
                {boms.length === 0
                  ? 'Submitted infrastructure requests will appear here.'
                  : 'Try adjusting your search or status filter.'}
              </p>
            </div>
          )}
        </section>

        <footer className="ce-footer">
          CloudOps Portal • Cloud Infrastructure Provisioning
        </footer>
      </main>
    </div>
  )
}

export default CloudEngineerDashboard
