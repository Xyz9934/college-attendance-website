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

## Run it

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
- Default admin password: `zoology123`
- You can override it with `ADMIN_PASSWORD` before starting the server.

## GitHub Pages

If you want the site to stay online even when your PC is off, publish the `docs/` folder with GitHub Pages:

- Branch: `main`
- Folder: `/docs`

The GitHub Pages version is browser-only, so it does not run `server.js`.
