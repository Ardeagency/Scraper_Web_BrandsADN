import OpenAI from 'openai';
import dotenv from 'dotenv';
import { ScrapedPage } from './scraper';

dotenv.config();

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
}

export interface BrandAnalysis {
    brandDetails: {
        niche: string[];
        personalityArchetype: string[];
        brandFocus: string[];
        visualStyle: string[];
        advertisingStyle: string[];
        tone: string[];
        writingStyle: string[];
        keywords: string[];
        prohibitedWords: string[];
        objectives: string[];
    };
    audience: {
        name: string;
        description: string;
        demographics: string[];
        psychographics: string[];
        painPoints: string[];
        desires: string[];
        objections: string[];
        buyingTriggers: string[];
    }[];
}

export class LLMService {
    async analyzeBrand(page: ScrapedPage): Promise<BrandAnalysis | null> {
        if (!openai) {
            console.warn('OPENAI_API_KEY not found. Skipping LLM analysis.');
            return null;
        }

        const prompt = `
    Analyze the following website content and extract detailed brand strategy information suitable for a marketing database.
    
    Website: ${page.url}
    Title: ${page.title}
    Description: ${page.description}
    Content Summary: ${page.text.substring(0, 8000)}... (truncated)

    Return a JSON object with the following structure:
    {
      "brandDetails": {
        "niche": ["array of strings"],
        "personalityArchetype": ["array of strings (e.g., Hero, Sage, Ruler)"],
        "brandFocus": ["array of strings"],
        "visualStyle": ["array of strings"],
        "advertisingStyle": ["array of strings"],
        "tone": ["array of strings (e.g., Professional, Friendly)"],
        "writingStyle": ["array of strings"],
        "keywords": ["array of strings"],
        "prohibitedWords": ["array of strings (things they seem to avoid)"],
        "objectives": ["array of strings"]
      },
      "audience": [
        {
          "name": "Target Audience Name",
          "description": "Brief description",
          "demographics": ["array of strings"],
          "psychographics": ["array of strings"],
          "painPoints": ["array of strings"],
          "desires": ["array of strings"],
          "objections": ["array of strings"],
          "buyingTriggers": ["array of strings"]
        }
      ]
    }
    
    Only return valid JSON. Do not include markdown formatting.
    `;

        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'gpt-4o-mini',
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0].message.content;
            if (!content) return null;

            return JSON.parse(content) as BrandAnalysis;
        } catch (error) {
            console.error('LLM Analysis failed:', error);
            return null;
        }
    }
}
