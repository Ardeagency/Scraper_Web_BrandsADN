import { SupabaseClient } from '@supabase/supabase-js';
import { BrandIdentity } from '../extractors/identity';
import { BrandAnalysis } from './llm';

export class DataMapper {
    constructor(private supabase: SupabaseClient) { }

    async saveBrandData(
        userId: string,
        url: string,
        identity: BrandIdentity,
        analysis: BrandAnalysis | null
    ) {
        if (!analysis) {
            console.warn('No analysis data to save. Only saving identity.');
        }

        // 1. Create Brand Container (Project)
        const { data: container, error: containerError } = await this.supabase
            .from('brand_containers')
            .insert({
                user_id: userId,
                nombre_marca: identity.name,
                logo_url: identity.logoUrl,
                website: url, // Assuming you might add this column or handle it
                idiomas_contenido: ['es'], // Default
                mercado_objetivo: analysis?.brandDetails.niche || ['General']
            })
            .select()
            .single();

        if (containerError) throw new Error(`Failed to create brand container: ${containerError.message}`);
        const containerId = container.id;
        console.log(`Created Brand Container: ${containerId}`);

        // 2. Save Social Links
        if (identity.socialLinks.length > 0) {
            const socialInserts = identity.socialLinks.map(link => {
                const platform = new URL(link).hostname.replace('www.', '').split('.')[0];
                return {
                    brand_container_id: containerId,
                    platform: platform,
                    url: link,
                    is_primary: false
                };
            });
            await this.supabase.from('brand_social_links').insert(socialInserts);
        }

        // 3. Create Brand Strategy (Brands table)
        if (analysis) {
            const { data: brand, error: brandError } = await this.supabase
                .from('brands')
                .insert({
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
                })
                .select()
                .single();

            if (brandError) console.error('Error saving brand strategy:', brandError);
            else {
                const brandId = brand.id;
                console.log(`Created Brand Strategy: ${brandId}`);

                // 4. Save Audiences
                if (analysis.audience.length > 0) {
                    const audienceInserts = analysis.audience.map(aud => ({
                        brand_id: brandId,
                        name: aud.name,
                        description: aud.description,
                        datos_demograficos: aud.demographics,
                        datos_psicograficos: aud.psychographics,
                        dolores: aud.painPoints,
                        deseos: aud.desires,
                        objeciones: aud.objections,
                        gatillos_compra: aud.buyingTriggers
                    }));
                    const { error: audError } = await this.supabase.from('audiences').insert(audienceInserts);
                    if (audError) console.error('Error saving audiences:', audError);
                }
            }
        }

        return containerId;
    }
}
