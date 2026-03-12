import OpenAI from 'openai';
import dotenv from 'dotenv';
import { ScrapedPage } from './scraper';
import { BrandIdentity } from '../extractors/identity';
import { CompetitorSuggestion } from '../types/intelligence';

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
    isAvailable() {
        return !!openai;
    }

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

    async rankCompetitors(page: ScrapedPage, identity: BrandIdentity, candidates: CompetitorSuggestion[]): Promise<CompetitorSuggestion[]> {
        if (!openai || !candidates.length) return [];

        const summary = candidates
            .slice(0, 12)
            .map((c, idx) => `${idx + 1}. ${c.name} - ${c.url} (confidence ${(c.confidence ?? 0).toFixed(2)})`)
            .join('\n');
        const truncatedText = page.text.substring(0, 6000);

        const prompt = [
            `Analiza la marca "${identity.name}" y decide cuáles de las siguientes empresas parecen ser competidores directos.`,
            '',
            'Contenido del sitio (truncado):',
            truncatedText,
            '',
            'Candidatos propuestos:',
            summary,
            '',
            'Devuelve un JSON array con máximo 6 objetos con esta forma: [{ "name": "Competidor", "url": "https://competidor.com", "confidence": 0.0-1.0, "reason": "breve explicación" }]',
            'Solo incluye marcas reales del mismo mercado y no repitas la marca principal.'
        ].join('\n');

        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'gpt-4o-mini',
                response_format: { type: 'json_object' }
            });
            const content = completion.choices[0].message.content;
            if (!content) return [];
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed) ? parsed : parsed.results || parsed.suggestions || parsed.data || [];
            if (!Array.isArray(items)) return [];
            return items
                .map((item: any): CompetitorSuggestion | null => {
                    if (!item?.name || !item?.url) return null;
                    const confidence = Number(item.confidence ?? 0.7);
                    return {
                        name: String(item.name),
                        url: String(item.url),
                        source: 'llm',
                        reason: item.reason || item.explanation || 'Identificado por LLM',
                        confidence: Math.min(1, Math.max(0, isNaN(confidence) ? 0.7 : confidence)),
                        detectedBy: 'llm'
                    };
                })
                .filter((item): item is CompetitorSuggestion => Boolean(item));
        } catch (error) {
            console.error('LLM competitor ranking failed:', error);
            return [];
        }
    }


}
