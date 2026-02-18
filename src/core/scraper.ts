import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';

export interface ScrapedPage {
    url: string;
    title: string;
    description: string;
    screenshotBuffer: Buffer;
    html: string;
    text: string;
    links: string[];
    images: { src: string; alt: string }[];
    socialLinks: string[];
}

export class ScraperEngine {
    private browser: Browser | null = null;
    private page: Page | null = null;

    async init() {
        this.browser = await chromium.launch({ headless: true });
        this.page = await this.browser.newPage();
    }

    async scrapePage(url: string): Promise<ScrapedPage> {
        if (!this.page) {
            // Auto-init if not initialized
            await this.init();
        }

        // Ensure page exists (ts check)
        if (!this.page) throw new Error('Browser not initialized');

        try {
            console.log(`Navigating to ${url}...`);
            await this.page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        } catch (e) {
            console.warn(`Initial navigation to ${url} timed out or failed, trying to continue...`);
        }

        const title = await this.page.title();
        // Take screenshot (store as buffer) - robust against failure
        let screenshotBuffer = Buffer.from('');
        try {
            const buffer = await this.page.screenshot({ fullPage: false });
            screenshotBuffer = Buffer.from(buffer);
        } catch (e) { console.warn('Failed to take screenshot', e); }

        const html = await this.page.content();

        // Use Cheerio for static extraction
        const $ = cheerio.load(html);

        // Metadata
        const description = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') || '';

        // Text content (cleaned)
        const text = $('body').text().replace(/\s+/g, ' ').trim();

        // Links (internal and external)
        const links = new Set<string>();
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                try {
                    const absoluteUrl = new URL(href, url).href;
                    links.add(absoluteUrl);
                } catch (e) {
                    // Ignore invalid URLs
                }
            }
        });

        // Images
        const images: Array<{ src: string; alt: string }> = [];
        $('img').each((_, el) => {
            const src = $(el).attr('src');
            const alt = $(el).attr('alt') || '';
            if (src) {
                try {
                    const absoluteSrc = new URL(src, url).href;
                    images.push({ src: absoluteSrc, alt });
                } catch (e) { }
            }
        });

        // Social Links (heuristic)
        const socialDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com'];
        const socialLinks = Array.from(links).filter(link => {
            return socialDomains.some(domain => link.includes(domain));
        });

        return {
            url,
            title,
            description,
            screenshotBuffer,
            html,
            text,
            links: Array.from(links),
            images,
            socialLinks
        };
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}
