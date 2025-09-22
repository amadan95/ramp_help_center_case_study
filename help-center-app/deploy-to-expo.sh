#!/bin/bash

# Login to Expo
echo "Please log in to your Expo account"
npx eas-cli login

# Update the project configuration
echo "Updating project configuration..."
npx eas-cli update --project-id 269b9a42-64df-4a78-828b-e742acf4e042

# Deploy the web build
echo "Deploying web build to Expo..."
npx eas-cli deploy --platform web --profile production --project-id 269b9a42-64df-4a78-828b-e742acf4e042

echo "Deployment complete! Your app should be available at https://ramp-context-hub.alokmadan.expo.dev"
