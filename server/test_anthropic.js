require('dotenv').config();
const axios = require('axios');

async function testAnthropicAPI() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log("Testing Anthropic API");
  console.log("API Key exists:", !!apiKey);
  console.log("API Key starts with:", apiKey.substring(0, 10) + "...");
  
  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      data: {
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 150,
        messages: [
          { role: "user", content: "Hello Claude, this is a simple test. Please respond with a single sentence." }
        ]
      }
    });
    
    console.log("Success! Claude responded with:", response.data.content[0].text);
  } catch (error) {
    console.error("Error calling Anthropic API:");
    console.error("Status:", error.response?.status);
    console.error("Data:", JSON.stringify(error.response?.data, null, 2));
  }
}

testAnthropicAPI();