require('dotenv').config();

const generateAdCopy = async (product, audience, tone) => {
    try {
        console.log(`🤖 AI Request started for Product: ${product}`);
        
        // .trim() is the magic word here. It destroys any hidden spaces from your .env file!
        const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;
        
        if (!apiKey) {
            throw new Error("API Key is missing from .env");
        }

        const prompt = `Write a short, highly engaging advertisement for ${product} targeting ${audience}. The tone should be ${tone}. Keep it under 3 sentences.`;

        // We use native 'fetch' to completely bypass the buggy SDK
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        // If Google rejects it, this will print the EXACT reason why
        if (!response.ok) {
            console.error("❌ Google API Error details:", JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || "Google API returned an error");
        }

        const text = data.candidates[0].content.parts[0].text;
        console.log("✅ AI Generation Successful!");
        return text;

    } catch (error) {
        console.error("❌ GEMINI API ERROR ❌");
        console.error(error.message);
        throw new Error("AI Generation Failed");
    }
};

module.exports = { generateAdCopy };