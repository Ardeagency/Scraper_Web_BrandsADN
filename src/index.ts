import { ScraperEngine } from './core/scraper';
import { IdentityExtractor } from './extractors/identity';
import { LLMService } from './core/llm';
import { DataMapper } from './core/mapper';
import { supabase } from './core/database';

async function main() {
    const url = process.argv[2];
    const userId = process.argv[3]; // Allow passing userId as 2nd arg

    if (!url) {
        console.error('Please provide a URL to scrape');
        console.error('Usage: npm start -- <url> [user_id]');
        process.exit(1);
    }

    console.log(`Starting scraper for: ${url}`);
    if (!userId) {
        console.warn('No user_id provided. DB insertion might fail if foreign keys are enforced.');
    }

    const scraper = new ScraperEngine();
    const llmService = new LLMService();
    const mapper = new DataMapper(supabase);

    try {
        await scraper.init();
        const result = await scraper.scrapePage(url);
        console.log(`Successfully scraped: ${result.title}`);

        // Extract Identity
        const identityExtractor = new IdentityExtractor();
        const identity = identityExtractor.extract(result);

        console.log('\n--- Brand Identity ---');
        console.log('Name:', identity.name);
        console.log('Logo:', identity.logoUrl);

        // LLM Analysis
        console.log('\n--- AI Analysis ---');
        const analysis = await llmService.analyzeBrand(result);

        if (analysis) {
            console.log('Archetype:', analysis.brandDetails.personalityArchetype);
            console.log('Audiences Identified:', analysis.audience.length);
        } else {
            console.log('AI Analysis skipped or failed (check API Key)');
        }

        // Save to DB
        console.log('\n--- Saving to Database ---');
        try {
            if (!userId) {
                console.log('Skipping DB insertion because no user_id was provided.');
            } else {
                const containerId = await mapper.saveBrandData(userId, url, identity, analysis);
                console.log(`Successfully saved data! Container ID: ${containerId}`);
            }
        } catch (e: any) {
            console.error('Failed to save to DB:', e.message);
        }

    } catch (error) {
        console.error('Error during execution:', error);
    } finally {
        await scraper.close();
    }
}

main();
