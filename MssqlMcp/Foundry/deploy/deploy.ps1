# Deploy MSSQL MCP Server to Azure Container Apps
# PowerShell Script for Windows

$ErrorActionPreference = "Stop"

# Configuration
$RESOURCE_GROUP = "rg-mssql-mcp-foundry"
$LOCATION = "eastus"
$ACR_NAME = "mcpfoundryacr"  # Must be globally unique, adjust as needed
$IMAGE_NAME = "mssql-mcp-foundry"
$IMAGE_TAG = "latest"

Write-Host "🚀 Starting deployment to Azure Container Apps" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

# Step 1: Login to Azure
Write-Host ""
Write-Host "📝 Step 1: Logging in to Azure..." -ForegroundColor Cyan
az login

# Step 2: Create Resource Group
Write-Host ""
Write-Host "📝 Step 2: Creating resource group..." -ForegroundColor Cyan
az group create `
  --name $RESOURCE_GROUP `
  --location $LOCATION

# Step 3: Create Azure Container Registry
Write-Host ""
Write-Host "📝 Step 3: Creating Azure Container Registry..." -ForegroundColor Cyan
az acr create `
  --resource-group $RESOURCE_GROUP `
  --name $ACR_NAME `
  --sku Basic `
  --admin-enabled true

# Step 4: Login to ACR
Write-Host ""
Write-Host "📝 Step 4: Logging in to Azure Container Registry..." -ForegroundColor Cyan
az acr login --name $ACR_NAME

# Step 5: Build and push Docker image
Write-Host ""
Write-Host "📝 Step 5: Building and pushing Docker image..." -ForegroundColor Cyan
Set-Location ..
docker build -t "$ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG" .
docker push "$ACR_NAME.azurecr.io/$IMAGE_NAME:$IMAGE_TAG"

# Step 6: Get ACR credentials
Write-Host ""
Write-Host "📝 Step 6: Getting ACR credentials..." -ForegroundColor Cyan
$ACR_LOGIN_SERVER = az acr show --name $ACR_NAME --query loginServer --output tsv
$ACR_USERNAME = az acr credential show --name $ACR_NAME --query username --output tsv
$ACR_PASSWORD = az acr credential show --name $ACR_NAME --query passwords[0].value --output tsv

# Step 7: Update parameters file
Write-Host ""
Write-Host "📝 Step 7: Updating parameters file..." -ForegroundColor Cyan
Set-Location deploy
Copy-Item container-app.parameters.json container-app.parameters.prod.json

# Update container image in parameters
$paramsContent = Get-Content container-app.parameters.prod.json | ConvertFrom-Json
$paramsContent.parameters.containerImage.value = "$ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG"

# Step 8: Generate secure API key
Write-Host ""
Write-Host "📝 Step 8: Generating API key..." -ForegroundColor Cyan
$API_KEY = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$API_KEY = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($API_KEY))
Write-Host "Generated API Key (save this!): $API_KEY" -ForegroundColor Yellow

# Update API key in parameters
$paramsContent.parameters.apiKey.value = $API_KEY
$paramsContent | ConvertTo-Json -Depth 10 | Set-Content container-app.parameters.prod.json

# Step 9: Deploy using Bicep
Write-Host ""
Write-Host "📝 Step 9: Deploying Container App..." -ForegroundColor Cyan
$deploymentOutput = az deployment group create `
  --resource-group $RESOURCE_GROUP `
  --template-file container-app.bicep `
  --parameters container-app.parameters.prod.json `
  --query properties.outputs `
  --output json | ConvertFrom-Json

# Step 10: Get deployment outputs
Write-Host ""
Write-Host "📝 Step 10: Getting deployment outputs..." -ForegroundColor Cyan
$MANAGED_IDENTITY_PRINCIPAL_ID = $deploymentOutput.managedIdentityPrincipalId.value
$CONTAINER_APP_URL = $deploymentOutput.containerAppUrl.value

Write-Host ""
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Grant SQL permissions to managed identity:" -ForegroundColor White
Write-Host "   Run this SQL on your Azure SQL Database:" -ForegroundColor White
Write-Host ""
Write-Host "   CREATE USER [mssql-mcp-foundry-identity] FROM EXTERNAL PROVIDER;" -ForegroundColor Gray
Write-Host "   ALTER ROLE db_datareader ADD MEMBER [mssql-mcp-foundry-identity];" -ForegroundColor Gray
Write-Host "   ALTER ROLE db_datawriter ADD MEMBER [mssql-mcp-foundry-identity];" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Test the deployment:" -ForegroundColor White
Write-Host "   Invoke-RestMethod $CONTAINER_APP_URL/health" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Test with API key:" -ForegroundColor White
Write-Host "   `$headers = @{'x-api-key' = '$API_KEY'}" -ForegroundColor Gray
Write-Host "   Invoke-RestMethod -Uri $CONTAINER_APP_URL/sse -Headers `$headers" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Container App URL: $CONTAINER_APP_URL" -ForegroundColor Green
Write-Host "5. API Key: $API_KEY" -ForegroundColor Yellow
Write-Host "   (Save this API key securely!)" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================" -ForegroundColor Green

# Save deployment info
$deploymentInfo = @{
    ContainerAppUrl = $CONTAINER_APP_URL
    ApiKey = $API_KEY
    ManagedIdentityPrincipalId = $MANAGED_IDENTITY_PRINCIPAL_ID
    DeploymentDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}
$deploymentInfo | ConvertTo-Json | Set-Content "deployment-info.json"
Write-Host "Deployment info saved to deployment-info.json" -ForegroundColor Cyan
