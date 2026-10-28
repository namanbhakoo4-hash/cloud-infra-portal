
output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.this.id
}

output "public_ip" {
  description = "Public IP address, if assigned"
  value       = aws_instance.this.public_ip
}

output "private_ip" {
  description = "Private IP address of the EC2 instance"
  value       = aws_instance.this.private_ip
}

output "subnet_id" {
  description = "Subnet ID where the EC2 instance is deployed"
  value       = aws_instance.this.subnet_id
}

output "availability_zone" {
  description = "Availability zone of the EC2 instance"
  value       = aws_instance.this.availability_zone
}
