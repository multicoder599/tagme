const generateAdCopy = async (product, audience, tone, ageRange, gender) => {
    try {
        console.log(`🤖 Local AI Watu Request started for Product: ${product}`);

        // We construct a highly structured prompt to force the LLM to give us perfect marketing copy
        const prompt = `You are "AI Watu", an expert social media marketing copywriter. Write a highly engaging advertisement based on the following parameters:
        
        - Product/Service: ${product}
        - Target Audience Context: ${audience}
        - Target Age Range: ${ageRange}
        - Target Gender: ${gender}
        - Desired Tone of Voice: ${tone}

        Strict Requirements:
        - Keep the copy concise, punchy, and under 4 sentences.
        - Include 2-3 relevant emojis.
        - End with a strong, clear Call to Action (CTA).
        - If the tone includes "Street / Sheng", naturally integrate authentic Kenyan urban slang.
        - Do not include conversational filler like "Here is your ad" or quotes around the text. Just output the final advertisement directly.`;

        // We use native fetch to talk to YOUR local server on port 11434
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2', // Your active local model
                prompt: prompt,
                stream: false // Wait for the full response
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("❌ Ollama API Error:", data);
            throw new Error("Local AI returned an error");
        }

        console.log("✅ Local AI Generation Successful!");
        return data.response.trim(); // Trim removes any accidental white space at the beginning/end

    } catch (error) {
        console.error("❌ LOCAL AI ERROR ❌");
        console.error(error.message);
        throw new Error("AI Watu Generation Failed");
    }
};

module.exports = { generateAdCopy };