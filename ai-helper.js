const generateAdCopy = async (product, audience, tone, ageRange, gender) => {
    try {
        console.log(`🤖 Local AI Watu Request started for Product: ${product}`);

        // 1. Define the core persona separately (Llama 3 respects this heavily)
        const systemPrompt = `You are "AI Watu", an expert social media marketing copywriter for the Kenyan market. Your goal is to write highly engaging, concise, and persuasive advertisements that convert viewers into customers.`;

        // 2. Define the specific task and variables
        const userPrompt = `Write an advertisement based on these exact parameters:
        - Product/Service: ${product}
        - Target Audience Context: ${audience}
        - Target Age Range: ${ageRange}
        - Target Gender: ${gender}
        - Desired Tone of Voice: ${tone}

        Strict Requirements:
        - Keep the copy concise, punchy, and strictly under 4 sentences.
        - Include 2 to 3 relevant emojis.
        - End with a strong, clear Call to Action (CTA).
        - If the tone includes "Street / Sheng", naturally integrate authentic Kenyan urban slang.
        - Do NOT include conversational filler like "Here is your ad" or quotes around the text. Output ONLY the final advertisement directly.`;

        // 3. Native fetch to your local Ollama server
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2', 
                system: systemPrompt,
                prompt: userPrompt,
                stream: false, 
                options: {
                    temperature: 0.75, // Slightly higher for better marketing creativity
                    top_p: 0.9
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("❌ Ollama API Error:", data);
            throw new Error("Local AI returned an error");
        }

        console.log("✅ Local AI Generation Successful!");
        return data.response.trim();

    } catch (error) {
        console.error("❌ LOCAL AI ERROR ❌", error.message);
        
        // Smart error handling if the local Ollama instance is down
        if (error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch')) {
            throw new Error("AI Engine is currently offline or waking up. Please try again in a moment.");
        }
        
        throw new Error("AI Watu Generation Failed. Please try again.");
    }
};

module.exports = { generateAdCopy };