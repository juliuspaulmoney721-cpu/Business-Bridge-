PIXORA — SUPABASE CONNECTED BUILD

This build uses Supabase as the real backend. It does not use the old localStorage/demo data layer.

Database tables used by the frontend:
- profiles
- posts
- follows
- conversations
- conversation_members
- messages
- notifications

Storage bucket used by the frontend:
- posts

IMPORTANT
Run schema.sql in the Supabase SQL Editor if the database has not already been repaired with the matching Pixora SQL.

The frontend is deliberately matched to these columns:
- profiles: id, name, username, avatar_url, bio, created_at, updated_at
- posts: id, author_id, content, image_url, created_at
- follows: follower_id, following_id
- conversations: id, created_at, updated_at
- conversation_members: conversation_id, user_id
- messages: id, conversation_id, sender_id, content, created_at, read_at
- notifications: id, user_id, actor_id, type, title, message, post_id, conversation_id, is_read, created_at

The app avoids PostgREST embedded relationship queries. Profiles are loaded separately, so errors such as:
"Could not find a relationship between 'posts' and 'author_id' in the schema cache"
are not produced by the frontend.

The old localStorage demo data layer is not used by the app and is removed from this build.
The service worker cache is bumped to a new Pixora version so GitHub Pages does not keep serving the previous JavaScript files.
