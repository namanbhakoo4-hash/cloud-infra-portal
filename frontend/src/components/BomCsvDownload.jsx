function BomCsvDownload({ bomId, ticketId, className = '' }) {
  const downloadFile = async (format) => {
    try {
      const token = localStorage.getItem('token')

      if (!token) {
        throw new Error('Please log in again.')
      }

      const isExcel = format === 'xlsx'
      const extension = isExcel ? 'xlsx' : 'csv'
      const response = await fetch(
        `http://localhost:5000/api/bom/${bomId}/export.${extension}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        let message = `Unable to download BOM ${isExcel ? 'Excel' : 'CSV'}.`

        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          message = `Unable to download BOM ${isExcel ? 'Excel' : 'CSV'}.`
        }

        throw new Error(message)
      }

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${ticketId || 'BOM'}.${extension}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      alert(error.message || 'BOM download failed.')
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={className}
        onClick={() => downloadFile('csv')}
        disabled={!bomId}
      >
        Download CSV
      </button>
      <button
        type="button"
        className={className}
        onClick={() => downloadFile('xlsx')}
        disabled={!bomId}
      >
        Download Excel
      </button>
    </div>
  )
}

export default BomCsvDownload
