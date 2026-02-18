import { ScrapedPage } from '../core/scraper';

export interface BrandIdentity {
    name: string;
    logoUrl?: string;
    socialLinks: string[];
    colors?: string[]; // Todo: Extract from CSS
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

        return {
            name,
            logoUrl: logoCandidate?.src,
            socialLinks: page.socialLinks,
            colors: []
        };
    }
}
