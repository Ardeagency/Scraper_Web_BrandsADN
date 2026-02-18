# Automated Brand Scraper

This system automates the extraction of brand identity and strategy from a given website URL.

## Features
- **Scraping**: Uses Playwright to render pages and Cheerio to extract metadata, links, and images.
- **Identity Extraction**: Heuristics to find Brand Name, Logo, and Social Media links.
- **AI Analysis**: Uses OpenAI (GPT-4) to analyze page text and determine Brand Archetype, Tone of Voice, Audience segments, and more.
- **Database Integration**: Saves all extracted data into Supabase, populating `brand_containers`, `brands`, `audiences`, and `brand_social_links`.

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

Run the scraper with a URL and an optional User ID (required for DB insertion):

```bash
npm start -- <url> <user_id>
```

Example:
```bash
npm start -- https://www.ostercolombia.com/ "user-uuid-here"
```

## Project Structure
- `src/core/scraper.ts`: Manages browser automation.
- `src/core/llm.ts`: Handles communication with OpenAI.
- `src/core/mapper.ts`: Maps data to Supabase schema.
- `src/extractors/`: Specific logic for extracting identity elements.
