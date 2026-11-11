
const mongoose = require('mongoose')

const networkSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['new', 'existing'],
    default: undefined
  },
  vpcCidr: { type: String, default: '' },
  publicSubnetCidr: { type: String, default: '' },
  privateSubnetCidr: { type: String, default: '' },
  vpcId: { type: String, default: '' }
}, { _id: false })

const vpcSubnetSchema = new mongoose.Schema({
  resourceKey: { type: String, default: '' },
  name: { type: String, trim: true, default: '' },
  availabilityZone: { type: String, trim: true, default: '' },
  ipv4Cidr: { type: String, trim: true, default: '' },
  subnetType: {
    type: String,
    enum: ['public', 'private'],
    default: 'private'
  },
  mapPublicIpOnLaunch: { type: Boolean, default: false }
}, { _id: false })

const existingVpcSubnetSchema = new mongoose.Schema({
  resourceKey: { type: String, trim: true, default: '' },
  subnetId: { type: String, trim: true, default: '' },
  subnetType: {
    type: String,
    enum: ['public', 'private'],
    default: 'private'
  },
  ipv4Cidr: { type: String, trim: true, default: '' }
}, { _id: false })

const vpcConfigurationSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['new', 'existing'],
    default: 'new'
  },
  creationExperience: {
    type: String,
    enum: ['vpc-only', 'vpc-and-more'],
    default: 'vpc-only'
  },
  name: { type: String, trim: true, default: '' },
  ipv4Cidr: { type: String, trim: true, default: '' },
  publicFirstCidr: { type: String, trim: true, default: '' },
  privateFirstCidr: { type: String, trim: true, default: '' },
  publicQuantity: { type: Number, min: 0, max: 100, default: 0 },
  privateQuantity: { type: Number, min: 0, max: 100, default: 0 },
  subnets: { type: [vpcSubnetSchema], default: [] },
  existingVpcCidr: { type: String, trim: true, default: '' },
  existingSubnets: {
    type: [existingVpcSubnetSchema],
    default: []
  },
  createdSubnets: {
    type: [vpcSubnetSchema],
    default: []
  },
  existingRouteTableId: {
    type: String,
    trim: true,
    default: ''
  },
  createInternetGateway: { type: Boolean, default: false },
  natGatewayMode: {
    type: String,
    enum: ['none', 'single', 'per-az'],
    default: 'none'
  },
  ipv6Mode: {
    type: String,
    enum: ['none', 'amazon-provided'],
    default: 'none'
  },
  tenancy: {
    type: String,
    enum: ['default', 'dedicated'],
    default: 'default'
  },
  enableDnsSupport: { type: Boolean, default: true },
  enableDnsHostnames: { type: Boolean, default: true },
  existingVpcId: { type: String, trim: true, default: '' }
}, { _id: false })

const securityGroupRuleSchema = new mongoose.Schema({
  protocol: {
    type: String,
    enum: ['tcp', 'udp', 'icmp', '-1'],
    required: true
  },
  fromPort: {
    type: Number,
    min: 1,
    max: 65535,
    default: undefined
  },
  toPort: {
    type: Number,
    min: 1,
    max: 65535,
    default: undefined
  },
  cidr: {
    type: String,
    trim: true,
    required: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: false })

const securityGroupConfigurationSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  ingressRules: {
    type: [securityGroupRuleSchema],
    default: []
  },
  egressRules: {
    type: [securityGroupRuleSchema],
    default: []
  }
}, { _id: false })

const ec2NetworkSchema = new mongoose.Schema({
  vpcSource: {
    type: String,
    enum: ['bom', 'existing', 'default'],
    default: 'bom'
  },
  vpcResourceKey: { type: String, default: '' },
  vpcId: { type: String, default: '' },
  subnetResourceKey: { type: String, default: '' },
  subnetId: { type: String, default: '' },
  associatePublicIpAddress: { type: Boolean, default: false },
  securityGroupMode: {
    type: String,
    enum: ['existing', 'new'],
    default: 'existing'
  },
  securityGroupIds: {
    type: [String],
    default: []
  },
  securityGroup: {
    type: securityGroupConfigurationSchema,
    default: undefined
  }
}, { _id: false })

const ec2ConfigurationSchema = new mongoose.Schema({
  instanceName: { type: String, trim: true, default: '' },
  amiId: { type: String, trim: true, default: '' },
  instanceType: { type: String, default: '' },
  keyPairName: { type: String, default: '' },
  operatingSystem: { type: String, default: 'Linux' },
  quantity: { type: Number, min: 1, default: 1 },
  network: {
    type: ec2NetworkSchema,
    default: () => ({})
  },
  instanceProfileMode: {
    type: String,
    enum: ['none', 'new', 'existing'],
    default: 'none'
  },
  instanceProfileName: { type: String, default: '' },
  iamRoleName: { type: String, default: '' }
}, { _id: false })

