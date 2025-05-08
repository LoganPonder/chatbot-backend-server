#!/usr/bin/env bash

# Debug info
echo "Current directory:"
pwd
ls -la

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
npm install
