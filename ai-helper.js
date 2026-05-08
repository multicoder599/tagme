const axios = require('axios');
require('dotenv').config();

/**
 * TagME AI Helper Service
 * Communicates with the Google Gemini API to generate marketing content.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ---------------------------------------------------------
// Function 1: Generate Ad Copy
// ---------------------------------------------------------
const generateAdCopy = async (productName, targetAudience, tone) => {
    const prompt = `You are an expert digital marketer for an East African ad network called TagME. 
    Write a highly engaging, 2-paragraph social media ad caption for a product called "${productName}". 
    The target audience is "${targetAudience}". 
    The tone should be ${tone}. 
    Include 3 relevant hashtags at the end. Do not include introductory text, just the ad copy.`;

    return await callAI(prompt);
};

// ---------------------------------------------------------
// Function 2: Generate SEO Keywords
// ---------------------------------------------------------
const generateKeywords = async (businessDescription) => {
    const prompt = `Based on the following business description, generate 10 highly effective SEO keywords and tags for targeting ads in East Africa. 
    Format the output as a simple comma-separated list.
    Business: ${businessDescription}`;

    return await callAI(prompt);
};

// ---------------------------------------------------------
// Core AI Engine (The Axios Call)
// ---------------------------------------------------------
const callAI = async (promptText) => {
    if (!GEMINI_API_KEY) {
        throw new Error("Missing GEMINI_API_KEY in .env file");
    }

    try {
        const response = await axios.post(GEMINI_URL, {
            contents: [{
                parts: [{ text: promptText }]
            }]
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Extract the clean text from the API response
        const aiText = response.data.candidates[0].content.parts[0].text;
        return aiText.trim();

    } catch (error) {
        console.error("AI Helper Error:", error.response ? error.response.data : error.message);
        throw new Error("Failed to generate content. Please try again later.");
    }
};

module.exports = {
    generateAdCopy,
    generateKeywords
};