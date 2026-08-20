# Orbit — a live 8D audio radio station

A self-hosted radio site: you upload 8D-processed songs through an admin panel,
assign them to time-based rotations, and visitors get a live, synced player —
everyone tunes into the same song at the same position, like a real broadcast.

## What's included

- **Public site** (`/`) — welcome screen, live player, playlist view, rotation tabs, live listener count
- **Admin panel** (`/admin.html`) — password-protected login, upload form, edit/delete/reorder tracks, move tracks between rotations
- **Backend** — Node.js + Express, JWT auth, file upload, automatic audio-duration detection, live-sync logic

## Requirements

- Node.js 18 or newer (check with `node -v`)

## Setup (first time only)

1. Install dependencies:
   ```
   npm install
   ```

2. Create your `.env` file from the template:
   ```
   cp .env.example .env
   ```

3. Generate your admin password hash:
   ```
   npm run setup-admin
   ```
   This asks for a password and prints a line like `ADMIN_PASSWORD_HASH=$2a$10$...`.
   Paste that line into your `.env` file (replacing the empty `ADMIN_PASSWORD_HASH=` line).

4. Open `.env` and also set:
   - `ADMIN_USERNAME` — whatever username you want to log in with
   - `JWT_SECRET` — any long random string (used to sign login sessions)

## Running the site

```
npm start
```

Then open:
- **Site**: http://localhost:3000
- **Admin panel**: http://localhost:3000/admin.html

## Uploading your first songs

1. Go to `/admin.html` and sign in with the username/password you set above.
2. Fill in the upload form — title, rotation, film, year, tags — and choose your audio file (mp3, wav, m4a, or ogg, up to 50MB).
3. The song's duration is read automatically from the file.
4. It appears immediately in that rotation's playlist on the main site.

## How rotations work

Five rotations are pre-configured in `rotations.js`:

| Rotation | Hours (IST) |
|---|---|
| Sunrise | 5:00–9:00 |
| Study 8D | 9:00–18:00 |
| Chill Evening | 18:00–22:00 |
| Night Bass | 22:00–5:00 |
| On Request | not time-based — always selectable |

You can rename these, change the hours, or add more by editing the `ROTATIONS` array
at the top of `rotations.js`.

## How the "live" sync works

The server picks a fixed starting point when it boots, adds up all the song durations
in a rotation, and works out — based on how much time has passed — exactly which song
should be playing right now and how many seconds into it. Every visitor who loads the
page gets that same answer, so they all hear the same moment, the same way a real FM
station would sound if you tuned in mid-song. When a song ends, everyone moves to the
next one together.

## Where things are stored

- Song metadata: `data/db.json` (plain JSON, human-readable, easy to back up)
- Audio files: `uploads/` folder
- Both are gitignored by default — back them up yourself before redeploying

## Deploying somewhere public

This runs anywhere Node.js runs — a VPS (DigitalOcean, Hetzner), Railway, Render, etc.
A few things to change before going live:
- Set a strong, random `JWT_SECRET`
- Put the app behind HTTPS (most hosts do this for you)
- Consider moving `uploads/` to object storage (Cloudflare R2, S3) if your host's
  disk doesn't persist between deploys
- Consider a rate limiter (e.g. `express-rate-limit`) on `/api/admin/login` to slow down password guessing

## Customizing the design

Colors, fonts, and layout all live in `public/css/style.css` as CSS variables at the top
(`--gold`, `--walnut`, `--deepest`, etc.) — change those to retheme the whole site at once.
