# This script builds your custom node, deploys it to your n8n custom nodes folder,
# kills any running n8n process, and then restarts n8n.
#
# It dynamically determines the target directory based on the "name" field in package.json.
#
# Usage: .\deploy-node.ps1

$ErrorActionPreference = "Stop"

##############################
# Step 0: Get Package Name
##############################
# Use Node.js to extract the package name from package.json.
$PACKAGE_NAME = node -p "require('./package.json').name"

if (-not $PACKAGE_NAME) {
    Write-Error "Error: Could not determine package name from package.json."
    exit 1
}

# Set the container target directory
$CONTAINER_DIR = "/home/node/.n8n/custom/$PACKAGE_NAME"

Write-Host "Detected package name: '$PACKAGE_NAME'"
Write-Host "Target deployment directory: '$CONTAINER_DIR'"

##############################
# Step 1: Build the Node
##############################
Write-Host "Building the node..."
npm run build

##############################
# Step 2: Deploy the Build Output
##############################
# Define the source (build output) directory.
$SOURCE_DIR = "./dist"

Write-Host "Deploying build output from '$SOURCE_DIR' to container..."

# Start the n8n container if it's not running
try {
    docker ps | Select-String "n8n" | Out-Null
} catch {
    try {
        docker start n8n
    } catch {
        docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
    }
}

# Remove previous installation from container
Write-Host "Removing previous installation..."
docker exec -u root n8n rm -rf "$CONTAINER_DIR"

# Create a temp directory for deployment
$TMP_DIR = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_.FullName }
Copy-Item "$SOURCE_DIR\*" -Destination $TMP_DIR -Recurse

# Copy to the container
Write-Host "Copying to n8n container..."
docker cp "$($TMP_DIR.FullName)\." "n8n:$CONTAINER_DIR"

# Fix permissions inside the container
Write-Host "Fixing permissions..."
docker exec -u root n8n chown -R node:node "$CONTAINER_DIR"
docker exec -u root n8n chmod -R 755 "$CONTAINER_DIR"

# Clean up temp directory
Remove-Item -Path $TMP_DIR -Recurse -Force

Write-Host "Deployment complete."

##############################
# Step 3: Restart n8n
##############################
Write-Host "Restarting n8n..."
docker container restart n8n

# Logging for debugging
docker logs -f n8n
