
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const MasterData = require('./models/MasterData')

const CATALOG_PATH = path.join(
  __dirname,
  'data',
  'aws-ec2-ap-south-1-prices.json'
)

function parseMemoryGiB(value) {
  if (typeof value !== 'string') return null

  const match = value.trim().match(
    /^([\d,.]+)\s*(GiB|MiB)$/i
  )

  if (!match) return null

  const amount = Number(match[1].replace(/,/g, ''))

  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return match[2].toLowerCase() === 'mib'
    ? amount / 1024
    : amount
}

async function syncAwsInstanceCatalog() {
  let connected = false

  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI

    if (!mongoUri) {
      throw new Error(
        'MONGO_URI or MONGODB_URI is missing from .env'
      )
    }

    if (!fs.existsSync(CATALOG_PATH)) {
      throw new Error(
        `AWS pricing catalog not found: ${CATALOG_PATH}`
      )
    }

    console.log('Reading official AWS pricing catalog...')

    const catalog = JSON.parse(
      fs.readFileSync(CATALOG_PATH, 'utf8')
    )

    if (
      catalog.cloudProvider !== 'aws' ||
      catalog.region !== 'ap-south-1' ||
      !Array.isArray(catalog.prices)
    ) {
      throw new Error('Invalid AWS pricing catalog format')
    }

    const uniqueInstances = new Map()
    let skipped = 0

    for (const item of catalog.prices) {
      if (
        item.cloudProvider !== 'aws' ||
        item.region !== 'ap-south-1' ||
        item.operatingSystem !== 'Linux' ||
        item.purchaseOption !== 'On-Demand'
      ) {
        skipped += 1
        continue
      }

      const instanceType = String(
        item.instanceType || ''
      ).trim()

      const cpu = Number(item.vcpu)
      const ram = parseMemoryGiB(item.memory)

      if (
        !instanceType ||
        !Number.isFinite(cpu) ||
        cpu <= 0 ||
        ram === null
      ) {
        skipped += 1
        continue
      }

      if (!uniqueInstances.has(instanceType)) {
        uniqueInstances.set(instanceType, {
          cloudProvider: 'aws',
          category: 'instanceType',
          name: instanceType,
          value: instanceType,
          cpu,
          ram,
          isActive: true
        })
      } else {
        const previous = uniqueInstances.get(instanceType)

        if (
          previous.cpu !== cpu ||
          previous.ram !== ram
        ) {
          console.warn(
            `Conflicting specifications for ${instanceType}. Skipping conflicting record.`
          )
          skipped += 1
        }
      }
    }

    console.log(
      `Valid unique AWS instance types: ${uniqueInstances.size}`
    )
    console.log(`Skipped records: ${skipped}`)

    if (uniqueInstances.size === 0) {
      throw new Error('No valid AWS instances found')
    }

    await mongoose.connect(mongoUri)
    connected = true

    console.log('MongoDB connected successfully')

    const operations = [...uniqueInstances.values()].map(
      (instance) => ({
        updateOne: {
          filter: {
            cloudProvider: 'aws',
            category: 'instanceType',
            value: instance.value
          },
          update: {
            $set: {
              name: instance.name,
              cpu: instance.cpu,
              ram: instance.ram
            },
            $setOnInsert: {
              cloudProvider: 'aws',
              category: 'instanceType',
              value: instance.value,
              isActive: true
            }
          },
          upsert: true
        }
      })
    )

    const result = await MasterData.bulkWrite(
      operations,
      { ordered: false }
    )

    console.log('\nAWS synchronization completed!')
    console.log('--------------------------------')
    console.log('Inserted:', result.upsertedCount)
    console.log('Modified:', result.modifiedCount)
    console.log('Matched:', result.matchedCount)
    console.log('Total catalog instances:', uniqueInstances.size)
    console.log('--------------------------------')
    console.log(
      'Existing manually configured AWS entries are preserved.'
    )
    console.log(
      'Azure and GCP master data were not modified.'
    )
  } catch (error) {
    console.error('AWS synchronization failed:', error)
    process.exitCode = 1
  } finally {
    if (connected) {
      await mongoose.disconnect()
    }
  }
}

syncAwsInstanceCatalog()
