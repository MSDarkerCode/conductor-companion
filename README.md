# Conductor Companion

One-thumb bus ticketing for conductors. React (Vite) + Express + built-in node:sqlite (Node 22.13+), with cookie login.

## Run locally
    npm install
    npm run build
    npm start            # http://localhost:3000

Dev with hot reload: run `npm run server` in one terminal and `npm run dev` in another (open http://localhost:5173).

## Accounts
- Conductors register in the app.
- Admin is seeded on first start from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `admin@depot.test` / `admin12345`; change them for any public deploy).

## Environment
`JWT_SECRET` (required in production), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DB_PATH` (SQLite file, point it at a persistent disk), `PORT`, `TZ` (default Asia/Kolkata).

## Deploy
Push to GitHub, then on Render choose New, Blueprint, and select the repo. Set `ADMIN_PASSWORD` when asked. Free instances lose the SQLite file on redeploy; attach a disk and set `DB_PATH` for real use.
