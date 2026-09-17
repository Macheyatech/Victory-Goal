const SUPABASE_URL = "https://obtcaguapfojibqjpqbs.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BqflKa7qaXaA5B4S3XatRQ_wkU2EXal";

if (
  !window.supabase ||
  typeof window.supabase.createClient !== "function"
) {
  throw new Error("La bibliothèque Supabase n'est pas chargée.");
}

window.vgSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
