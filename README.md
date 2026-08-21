# 8D Adda — a live 8D audio radio station

A self-hosted radio site: you upload 8D-processed songs through an admin panel,
assign them to time-based rotations, and visitors get a live, synced player —
everyone tunes into the same song at the same position, like a real broadcast.

## What's included

- **Public site** (`/`) — welcome screen, live player, playlist view, rotation tabs, live listener count
- **Admin panel** (`/admin.html`) — password-protected login, upload form, edit/delete/reorder tracks, move tracks between rotations
- **Backend** — Node.js + Express, JWT auth, AWS SDK for Cloudflare R2, automatic audio-duration detection, live-sync logic

## Requirements

- Node.js 18 or newer (check with `node -v`)

## Setup (first time only)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create your `.env` file from the template:
   ```bash
   cp .env.example .env
   ```

3. Generate your admin password hash:
   ```bash
   npm run setup-admin
   ```
   This asks for a password and prints a line like `ADMIN_PASSWORD_HASH=$2a$10$...`.
   Paste that line into your `.env` file.

4. Open `.env` and set up the rest:
   - `ADMIN_USERNAME` — whatever username you want to log in with
   - `JWT_SECRET` — any long random string (used to sign login sessions)

### Cloudflare R2 Setup (Required for Uploads)

To ensure your uploaded audio files survive server restarts on hosts with ephemeral disk (like Render free tier), this app uploads directly to Cloudflare R2 (an S3-compatible object storage).

1. Go to the Cloudflare Dashboard -> R2 -> Create a bucket.
2. In R2 settings, click **Manage R2 API Tokens**.
3. Create a token with **Object Read & Write** permissions.
4. Go to your bucket settings and enable **Public URL** access (or link a custom domain).
5. Fill these details into your `.env`:
   - `R2_ACCOUNT_ID` — found in the R2 dashboard URL or right sidebar.
   - `R2_ACCESS_KEY_ID` — from the token you created.
   - `R2_SECRET_ACCESS_KEY` — from the token you created.
   - `R2_BUCKET_NAME` — the name of your bucket.
   - `R2_PUBLIC_URL` — the public URL of your bucket (e.g., `https://pub-xxxxxx.r2.dev`).

## Running the site

```bash
npm start
```

Then open:
- **Site**: http://localhost:3000
- **Admin panel**: http://localhost:3000/admin.html

## Deploying on Free Hosts (Render, etc.)

This app is safe to deploy on hosts with ephemeral disk storage because audio files are streamed directly to Cloudflare R2 without touching the local disk. 

However, song metadata is stored in `data/db.json`. On a free ephemeral host, this file will reset on every deploy. For production use, you should periodically back up `db.json`, or swap out the `db.js` storage layer for a real database (like MongoDB or Postgres).

## Customizing the design

Colors, fonts, and layout all live in `public/css/style.css` as CSS variables at the top. Change those to retheme the whole site at once.
