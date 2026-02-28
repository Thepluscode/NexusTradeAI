# RDS Databases Module for NexusTradeAI
# High-performance database infrastructure optimized for trading applications

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# Random password for database
resource "random_password" "master" {
  length  = 32
  special = true
}

# KMS Key for RDS encryption
resource "aws_kms_key" "rds" {
  description             = "RDS encryption key for ${var.identifier}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.identifier}-rds-encryption-key"
    Type = "KMSKey"
  })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.identifier}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name_prefix = "${var.identifier}-rds-"
  vpc_id      = var.vpc_id

  # PostgreSQL access from private subnets
  ingress {
    description = "PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  # Outbound traffic for replication and backups
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.identifier}-rds-sg"
    Type = "SecurityGroup"
  })
}

# Parameter Group for PostgreSQL optimization
resource "aws_db_parameter_group" "main" {
  family = "postgres14"
  name   = "${var.identifier}-postgres14"

  # Performance optimizations for trading applications
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,auto_explain"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries taking more than 1 second
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory*3/4}"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4}"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152"  # 2GB
  }

  parameter {
    name  = "checkpoint_completion_target"
    value = "0.9"
  }

  parameter {
    name  = "wal_buffers"
    value = "16384"  # 16MB
  }

  parameter {
    name  = "default_statistics_target"
    value = "100"
  }

  parameter {
    name  = "random_page_cost"
    value = "1.1"  # Optimized for SSD
  }

  parameter {
    name  = "effective_io_concurrency"
    value = "200"
  }

  parameter {
    name  = "work_mem"
    value = "65536"  # 64MB
  }

  parameter {
    name  = "min_wal_size"
    value = "2048"  # 2GB
  }

  parameter {
    name  = "max_wal_size"
    value = "8192"  # 8GB
  }

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  # Enable query plan logging for slow queries
  parameter {
    name  = "auto_explain.log_min_duration"
    value = "5000"  # 5 seconds
  }

  parameter {
    name  = "auto_explain.log_analyze"
    value = "1"
  }

  parameter {
    name  = "auto_explain.log_buffers"
    value = "1"
  }

  tags = merge(var.tags, {
    Name = "${var.identifier}-parameter-group"
    Type = "DBParameterGroup"
  })
}

# Option Group for PostgreSQL extensions
resource "aws_db_option_group" "main" {
  name                     = "${var.identifier}-postgres14"
  option_group_description = "Option group for ${var.identifier}"
  engine_name              = "postgres"
  major_engine_version     = "14"

  tags = merge(var.tags, {
    Name = "${var.identifier}-option-group"
    Type = "DBOptionGroup"
  })
}

# Primary RDS Instance
resource "aws_db_instance" "main" {
  identifier = var.identifier

  # Engine configuration
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  # Storage configuration
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = aws_kms_key.rds.arn
  iops                 = var.iops
  storage_throughput   = var.storage_throughput

  # Database configuration
  db_name  = var.database_name
  username = var.master_username
  password = random_password.master.result
  port     = 5432

  # Network configuration
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = var.db_subnet_group_name
  publicly_accessible    = false

  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.main.name
  option_group_name    = aws_db_option_group.main.name

  # Backup configuration
  backup_retention_period = var.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window
  copy_tags_to_snapshot  = true
  delete_automated_backups = false

  # High availability
  multi_az               = var.multi_az
  availability_zone      = var.multi_az ? null : var.availability_zone

  # Monitoring and logging
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn
  enabled_cloudwatch_logs_exports = [
    "postgresql"
  ]

  # Performance Insights
  performance_insights_enabled          = true
  performance_insights_kms_key_id      = aws_kms_key.rds.arn
  performance_insights_retention_period = 7

  # Security
  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.identifier}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Auto minor version upgrade
  auto_minor_version_upgrade = false

  # Apply changes immediately in non-production environments
  apply_immediately = var.apply_immediately

  tags = merge(var.tags, {
    Name = var.identifier
    Type = "RDSInstance"
    Role = "Primary"
  })

  depends_on = [
    aws_db_parameter_group.main,
    aws_db_option_group.main
  ]
}

# Read Replica for read scaling
resource "aws_db_instance" "read_replica" {
  count = var.create_read_replica ? var.read_replica_count : 0

  identifier = "${var.identifier}-read-replica-${count.index + 1}"

  # Replica configuration
  replicate_source_db = aws_db_instance.main.identifier

  # Instance configuration
  instance_class = var.read_replica_instance_class

  # Storage configuration (inherited from source)
  storage_encrypted = true
  kms_key_id       = aws_kms_key.rds.arn

  # Network configuration
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn

  # Performance Insights
  performance_insights_enabled          = true
  performance_insights_kms_key_id      = aws_kms_key.rds.arn
  performance_insights_retention_period = 7

  # Security
  deletion_protection = false
  skip_final_snapshot = true

  # Auto minor version upgrade
  auto_minor_version_upgrade = false

  tags = merge(var.tags, {
    Name = "${var.identifier}-read-replica-${count.index + 1}"
    Type = "RDSInstance"
    Role = "ReadReplica"
  })
}

# IAM Role for Enhanced Monitoring
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.identifier}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.identifier}-rds-monitoring-role"
    Type = "IAMRole"
  })
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch Log Group for PostgreSQL logs
resource "aws_cloudwatch_log_group" "postgresql" {
  name              = "/aws/rds/instance/${var.identifier}/postgresql"
  retention_in_days = 30

  tags = merge(var.tags, {
    Name = "${var.identifier}-postgresql-logs"
    Type = "CloudWatchLogGroup"
  })
}

# Secrets Manager secret for database credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.identifier}-db-credentials"
  description = "Database credentials for ${var.identifier}"

  tags = merge(var.tags, {
    Name = "${var.identifier}-db-credentials"
    Type = "Secret"
  })
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master.result
    engine   = "postgres"
    host     = aws_db_instance.main.endpoint
    port     = aws_db_instance.main.port
    dbname   = var.database_name
  })
}

# CloudWatch Alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.identifier}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "120"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.identifier}-cpu-alarm"
    Type = "CloudWatchAlarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "database_connections" {
  alarm_name          = "${var.identifier}-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "120"
  statistic           = "Average"
  threshold           = "800"
  alarm_description   = "This metric monitors RDS connection count"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.identifier}-connections-alarm"
    Type = "CloudWatchAlarm"
  })
}

resource "aws_cloudwatch_metric_alarm" "database_freeable_memory" {
  alarm_name          = "${var.identifier}-low-freeable-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = "120"
  statistic           = "Average"
  threshold           = "2000000000"  # 2GB in bytes
  alarm_description   = "This metric monitors RDS freeable memory"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }

  tags = merge(var.tags, {
    Name = "${var.identifier}-memory-alarm"
    Type = "CloudWatchAlarm"
  })
}
