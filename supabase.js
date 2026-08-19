import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://ycjlibjvhimhbpxpejqp.supabase.co";

const supabaseKey = "sb_publishable_3oaFbXriLxj3_PZ7nJfdYA_ppQmaMjM'

export const supabase = createClient(supabaseUrl, supabaseKey);