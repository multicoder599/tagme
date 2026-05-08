const generateAdCopy = async (product, audience, tone) => {
    try {
        console.log(`🤖 Local AI Request started for Product: ${product}`);

        const prompt = `Write a short, highly engaging advertisement for ${product} targeting ${audience}. The tone should be ${tone}. Keep it under 3 sentences.`;

        // We use native fetch to talk to YOUR local server on port 11434
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2', // The model we just downloaded
                prompt: prompt,
                stream: false // Get the whole response at once
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("❌ Ollama API Error:", data);
            throw new Error("Local AI returned an error");
        }

        console.log("✅ Local AI Generation Successful!");
        return data.response; // Ollama returns the text inside 'response'

    } catch (error) {
        console.error("❌ LOCAL AI ERROR ❌");
        console.error(error.message);
        throw new Error("AI Generation Failed");
    }
};

module.exports = { generateAdCopy };