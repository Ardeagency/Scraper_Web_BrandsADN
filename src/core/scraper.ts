import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { CrawlerStateStore } from './crawlerState';

export interface ScrapedPage {
    url: string;
    title: string;
    description: string;
    screenshotBuffer: Buffer;
    html: string;
    text: string;
    links: string[];
    linkDetails: { url: string; text: string }[];
    images: { src: string; alt: string }[];
    socialLinks: string[];
}

export interface CrawlSummary {
    url: string;
    title: string;
    type: 'about' | 'blog' | 'news' | 'product' | 'other';
}

export class ScraperEngine {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private crawlerState = new CrawlerStateStore();

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
        const linkDetails: Array<{ url: string; text: string }> = [];
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            const textContent = $(el).text().replace(/\s+/g, ' ').trim();
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                try {
                    const absoluteUrl = new URL(href, url).href;
                    links.add(absoluteUrl);
                    linkDetails.push({ url: absoluteUrl, text: textContent });
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
            linkDetails,
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

    async crawlSite(baseUrl: string, options: { maxPages?: number; maxDepth?: number } = {}): Promise<{ pages: CrawlSummary[]; newPages: CrawlSummary[] }> {
        if (!this.browser) {
            await this.init();
        }
        if (!this.browser) throw new Error('Browser not initialized');

        const maxPages = options.maxPages ?? 20;
        const maxDepth = options.maxDepth ?? 2;
        const origin = new URL(baseUrl);
        const domain = origin.hostname.replace(/^www\./, '');
        const visited = new Set<string>(this.crawlerState.getVisited(domain));
        const summary: CrawlSummary[] = [];
        const queue: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }];

        while (queue.length && summary.length < maxPages) {
            const { url, depth } = queue.shift()!;
            if (visited.has(url) || depth > maxDepth) continue;
            visited.add(url);
            try {
                const page = await this.browser!.newPage();
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
                const title = await page.title();
                const html = await page.content();
                const $ = cheerio.load(html);
                summary.push({ url, title, type: this.classifyPage(url, title, $.text()) });
                if (depth < maxDepth) {
                    $('a').each((_, el) => {
                        const href = $(el).attr('href');
                        if (!href) return;
                        try {
                            const absolute = new URL(href, url);
                            if (absolute.hostname.replace(/^www\./, '') !== domain) return;
                            const normalized = absolute.toString().split('#')[0];
                            if (!visited.has(normalized)) {
                                queue.push({ url: normalized, depth: depth + 1 });
                            }
                        } catch { }
                    });
                }
                await page.close();
            } catch (error) {
                console.warn('crawl failed for', url, error);
            }
        }

        const prev = new Set(this.crawlerState.getVisited(domain));
        this.crawlerState.update(domain, Array.from(visited));
        const newPages = summary.filter(page => !prev.has(page.url));
        return { pages: summary, newPages };
    }

    private classifyPage(url: string, title: string, text: string): CrawlSummary['type'] {
        const haystack = `${url} ${title}`.toLowerCase();
        if (haystack.includes('about') || haystack.includes('quienes-somos') || haystack.includes('historia')) return 'about';
        if (haystack.includes('blog') || haystack.includes('article') || /blog/i.test(title)) return 'blog';
        if (haystack.includes('news') || haystack.includes('press') || /noticias/i.test(title) || text.toLowerCase().includes('press release')) return 'news';
        if (haystack.includes('product') || haystack.includes('tienda') || haystack.includes('shop')) return 'product';
        return 'other';
    }

}