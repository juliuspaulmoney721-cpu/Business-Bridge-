import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://qydwvspemujwizsrtxla.supabase.co";
const supabaseKey = "sb_publishable_u2Ri0HpNit3DB4owj7tb6w_t2IGUZW9";

export const supabase = createClient(supabaseUrl, supabaseKey);