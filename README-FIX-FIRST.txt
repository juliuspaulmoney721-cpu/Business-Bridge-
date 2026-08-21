PIXORA — CLEAN REPAIR BUILD v11

THIS IS A REBUILT REPAIR PACKAGE, NOT THE PREVIOUS ZIP.

What changed in this build:
- createPost now handles the old posts.user_id NOT NULL schema and the new posts.author_id schema.
- Messaging now uses SECURITY DEFINER RPCs for conversation membership, so the browser never triggers a recursive conversation_members policy.
- Service worker cache is v11 and deletes previous Pixora caches so old JavaScript is not reused.
- schema.sql migrates posts.user_id into posts.author_id and repairs the conversation_members recursion problem without requiring direct member-table reads from the browser.

Do this in order:
1. Replace ALL files in the GitHub repository with these files.
2. In Supabase SQL Editor, open schema.sql and RUN it once.
3. Do NOT delete the Supabase project or the existing tables.
4. Wait for GitHub Pages to publish.
5. Open Pixora again and test Create -> Publish post.

If publishing still fails, the exact Supabase error shown on screen is the next thing to fix; do not delete tables or create random new SQL tabs.
