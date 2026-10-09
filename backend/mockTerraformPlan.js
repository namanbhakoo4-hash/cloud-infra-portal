const fs = require('fs')
const path = require('path')

const bom = require('./mockBOM.json')

const resource = bom.resources[0]

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
      storage: resource.storage,
      quantity: resource.quantity
    }
  ],
  summary: {
    add: resource.quantity,
    change: 0,
    destroy: 0
  },
  note: 'This is a simulated plan, not the output of terraform plan.'
}

const folder = path.join(
  __dirname,
  '..',
  'terraform',
  'generated',
  bom.ticketId
)

fs.mkdirSync(folder, { recursive: true })

const filePath = path.join(folder, 'mock-plan.json')

fs.writeFileSync(
  filePath,
  JSON.stringify(mockPlan, null, 2)
)

console.log('Mock Terraform plan generated successfully!')
console.log(JSON.stringify(mockPlan, null, 2))
console.log('Saved at:', filePath)