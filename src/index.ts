import { runScraper } from './workflow/runScraper';

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

    const response = await runScraper({
        url,
        userId,
        organizationName,
        plan,
        environment: plan,
        logger: (message) => console.log(message)
    });

    console.log('\n--- Scraper JSON Response ---');
    console.log(JSON.stringify(response, null, 2));
}

main().catch(error => {
    console.error('Fatal error running scraper:', error);
    process.exit(1);
});
