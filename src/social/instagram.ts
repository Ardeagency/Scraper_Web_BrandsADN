import { chromium, Browser } from 'playwright';
import { supabase } from '../core/database';

export interface InstagramPostInsight {
    id: string;
    shortcode: string;
    caption: string;
    commentCount: number;
    likeCount: number;
    takenAt: string;
    displayUrl: string;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL';
}

export interface InstagramProfileInsight {
    username: string;
    fullName: string;
    biography: string;
    followerCount: number;
    followingCount: number;
    postCount: number;
    profilePicUrl: string;
    profileUrl: string;
    posts: InstagramPostInsight[];
    fetchedAt: string;
}

interface GraphQLUser {
    biography: string;
    full_name: string;
    username: string;
    profile_pic_url_hd: string;
    profile_pic_url: string;
    edge_followed_by: { count: number };
    edge_follow: { count: number };
    edge_owner_to_timeline_media: {
        count: number;
        edges: Array<{ node: any }>;
    };
}

export class InstagramCollector {
    private browser: Browser | null = null;

    async init() {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async fetchProfile(username: string): Promise<InstagramProfileInsight> {
        if (!username) throw new Error('username is required');
        await this.init();
        if (!this.browser) throw new Error('browser not initialized');

        const url = `https://www.instagram.com/${username.replace(/^@/, '')}/`;
        const page = await this.browser.newPage({ userAgent: this.randomUserAgent() });
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);
            const scriptContent = await page.evaluate(() => {
                const scripts = Array.from(document.scripts);
                const target = scripts.find(s => s.textContent && s.textContent.includes('window.__additionalDataLoaded'));
                return target?.textContent || null;
            });
            if (!scriptContent) {
                throw new Error('Could not locate profile data script');
            }
            const data = this.parseAdditionalData(scriptContent);
            const user: GraphQLUser | undefined = data?.graphql?.user;
            if (!user) throw new Error('Unable to parse instagram profile data');

            return {
                username: user.username,
                fullName: user.full_name,
                biography: user.biography,
                followerCount: user.edge_followed_by?.count || 0,
                followingCount: user.edge_follow?.count || 0,
                postCount: user.edge_owner_to_timeline_media?.count || 0,
                profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url,
                profileUrl: url,
                posts: (user.edge_owner_to_timeline_media?.edges || []).slice(0, 12).map(edge => this.mapPost(edge.node)),
                fetchedAt: new Date().toISOString()
            };
        } finally {
            await page.close();
        }
    }

    private parseAdditionalData(script: string): any {
        const match = script.match(/window\.__additionalDataLoaded\([^,]+,(\{.*\})\);/s);
        if (!match) {
            throw new Error('Failed to extract JSON payload from instagram script');
        }
        return JSON.parse(match[1]);
    }

    private mapPost(node: any): InstagramPostInsight {
        const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        const likeCount = node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0;
        const commentCount = node.edge_media_to_comment?.count || 0;
        const takenAt = node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : '';
        let mediaType: InstagramPostInsight['mediaType'] = 'IMAGE';
        if (node.is_video) mediaType = 'VIDEO';
        else if (node.__typename === 'GraphSidecar') mediaType = 'CAROUSEL';

        return {
            id: node.id,
            shortcode: node.shortcode,
            caption,
            commentCount,
            likeCount,
            takenAt,
            displayUrl: node.display_url || node.thumbnail_src || '',
            mediaType
        };
    }

    private randomUserAgent() {
        const uagents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15',
            'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        ];
        return uagents[Math.floor(Math.random() * uagents.length)];
    }
}

export class InstagramSignalService {
    constructor(private client = supabase) {}

    async recordInsights(insight: InstagramProfileInsight, brandContainerId?: string, userId?: string) {
        if (!brandContainerId) return;
        const entity = await this.ensureEntity(brandContainerId, insight);
        await this.insertSignal(entity, insight, userId);
    }

    private async ensureEntity(brandContainerId: string, insight: InstagramProfileInsight) {
        const profileUrl = insight.profileUrl;
        const { data: existing } = await this.client
            .from('intelligence_entities')
            .select('id')
            .eq('brand_container_id', brandContainerId)
            .eq('target_identifier', profileUrl)
            .maybeSingle();
        const payload = {
            brand_container_id: brandContainerId,
            name: insight.username,
            domain: 'social',
            target_identifier: profileUrl,
            metadata: {
                username: insight.username,
                followerCount: insight.followerCount,
                followingCount: insight.followingCount,
                profilePicUrl: insight.profilePicUrl
            },
            is_active: true
        };
        if (existing) {
            await this.client
                .from('intelligence_entities')
                .update({ metadata: payload.metadata, name: insight.username })
                .eq('id', existing.id);
            return existing.id;
        }
        const { data, error } = await this.client
            .from('intelligence_entities')
            .insert(payload)
            .select('id')
            .single();
        if (error || !data) throw new Error(error?.message || 'Failed to insert intelligence entity');
        return data.id;
    }

    private async insertSignal(entityId: string, insight: InstagramProfileInsight, userId?: string) {
        const { error } = await this.client
            .from('intelligence_signals')
            .insert({
                entity_id: entityId,
                signal_type: 'instagram_snapshot',
                content_text: `Instagram snapshot for @${insight.username}`,
                ai_analysis: {
                    followerCount: insight.followerCount,
                    followingCount: insight.followingCount,
                    postCount: insight.postCount,
                    topPosts: insight.posts.slice(0, 5),
                    fetchedAt: insight.fetchedAt,
                    approvedBy: userId || null
                },
                captured_at: new Date().toISOString()
            });
        if (error) {
            console.warn('Failed to insert instagram signal', error.message);
        }
    }
}
