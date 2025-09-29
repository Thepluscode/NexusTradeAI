#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Deploying Kafka Cluster with Monitoring ===${NC}\n"

# Function to check if a Kubernetes resource exists
resource_exists() {
    kubectl get $1 $2 -n $3 >/dev/null 2>&1
    return $?
}

# Create namespaces if they don't exist
for ns in kafka monitoring; do
    if ! resource_exists namespace $ns ""; then
        echo -e "${GREEN}Creating $ns namespace...${NC}"
        kubectl create namespace $ns
    else
        echo -e "${YELLOW}Namespace $ns already exists, skipping...${NC}"
    fi
done

# Deploy Zookeeper
echo -e "\n${GREEN}Deploying Zookeeper...${NC}"
kubectl apply -f kubernetes/kafka/01-zookeeper-config.yaml
kubectl apply -f kubernetes/kafka/03-zookeeper.yaml

# Wait for Zookeeper to be ready
echo -e "\n${YELLOW}Waiting for Zookeeper to be ready...${NC}" 
kubectl wait --for=condition=ready pod -l app=zookeeper -n kafka --timeout=300s

# Create Kafka secrets if they don't exist
if ! resource_exists secret kafka-secrets kafka; then
    echo -e "\n${GREEN}Creating Kafka secrets...${NC}"
    # Generate random passwords
    KEYSTORE_PASSWORD=$(openssl rand -base64 32)
    TRUSTSTORE_PASSWORD=$(openssl rand -base64 32)
    
    # Create a temporary directory for certs
    TMP_DIR=$(mktemp -d)
    
    # Generate CA key and certificate
    openssl req -x509 -newkey rsa:4096 -keyout $TMP_DIR/ca-key.pem -out $TMP_DIR/ca-cert.pem \
        -days 365 -nodes -subj "/CN=kafka-ca"
    
    # Create truststore and import CA cert
    keytool -keystore $TMP_DIR/kafka.truststore.jks -alias CARoot -import -file $TMP_DIR/ca-cert.pem \
        -storepass $TRUSTSTORE_PASSWORD -keypass $KEYSTORE_PASSWORD -noprompt
    
    # Create keystore and generate certificate signing request (CSR)
    keytool -keystore $TMP_DIR/kafka.keystore.jks -alias localhost -validity 365 -genkey -keyalg RSA \
        -storepass $KEYSTORE_PASSWORD -keypass $KEYSTORE_PASSWORD \
        -dname "CN=kafka, O=NexusTradeAI"
    
    # Generate CSR
    keytool -keystore $TMP_DIR/kafka.keystore.jks -alias localhost -certreq -file $TMP_DIR/cert-file \
        -storepass $KEYSTORE_PASSWORD -keypass $KEYSTORE_PASSWORD
    
    # Sign the certificate with CA
    openssl x509 -req -CA $TMP_DIR/ca-cert.pem -CAkey $TMP_DIR/ca-key.pem -in $TMP_DIR/cert-file \
        -out $TMP_DIR/cert-signed -days 365 -CAcreateserial -passin pass:$KEYSTORE_PASSWORD
    
    # Import CA cert into keystore
    keytool -keystore $TMP_DIR/kafka.keystore.jks -alias CARoot -import -file $TMP_DIR/ca-cert.pem \
        -storepass $KEYSTORE_PASSWORD -keypass $KEYSTORE_PASSWORD -noprompt
    
    # Import signed certificate into keystore
    keytool -keystore $TMP_DIR/kafka.keystore.jks -alias localhost -import -file $TMP_DIR/cert-signed \
        -storepass $KEYSTORE_PASSWORD -keypass $KEYSTORE_PASSWORD -noprompt
    
    # Create Kubernetes secret with the generated files
    kubectl create secret generic kafka-secrets -n kafka \
        --from-file=kafka.keystore.jks=$TMP_DIR/kafka.keystore.jks \
        --from-file=kafka.truststore.jks=$TMP_DIR/kafka.truststore.jks \
        --from-literal=keystore-password=$KEYSTORE_PASSWORD \
        --from-literal=truststore-password=$TRUSTSTORE_PASSWORD \
        --from-literal=key-password=$KEYSTORE_PASSWORD
    
    # Cleanup
    rm -rf $TMP_DIR
fi

