resource "aws_instance" "this" {
  ami           = var.ami_id
  instance_type = var.instance_type

  root_block_device {
    volume_size = var.storage_size
    volume_type = "gp3"
  }

  tags = {
    Name = var.instance_name
  }
}