# Pixora rebuild status

This build uses the existing Pixora interface and a real Supabase data layer.

## Repaired
- Auth/profile creation and profile lookup
- Search by name/username
- Posts and image storage
- Stories
- Likes and follows
- Real direct messages
- In-app notifications for messages, follows and likes
- Unread badges
- Realtime chat and notification updates
- Database repair SQL for missing columns, foreign keys, policies, triggers, storage and realtime

## Important
Run `schema.sql` once in the Supabase SQL Editor before testing the repaired build. The public browser key cannot create the database objects itself.
