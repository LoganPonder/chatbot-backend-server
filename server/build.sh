#!/usr/bin/env bash

# Debug info
echo "Current directory:"
pwd
ls -la

# Install Node.js dependencies
npm install

# Install Python packages
pip install langchain==0.0.312 langchain-community==0.0.13 huggingface-hub==0.19.4 transformers==4.35.2 sentence-transformers==2.2.2