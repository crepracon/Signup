# Forever Guild Roster

A guild sign-up sheet for **World of Warcraft: Forever** (launching Nov 4, 2026). Everyone opens the link, adds their Discord name, faction, race, class, main role and server type, and every open page updates within a few seconds. No accounts needed.

- Only valid Forever race/class combos can be picked (including Skyborne).
- Shows which server type + faction group is biggest and who can't group with it.
- Class, role and race breakdown.
- **Copy roster for Discord** formats the whole roster as a message to paste into a channel.
- People can edit or remove their own entry from the device they signed on.
- Officers can edit or remove anyone (see below).

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub**, pick this repo.
2. Leave the build settings as they are (`netlify.toml` handles them) and deploy.
3. Set an officer key: **Site configuration → Environment variables → Add variable**
   - Key: `ADMIN_KEY`
   - Value: any long password you choose
   Then redeploy (**Deploys → Trigger deploy**).
4. Post the site link in Discord.

Storage uses Netlify Blobs, which is built in; there's nothing else to set up.

## Officer mode

Open the site with `#admin` at the end of the address (e.g. `https://your-site.netlify.app/#admin`), enter your `ADMIN_KEY`, and you can edit or remove any entry. The key is remembered on that device.

## Files

- `public/index.html`, `public/app.js` – the page
- `netlify/functions/roster.mjs` – the API at `/api/roster` (list, add, edit, remove)
- `netlify/lib/game.mjs` – race/class combos and server types (the page has a copy in `app.js`)
