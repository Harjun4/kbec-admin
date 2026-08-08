const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is not set in environment variables.');
}

const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false
    }
}) : null;

if (supabase) {
    console.log('⚡ Initialized Official Supabase JS SDK Client:', supabaseUrl);
}

module.exports = supabase;

