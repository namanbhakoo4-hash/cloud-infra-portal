
const mockBOM = require('./mockBOM.json')

const {
  createTerraformFiles
} = require('./services/terraformService')

try {
  // STEP 1: READ MOCK BOM
  console.log('=================================')
  console.log('STEP 1: Reading Mock BOM')
  console.log('=================================')

  console.log('Ticket ID:', mockBOM.ticketId)
  console.log('Project:', mockBOM.projectName)

  // STEP 2: GENERATE TERRAFORM FILES
  // STEP 3: RUN TERRAFORM INIT
  // STEP 4: RUN TERRAFORM VALIDATE

  console.log('\nStarting Terraform automation...')

  const result = createTerraformFiles(mockBOM)

  console.log('\n=================================')
  console.log('Terraform Initialization: SUCCESS')
  console.log('Terraform Validation: SUCCESS')
  console.log('=================================')

  console.log('\nGenerated folder:', result.terraformFolder)

  // STEP 5: GENERATE MOCK TERRAFORM PLAN
  console.log('\n=================================')
  console.log('STEP 5: Generating Mock Terraform Plan')
  console.log('=================================')

  require('./mockTerraformPlan')

  console.log('\n=================================')
  console.log('COMPLETE MOCK TERRAFORM WORKFLOW')
  console.log('=================================')

  console.log('Mock BOM: SUCCESS')
  console.log('Terraform File Generation: SUCCESS')
  console.log('Terraform Init: SUCCESS')
  console.log('Terraform Validate: SUCCESS')
  console.log('Mock Terraform Plan: SUCCESS')

  console.log('\nNo AWS resources were created.')

} catch (error) {
  console.error('\nTerraform automation failed!')
  console.error(error.message)

  process.exitCode = 1
}
