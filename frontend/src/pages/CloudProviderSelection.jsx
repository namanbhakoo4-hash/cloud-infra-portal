
import { useNavigate } from 'react-router-dom'
import './CloudProviderSelection.css'

function CloudProviderSelection() {
  const navigate = useNavigate()

  return (
    <main className="provider-page">
      <header className="provider-header">
        <div className="provider-brand">
          <span className="provider-brand-icon">☁</span>
          <span>CloudOps Portal</span>
        </div>

        <button
          className="provider-logout"
          onClick={() => {
            localStorage.removeItem('token')
            navigate('/', { replace: true })
          }}
        >
          Sign out
        </button>
      </header>

      <section className="provider-content">
        <div className="provider-eyebrow">
          CLOUD INFRASTRUCTURE MANAGEMENT
        </div>

        <h1>Choose your cloud provider</h1>

        <p className="provider-description">
          Select the cloud platform for which you want to
          configure and submit infrastructure requirements.
        </p>

        <div className="provider-grid">
          <button
            className="provider-card provider-aws"
            onClick={() => navigate('/user-dashboard')}
          >
            <span className="provider-icon">☁</span>
            <span className="provider-card-title">
              Amazon Web Services
            </span>
            <span className="provider-card-description">
              Create and manage AWS infrastructure requests.
            </span>
            <span className="provider-card-action">
              Continue with AWS →
            </span>
          </button>

          <button
            className="provider-card provider-azure"
            onClick={() => navigate('/azure-dashboard')}
          >
            <span className="provider-icon">☁</span>
            <span className="provider-card-title">
              Microsoft Azure
            </span>
            <span className="provider-card-description">
              Configure Azure infrastructure requirements.
            </span>
            <span className="provider-card-action">
              Continue with Azure →
            </span>
          </button>
        </div>

        <p className="provider-footer">
          Your cloud selection determines which infrastructure
          configuration workflow you enter.
        </p>
      </section>
    </main>
  )
}

export default CloudProviderSelection
