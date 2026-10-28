
const fs = require('fs')
const path = require('path')
const https = require('https')
const { pipeline } = require('stream/promises')
const { spawn } = require('child_process')

const REGION = 'ap-south-1'

const DATA_DIR = path.join(__dirname, 'data')

const CATALOG_FILE = path.join(
  DATA_DIR,
  `aws-ec2-${REGION}.json`
)

const PRICE_FILE = path.join(
  DATA_DIR,
  `aws-ec2-${REGION}-prices.json`
)

const AWS_URL =
  `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/${REGION}/index.json`

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      return reject(new Error('Too many redirects'))
    }

    const request = https.get(
      url,
      { timeout: 120000 },
      async (response) => {
        const status = response.statusCode

        if (
          [301, 302, 303, 307, 308].includes(status)
        ) {
          const location = response.headers.location
          response.resume()

          if (!location) {
            return reject(
              new Error('Redirect without location')
            )
          }

          try {
            const nextUrl = new URL(location, url)

            if (
              nextUrl.protocol !== 'https:' ||
              !nextUrl.hostname.endsWith('.amazonaws.com')
            ) {
              throw new Error(
                'Unexpected AWS redirect destination'
              )
            }

            await downloadFile(
              nextUrl.toString(),
              destination,
              redirects + 1
            )

            return resolve()
          } catch (error) {
            return reject(error)
          }
        }

        if (status !== 200) {
          response.resume()

          return reject(
            new Error(`AWS returned HTTP ${status}`)
          )
        }

        try {
          await pipeline(
            response,
            fs.createWriteStream(destination)
          )

          resolve()
        } catch (error) {
          reject(error)
        }
      }
    )

    request.on('timeout', () => {
      request.destroy(
        new Error('AWS download timed out')
      )
    })

    request.on('error', reject)
  })
}

function runNodeScript(relativePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, relativePath)],
      {
        cwd: __dirname,
        stdio: 'inherit'
      }
    )

    child.on('error', reject)

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(
            `${relativePath} failed with exit code ${code}`
          )
        )
      }
    })
  })
}

function restoreFile(backup, destination) {
  if (!fs.existsSync(backup)) return

  fs.copyFileSync(backup, destination)
}

async function refreshAwsCatalog() {
  const catalogBackup = `${CATALOG_FILE}.backup`
  const priceBackup = `${PRICE_FILE}.backup`
  const temporaryDownload = `${CATALOG_FILE}.download`

  let catalogReplaced = false
  let priceReplaced = false
  let completed = false

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })

    console.log('================================')
    console.log('AWS AUTOMATIC CATALOG REFRESH')
    console.log('================================')
    console.log('Region:', REGION)
    console.log('Source:', AWS_URL)

    // Back up existing working files
    if (fs.existsSync(CATALOG_FILE)) {
      fs.copyFileSync(CATALOG_FILE, catalogBackup)
    }

    if (fs.existsSync(PRICE_FILE)) {
      fs.copyFileSync(PRICE_FILE, priceBackup)
    }

    console.log('\nStep 1: Downloading AWS catalog...')

    await downloadFile(AWS_URL, temporaryDownload)

    const stats = fs.statSync(temporaryDownload)

    if (stats.size < 1000000) {
      throw new Error(
        'Downloaded AWS catalog is unexpectedly small'
      )
    }

    fs.renameSync(temporaryDownload, CATALOG_FILE)
    catalogReplaced = true

    console.log(
      'Download completed:',
      (stats.size / 1024 / 1024).toFixed(2),
      'MB'
    )

    console.log('\nStep 2: Extracting prices...')

    priceReplaced = true

    await runNodeScript(
      'scripts/extractAwsPrices.js'
    )

    const prices = JSON.parse(
      fs.readFileSync(PRICE_FILE, 'utf8')
    )

    if (
      prices.cloudProvider !== 'aws' ||
      prices.region !== REGION ||
      !Array.isArray(prices.prices) ||
      prices.prices.length === 0
    ) {
      throw new Error(
        'Extracted pricing data failed validation'
      )
    }

    console.log(
      'Validated instance prices:',
      prices.prices.length
    )

    console.log('\nStep 3: Synchronizing MongoDB...')

    await runNodeScript(
      'syncAwsInstanceCatalog.js'
    )

    completed = true

    console.log('\n================================')
    console.log('AWS REFRESH SUCCESSFUL')
    console.log('================================')
    console.log('Instance prices:', prices.prices.length)
    console.log('MongoDB synchronization completed')
  } catch (error) {
    console.error('\nAWS refresh failed:')
    console.error(error.message)

    // Restore previous pricing files where possible.
    // MongoDB updates, if already committed, are not rolled back.
    if (catalogReplaced) {
      restoreFile(catalogBackup, CATALOG_FILE)
    }

    if (priceReplaced) {
      restoreFile(priceBackup, PRICE_FILE)
    }

    process.exitCode = 1
  } finally {
    if (fs.existsSync(temporaryDownload)) {
      fs.unlinkSync(temporaryDownload)
    }

    if (completed) {
      console.log(
        '\nExisting backups can now be removed after verification.'
      )
    }
  }
}

refreshAwsCatalog()
