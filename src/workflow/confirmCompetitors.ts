import { supabase } from '../core/database';
import { CompetitorSuggestion, CompetitorConfirmationInput } from '../types/intelligence';

export interface ManualCompetitor {
    name: string;
    url: string;
}

export interface ConfirmCompetitorsPayload {
    brandContainerId: string;
    organizationId?: string | null;
    userId: string;
    approved?: CompetitorConfirmationInput[];
    manualAdds?: ManualCompetitor[];
    rejected?: CompetitorConfirmationInput[];
    skip?: boolean;
}

export interface ConfirmCompetitorsResult {
    inserted: number;
    reused: number;
    signals: number;
    skipped: boolean;
}

interface EntityRecord {
    id: string;
}

export class CompetitorConfirmationService {
    constructor(private client = supabase) {}

    async confirm(payload: ConfirmCompetitorsPayload): Promise<ConfirmCompetitorsResult> {
        if (!payload.brandContainerId) {
            throw new Error('brandContainerId is required');
        }
        if (!payload.userId) {
            throw new Error('userId is required');
        }
        if (payload.skip) {
            return { inserted: 0, reused: 0, signals: 0, skipped: true };
        }

        const approved = payload.approved || [];
        const manualAdds = payload.manualAdds || [];
        const targets = [
            ...approved.map(comp => ({ ...comp, source: comp.source || comp.detectedBy || 'auto', manual: false })),
            ...manualAdds.map(comp => ({ ...comp, source: 'manual', manual: true }))
        ];
        if (!targets.length) {
            return { inserted: 0, reused: 0, signals: 0, skipped: false };
        }

        let inserted = 0;
        let reused = 0;
        let signals = 0;

        for (const target of targets) {
            const url = this.normalizeUrl(target.url);
            if (!url) continue;
            const entityId = await this.upsertEntity(payload.brandContainerId, target.name, url, target);
            if (entityId.inserted) inserted += 1; else reused += 1;
            const signalInserted = await this.insertSignal(entityId.id, target, payload);
            if (signalInserted) signals += 1;
        }

        return { inserted, reused, signals, skipped: false };
    }

    private normalizeUrl(url?: string) {
        if (!url) return '';
        try {
            const hasProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
            const normalized = new URL(hasProtocol);
            normalized.hash = '';
            return normalized.toString();
        } catch {
            return '';
        }
    }

    private async upsertEntity(
        brandContainerId: string,
        name: string,
        url: string,
        metadata: Partial<CompetitorSuggestion> & { manual?: boolean }
    ): Promise<{ id: string; inserted: boolean }> {
        const { data: existing } = await this.client
            .from('intelligence_entities')
            .select('id')
            .eq('brand_container_id', brandContainerId)
            .eq('target_identifier', url)
            .maybeSingle<EntityRecord>();

        const entityPayload = {
            brand_container_id: brandContainerId,
            name,
            domain: 'web',
            target_identifier: url,
            metadata: {
                url,
                source: metadata.source,
                reason: metadata.reason,
                confidence: metadata.confidence ?? null,
                detectedBy: metadata.detectedBy ?? null,
                manual: metadata.manual || false
            },
            is_active: true
        };

        if (existing) {
            await this.client
                .from('intelligence_entities')
                .update({ metadata: entityPayload.metadata, name })
                .eq('id', existing.id);
            return { id: existing.id, inserted: false };
        }

        const { data, error } = await this.client
            .from('intelligence_entities')
            .insert(entityPayload)
            .select('id')
            .single<EntityRecord>();
        if (error || !data) throw new Error(error?.message || 'Failed to insert intelligence entity');
        return { id: data.id, inserted: true };
    }

    private async insertSignal(
        entityId: string,
        competitor: Partial<CompetitorSuggestion> & { manual?: boolean },
        payload: ConfirmCompetitorsPayload
    ): Promise<boolean> {
        const { error } = await this.client
            .from('intelligence_signals')
            .insert({
                entity_id: entityId,
                signal_type: 'competitor_confirmed',
                content_text: `Competidor confirmado: ${competitor.name || 'sin nombre'}`,
                ai_analysis: {
                    confidence: competitor.confidence ?? null,
                    detectedBy: competitor.detectedBy || competitor.source || (competitor.manual ? 'manual' : 'auto'),
                    manual: competitor.manual || false,
                    approvedBy: payload.userId,
                    reason: competitor.reason || null
                },
                captured_at: new Date().toISOString()
            });
        if (error) {
            console.warn('Failed to insert intelligence signal', error.message);
            return false;
        }
        return true;
    }
}
