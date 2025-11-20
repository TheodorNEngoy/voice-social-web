import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

// Server-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
