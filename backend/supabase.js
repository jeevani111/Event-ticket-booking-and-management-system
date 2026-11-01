const { createClient } = require("@supabase/supabase-js");

// Prefer SUPABASE_SECRET_KEY (new Supabase format) or SUPABASE_SERVICE_ROLE_KEY (classic format)
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseKey,
  { auth: { persistSession: false } }
);

module.exports = supabase;

