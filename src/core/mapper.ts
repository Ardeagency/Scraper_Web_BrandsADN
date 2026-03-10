import { SupabaseClient } from '@supabase/supabase-js';
import { BrandIdentity } from '../extractors/identity';
import { BrandAnalysis } from './llm';

export class DataMapper {
    constructor(private supabase: SupabaseClient) { }

    async saveBrandData(
        organizationId: string,
        userId: string,
        url: string,
        identity: BrandIdentity,
        analysis: BrandAnalysis | null
    ) {
        if (!organizationId) throw new Error('organizationId is required for saving brand data');

        const variants = identity.variants?.length ? identity.variants : [{ name: identity.name }];
        let lastContainerId = '';

        for (const variant of variants) {
            const containerId = await this.upsertBrandContainer({ organizationId, userId, url, identity, variant, analysis });
            lastContainerId = containerId;
        }

        return lastContainerId;
    }

    private async upsertBrandContainer({ organizationId, userId, url, identity, variant, analysis }: { organizationId: string; userId: string; url: string; identity: BrandIdentity; variant: { name: string; locale?: string; host?: string }; analysis: BrandAnalysis | null; }): Promise<string> {
        const website = url.split('?')[0];
        const { data: existing, error } = await this.supabase
            .from('brand_containers')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('website', website)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Failed querying brand container: ${error.message}`);
        }

        let containerId = existing?.id;

        if (!containerId) {
            const insertPayload: any = {
                organization_id: organizationId,
                user_id: userId,
                nombre_marca: variant.name,
                logo_url: identity.logoUrl,
                website,
                idiomas_contenido: ['es'],
                mercado_objetivo: analysis?.brandDetails.niche || ['General']
            };
            const { data: inserted, error: insertError } = await this.supabase
                .from('brand_containers')
                .insert(insertPayload)
                .select('id')
                .single();

            if (insertError || !inserted) {
                throw new Error(`Failed to create brand container: ${insertError?.message}`);
            }
            containerId = inserted.id;
            console.log(`Created Brand Container: ${containerId}`);
        } else {
            await this.supabase
                .from('brand_containers')
                .update({ nombre_marca: variant.name, logo_url: identity.logoUrl })
                .eq('id', containerId);
        }

        await this.saveSocialLinks(containerId, identity.socialLinks);
        await this.upsertBrandStrategy(containerId, analysis);

        return containerId;
    }

    private async saveSocialLinks(containerId: string, links: string[]) {
        if (!links || links.length === 0) return;
        const { data: existing } = await this.supabase
            .from('brand_social_links')
            .select('url')
            .eq('brand_container_id', containerId);
        const existingSet = new Set((existing || []).map((l: any) => l.url));
        const inserts = links
            .filter(link => {
                try {
                    new URL(link);
                    return !existingSet.has(link);
                } catch {
                    return false;
                }
            })
            .map(link => ({
                brand_container_id: containerId,
                platform: new URL(link).hostname.replace('www.', '').split('.')[0],
                url: link,
                is_primary: false
            }));
        if (inserts.length > 0) {
            await this.supabase.from('brand_social_links').insert(inserts);
        }
    }

    private async upsertBrandStrategy(containerId: string, analysis: BrandAnalysis | null) {
        if (!analysis) return;
        const { data: existing, error } = await this.supabase
            .from('brands')
            .select('id')
            .eq('project_id', containerId)
            .maybeSingle();
        if (error && error.code !== 'PGRST116') {
            console.error('Error checking existing brand strategy:', error.message);
            return;
        }
        const payload = {
            project_id: containerId,
            nicho_mercado: analysis.brandDetails.niche,
            arquetipo_personalidad: analysis.brandDetails.personalityArchetype,
            enfoque_marca: analysis.brandDetails.brandFocus,
            estilo_visual: analysis.brandDetails.visualStyle,
            estilo_publicidad: analysis.brandDetails.advertisingStyle,
            tono_comunicacion: analysis.brandDetails.tone,
            estilo_escritura: analysis.brandDetails.writingStyle,
            palabras_clave: analysis.brandDetails.keywords,
            palabras_prohibidas: analysis.brandDetails.prohibitedWords,
            objetivos_marca: analysis.brandDetails.objectives
        };
        let brandId = existing?.id;
        if (!brandId) {
            const { data: inserted, error: insertError } = await this.supabase
                .from('brands')
                .insert(payload)
                .select('id')
                .single();
            if (insertError || !inserted) {
                console.error('Error saving brand strategy:', insertError?.message);
                return;
            }
            brandId = inserted.id;
            console.log(`Created Brand Strategy: ${brandId}`);
        } else {
            await this.supabase
                .from('brands')
                .update(payload)
                .eq('id', brandId);
        }

        await this.upsertAudiences(brandId!, analysis.audience);
    }

    private async upsertAudiences(brandId: string, audiences: BrandAnalysis['audience']) {
        if (!audiences || audiences.length === 0) return;
        for (const aud of audiences) {
            const { data: existing, error } = await this.supabase
                .from('audiences')
                .select('id')
                .eq('brand_id', brandId)
                .ilike('name', aud.name)
                .maybeSingle();
            if (error && error.code !== 'PGRST116') {
                console.error('Error checking audience:', error.message);
                continue;
            }
            const payload = {
                brand_id: brandId,
                name: aud.name,
                description: aud.description,
                datos_demograficos: aud.demographics,
                datos_psicograficos: aud.psychographics,
                dolores: aud.painPoints,
                deseos: aud.desires,
                objeciones: aud.objections,
                gatillos_compra: aud.buyingTriggers
            };
            if (existing?.id) {
                await this.supabase
                    .from('audiences')
                    .update(payload)
                    .eq('id', existing.id);
            } else {
                await this.supabase.from('audiences').insert(payload);
            }
        }
    }
}