# Deploy Kafka
echo -e "\n${GREEN}Deploying Kafka...${NC}"
kubectl apply -f kubernetes/kafka/02-kafka-config.yaml
kubectl apply -f kubernetes/kafka/04-kafka.yaml

# Wait for Kafka to be ready
echo -e "\n${YELLOW}Waiting for Kafka to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=kafka -n kafka --timeout=300s

# Deploy monitoring components
echo -e "\n${GREEN}Deploying monitoring stack...${NC}"
kubectl apply -f kubernetes/monitoring/00-namespace.yaml
kubectl apply -f kubernetes/monitoring/01-prometheus-config.yaml
kubectl apply -f kubernetes/monitoring/02-prometheus-deployment.yaml
kubectl apply -f kubernetes/monitoring/03-grafana-deployment.yaml
kubectl apply -f kubernetes/monitoring/04-kafka-exporter.yaml

# Wait for monitoring components to be ready
echo -e "\n${YELLOW}Waiting for monitoring components to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=prometheus -n monitoring --timeout=180s
kubectl wait --for=condition=ready pod -l app=grafana -n monitoring --timeout=180s
kubectl wait --for=condition=ready pod -l app=kafka-exporter -n monitoring --timeout=180s

# Create Kafka topics
echo -e "\n${GREEN}Creating Kafka topics...${NC}"
for topic in market_data_1m market_data_5m market_data_1h trades system_metrics error_logs; do
    if ! kubectl exec -n kafka kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --list | grep -q "^$topic$"; then
        echo "Creating topic: $topic"
        kubectl exec -n kafka kafka-0 -- kafka-topics --create \
            --bootstrap-server localhost:9092 \
            --replication-factor 3 \
            --partitions 10 \
            --topic $topic
    else
        echo "Topic $topic already exists, skipping..."
    fi
done

# Print access information
echo -e "\n${GREEN}=== Deployment Complete ===${NC}"
echo -e "\n${YELLOW}Access Information:${NC}"
echo "Kafka Bootstrap Servers: kafka-0.kafka-headless.kafka.svc.cluster.local:9092"
echo -e "\n${YELLOW}Monitoring:${NC}"
echo "Prometheus: http://$(kubectl get svc prometheus-service -n monitoring -o jsonpath='{.status.loadBalancer.ingress[0].ip}'):9090"
echo "Grafana: http://$(kubectl get svc grafana -n monitoring -o jsonpath='{.status.loadBalancer.ingress[0].ip}'):3000"
echo -e "\n${YELLOW}Grafana Credentials:${NC}"
echo "Username: admin"
echo "Password: admin123"

echo -e "\n${GREEN}To access Kafka from outside the cluster, use port-forwarding:${NC}"
echo "kubectl port-forward -n kafka svc/kafka 9092:9092"
echo -e "\n${GREEN}To produce test messages:${NC}"
echo "kubectl run kafka-producer -n kafka -ti --image=bitnami/kafka:3.1.0 --rm=true --restart=Never -- \\"
echo "  bash -c \"echo 'Hello, Kafka!' | kafka-console-producer.sh --broker-list kafka-0.kafka-headless.kafka.svc.cluster.local:9092 --topic test-topic\""

echo -e "\n${GREEN}To consume messages:${NC}"
echo "kubectl run kafka-consumer -n kafka -ti --image=bitnami/kafka:3.1.0 --rm=true --restart=Never -- \\"
echo "  bash -c 'kafka-console-consumer.sh --bootstrap-server kafka-0.kafka-headless.kafka.svc.cluster.local:9092 --topic test-topic --from-beginning'"

echo -e "\n${GREEN}To view Kafka logs:${NC}"
echo "kubectl logs -n kafka -l app=kafka -f"

echo -e "\n${GREEN}To view Zookeeper logs:${NC}"
echo "kubectl logs -n kafka -l app=zookeeper -f"

echo -e "\n${GREEN}To view Prometheus logs:${NC}"
echo "kubectl logs -n monitoring -l app=prometheus -f"

echo -e "\n${GREEN}To view Grafana logs:${NC}"
echo "kubectl logs -n monitoring -l app=grafana -f"

echo -e "\n${GREEN}To view Kafka Exporter metrics:${NC}"
echo "kubectl port-forward -n monitoring svc/kafka-exporter 9308:9308"
echo "Then visit: http://localhost:9308/metrics"
