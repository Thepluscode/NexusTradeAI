#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Setting up Grafana Dashboards ===${NC}\n"

# Function to wait for Grafana to be ready
wait_for_grafana() {
    echo -e "${YELLOW}Waiting for Grafana to be ready...${NC}"
    local grafana_url="http://admin:admin123@localhost:3000/api/health"
    
    while ! curl -s $grafana_url | grep -q '"database"\s*:\s*"ok"'; do
        echo "Grafana not ready yet, waiting 5 seconds..."
        sleep 5
    done
    
    echo -e "${GREEN}Grafana is ready!${NC}"
}

# Function to create a Grafana dashboard
create_dashboard() {
    local dashboard_name=$1
    local dashboard_file=$2
    
    echo -e "\n${YELLOW}Creating ${dashboard_name} dashboard...${NC}"
    
    # Check if dashboard already exists
    dashboard_uid=$(curl -s -X GET \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        http://admin:admin123@localhost:3000/api/search?query=${dashboard_name} | \
        jq -r '.[] | select(.title == "'${dashboard_name}'") | .uid')
    
    if [ -n "$dashboard_uid" ]; then
        echo -e "${YELLOW}Dashboard ${dashboard_name} already exists, updating...${NC}"
        
        # Get current dashboard version
        current_dashboard=$(curl -s -X GET \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            http://admin:admin123@localhost:3000/api/dashboards/uid/${dashboard_uid} | \
            jq '.dashboard.id = null | .dashboard.uid = "'${dashboard_uid}'" | .dashboard.version += 1')
        
        # Update dashboard
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d "${current_dashboard}" \
            http://admin:admin123@localhost:3000/api/dashboards/db)
    else
        # Create new dashboard
        dashboard_json=$(cat "$dashboard_file" | \
            jq '.id = null | .dashboard.uid = "'$(uuidgen)'" | .dashboard.id = null | .overwrite = true')
        
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d "${dashboard_json}" \
            http://admin:admin123@localhost:3000/api/dashboards/db)
    fi
    
    # Check response
    if echo "$response" | grep -q '"status":"success"'; then
        echo -e "${GREEN}Successfully created/updated ${dashboard_name} dashboard!${NC}"
    else
        echo -e "${YELLOW}Failed to create/update ${dashboard_name} dashboard:${NC}"
        echo "$response" | jq .
    fi
}

# Function to create a Grafana data source
create_datasource() {
    local ds_name=$1
    local ds_type=$2
    local ds_url=$3
    
    echo -e "\n${YELLOW}Creating ${ds_name} data source...${NC}"
    
    # Check if data source already exists
    ds_id=$(curl -s -X GET \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        http://admin:admin123@localhost:3000/api/datasources/name/${ds_name} | \
        jq -r '.id' 2>/dev/null || true)
    
    # Data source JSON
    ds_json=$(cat <<EOF
    {
        "name": "${ds_name}",
        "type": "${ds_type}",
        "url": "${ds_url}",
        "access": "proxy",
        "isDefault": true,
        "jsonData": {}
    }
EOF
    )
    
    if [ -n "$ds_id" ]; then
        echo -e "${YELLOW}Data source ${ds_name} already exists, updating...${NC}"
        response=$(curl -s -X PUT \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d "${ds_json}" \
            http://admin:admin123@localhost:3000/api/datasources/${ds_id})
    else
        response=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d "${ds_json}" \
            http://admin:admin123@localhost:3000/api/datasources)
    fi
    
    # Check response
    if echo "$response" | grep -q '"datasource"'; then
        echo -e "${GREEN}Successfully created/updated ${ds_name} data source!${NC}"
    else
        echo -e "${YELLOW}Failed to create/update ${ds_name} data source:${NC}"
        echo "$response" | jq .
    fi
}

# Main script

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}jq is required but not installed. Installing jq...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq
    else
        sudo apt-get update && sudo apt-get install -y jq
    fi
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${YELLOW}kubectl is required but not installed. Please install kubectl and configure it to connect to your cluster.${NC}"
    exit 1
fi

# Check if Grafana is running
if ! kubectl get svc -n monitoring grafana &> /dev/null; then
    echo -e "${YELLOW}Grafana service not found in monitoring namespace. Please deploy Grafana first.${NC}"
    exit 1
fi

# Port-forward Grafana service
echo -e "${YELLOW}Setting up port-forward to Grafana...${NC}"
kubectl port-forward -n monitoring svc/grafana 3000:3000 > /dev/null 2>&1 &
PORT_FORWARD_PID=$!

# Kill port-forward on script exit
trap "kill $PORT_FORWARD_PID" EXIT

# Wait for Grafana to be ready
wait_for_grafana

# Create Prometheus data source
create_datasource "Prometheus" "prometheus" "http://prometheus-service.monitoring.svc.cluster.local:9090"

# Create Kafka Overview dashboard
create_dashboard "Kafka Overview" "kubernetes/monitoring/dashboards/kafka-overview.json"

# Create Zookeeper dashboard
create_dashboard "Zookeeper" "kubernetes/monitoring/dashboards/zookeeper.json"

# Create Kafka Exporter dashboard
create_dashboard "Kafka Exporter" "kubernetes/monitoring/dashboards/kafka-exporter.json"

echo -e "\n${GREEN}=== Grafana Dashboards Setup Complete ===${NC}"
echo -e "${YELLOW}Access Grafana at: http://localhost:3000${NC}"
echo -e "${YELLOW}Username: admin${NC}"
echo -e "${YELLOW}Password: admin123${NC}"

# Keep the script running to maintain port-forward
# Press Ctrl+C to exit
echo -e "\n${YELLOW}Press Ctrl+C to stop port-forwarding and exit...${NC}"
wait $PORT_FORWARD_PID
