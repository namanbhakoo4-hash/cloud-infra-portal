
import { useNavigate } from 'react-router-dom'

function AzureDashboard() {
  const navigate = useNavigate()

  return (
    <main style={{ padding: '40px', fontFamily: 'inherit' }}>
      <button onClick={() => navigate('/cloud-provider')}>
        ← Back to cloud selection
      </button>

      <h1>Azure Infrastructure Dashboard</h1>

      <p>
        This page is ready for the Azure BOM workflow.
        Azure submission and Terraform generation are not
        implemented yet.
      </p>
    </main>
  )
}

export default AzureDashboard
