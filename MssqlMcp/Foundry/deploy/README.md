# Azure Deployment Guide

This guide walks you through deploying the MSSQL MCP Server to Azure Container Apps.

## Prerequisites

1. **Azure Subscription** with permissions to create:
   - Resource Groups
   - Container Apps
   - Container Registry
   - Managed Identities

2. **Tools Installed:**
   - [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
   - [Docker](https://docs.docker.com/get-docker/)
   - PowerShell (Windows) or Bash (Linux/Mac)

3. **Azure SQL Database:**
   - Existing Azure SQL Database
   - Firewall configured to allow Azure services
   - Entra ID authentication enabled

## Deployment Options

### Option 1: Automated Deployment (Recommended)

#### Windows (PowerShell)
```powershell
cd deploy
.\deploy.ps1
```

#### Linux/Mac (Bash)
```bash
cd deploy
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. ✅ Create Azure Resource Group
2. ✅ Create Azure Container Registry
3. ✅ Build and push Docker image
4. ✅ Deploy Container App with managed identity
5. ✅ Generate secure API key
6. ✅ Configure health checks and autoscaling

### Option 2: Manual Deployment

#### Step 1: Create Resource Group
```bash
az group create \
  --name rg-mssql-mcp-foundry \
  --location eastus
```

#### Step 2: Create Container Registry
```bash
az acr create \
  --resource-group rg-mssql-mcp-foundry \
  --name <your-unique-acr-name> \
  --sku Basic \
  --admin-enabled true
```

#### Step 3: Build and Push Image
```bash
# Login to ACR
az acr login --name <your-acr-name>

# Build image
docker build -t <your-acr-name>.azurecr.io/mssql-mcp-foundry:latest .

# Push image
docker push <your-acr-name>.azurecr.io/mssql-mcp-foundry:latest
```

#### Step 4: Update Parameters
Edit `container-app.parameters.json`:
- Set `containerImage` to your ACR image
- Set `sqlServerName` to your SQL server
- Set `sqlDatabaseName` to your database
- Generate a secure `apiKey`

#### Step 5: Deploy with Bicep
```bash
az deployment group create \
  --resource-group rg-mssql-mcp-foundry \
  --template-file container-app.bicep \
  --parameters container-app.parameters.json
```

#### Step 6: Grant SQL Permissions

Get the managed identity name:
```bash
az identity list \
  --resource-group rg-mssql-mcp-foundry \
  --query "[0].name" -o tsv
```

Connect to your Azure SQL Database and run:
```sql
-- Create user for the managed identity
CREATE USER [mssql-mcp-foundry-identity] FROM EXTERNAL PROVIDER;

-- Grant permissions
ALTER ROLE db_datareader ADD MEMBER [mssql-mcp-foundry-identity];
ALTER ROLE db_datawriter ADD MEMBER [mssql-mcp-foundry-identity];

-- Optional: Grant specific permissions
GRANT SELECT, INSERT, UPDATE ON SCHEMA::SalesLT TO [mssql-mcp-foundry-identity];
```

## Post-Deployment Configuration

### 1. Get Container App URL
```bash
az containerapp show \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --query properties.configuration.ingress.fqdn -o tsv
```

### 2. Test the Deployment

#### Health Check
```bash
curl https://<your-app>.azurecontainerapps.io/health
```

#### With API Key
```bash
curl -H "x-api-key: <your-api-key>" \
     https://<your-app>.azurecontainerapps.io/sse
```

### 3. View Logs
```bash
az containerapp logs show \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --follow
```

### 4. Monitor Application
```bash
# Get metrics
az monitor metrics list \
  --resource <container-app-resource-id> \
  --metric-names "Requests,ResponseTime"

# View in Azure Portal
az containerapp browse \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry
```

## Scaling Configuration

The deployment includes auto-scaling based on HTTP requests:

- **Min Replicas:** 1
- **Max Replicas:** 3
- **Scale Trigger:** 50 concurrent requests

To adjust:
```bash
az containerapp update \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --min-replicas 2 \
  --max-replicas 5
```

## Security Configuration

### Update API Key
```bash
az containerapp secret set \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --secrets api-key=<new-secure-key>

# Restart to apply
az containerapp revision restart \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry
```

### Configure Custom Domain
```bash
az containerapp hostname add \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --hostname mcp.yourdomain.com
```

### Enable Application Insights
```bash
# Create Application Insights
az monitor app-insights component create \
  --app mcp-insights \
  --location eastus \
  --resource-group rg-mssql-mcp-foundry

# Get instrumentation key
INSTRUMENTATION_KEY=$(az monitor app-insights component show \
  --app mcp-insights \
  --resource-group rg-mssql-mcp-foundry \
  --query instrumentationKey -o tsv)

# Update container app
az containerapp update \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --set-env-vars APPINSIGHTS_INSTRUMENTATIONKEY=$INSTRUMENTATION_KEY
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
az containerapp logs show \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --tail 100

# Check replica status
az containerapp replica list \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry
```

### SQL Connection Fails
1. Verify managed identity has SQL permissions
2. Check Azure SQL firewall allows Azure services
3. Verify connection string in environment variables

```bash
# Get current environment variables
az containerapp show \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --query properties.template.containers[0].env
```

### Authentication Issues
```bash
# Verify API key is set
az containerapp secret list \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry
```

## Cost Optimization

### Development Environment
- Min replicas: 1
- CPU: 0.25 cores
- Memory: 0.5Gi

### Production Environment
- Min replicas: 2 (for high availability)
- CPU: 0.5 cores
- Memory: 1Gi

### Stop Container App (to save costs)
```bash
az containerapp update \
  --name mssql-mcp-foundry \
  --resource-group rg-mssql-mcp-foundry \
  --min-replicas 0 \
  --max-replicas 0
```

## Cleanup

To remove all resources:
```bash
az group delete \
  --name rg-mssql-mcp-foundry \
  --yes --no-wait
```

## Next Steps

1. ✅ Deploy to Azure Container Apps
2. ✅ Configure managed identity for SQL
3. ✅ Test the deployment
4. 📝 Integrate with Azure AI Foundry Agent Service (see FOUNDRY_INTEGRATION.md)
5. 📝 Set up monitoring and alerts
6. 📝 Configure custom domain (optional)

## Support

For issues:
1. Check logs: `az containerapp logs show`
2. Verify environment variables
3. Test SQL connectivity
4. Review Application Insights (if enabled)
