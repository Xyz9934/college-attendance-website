# B.Sc. Zoology Attendance App

## What it captures

- Full Name
- Roll Number
- Mobile Number
- Semester
- Date and Time
- Public IP Address
- GPS Location if the user allows it
- Admin-only attendance dashboard

## Run it locally

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

## Notes

- Location permission is requested automatically when the page opens.
- If GPS permission is denied, attendance still saves and location is marked as unavailable.
- IP is captured on the server and can be used for audit purposes.
- The admin dashboard is protected by a password.
- Default admin password: `zoologybotany`
- You can override it with `ADMIN_PASSWORD` before starting the server.

## Shared backend setup

The app now uses a hosted Supabase database instead of browser-only storage.

1. Create a free Supabase project.
2. Run [`supabase-schema.sql`](./supabase-schema.sql) in the SQL editor.
3. Copy the project URL and the `service_role` key into environment variables.
4. Set these variables in your host:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD=zoologybotany`

## Deployment

The easiest fully hosted setup is:

- Backend: a free Node host such as Render
- Database: Supabase free tier

The backend serves the app and talks to Supabase, so the attendance data stays shared and permanent even when your PC is off.

## Access rules

- Students submit attendance normally.
- Each submission gets a private token stored in that browser.
- A student can only reopen their own record with that token.
- The admin dashboard is available only after the correct password is entered.
- The admin password is `zoologybotany`.
