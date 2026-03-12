export interface CompetitorSuggestion {
    name: string;
    url: string;
    source: string;
    reason?: string;
    confidence: number;
    detectedBy: 'heuristic' | 'llm';
}
