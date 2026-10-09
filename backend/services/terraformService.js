
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

// =====================================================
// TERRAFORM PROVIDER CACHE CONFIGURATION
// =====================================================

// Shared cache folder for downloaded Terraform providers
const providerCache = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.terraform'),
  'terraform',
  'plugin-cache'
)

// Create cache folder if it does not exist
fs.mkdirSync(providerCache, {
  recursive: true
})

// =====================================================
// GENERATE TERRAFORM FILES AND RUN AUTOMATION
// =====================================================

const createTerraformFiles = (bom) => {
  console.log(
    'Terraform generation started for:',
    bom.ticketId
  )

  // =====================================================
  // STEP 1: DEFINE TERRAFORM FOLDER
  // =====================================================

  const terraformFolder = path.join(
    __dirname,
    '..',
    '..',
    'terraform',
    'generated',
    bom.ticketId
  )

  const resource = bom.resources[0]

  if (!resource) {
    throw new Error('No resource found in BOM')
  }

  // Currently supports only one EC2 resource
  // with quantity equal to 1
  if (
    bom.resources.length !== 1 ||
    resource.service?.toLowerCase() !== 'ec2' ||
    Number(resource.quantity) !== 1
  ) {
    throw new Error(
      'Terraform automation currently supports one EC2 resource with quantity 1'
    )
  }

  // =====================================================
  // STEP 2: VALIDATE BOM VALUES
  // =====================================================

  if (!/^BOM-[A-Za-z0-9-]+$/.test(bom.ticketId)) {
    throw new Error('Invalid BOM ticket ID')
  }

  if (
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d+$/.test(
      bom.region
    )
  ) {
    throw new Error('Invalid AWS region')
  }

  if (
    !/^[a-z][a-z0-9]*[0-9][a-z0-9]*\.[a-z0-9]+$/.test(
      resource.instanceType
    )
  ) {
    throw new Error('Invalid EC2 instance type')
  }

  const storage = Number(resource.storage)

  if (
    !Number.isInteger(storage) ||
    storage < 1
  ) {
    throw new Error('Invalid storage size')
  }

  // =====================================================
  // STEP 3: CREATE TERRAFORM FOLDER
  // =====================================================

  fs.mkdirSync(terraformFolder, {
    recursive: true
  })

  // =====================================================
  // STEP 4: GENERATE main.tf
  // =====================================================

  const mainTf = `
module "ec2" {
  source = "../../modules/ec2"

  ami_id        = "ami-1234567890abcdef0"
  instance_type = "${resource.instanceType}"
  instance_name = "${bom.ticketId}-Server"
  storage_size  = ${storage}
}
`

  fs.writeFileSync(
    path.join(terraformFolder, 'main.tf'),
    mainTf
  )

  // =====================================================
  // STEP 5: GENERATE provider.tf
  // =====================================================

  const providerTf = `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "${bom.region}"
}
`

  fs.writeFileSync(
    path.join(terraformFolder, 'provider.tf'),
    providerTf
  )

  console.log(
    'Terraform files generated successfully'
  )

  // =====================================================
  // STEP 6: RUN TERRAFORM INIT
  // =====================================================

  console.log('Running terraform init...')

  console.log(
    'Using Terraform provider cache:',
    providerCache
  )

  const initOutput = execFileSync(
    'terraform',
    ['init', '-input=false', '-no-color'],
    {
      cwd: terraformFolder,
      encoding: 'utf8',

      // Allow up to 10 minutes
      timeout: 600000,

      // Tell Terraform to use the shared provider cache
      env: {
        ...process.env,
        TF_PLUGIN_CACHE_DIR: providerCache
      }
    }
  )

  console.log(
    'Terraform init completed successfully'
  )

  console.log(initOutput)

  // =====================================================
  // STEP 7: RUN TERRAFORM VALIDATE
  // =====================================================

  console.log(
    'Running terraform validate...'
  )

  const validateOutput = execFileSync(
    'terraform',
    ['validate', '-no-color'],
    {
      cwd: terraformFolder,
      encoding: 'utf8',
      timeout: 60000,

      env: {
        ...process.env,
        TF_PLUGIN_CACHE_DIR: providerCache
      }
    }
  )

  console.log(
    'Terraform validation completed successfully'
  )

  console.log(validateOutput)

  // =====================================================
  // STEP 8: GENERATE SIMULATED TERRAFORM PLAN
  // =====================================================

  console.log(
    'Generating mock Terraform plan...'
  )

  const mockPlan = {
    ticketId: bom.ticketId,
    projectName: bom.projectName,
    planType: 'SIMULATED',
    region: bom.region,

    plannedResources: [
      {
        action: 'create',
        resourceType: 'aws_instance',
        instanceType: resource.instanceType,
        cpu: resource.cpu,
        ram: resource.ram,
        storage,
        quantity: 1
      }
    ],

    summary: {
      add: 1,
      change: 0,
      destroy: 0
    },

    note:
      'This is a simulated plan, not the output of terraform plan.'
  }

  fs.writeFileSync(
    path.join(terraformFolder, 'mock-plan.json'),
    JSON.stringify(mockPlan, null, 2)
  )

  console.log(
    'Mock Terraform plan generated successfully'
  )

  // =====================================================
  // STEP 9: RETURN TERRAFORM RESULTS
  // =====================================================

  return {
    terraformFolder,
    initOutput,
    validateOutput,
    mockPlan
  }
}

module.exports = {
  createTerraformFiles
}
