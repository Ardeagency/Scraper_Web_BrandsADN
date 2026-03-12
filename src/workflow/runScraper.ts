import { ScraperEngine } from '../core/scraper';
import { IdentityExtractor, BrandIdentity } from '../extractors/identity';
import { LLMService, BrandAnalysis } from '../core/llm';
import { DataMapper } from '../core/mapper';
import { supabase } from '../core/database';
import { OrganizationService } from '../core/organization';
import { CompetitionDetector } from '../core/competition';
import { ScraperResponse, OnboardingStatus } from '../types/onboarding';
import { CompetitorSuggestion } from '../types/intelligence';

export interface RunScraperParams {
    url: string;
    userId: string;
    organizationName: string;
    plan?: string;
    environment?: string;
    organizationInput?: Record<string, any> | null;
    logger?: (message: string) => void;
}

const noop = () => {};

export async function runScraper(params: RunScraperParams): Promise<ScraperResponse> {
    const {
        url,
        userId,
        organizationName,
        plan = 'starter',
        environment = plan,
        logger = noop
    } = params;

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
        logger(`Initializing scraper for ${url}`);
        await scraper.init();
        const result = await scraper.scrapePage(url);
        logger(`Successfully scraped: ${result.title}`);

        const identityExtractor = new IdentityExtractor();
        identity = identityExtractor.extract(result);
        logger(`Brand identity extracted for ${identity.name}`);

        competitors = await competitionDetector.suggestCompetitors(result, identity);
        logger(`Found ${competitors.length} competitor candidates`);

        analysis = await llmService.analyzeBrand(result);
        if (analysis) {
            logger(`LLM analysis succeeded with ${analysis.audience.length} audiences`);
        } else {
            logger('LLM analysis skipped or failed (check API key)');
        }

        try {
            const ensured = await orgService.ensureOrganization(userId, organizationName, plan);
            organizationId = ensured.organizationId;
            containerId = await mapper.saveBrandData(organizationId, userId, url, identity, analysis);
            logger(`Saved Supabase data (container ${containerId})`);
        } catch (e: any) {
            const message = e?.message || 'Unknown error saving brand data';
            collectorErrors.push(message);
            logger(`Failed to save to DB: ${message}`);
        }

        const status: OnboardingStatus = collectorErrors.length
            ? 'error'
            : (competitors.length ? 'needs_confirmation' : 'saved_without_competitors');

        return {
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
                source: 'scraper-service',
                userId,
                scrapedAt: new Date().toISOString(),
                scrapedUrl: url,
                environment,
                inputSnapshot: params.organizationInput || null
            }
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger(`Fatal scraping error: ${message}`);
        return {
            status: 'error',
            organization: {
                name: identity?.name || organizationName,
                website: url,
                plan,
                identity: identity || {
                    name: organizationName,
                    logoUrl: undefined,
                    socialLinks: [],
                    colors: [],
                    variants: []
                },
                analysis,
                organizationId,
                brandContainerId: containerId
            },
            competitors,
            errors: [message],
            meta: {
                source: 'scraper-service',
                userId,
                scrapedAt: new Date().toISOString(),
                scrapedUrl: url,
                environment,
                inputSnapshot: params.organizationInput || null
            }
        };
    } finally {
        await scraper.close();
    }
}
