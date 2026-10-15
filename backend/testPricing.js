
const { getCloudPrice } = require('./services/pricingService')

async function testPricing() {
  console.log('=================================')
  console.log('Testing Official Azure Pricing API')
  console.log('=================================')

  try {
    const result = await getCloudPrice({
      cloudProvider: 'azure',
      region: 'centralindia',
      instanceType: 'Standard_B2s',
      operatingSystem: 'Linux'
    })

    console.log('\nAPI Result:')
    console.log(JSON.stringify(result, null, 2))

    if (result.status === 'Available') {
      console.log('\nPricing API returned a price.')
      console.log('Hourly Price:', result.hourlyPrice)
      console.log('Currency:', result.currency)
      console.log(
        'Estimated Monthly Compute Cost:',
        result.estimatedMonthlyComputeCost
      )
      console.log('Pricing Source:', result.pricingSource)
      console.log('Meter:', result.meterName)
    } else {
      console.log('\nPrice unavailable:', result.message)
    }
  } catch (error) {
    console.error('\nPricing test failed:', error.message)
  }
}

testPricing()
