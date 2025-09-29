#!/bin/bash

# Create base directories
mkdir -p services/auth-service/{src/{controllers,middleware,models,services,routes,config,utils},tests}
mkdir -p services/market-data-service/{src/{collectors,processors,distributors,models,config},tests}
mkdir -p services/trading-engine/{src/{execution,risk,matching,compliance,models},tests}

# Create AI/ML directories
mkdir -p ai-ml/{models,data-pipeline,training,inference,deployment}

# Create data infrastructure directories
mkdir -p data-infrastructure/{streaming,storage,processing,orchestration}

# Create client directories
mkdir -p clients/{web-app/src/{components,hooks,services,store,utils,styles},mobile-app,desktop-app,pro-terminal}

# Create infrastructure directories
mkdir -p infrastructure/{kubernetes,terraform,ansible,docker,ci-cd}

# Create shared libraries
mkdir -p shared/{libs,types,configs,constants}

# Create test directories
mkdir -p tests/{unit,integration,e2e,performance,security,fixtures}

# Create documentation
mkdir -p docs/{architecture,api,deployment,development,user}

# Set permissions
echo "Project structure created successfully!"
echo "Next steps:"
echo "1. Run 'cd /Users/theophilusogieva/CascadeProjects/nexus-trade-ai'"
echo "2. Run 'npm install' to install root dependencies"
echo "3. Run 'docker-compose up -d' to start the development environment"
