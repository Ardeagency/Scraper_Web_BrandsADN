import { SupabaseClient } from '@supabase/supabase-js';

export interface OrganizationResult {
    organizationId: string;
}

export class OrganizationService {
    constructor(private supabase: SupabaseClient) { }

    async ensureOrganization(userId: string, orgName: string, plan: string): Promise<OrganizationResult> {
        if (!userId) throw new Error('userId is required to create an organization');
        if (!orgName) throw new Error('Organization name is required');

        // Try to find existing org by owner + name (case insensitive)
        const { data: existing, error } = await this.supabase
            .from('organizations')
            .select('id')
            .eq('owner_user_id', userId)
            .ilike('name', orgName)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Failed to query organization: ${error.message}`);
        }

        if (existing?.id) {
            await this.ensureMembership(userId, existing.id);
            return { organizationId: existing.id };
        }

        const { data: inserted, error: insertError } = await this.supabase
            .from('organizations')
            .insert({
                owner_user_id: userId,
                name: orgName
            })
            .select('id')
            .single();

        if (insertError || !inserted) {
            throw new Error(`Failed to create organization: ${insertError?.message}`);
        }

        await this.ensureMembership(userId, inserted.id);
        await this.ensureSubscription(inserted.id, plan);

        return { organizationId: inserted.id };
    }

    private async ensureMembership(userId: string, organizationId: string) {
        // Upsert membership as admin
        await this.supabase
            .from('organization_members')
            .upsert({
                organization_id: organizationId,
                user_id: userId,
                role: 'admin'
            }, { onConflict: 'organization_id,user_id' });
    }

    private async ensureSubscription(organizationId: string, plan: string) {
        if (!plan) return;
        try {
            await this.supabase
                .from('subscriptions')
                .insert({
                    organization_id: organizationId,
                    plan_type: plan,
                    status: 'active',
                    credits_included: plan === 'enterprise' ? 1000 : plan === 'pro' ? 300 : 100,
                    price: 0,
                    currency: 'USD'
                });
        } catch (error) {
            console.warn('Failed to create subscription (maybe table or enum differs):', (error as any)?.message);
        }
    }
}
