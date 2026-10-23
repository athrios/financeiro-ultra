import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type AppSupabaseClient = SupabaseClient<Database>;

export type DbEnums = Database["public"]["Enums"];
