import fetch from 'node-fetch';
import logger from '../utils/logger.js';

/**
 * Analyzes a movie poster using Gemini Vision AI to extract movie details.
 * @param {Buffer} imageBuffer - The downloaded image buffer
 * @param {String} mimeType - The mime type of the image (e.g. image/jpeg)
 * @returns {Promise<Object>} - Parsed JSON object { title, year, genre, description }
 */
export const analyzePosterWithAI = async (imageBuffer, mimeType = 'image/jpeg') => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is missing in environment variables');
        }

        const base64Image = imageBuffer.toString('base64');

        const prompt = `
You are a movie expert AI. Analyze this movie poster and extract the movie details. 
Reply ONLY with a valid JSON object in this exact format, with no markdown, no \`\`\`json wrappers, and no extra text:
{
  "title": "Movie Name",
  "year": 2024,
  "genre": "Jangari",
  "description": "O'zbek tilida qisqacha va qiziqarli 2-3 ta gapdan iborat tavsif"
}
Note on genres: Use ONLY one of these genres in Uzbek if possible: Jangari, Komediya, Drama, Fantastika, Dahshatli, Sarguzasht, Romantik, Boshqa.
`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1, // Low temp for more factual recognition
                maxOutputTokens: 250, // Optimize token usage
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('No response from Gemini');
        }

        let rawText = data.candidates[0].content.parts[0].text.trim();
        // Clean up markdown if AI accidentally included it
        if (rawText.startsWith('\`\`\`json')) rawText = rawText.replace('\`\`\`json', '');
        if (rawText.startsWith('\`\`\`')) rawText = rawText.replace('\`\`\`', '');
        if (rawText.endsWith('\`\`\`')) rawText = rawText.substring(0, rawText.length - 3);

        const movieData = JSON.parse(rawText.trim());
        return movieData;

    } catch (error) {
        logger.error('AI Poster Analysis Error:', error.message);
        return null; // Return null on failure so we can fallback
    }
};
