import { ScrapedPage } from '../core/scraper';

export interface BrandVariant {
    name: string;
    locale?: string;
    host?: string;
}

export interface BrandIdentity {
    name: string;
    logoUrl?: string;
    socialLinks: string[];
    colors?: string[]; // Todo: Extract from CSS
    variants: BrandVariant[];
}

export class IdentityExtractor {
    extract(page: ScrapedPage): BrandIdentity {
        // 1. Guess Brand Name (from title or heuristics)
        // Simply use the domain name or title for now
        let name = page.title.split('|')[0].trim();
        if (name.length > 50) name = new URL(page.url).hostname.replace('www.', '').split('.')[0];

        // 2. Find Logo
        // Search for images with 'logo' in src or alt, or first image in header
        const logoCandidate = page.images.find(img =>
            img.src.toLowerCase().includes('logo') ||
            img.alt.toLowerCase().includes('logo')
        );

        const variants: BrandVariant[] = [];
        const host = new URL(page.url).hostname.replace('www.', '');
        const localeCandidate = host.split('.').slice(-1)[0];
        const locale = localeCandidate && localeCandidate.length <= 4 ? localeCandidate : undefined;

        variants.push({
            name,
            locale,
            host
        });

        return {
            name,
            logoUrl: logoCandidate?.src,
            socialLinks: page.socialLinks,
            colors: [],
            variants
        };
    }
}
