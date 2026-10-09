variable "ami_id" {
  description = "AMI ID for the EC2 instance"
  type        = string
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
  description = "Root storage size in GB"
  type        = number
  default     = 20
}