PIXORA — REAL GITHUB + SUPABASE VERSION

This version removes the old browser-local fake/demo data layer.

REAL FEATURES INCLUDED
- Supabase authentication
- Real profiles stored in public.profiles
- Real search from Supabase profiles
- Real follows stored in public.follows
- Real posts stored in public.posts
- Real post likes stored in public.post_likes
- Real photo uploads through Supabase Storage
- Real stories stored in public.stories and expire after 24 hours
- Real conversations stored in public.messages
- Realtime chat updates through Supabase Realtime
- Real in-app notifications stored in public.notifications
- Notifications for messages, follows and likes
- Unread message/notification badges
- Profile editing with real database updates
- Supabase logout

IMPORTANT FIRST SETUP
1. Upload these files to the GitHub repository used by Pixora.
2. Open Supabase SQL Editor.
3. Copy ALL of schema.sql into the SQL Editor and run it once.
4. Make sure Supabase Auth email confirmation is configured the way you want.
5. Log out and log back in to Pixora after the database setup.
6. If accounts already existed before this version, log into each account once so the app can create/repair its profile record.

NO FAKE DATA
The new core pages do not use localStorage for users, follows, posts, messages or notifications. Those records come from Supabase.

SUPABASE PROJECT
The existing project URL/key in supabase.js are preserved from the supplied Pixora project.

The GitHub site still needs the Supabase database/schema to be initialized. A ZIP file alone cannot create database tables in your Supabase project.
