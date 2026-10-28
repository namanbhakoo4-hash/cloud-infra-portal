
resource "aws_instance" "this" {
  ami           = var.ami_id
  instance_type = var.instance_type

  subnet_id = var.subnet_id

  associate_public_ip_address = var.associate_public_ip_address

  vpc_security_group_ids = var.security_group_ids

  key_name = var.key_pair_name

  iam_instance_profile = var.iam_instance_profile

  root_block_device {
    volume_size = var.storage_size
    volume_type = var.storage_type
    encrypted   = var.root_volume_encrypted
  }

  tags = {
    Name = var.instance_name
  }
}
