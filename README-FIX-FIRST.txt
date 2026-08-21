PIXORA — CLEAN REPLACEMENT BUILD

This ZIP is the current Pixora source, repaired to use the real Supabase backend.

1. Replace ALL files in the GitHub repository with the files from this ZIP.
2. In Supabase SQL Editor, run schema.sql ONCE. It repairs posts.user_id/author_id and removes the recursive messaging RLS policies.
3. Do NOT delete your Supabase project or tables.
4. After GitHub Pages publishes, hard-refresh the site. The service-worker cache is v8.

POSTING FIX:
The app now sends the authenticated user's ID to both author_id and the legacy user_id when publishing. This prevents the old NOT NULL user_id error even if the database migration has not been applied yet. Once schema.sql is run, user_id is removed and the app uses author_id.

MESSAGING FIX:
schema.sql replaces the recursive conversation_members RLS policies with a security-definer membership check. Run schema.sql before testing Messages.

Supabase project URL is already configured in supabase.js.
