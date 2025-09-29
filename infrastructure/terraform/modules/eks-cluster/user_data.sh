#!/bin/bash

# EKS Node User Data Script for NexusTradeAI
# Optimized for high-performance trading applications

set -o xtrace

# Variables
CLUSTER_NAME="${cluster_name}"
CLUSTER_ENDPOINT="${cluster_endpoint}"
CLUSTER_CA="${cluster_ca}"
BOOTSTRAP_ARGUMENTS="${bootstrap_arguments}"

# System optimization for trading applications
echo "Optimizing system for high-performance trading..."

# Network optimizations
echo 'net.core.rmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.rmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.core.wmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_rmem = 4096 65536 16777216' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_wmem = 4096 65536 16777216' >> /etc/sysctl.conf
echo 'net.core.netdev_max_backlog = 5000' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_congestion_control = bbr' >> /etc/sysctl.conf

# CPU optimizations
echo 'kernel.sched_migration_cost_ns = 5000000' >> /etc/sysctl.conf
echo 'kernel.sched_autogroup_enabled = 0' >> /etc/sysctl.conf

# Memory optimizations
echo 'vm.swappiness = 1' >> /etc/sysctl.conf
echo 'vm.dirty_ratio = 15' >> /etc/sysctl.conf
echo 'vm.dirty_background_ratio = 5' >> /etc/sysctl.conf

# Apply sysctl settings
sysctl -p

# Install additional packages for trading applications
yum update -y
yum install -y \
    htop \
    iotop \
    nethogs \
    tcpdump \
    strace \
    perf \
    chrony \
    jq \
    awscli

# Configure time synchronization (critical for trading)
systemctl enable chronyd
systemctl start chronyd

# Configure chrony for high precision
cat > /etc/chrony.conf << EOF
server 169.254.169.123 prefer iburst minpoll 4 maxpoll 4
driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync
logdir /var/log/chrony
EOF

systemctl restart chronyd

# Install CloudWatch agent for monitoring
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOF
{
    "agent": {
        "metrics_collection_interval": 10,
        "run_as_user": "cwagent"
    },
    "metrics": {
        "namespace": "NexusTradeAI/EKS",
        "metrics_collected": {
            "cpu": {
                "measurement": [
                    "cpu_usage_idle",
                    "cpu_usage_iowait",
                    "cpu_usage_user",
                    "cpu_usage_system"
                ],
                "metrics_collection_interval": 10,
                "totalcpu": false
            },
            "disk": {
                "measurement": [
                    "used_percent"
                ],
                "metrics_collection_interval": 10,
                "resources": [
                    "*"
                ]
            },
            "diskio": {
                "measurement": [
                    "io_time",
                    "read_bytes",
                    "write_bytes",
                    "reads",
                    "writes"
                ],
                "metrics_collection_interval": 10,
                "resources": [
                    "*"
                ]
            },
            "mem": {
                "measurement": [
                    "mem_used_percent"
                ],
                "metrics_collection_interval": 10
            },
            "netstat": {
                "measurement": [
                    "tcp_established",
                    "tcp_time_wait"
                ],
                "metrics_collection_interval": 10
            },
            "swap": {
                "measurement": [
                    "swap_used_percent"
                ],
                "metrics_collection_interval": 10
            }
        }
    },
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/var/log/messages",
                        "log_group_name": "/aws/eks/${CLUSTER_NAME}/system",
                        "log_stream_name": "{instance_id}/messages"
                    },
                    {
                        "file_path": "/var/log/secure",
                        "log_group_name": "/aws/eks/${CLUSTER_NAME}/security",
                        "log_stream_name": "{instance_id}/secure"
                    }
                ]
            }
        }
    }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
    -s

# Install Node Exporter for Prometheus monitoring
useradd --no-create-home --shell /bin/false node_exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.1/node_exporter-1.6.1.linux-amd64.tar.gz
tar xvf node_exporter-1.6.1.linux-amd64.tar.gz
cp node_exporter-1.6.1.linux-amd64/node_exporter /usr/local/bin/
chown node_exporter:node_exporter /usr/local/bin/node_exporter

