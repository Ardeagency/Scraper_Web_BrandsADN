import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Missing SUPABASE_URL or SUPABASE_KEY in .env file');
}

export const supabase: SupabaseClient = createClient(
    supabaseUrl || '',
    supabaseKey || ''
);

export async function testConnection() {
    try {
        const { data, error } = await supabase.from('organizations').select('count').limit(1);
        if (error) {
            console.error('Supabase connection error:', error.message);
            return false;
        }
        console.log('Supabase connection successful');
        return true;
    } catch (err) {
        console.error('Unexpected error connecting to Supabase:', err);
        return false;
    }
}
