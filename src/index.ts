import { ScraperEngine } from './core/scraper';
import { IdentityExtractor, BrandIdentity } from './extractors/identity';
import { LLMService, BrandAnalysis } from './core/llm';
import { DataMapper } from './core/mapper';
import { supabase } from './core/database';
import { OrganizationService } from './core/organization';
import { CompetitionDetector } from './core/competition';
import { ScraperResponse, OnboardingStatus } from './types/onboarding';
import { CompetitorSuggestion } from './types/intelligence';

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
    const competitionDetector = new CompetitionDetector(llmService);

    const collectorErrors: string[] = [];
    let organizationId: string | null = null;
    let containerId: string | null = null;
    let identity: BrandIdentity | null = null;
    let analysis: BrandAnalysis | null = null;
    let competitors: CompetitorSuggestion[] = [];

    try {
        await scraper.init();
        const result = await scraper.scrapePage(url);
        console.log(`Successfully scraped: ${result.title}`);

        // Extract Identity
        const identityExtractor = new IdentityExtractor();
        identity = identityExtractor.extract(result);

        console.log('\n--- Brand Identity ---');
        console.log('Name:', identity.name);
        console.log('Logo:', identity.logoUrl);

        competitors = await competitionDetector.suggestCompetitors(result, identity);

        console.log('\n--- Competitor Candidates (beta) ---');
        if (competitors.length) {
            competitors.slice(0, 6).forEach((comp, idx) => {
                console.log(`${idx + 1}. ${comp.name} -> ${comp.url} (${(comp.confidence * 100).toFixed(0)}% via ${comp.detectedBy})`);
            });
        } else {
            console.log('No competitor suggestions yet.');
        }

        // LLM Analysis
        console.log('\n--- AI Analysis ---');
        analysis = await llmService.analyzeBrand(result);

        if (analysis) {
            console.log('Archetype:', analysis.brandDetails.personalityArchetype);
            console.log('Audiences Identified:', analysis.audience.length);
        } else {
            console.log('AI Analysis skipped or failed (check API Key)');
        }

        // Save to DB
        console.log('\n--- Saving to Database ---');
        try {
            const ensured = await orgService.ensureOrganization(userId, organizationName, plan);
            organizationId = ensured.organizationId;
            containerId = await mapper.saveBrandData(organizationId, userId, url, identity, analysis);
            console.log(`Successfully saved data! Container ID: ${containerId}`);
        } catch (e: any) {
            const message = e?.message || 'Unknown error';
            collectorErrors.push(message);
            console.error('Failed to save to DB:', message);
        }

        const status: OnboardingStatus = collectorErrors.length
            ? 'error'
            : (competitors.length ? 'needs_confirmation' : 'saved_without_competitors');

        const response: ScraperResponse = {
            status,
            organization: {
                name: identity.name,
                website: url,
                plan,
                identity,
                analysis,
                organizationId,
                brandContainerId: containerId
            },
            competitors,
            errors: collectorErrors.length ? collectorErrors : undefined,
            meta: {
                source: 'cli',
                userId,
                scrapedAt: new Date().toISOString(),
                scrapedUrl: url,
                environment: plan
            }
        };

        console.log('\n--- Scraper JSON Response ---');
        console.log(JSON.stringify(response, null, 2));

    } catch (error) {
        console.error('Error during execution:', error);
        const fallback: ScraperResponse = {
            status: 'error',
            organization: {
                name: organizationName,
                website: url,
                plan,
                identity: identity || {
                    name: organizationName,
                    logoUrl: undefined,
                    socialLinks: [],
                    colors: [],
                    variants: []
                }
            },
            competitors: [],
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            meta: {
                source: 'cli',
                userId,
                scrapedAt: new Date().toISOString(),
                scrapedUrl: url,
                environment: plan
            }
        };
        console.log('\n--- Scraper JSON Response ---');
        console.log(JSON.stringify(fallback, null, 2));
    } finally {
        await scraper.close();
    }
}

main();