# Create systemd service for Node Exporter
cat > /etc/systemd/system/node_exporter.service << EOF
[Unit]
Description=Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter --web.listen-address=:9100

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable node_exporter
systemctl start node_exporter

# Configure Docker for performance
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << EOF
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "storage-opts": [
        "overlay2.override_kernel_check=true"
    ],
    "exec-opts": ["native.cgroupdriver=systemd"],
    "live-restore": true,
    "max-concurrent-downloads": 10,
    "max-concurrent-uploads": 5,
    "default-ulimits": {
        "memlock": {
            "Name": "memlock",
            "Hard": -1,
            "Soft": -1
        },
        "nofile": {
            "Name": "nofile",
            "Hard": 65536,
            "Soft": 65536
        }
    }
}
EOF

# Set ulimits for better performance
cat >> /etc/security/limits.conf << EOF
* soft nofile 65536
* hard nofile 65536
* soft nproc 65536
* hard nproc 65536
* soft memlock unlimited
* hard memlock unlimited
EOF

# Configure kubelet for performance
mkdir -p /etc/kubernetes/kubelet
cat > /etc/kubernetes/kubelet/kubelet-config.json << EOF
{
    "kind": "KubeletConfiguration",
    "apiVersion": "kubelet.config.k8s.io/v1beta1",
    "address": "0.0.0.0",
    "port": 10250,
    "readOnlyPort": 0,
    "cgroupDriver": "systemd",
    "hairpinMode": "hairpin-veth",
    "serializeImagePulls": false,
    "maxPods": 110,
    "podCIDR": "10.244.0.0/16",
    "clusterDNS": ["10.100.0.10"],
    "clusterDomain": "cluster.local",
    "runtimeRequestTimeout": "15m",
    "kubeReserved": {
        "cpu": "100m",
        "memory": "100Mi",
        "ephemeral-storage": "1Gi"
    },
    "systemReserved": {
        "cpu": "100m",
        "memory": "100Mi",
        "ephemeral-storage": "1Gi"
    },
    "evictionHard": {
        "memory.available": "100Mi",
        "nodefs.available": "10%",
        "nodefs.inodesFree": "5%",
        "imagefs.available": "15%"
    },
    "featureGates": {
        "RotateKubeletServerCertificate": true
    }
}
EOF

# Bootstrap the node to the EKS cluster
/etc/eks/bootstrap.sh $CLUSTER_NAME $BOOTSTRAP_ARGUMENTS

# Install SSM agent for remote management
yum install -y amazon-ssm-agent
systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent

# Create a script for post-boot optimizations
cat > /usr/local/bin/trading-optimizations.sh << 'EOF'
#!/bin/bash

# CPU governor optimization
echo performance | tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Disable CPU idle states for consistent latency
for i in /sys/devices/system/cpu/cpu*/cpuidle/state*/disable; do
    echo 1 > $i 2>/dev/null || true
done

# IRQ affinity optimization
if [ -f /proc/irq/default_smp_affinity ]; then
    echo f > /proc/irq/default_smp_affinity
fi

# Network interface optimizations
for iface in $(ls /sys/class/net/ | grep -E '^(eth|ens)'); do
    ethtool -G $iface rx 4096 tx 4096 2>/dev/null || true
    ethtool -K $iface gro on 2>/dev/null || true
    ethtool -K $iface lro on 2>/dev/null || true
    echo 32768 > /sys/class/net/$iface/queues/rx-0/rps_flow_cnt 2>/dev/null || true
done
EOF

chmod +x /usr/local/bin/trading-optimizations.sh

# Create systemd service for trading optimizations
cat > /etc/systemd/system/trading-optimizations.service << EOF
[Unit]
Description=Trading Performance Optimizations
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/trading-optimizations.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable trading-optimizations.service
systemctl start trading-optimizations.service

echo "Node initialization completed successfully"
