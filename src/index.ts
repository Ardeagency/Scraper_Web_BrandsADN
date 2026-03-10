import { ScraperEngine } from './core/scraper';
import { IdentityExtractor } from './extractors/identity';
import { LLMService } from './core/llm';
import { DataMapper } from './core/mapper';
import { supabase } from './core/database';
import { OrganizationService } from './core/organization';

async function main() {
    const url = process.argv[2];
    const userId = process.argv[3];
    const organizationName = process.argv[4];
    const plan = process.argv[5] || 'starter';

    if (!url || !userId || !organizationName) {
        console.error('Usage: npm start -- <url> <user_id> <organization_name> [plan]');
        process.exit(1);
    }

    console.log(`Starting scraper for: ${url}`);
    console.log(`Organization: ${organizationName} (plan: ${plan})`);

    const scraper = new ScraperEngine();
    const llmService = new LLMService();
    const mapper = new DataMapper(supabase);
    const orgService = new OrganizationService(supabase);

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
            const { organizationId } = await orgService.ensureOrganization(userId, organizationName, plan);
            const containerId = await mapper.saveBrandData(organizationId, userId, url, identity, analysis);
            console.log(`Successfully saved data! Container ID: ${containerId}`);
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
