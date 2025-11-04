#!/bin/bash
# Deploy MSSQL MCP Server to Azure Container Apps

set -e

# Configuration
RESOURCE_GROUP="rg-mssql-mcp-foundry"
LOCATION="eastus"
ACR_NAME="mcpfoundryacr"  # Must be globally unique, adjust as needed
IMAGE_NAME="mssql-mcp-foundry"
IMAGE_TAG="latest"

echo "🚀 Starting deployment to Azure Container Apps"
echo "================================================"

# Step 1: Login to Azure
echo ""
echo "📝 Step 1: Logging in to Azure..."
az login

# Step 2: Create Resource Group
echo ""
echo "📝 Step 2: Creating resource group..."
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION

# Step 3: Create Azure Container Registry
echo ""
echo "📝 Step 3: Creating Azure Container Registry..."
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# Step 4: Login to ACR
echo ""
echo "📝 Step 4: Logging in to Azure Container Registry..."
az acr login --name $ACR_NAME

# Step 5: Build and push Docker image
echo ""
echo "📝 Step 5: Building and pushing Docker image..."
cd ..
docker build -t $ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG .
docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG

# Step 6: Get ACR credentials
echo ""
echo "📝 Step 6: Getting ACR credentials..."
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value --output tsv)

# Step 7: Update parameters file
echo ""
echo "📝 Step 7: Updating parameters file..."
cd deploy
cp container-app.parameters.json container-app.parameters.prod.json

# Update container image in parameters (using jq if available)
if command -v jq &> /dev/null; then
  jq --arg image "$ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG" \
     '.parameters.containerImage.value = $image' \
     container-app.parameters.prod.json > temp.json && \
     mv temp.json container-app.parameters.prod.json
else
  echo "⚠️  Please manually update containerImage in container-app.parameters.prod.json to:"
  echo "   $ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG"
fi

# Step 8: Generate secure API key
echo ""
echo "📝 Step 8: Generating API key..."
API_KEY=$(openssl rand -base64 32)
echo "Generated API Key (save this!): $API_KEY"

# Update API key in parameters
if command -v jq &> /dev/null; then
  jq --arg key "$API_KEY" \
     '.parameters.apiKey.value = $key' \
     container-app.parameters.prod.json > temp.json && \
     mv temp.json container-app.parameters.prod.json
fi

# Step 9: Deploy using Bicep
echo ""
echo "📝 Step 9: Deploying Container App..."
DEPLOYMENT_OUTPUT=$(az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file container-app.bicep \
  --parameters container-app.parameters.prod.json \
  --query properties.outputs \
  --output json)

# Step 10: Get managed identity details
echo ""
echo "📝 Step 10: Getting managed identity..."
MANAGED_IDENTITY_PRINCIPAL_ID=$(echo $DEPLOYMENT_OUTPUT | jq -r '.managedIdentityPrincipalId.value')
CONTAINER_APP_URL=$(echo $DEPLOYMENT_OUTPUT | jq -r '.containerAppUrl.value')

echo ""
echo "✅ Deployment Complete!"
echo "================================================"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Grant SQL permissions to managed identity:"
echo "   Run this SQL on your Azure SQL Database:"
echo ""
echo "   CREATE USER [mssql-mcp-foundry-identity] FROM EXTERNAL PROVIDER;"
echo "   ALTER ROLE db_datareader ADD MEMBER [mssql-mcp-foundry-identity];"
echo "   ALTER ROLE db_datawriter ADD MEMBER [mssql-mcp-foundry-identity];"
echo ""
echo "2. Test the deployment:"
echo "   curl $CONTAINER_APP_URL/health"
echo ""
echo "3. Test with API key:"
echo "   curl -H \"x-api-key: $API_KEY\" $CONTAINER_APP_URL/sse"
echo ""
echo "4. Container App URL: $CONTAINER_APP_URL"
echo "5. API Key: $API_KEY"
echo "   (Save this API key securely!)"
echo ""
echo "================================================"
