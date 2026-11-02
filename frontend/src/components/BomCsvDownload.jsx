function BomCsvDownload({ bomId, ticketId, className = '' }) {
  const handleDownload = async () => {
    try {
      const token = localStorage.getItem('token')

      if (!token) {
        throw new Error('Please log in again.')
      }

      const response = await fetch(
        `http://localhost:5000/api/bom/${bomId}/export.csv`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        let message = 'Unable to download BOM CSV.'

        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          message = 'Unable to download BOM CSV.'
        }

        throw new Error(message)
      }

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${ticketId || 'BOM'}.csv`

      document.body.appendChild(link)
      link.click()
      link.remove()

      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      alert(error.message || 'CSV download failed.')
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleDownload}
      disabled={!bomId}
    >
      Download CSV
    </button>
  )
}

export default BomCsvDownload