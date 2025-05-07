// server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'shFCjVUeKwnDT5FJTSAI';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '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';

// Store conversation history
let conversationHistory = [];

// System prompt
const systemPrompt = `You are Sarah, a customer service representative at ABLe Capital Property Management. Provide warm, helpful, professional support with concise responses (1-2 sentences).

Personality: Friendly, patient, clear, and solution-focused.

Payment Verification Process:
- For payment inquiries, verify tenant's identity before sharing account information
- Ask for these details:
  1. Last name
  2. Complete address with apartment number
  3. Payment amount
  4. Payment date
- After verifying ALL information (Johnson, 1022 Lakewood Dr, Apt 2A, Raleigh, NC, $1,200, May 3rd), confirm payment was received on May 3rd and properly applied
- Assure no late fees will be charged (within grace period)
- Offer to provide a receipt if requested
- Don't provide any tenant information unless first offered/verified by the tenant

Communication Guidelines:
- Use positive language and show empathy
- Be specific about next steps
- End interactions on a positive note
- Keep responses concise while maintaining warmth
- For complex issues or legal matters, refer to appropriate department emails`;


// Endpoint to process transcription and get AI response
app.post('/api/process-speech', async (req, res) => {
    try {
        const { transcript } = req.body;
        
        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }
        
        console.log('Processing transcript:', transcript);
        
        // Add user message to conversation history
        conversationHistory.push({ role: 'user', content: transcript });
        
        // Call Python script to get RAG content - this calls a Python script that accesses your ChromaDB
        // We'll create this script separately
        const retrievedContext = await getRagContext(transcript);
        
        // Create final system prompt with context
        let finalSystemPrompt = systemPrompt;
        if (retrievedContext) {
            finalSystemPrompt += "\n\nRelevant Context:\n" + retrievedContext;
        }
        
        // Call Anthropic API
        const claudeResponse = await axios({
            method: 'post',
            url: 'https://api.anthropic.com/v1/messages',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            data: {
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 150,
                temperature: 0.7,
                system: finalSystemPrompt,
                messages: conversationHistory
            }
        });
        
        // Extract assistant's response
        const assistantResponse = claudeResponse.data.content[0].text;
        
        // Add assistant message to conversation history
        conversationHistory.push({ role: 'assistant', content: assistantResponse });
        
        // Generate speech from the response
        const speechResponse = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            data: {
                text: assistantResponse,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5
                }
            },
            responseType: 'arraybuffer'
        });
        
        const audioBuffer = Buffer.from(speechResponse.data);
        const base64Audio = audioBuffer.toString('base64');
        
        res.json({
            transcript: transcript,
            response: assistantResponse,
            audio: base64Audio,
            conversationHistory: conversationHistory
        });
        
    } catch (error) {
        console.error('Error processing speech:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to process speech' });
    }
});

// Function to call Python for RAG context
async function getRagContext(query) {
    // Write a temporary Python script to access ChromaDB
    const pythonScript = `
import sys
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

try:
    # Initialize embedding model
    embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    
    # Initialize vector store
    vectorstore = Chroma(
        persist_directory="./chroma_data",
        embedding_function=embedding_model,
        collection_name="lease_collection"
    )
    
    # Get user query from command line
    query = """${query}"""
    
    # Search for similar documents
    results = vectorstore.similarity_search(query, k=3)
    
    # Combine document content
    context = "\\n".join([doc.page_content for doc in results])
    
    # Print context to stdout for Node.js to capture
    print(context)
except Exception as e:
    print(f"Error in RAG system: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

    // Write script to a temp file
    const scriptPath = path.join(__dirname, 'temp_rag.py');
    fs.writeFileSync(scriptPath, pythonScript);
    
    return new Promise((resolve, reject) => {
        exec(`python ${scriptPath}`, (error, stdout, stderr) => {
            // Clean up temp file
            fs.unlinkSync(scriptPath);
            
            if (error) {
                console.error(`RAG error: ${stderr}`);
                resolve(""); // Return empty string on error
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

// Text chat endpoint
app.post('/api/text-chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        console.log('Processing text message:', message);
        
        // Add user message to conversation history
        conversationHistory.push({ role: 'user', content: message });
        
        // Get RAG context using your existing function
        const retrievedContext = await getRagContext(message);
        
        // Create final system prompt with context
        let finalSystemPrompt = systemPrompt;
        if (retrievedContext) {
            finalSystemPrompt += "\n\nRelevant Context:\n" + retrievedContext;
        }
        
        // Call Anthropic API
        const claudeResponse = await axios({
            method: 'post',
            url: 'https://api.anthropic.com/v1/messages',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            data: {
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 150,
                temperature: 0.7,
                system: finalSystemPrompt,
                messages: conversationHistory
            }
        });
        
        // Extract assistant's response
        const assistantResponse = claudeResponse.data.content[0].text;
        
        // Add assistant message to conversation history
        conversationHistory.push({ role: 'assistant', content: assistantResponse });
        
        // Return the response and updated conversation history
        res.json({
            response: assistantResponse,
            context: retrievedContext,
            conversationHistory: conversationHistory
        });
        
    } catch (error) {
        console.error('Error processing text message:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to process message' });
    }
});

// Reset conversation endpoint
app.post('/api/reset-conversation', (req, res) => {
    conversationHistory = [];
    res.json({ status: 'success', message: 'Conversation reset' });
});

// Text-to-speech endpoint (previously defined)
app.post('/api/text-to-speech', async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        
        console.log('Generating speech for:', text);
        
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            data: {
                text,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.5
                }
            },
            responseType: 'arraybuffer'
        });
        
        console.log('Response received from ElevenLabs');
        
        const audioBuffer = Buffer.from(response.data);
        const base64Audio = audioBuffer.toString('base64');
        
        res.json({ audio: base64Audio });
    } catch (error) {
        console.error('Error generating speech:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
        res.status(500).json({ error: 'Failed to generate speech' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});