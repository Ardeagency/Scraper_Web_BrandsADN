# Automated Brand Scraper

This system automates the extraction of brand identity and strategy from a given website URL.

## Features
- **Scraping**: Uses Playwright to render pages and Cheerio to extract metadata, links, and images.
- **Identity Extraction**: Heuristics to find Brand Name, Logo, and Social Media links.
- **AI Analysis**: Uses OpenAI (GPT-4) to analyze page text and determine Brand Archetype, Tone of Voice, Audience segments, and more.
- **Competitor Radar**: Detects competitor candidates via heuristics + LLM re-ranking, returning a structured list for human confirmation.
- **Database Integration**: Saves all extracted data into Supabase, populating `brand_containers`, `brands`, `audiences`, and `brand_social_links`.
- **JSON Output**: Every run produces a `ScraperResponse` payload (status + organization + competitors) ready for webhook consumption.

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Variables**
    Copy `.env.example` to `.env` and fill in your credentials:
    ```env
    SUPABASE_URL=your_supabase_url
    SUPABASE_KEY=your_supabase_key
    OPENAI_API_KEY=your_openai_key
    ```

3.  **Build**
    ```bash
    npm run build
    ```

## Usage

Run the scraper with a URL, user ID, organization name and optional plan:

```bash
npm start -- <url> <user_id> <organization_name> [plan]
```

Example:
```bash
npm start -- https://www.ostercolombia.com/ "user-uuid-here" "Oster LATAM" pro
```

## Project Structure
- `src/core/scraper.ts`: Manages browser automation.
- `src/core/llm.ts`: Handles communication with OpenAI.
- `src/core/mapper.ts`: Maps data to Supabase schema.
- `src/extractors/`: Specific logic for extracting identity elements.

After each run the CLI prints a JSON block like:

```json
{
  "status": "needs_confirmation",
  "organization": {
    "name": "Oster",
    "website": "https://www.ostercolombia.com/",
    "plan": "pro",
    "brandContainerId": "..."
  },
  "competitors": [
    { "name": "Black+Decker", "url": "https://www.blackanddeckerappliances.com/", "confidence": 0.58 }
  ],
  "meta": { "source": "cli", "scrapedAt": "2026-03-10T22:40:00Z" }
}
```

The frontend/webhook can parse this block to show the "¿Esta es tu competencia?" step before triggering deeper scraping.

