import fs from 'fs';
import path from 'path';

interface DomainState {
    lastCrawledAt: string;
    pages: string[];
}

interface StateFile {
    [domain: string]: DomainState;
}

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const STATE_PATH = path.join(CACHE_DIR, 'crawler-state.json');

export class CrawlerStateStore {
    private state: StateFile = {};

    constructor() {
        try {
            if (fs.existsSync(STATE_PATH)) {
                const raw = fs.readFileSync(STATE_PATH, 'utf-8');
                this.state = JSON.parse(raw);
            }
        } catch (error) {
            console.warn('Crawler state load failed, starting fresh', error);
            this.state = {};
        }
    }

    getVisited(domain: string): string[] {
        return this.state[domain]?.pages || [];
    }

    update(domain: string, pages: string[]) {
        this.state[domain] = {
            lastCrawledAt: new Date().toISOString(),
            pages: Array.from(new Set(pages))
        };
        this.flush();
    }

    private flush() {
        try {
            if (!fs.existsSync(CACHE_DIR)) {
                fs.mkdirSync(CACHE_DIR, { recursive: true });
            }
            fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.warn('Failed to persist crawler state', error);
        }
    }
}
