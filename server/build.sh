echo '#!/bin/bash

# Print debug info
echo "Current directory:"
pwd
ls -la

# Install Node.js dependencies
npm install

# Install Python packages with pip3
pip3 install langchain langchain-community huggingface-hub transformers sentence-transformers
' > build.sh