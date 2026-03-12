import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import dotenv from 'dotenv';
import { runScraper } from './workflow/runScraper';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '2mb' }));
app.use(cors());

const scrapeSchema = z.object({
    url: z.string().url(),
    userId: z.string().min(1),
    organizationName: z.string().min(1),
    plan: z.string().optional(),
    environment: z.string().optional(),
    organizationInput: z.record(z.string(), z.any()).optional()
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/scrape', async (req, res) => {
    const parsed = scrapeSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: 'invalid_payload',
            details: parsed.error.flatten()
        });
    }

    try {
        const response = await runScraper({
            url: parsed.data.url,
            userId: parsed.data.userId,
            organizationName: parsed.data.organizationName,
            plan: parsed.data.plan,
            environment: parsed.data.environment,
            organizationInput: parsed.data.organizationInput,
            logger: (msg) => console.log(`[api] ${msg}`)
        });
        res.json(response);
    } catch (error) {
        console.error('Server scrape error:', error);
        res.status(500).json({ error: 'internal_error' });
    }
});

app.listen(PORT, () => {
    console.log(`Scraper server listening on port ${PORT}`);
});
