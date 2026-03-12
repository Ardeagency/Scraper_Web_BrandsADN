import { BrandIdentity } from '../extractors/identity';
import { BrandAnalysis } from '../core/llm';
import { CompetitorSuggestion } from './intelligence';

export type OnboardingStatus = 'needs_confirmation' | 'saved_without_competitors' | 'error';

export interface ScraperResponse {
    status: OnboardingStatus;
    organization: {
        name: string;
        website: string;
        plan: string;
        identity: BrandIdentity;
        analysis?: BrandAnalysis | null;
        organizationId?: string | null;
        brandContainerId?: string | null;
    };
    competitors: CompetitorSuggestion[];
    errors?: string[];
    meta: {
        source: string;
        userId: string;
        scrapedAt: string;
        scrapedUrl: string;
        environment: string;
    };
}
