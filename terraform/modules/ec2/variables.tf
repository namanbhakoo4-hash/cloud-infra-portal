
variable "ami_id" {
  description = "AMI ID for the EC2 instance"
  type        = string

  validation {
    condition     = can(regex("^ami-[a-fA-F0-9]{8}([a-fA-F0-9]{9})?$", var.ami_id))
    error_message = "Enter a valid AMI ID format."
  }
}

variable "instance_type" {
  description = "AWS EC2 instance type"
  type        = string
}

variable "instance_name" {
  description = "Name of the EC2 instance"
  type        = string
}

variable "storage_size" {
  description = "Root EBS storage size in GiB"
  type        = number
  default     = 20

  validation {
    condition     = var.storage_size >= 1
    error_message = "Storage size must be at least 1 GiB."
  }
}

variable "storage_type" {
  description = "AWS EBS root volume type"
  type        = string
  default     = "gp3"

  validation {
    condition = contains(
      ["gp3", "gp2", "io1", "io2", "standard"],
      var.storage_type
    )
    error_message = "Unsupported EBS root volume type."
  }
}

variable "root_volume_encrypted" {
  description = "Encrypt the root EBS volume"
  type        = bool
  default     = true
}

variable "subnet_id" {
  description = "Subnet ID where EC2 will be launched"
  type        = string
}

variable "associate_public_ip_address" {
  description = "Assign a public IPv4 address"
  type        = bool
  default     = false
}

variable "security_group_ids" {
  description = "Security group IDs to attach to EC2"
  type        = list(string)
  default     = []
}

variable "key_pair_name" {
  description = "Existing AWS EC2 key pair name"
  type        = string
  default     = null
}

variable "iam_instance_profile" {
  description = "IAM instance profile name"
  type        = string
  default     = null
}
