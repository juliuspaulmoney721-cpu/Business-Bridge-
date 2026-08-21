PIXORA — CLEAN REPAIR BUILD

This package is the clean replacement build for the Pixora GitHub site.

1. Replace ALL files in the GitHub repository with the files in this folder.
2. In Supabase SQL Editor, open schema.sql and run it once. It repairs the old posts.user_id -> posts.author_id setup and removes the recursive messaging RLS policies.
3. Wait for GitHub Pages to publish. Then refresh the site.

IMPORTANT:
- Do not delete your Supabase project.
- Do not delete tables just because the SQL Editor shows old Untitled queries. Those tabs are only saved/unsaved SQL editor documents.
- The app now has a temporary legacy fallback for posts.user_id so posting can still work while the database repair is being applied.
- Service worker cache is v7 so the new JavaScript is fetched instead of staying on the previous Pixora build.

Supabase project URL is already configured in supabase.js.
