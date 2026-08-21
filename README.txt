PIXORA - GITHUB + SUPABASE

This build keeps Pixora as a normal code project for GitHub Pages. No Lovable or Hercules is required.

IMPORTANT: Messaging and in-app notifications need the Supabase database schema.

ONE-TIME SETUP
1. Open your Supabase project.
2. Open SQL Editor.
3. Open schema.sql from this ZIP.
4. Paste the whole file into SQL Editor.
5. Run it once.
6. Log out and log back into each Pixora account.
7. Go to Search, find the other account, tap Message, and send a message.

The schema creates:
- profiles
- messages
- notifications
- follows
- Row Level Security policies
- automatic profile creation for new Auth accounts
- automatic notification when a message is sent
- automatic notification when someone follows another user
- Realtime for messages and notifications

WHY THIS IS REQUIRED
A GitHub Pages website cannot store messages between two different email accounts by itself. The shared Supabase database is what makes messages and notifications appear on both accounts/devices.

If you see "User not found" before running schema.sql, that means the account exists in Supabase Auth but does not yet have a public Pixora profile row. Running schema.sql and logging into each account fixes that.
