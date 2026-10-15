const fs = require('fs')
const path = require('path')

const { chain } = require('stream-chain')
const { parser } = require('stream-json')

// Compatible with stream-json 3.x
const { pick } = require('stream-json/filters/pick.js')
const { streamObject } = require('stream-json/streamers/stream-object.js')

// ==========================================
// CONFIGURATION
// ==========================================

const REGION = 'ap-south-1'

const INPUT_FILE = path.join(
  __dirname,
  '..',
  'data',
  `aws-ec2-${REGION}.json`
)

const OUTPUT_FILE = path.join(
  __dirname,
  '..',
  'data',
  `aws-ec2-${REGION}-prices.json`
)

// ==========================================
// HELPER: STREAM A SECTION OF LARGE JSON
// ==========================================

function createJsonStream(section) {
  return chain([
    fs.createReadStream(INPUT_FILE),
    parser(),
    pick({ filter: section }),
    streamObject()
  ])
}

// ==========================================
// EXTRACT AWS EC2 PRICES
// ==========================================

async function extractAwsPrices() {
  console.log('===================================')
  console.log('AWS EC2 PRICE EXTRACTION')
  console.log('===================================')

  console.log('Region:', REGION)
  console.log('Input:', INPUT_FILE)

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(
      'AWS pricing file not found. Run syncAwsPricing.js first.'
    )
  }

  // ========================================
  // STEP 1: FIND MATCHING EC2 PRODUCTS
  // ========================================

  console.log('\nStep 1: Reading AWS EC2 products...')

  const products = new Map()

  const productStream = createJsonStream('products')

  let scannedProducts = 0

  for await (const { key: sku, value: product } of productStream) {
    scannedProducts++

    const attributes = product.attributes || {}

    const isLinux =
      attributes.operatingSystem === 'Linux'

    const isShared =
      attributes.tenancy === 'Shared'

    const noPreinstalledSoftware =
      attributes.preInstalledSw === 'NA'

    const isNormalCapacity =
      attributes.capacitystatus === 'Used'

    const isCorrectRegion =
      attributes.regionCode === REGION

    const isAwsRegion =
      attributes.locationType === 'AWS Region'

    const hasInstanceType =
      Boolean(attributes.instanceType)

    if (
      isLinux &&
      isShared &&
      noPreinstalledSoftware &&
      isNormalCapacity &&
      isCorrectRegion &&
      isAwsRegion &&
      hasInstanceType
    ) {
      products.set(sku, {
        sku,
        instanceType: attributes.instanceType,
        operatingSystem: 'Linux',
        vcpu: attributes.vcpu,
        memory: attributes.memory
      })
    }

    if (scannedProducts % 50000 === 0) {
      console.log(
        `Scanned ${scannedProducts} products...`
      )
    }
  }

  console.log(
    `Total products scanned: ${scannedProducts}`
  )

  console.log(
    `Matching Linux EC2 SKUs: ${products.size}`
  )

  // ========================================
  // STEP 2: READ ON-DEMAND PRICING TERMS
  // ========================================

  console.log('\nStep 2: Reading AWS On-Demand prices...')

  const priceStream = createJsonStream('terms.OnDemand')

  const priceCandidates = new Map()

  let scannedTerms = 0

  for await (const { key: sku, value: terms } of priceStream) {
    scannedTerms++

    const product = products.get(sku)

    if (!product) {
      continue
    }

    for (const term of Object.values(terms || {})) {
      for (const dimension of Object.values(
        term.priceDimensions || {}
      )) {
        const unit = dimension.unit

        const price = Number(
          dimension.pricePerUnit?.USD
        )

        if (unit !== 'Hrs') {
          continue
        }

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {
          continue
        }

        // Only accept hourly dimensions.
        // Exclude dimensions with a finite usage limit
        // to avoid tier-specific pricing.

        const beginRange = String(
          dimension.beginRange ?? '0'
        )

        const endRange = String(
          dimension.endRange ?? 'Inf'
        )

        if (
          beginRange !== '0' ||
          endRange !== 'Inf'
        ) {
          continue
        }

        const key = product.instanceType

        if (!priceCandidates.has(key)) {
          priceCandidates.set(key, [])
        }

        priceCandidates.get(key).push({
          cloudProvider: 'aws',
          region: REGION,
          instanceType: product.instanceType,
          operatingSystem: 'Linux',
          tenancy: 'Shared',
          purchaseOption: 'On-Demand',
          vcpu: product.vcpu,
          memory: product.memory,
          hourlyPrice: price,
          currency: 'USD',
          pricingSource: 'AWS Public Price List',
          sku,
          rateCode: dimension.rateCode,
          description: dimension.description
        })
      }
    }

    if (scannedTerms % 50000 === 0) {
      console.log(
        `Scanned ${scannedTerms} pricing terms...`
      )
    }
  }

  console.log(
    `Total pricing terms scanned: ${scannedTerms}`
  )

  // ========================================
  // STEP 3: REMOVE AMBIGUOUS PRICES
  // ========================================

  console.log('\nStep 3: Validating extracted prices...')

  const prices = []
  const ambiguousInstances = []

  for (const [instanceType, candidates] of priceCandidates) {
    const uniquePrices = [
      ...new Set(
        candidates.map((item) => item.hourlyPrice)
      )
    ]

    if (uniquePrices.length !== 1) {
      ambiguousInstances.push({
        instanceType,
        candidatePrices: uniquePrices
      })

      continue
    }

    const selected = candidates[0]

    prices.push({
      cloudProvider: selected.cloudProvider,
      region: selected.region,
      instanceType: selected.instanceType,
      operatingSystem: selected.operatingSystem,
      tenancy: selected.tenancy,
      purchaseOption: selected.purchaseOption,
      vcpu: selected.vcpu,
      memory: selected.memory,
      hourlyPrice: selected.hourlyPrice,
      currency: selected.currency,
      pricingSource: selected.pricingSource,
      sku: selected.sku,
      rateCode: selected.rateCode,
      description: selected.description
    })
  }

  prices.sort((a, b) =>
    a.instanceType.localeCompare(b.instanceType)
  )

  // ========================================
  // STEP 4: SAVE COMPACT PRICING FILE
  // ========================================

  console.log('\nStep 4: Saving compact pricing data...')

  const result = {
    cloudProvider: 'aws',
    service: 'AmazonEC2',
    region: REGION,
    operatingSystem: 'Linux',
    purchaseOption: 'On-Demand',
    currency: 'USD',
    extractedAt: new Date().toISOString(),
    totalPrices: prices.length,
    ambiguousCount: ambiguousInstances.length,
    prices
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), {
    recursive: true
  })

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(result, null, 2),
    'utf8'
  )

  // ========================================
  // STEP 5: DISPLAY RESULTS
  // ========================================

  console.log('\n===================================')
  console.log('EXTRACTION COMPLETED')
  console.log('===================================')

  console.log('Region:', REGION)
  console.log('Valid instance prices:', prices.length)

  console.log(
    'Ambiguous instance types excluded:',
    ambiguousInstances.length
  )

  console.log('Output:', OUTPUT_FILE)

  const examples = [
    't3.micro',
    't3.small',
    't3.medium',
    't3.large'
  ]

  console.log('\nExample AWS EC2 prices:\n')

  for (const instanceType of examples) {
    const instance = prices.find(
      (item) => item.instanceType === instanceType
    )

    if (!instance) {
      console.log(
        `${instanceType}: Not found or ambiguous`
      )

      continue
    }

    const monthlyPrice =
      instance.hourlyPrice * 730

    console.log('-----------------------------')
    console.log('Instance:', instance.instanceType)
    console.log('vCPUs:', instance.vcpu)
    console.log('RAM:', instance.memory)
    console.log(
      'Hourly price:',
      `$${instance.hourlyPrice}`
    )
    console.log(
      'Monthly estimate:',
      `$${monthlyPrice.toFixed(2)}`
    )
    console.log('SKU:', instance.sku)
  }

  console.log('\nPricing data saved successfully.')
}

// ==========================================
// EXECUTE
// ==========================================

extractAwsPrices().catch((error) => {
  console.error('\nAWS price extraction failed:')
  console.error(error.message)

  process.exitCode = 1
})