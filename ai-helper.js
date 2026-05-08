const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Initialize the Gemini API with your secret key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// We use gemini-1.5-flash as it is blazing fast and perfect for text generation
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// ---------------------------------------------------------
// Function 1: Generate Ad Copy
// ---------------------------------------------------------
const generateAdCopy = async (productName, targetAudience, tone) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Missing GEMINI_API_KEY in .env file");
    }

    const prompt = `You are an expert digital marketer for an East African ad network called TagME. 
    Write a highly engaging social media ad campaign for the following:
    
    Product/Service: ${productName}
    Target Audience: ${targetAudience}
    Tone of Voice: ${tone}

    Structure the output cleanly:
    1. Give it a catchy headline (use emojis).
    2. Write a compelling, concise body paragraph.
    3. Include a strong Call to Action (CTA).
    4. Add 3-5 relevant hashtags at the bottom.
    
    Do not use markdown formatting like ** or ## in the final output, keep it clean text.`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini AI Error:", error);
        throw new Error("Failed to generate Ad Copy. Ensure your API key is valid.");
    }
};

// ---------------------------------------------------------
// Function 2: Generate SEO Keywords
// ---------------------------------------------------------
const generateKeywords = async (businessDescription) => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Missing GEMINI_API_KEY in .env file");
    }

    const prompt = `Based on the following business description, generate 10 highly effective SEO keywords and tags for targeting ads in East Africa. 
    Format the output as a simple comma-separated list without bullet points or numbering.
    Business: ${businessDescription}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error("Gemini AI Error:", error);
        throw new Error("Failed to generate Keywords. Ensure your API key is valid.");
    }
};

module.exports = {
    generateAdCopy,
    generateKeywords
};