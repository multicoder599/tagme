const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// 1. Verify the API Key is actually loaded
if (!process.env.GEMINI_API_KEY) {
    console.error("🚨 CRITICAL: GEMINI_API_KEY is missing from your .env file!");
}

// 2. Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateAdCopy = async (product, audience, tone) => {
    try {
        console.log(`🤖 AI Request started for Product: ${product}`);

        // Using the most stable standard model. 
        // If this fails, we will change it to 'gemini-pro'
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Write a short, highly engaging advertisement for ${product} targeting ${audience}. The tone should be ${tone}. Keep it under 3 sentences.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("✅ AI Generation Successful!");
        return text;

    } catch (error) {
        console.error("❌ GEMINI API ERROR ❌");
        console.error(error.message);
        throw new Error("AI Generation Failed");
    }
};

module.exports = { generateAdCopy };