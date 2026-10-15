const fs = require('fs')
const path = require('path')
const https = require('https')

const REGION = 'ap-south-1'

const BASE_URL =
  'https://pricing.us-east-1.amazonaws.com'

const PRICE_LIST_URL =
  `${BASE_URL}/offers/v1.0/aws/AmazonEC2/current/${REGION}/index.json`

const OUTPUT_DIRECTORY = path.join(__dirname, '../data')

const OUTPUT_FILE = path.join(
  OUTPUT_DIRECTORY,
  `aws-ec2-${REGION}.json`
)

const TEMP_FILE = `${OUTPUT_FILE}.part`

const MAX_RETRIES = 8
const RETRY_DELAY_MS = 3000

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms))

function requestFile(url, startByte = 0) {
  return new Promise((resolve, reject) => {
    const headers = {}

    if (startByte > 0) {
      headers.Range = `bytes=${startByte}-`
    }

    const request = https.get(
      url,
      {
        headers,
        timeout: 60000
      },
      (response) => {
        resolve(response)
      }
    )

    request.on('timeout', () => {
      request.destroy(new Error('Connection timed out'))
    })

    request.on('error', reject)
  })
}

async function downloadAttempt() {
  const downloadedBytes = fs.existsSync(TEMP_FILE)
    ? fs.statSync(TEMP_FILE).size
    : 0

  console.log(
    `Existing download: ${(downloadedBytes / 1048576).toFixed(2)} MiB`
  )

  const response = await requestFile(
    PRICE_LIST_URL,
    downloadedBytes
  )

  if (response.statusCode === 416) {
    response.resume()
    throw new Error('AWS rejected the requested byte range')
  }

  if (![200, 206].includes(response.statusCode)) {
    response.resume()

    throw new Error(
      `AWS returned HTTP ${response.statusCode}`
    )
  }

  let append = false
  let expectedTotal = null

  if (response.statusCode === 206) {
    const contentRange = response.headers['content-range']

    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
      String(contentRange || '')
    )

    if (!match) {
      response.destroy()
      throw new Error('Invalid Content-Range response')
    }

    const rangeStart = Number(match[1])
    const rangeEnd = Number(match[2])
    expectedTotal = Number(match[3])

    if (
      rangeStart !== downloadedBytes ||
      rangeEnd < rangeStart
    ) {
      response.destroy()
      throw new Error('Unexpected byte range from AWS')
    }

    append = downloadedBytes > 0
  } else {
    if (downloadedBytes > 0) {
      console.log(
        'AWS did not support resume. Restarting download.'
      )
    }

    const length = Number(
      response.headers['content-length']
    )

    if (Number.isSafeInteger(length) && length > 0) {
      expectedTotal = length
    }
  }

  const file = fs.createWriteStream(TEMP_FILE, {
    flags: append ? 'a' : 'w'
  })

  let receivedBytes = 0
  let lastProgress = Date.now()

  await new Promise((resolve, reject) => {
    let settled = false

    function fail(error) {
      if (settled) return
      settled = true
      file.destroy()
      response.destroy()
      reject(error)
    }

    response.on('data', (chunk) => {
      receivedBytes += chunk.length

      if (Date.now() - lastProgress >= 2000) {
        const totalDownloaded =
          (append ? downloadedBytes : 0) +
          receivedBytes

        console.log(
          `Downloaded: ${(totalDownloaded / 1048576).toFixed(2)} MiB`
        )

        lastProgress = Date.now()
      }
    })

    response.on('error', fail)
    response.on('aborted', () => {
      fail(new Error('AWS interrupted the response'))
    })

    file.on('error', fail)

    file.on('finish', () => {
      if (settled) return
      settled = true
      resolve()
    })

    response.pipe(file)
  })

  if (!response.complete) {
    throw new Error('AWS response was incomplete')
  }

  const finalSize = fs.statSync(TEMP_FILE).size

  if (
    expectedTotal !== null &&
    finalSize !== expectedTotal
  ) {
    throw new Error(
      `Incomplete download: expected ${expectedTotal} bytes, got ${finalSize}`
    )
  }

  if (expectedTotal === null) {
    throw new Error(
      'Cannot verify download size because AWS did not provide a total length'
    )
  }

  return finalSize
}

async function syncAwsPricing() {
  fs.mkdirSync(OUTPUT_DIRECTORY, {
    recursive: true
  })

  console.log('Starting AWS EC2 pricing download...')
  console.log('Region:', REGION)
  console.log('Source:', PRICE_LIST_URL)

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `\nDownload attempt ${attempt}/${MAX_RETRIES}`
      )

      const size = await downloadAttempt()

      fs.renameSync(TEMP_FILE, OUTPUT_FILE)

      console.log('\nDownload completed successfully!')
      console.log('File:', OUTPUT_FILE)

      console.log(
        'Size:',
        (size / 1048576).toFixed(2),
        'MiB'
      )

      console.log(
        'Next step: Extract EC2 On-Demand prices.'
      )

      return
    } catch (error) {
      console.error(
        'Download attempt failed:',
        error.message
      )

      if (attempt === MAX_RETRIES) {
        console.error(
          '\nMaximum retries reached.'
        )

        process.exitCode = 1
        return
      }

      console.log(
        'Retrying in 3 seconds...'
      )

      await sleep(RETRY_DELAY_MS)
    }
  }
}

syncAwsPricing()