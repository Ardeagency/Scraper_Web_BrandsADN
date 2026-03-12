import { BrandIdentity } from '../extractors/identity';
import { ScrapedPage } from './scraper';
import { LLMService } from './llm';
import { CompetitorSuggestion } from '../types/intelligence';

const SOCIAL_DOMAINS = new Set([
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
    'youtube.com', 'tiktok.com', 'pinterest.com', 'whatsapp.com', 'telegram.org'
]);

interface DomainHit {
    domain: string;
    url: string;
    anchorSamples: string[];
    hits: number;
}

export class CompetitionDetector {
    constructor(private llmService?: LLMService) {}

    async suggestCompetitors(page: ScrapedPage, identity: BrandIdentity): Promise<CompetitorSuggestion[]> {
        const heuristic = this.extractHeuristicCandidates(page);
        if (!heuristic.length) return [];

        if (!this.llmService || !this.llmService.isAvailable()) {
            return heuristic.slice(0, 6);
        }

        try {
            const llmRanked = await this.llmService.rankCompetitors(page, identity, heuristic);
            if (llmRanked.length) {
                return llmRanked;
            }
        } catch (err) {
            console.warn('LLM competitor ranking failed, using heuristics:', err);
        }

        return heuristic.slice(0, 6);
    }

    private extractHeuristicCandidates(page: ScrapedPage): CompetitorSuggestion[] {
        const rootDomain = this.getDomain(page.url);
        const domainMap = new Map<string, DomainHit>();

        for (const { url, text } of page.linkDetails || []) {
            const domain = this.getDomain(url);
            if (!domain || domain === rootDomain) continue;
            if (SOCIAL_DOMAINS.has(domain)) continue;
            if (rootDomain && domain.endsWith(rootDomain)) continue;

            const existing = domainMap.get(domain) || { domain, url, anchorSamples: [], hits: 0 };
            existing.hits += 1;
            if (text) {
                if (!existing.anchorSamples.includes(text) && existing.anchorSamples.length < 3) {
                    existing.anchorSamples.push(text);
                }
            }
            existing.url = existing.url || url;
            domainMap.set(domain, existing);
        }

        const suggestions: CompetitorSuggestion[] = Array.from(domainMap.values())
            .sort((a, b) => b.hits - a.hits)
            .slice(0, 12)
            .map(hit => ({
                name: this.formatNameFromDomain(hit.domain),
                url: hit.url,
                source: 'homepage-link',
                reason: hit.anchorSamples.length ? `Enlace detectado (${hit.anchorSamples.join(', ')})` : 'Enlace externo detectado en la home',
                confidence: Math.min(0.6, 0.25 + hit.hits * 0.05),
                detectedBy: 'heuristic' as const
            }));

        return suggestions;
    }

    private getDomain(url: string): string | null {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return host.replace(/^www\./, '');
        } catch {
            return null;
        }
    }

    private formatNameFromDomain(domain: string): string {
        const base = domain.split('.')[0];
        if (!base) return domain;
        return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }
}