const ebsVolumeSchema = new mongoose.Schema({
  deviceName: { type: String, default: '' },
  volumeType: {
    type: String,
    enum: ['gp3', 'gp2', 'io1', 'io2', 'st1', 'sc1', 'standard'],
    default: 'gp3'
  },
  sizeGiB: { type: Number, min: 1, default: 20 },
  iops: { type: Number, min: 0, default: undefined },
  throughput: { type: Number, min: 0, default: undefined },
  encrypted: { type: Boolean, default: true },
  kmsKeyId: { type: String, default: '' },
  deleteOnTermination: { type: Boolean, default: true }
}, { _id: false })

const resourceSchema = new mongoose.Schema({
  cloudProvider: {
    type: String,
    enum: ['aws', 'azure', 'gcp'],
    default: 'aws',
    required: true
  },
  region: {
    type: String,
    trim: true,
    default: ''
  },
  resourceKey: {
    type: String,
    default: ''
  },
  service: {
    type: String,
    required: true,
    trim: true
  },
  resourceName: {
    type: String,
    trim: true,
    default: ''
  },
  vpcConfiguration: {
    type: vpcConfigurationSchema,
    default: undefined
  },
  ec2Configuration: {
    type: ec2ConfigurationSchema,
    default: undefined
  },
  ebsVolumes: {
    type: [ebsVolumeSchema],
    default: undefined
  },
  instanceType: { type: String },
  cpu: { type: Number, min: 0 },
  ram: { type: Number, min: 0 },
  storage: { type: Number, min: 0 },
  storageType: { type: String, default: 'gp3' },
  operatingSystem: { type: String, default: 'Linux' },
  billingModel: { type: String, default: 'On-Demand' },
  quantity: { type: Number, min: 1, default: 1 },
  subnetType: {
    type: String,
    enum: ['public', 'private'],
    default: 'private'
  },
  subnetId: { type: String, default: '' },
  publicIp: { type: Boolean, default: false },
  instanceProfileMode: {
    type: String,
    enum: ['none', 'new', 'existing'],
    default: 'none'
  },
  instanceProfileName: { type: String, default: '' },
  iamRoleName: { type: String, default: '' }
}, { _id: false })

const pricingComponentSchema = new mongoose.Schema({
  resourceIndex: Number,
  category: { type: String },
  description: { type: String },
  amount: { type: Number, min: 0 },
  unit: { type: String },
  rate: { type: Number, min: 0 },
  source: { type: String }
}, { _id: false })

const estimatedCostSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Not Calculated', 'Available', 'Unavailable'],
    default: 'Not Calculated'
  },
  monthlyTotal: { type: Number, default: null, min: 0 },
  currency: { type: String, default: 'USD' },
  monthlyHours: { type: Number, default: 730, min: 0 },
  pricingSource: { type: String, default: '' },
  calculatedAt: { type: Date, default: null },
  breakdown: { type: [pricingComponentSchema], default: [] },
  errorMessage: { type: String, default: '' }
}, { _id: false })

const terraformExecutionSchema = new mongoose.Schema({
  generation: {
    type: String,
    enum: ['Not Started', 'Success', 'Failed'],
    default: 'Not Started'
  },
  init: {
    type: String,
    enum: ['Not Started', 'Success', 'Failed'],
    default: 'Not Started'
  },
  validation: {
    type: String,
    enum: ['Not Started', 'Success', 'Failed'],
    default: 'Not Started'
  },
  plan: {
    type: String,
    enum: ['Not Started', 'Success', 'Failed'],
    default: 'Not Started'
  },
  planType: {
    type: String,
    enum: ['SIMULATED', 'REAL'],
    default: 'SIMULATED'
  },
  terraformFolder: { type: String, default: '' },
  executedAt: { type: Date, default: null }
}, { _id: false })

const bomSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ticketId: {
    type: String,
    unique: true
  },
  projectName: {
    type: String,
    required: true,
    trim: true
  },
  environment: {
    type: String,
    enum: ['Development', 'Testing', 'Staging', 'Production'],
    required: true
  },
  cloudProvider: {
    type: String,
    enum: ['aws', 'azure', 'gcp'],
    default: 'aws',
    required: true
  },
  region: {
    type: String,
    required: true
  },
  network: {
    type: networkSchema,
    default: undefined
  },
  resources: {
    type: [resourceSchema],
    default: []
  },
  estimatedCost: {
    type: estimatedCostSchema,
    default: () => ({})
  },
  justification: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: [
      'Pending Review',
      'Processing',
      'Approved',
      'Changes Requested',
      'Rejected',
      'Terraform Generated',
      'Plan Completed',
      'Plan Failed'
    ],
    default: 'Pending Review'
  },
  engineerRemarks: { type: String, default: '' },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  terraformExecution: {
    type: terraformExecutionSchema,
    default: () => ({})
  }
}, {
  timestamps: true
})

bomSchema.index({
  createdBy: 1,
  createdAt: -1
})

bomSchema.index({
  status: 1,
  createdAt: -1
})

const BOM = mongoose.model('BOM', bomSchema)

module.exports = BOM
