# TechChampionStore

E-commerce site for IoT components and robot kits (Vite + React + Tailwind + Supabase).

## Run it

```bash
npm install
cp .env.example .env      # leave blank for demo mode
npm run dev               # http://localhost:5173
npm run build             # production build in dist/
npm run preview           # serve dist/ at http://localhost:4173
```

Needs Node 20 or newer. Don't open `dist/index.html` by double-clicking it: browsers block the scripts on
`file://` and the page stays blank. Serve it with `npm run preview` or a host (Netlify and Vercel rewrites
for page links are in `public/_redirects` and `vercel.json`).

Without Supabase keys the site runs in **demo mode**: the 46 seed products load from
`src/data/seedProducts.json` and admin edits, uploads, accounts and orders are saved in the browser.
The first account created in demo mode becomes admin; there is also a built-in admin login `admin@techchampionstore.com` / the `VITE_DEMO_ADMIN_PASSWORD` value (default `champion123`).

## Go live with Supabase

1. Create a Supabase project and put its URL and anon key in `.env`.
2. In the SQL editor run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
   This creates `products`, `site_settings`, `orders`, `admins`, row-level security and the public
   `product-images` storage bucket (folders: `microcontrollers/`, `sensors/`, `actuators/`, `power/`, `3d-printers/`, `site/`).
3. Run `supabase/migrations/0002_first_user_admin.sql`. The first account that signs up (or logs in while
   there is no admin yet) becomes the admin. To add more admins later:
   `insert into admins (user_id, email) select id, email from auth.users where email = 'you@example.com';`
4. Open `/admin` to add products with images, set YouTube tutorial links, grid size, contacts,
   social links, payment accounts, delivery options and hero images.

## Meet Champ (AI assistant)

Typing, voice recording and live voice conversation use the browser speech APIs (best in Chrome/Edge).
Without an AI backend Champ answers from the catalog and store settings. For full AI answers, deploy the
bundled edge function, which calls Claude:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy champ-chat --no-verify-jwt
```

The site calls `<SUPABASE_URL>/functions/v1/champ-chat` automatically; set `VITE_CHAMP_API_URL` or the
admin "Champ AI endpoint" field to use another endpoint (POST `{messages}` → `{reply}`).

## Visitor analytics (Admin → Visitors)

Counts visitors, new vs. returning, how often each visitor comes back, time of visit, top pages,
where visitors came from, devices, and approximate location (country, region, city).

- A notice asks visitors first (Admin → Site settings → *Visitor tracking* can switch to "notice only").
  Visitors who decline, browsers sending Global Privacy Control, admins and `/admin` are never counted.
  The privacy page is `/privacy`.
- Each browser gets a random ID in localStorage; a visit (session) ends after 30 minutes without a page view.
- Location comes from an IP lookup ([ipapi.co](https://ipapi.co)) done once per visit by the `track-visit`
  edge function. The IP address itself is never stored. No GPS or exact location.
- Demo mode records only the current browser's visits, with location guessed from its language and time zone.

To go live, run `supabase/migrations/0003_analytics_and_email.sql`, then:

```bash
supabase functions deploy track-visit --no-verify-jwt
# optional, only if you outgrow ipapi.co's free ~1,000 lookups a day:
supabase secrets set IPAPI_KEY=...
```

To keep 13 months of data, run `select purge_old_visits();` now and then (or schedule it with pg_cron).

## Emails (orders, status updates, product news)

Sent with [Resend](https://resend.com) from the `send-email` edge function:

- **New order:** an alert to the store email (Site settings → Email, or `OWNER_EMAIL`) and a confirmation
  with items, total and MoMo details to the customer if they typed an email at checkout (the field is optional).
- **Order status:** changing an order to paid / dispatched / completed / cancelled in Admin → Orders emails the customer.
- **Product updates:** Admin → Emails sends a message (optionally featuring up to 6 products) to everyone
  who subscribed from the footer form or the checkout checkbox. Each email has an unsubscribe link (`/unsubscribe`).

Setup:

1. Create a Resend account, add and verify your domain (DNS records), and create an API key.
   Until the domain is verified Resend only delivers to your own Resend account email.
2. Run `0003_analytics_and_email.sql` if you have not already, then:

```bash
supabase secrets set RESEND_API_KEY=re_... \
  EMAIL_FROM="TechChampionStore <orders@yourdomain.com>" \
  SITE_URL=https://yourdomain.com
supabase secrets set OWNER_EMAIL=you@example.com   # optional, defaults to the Site settings email
supabase functions deploy send-email --no-verify-jwt
```

3. Admin → Emails → **Send a test email**.

In demo mode nothing is sent; Admin → Emails shows an outbox of what would have gone out.

## Where things live

| Path | What |
| --- | --- |
| `public/images/<category>/` | Product image folders (placeholder art; replace with real photos) |
| `public/robots/<robot>/` | Robot cut-outs (`main.webp`) and real product-structure photos |
| `src/data/robots.js` | Robot names, text, specs and animation type |
| `src/data/defaultSettings.js` | Default contacts, delivery fees, payment accounts |
| `src/components/RobotAssembly.jsx` | Scroll-driven exploded view → assembly → walk/drive/grab |
| `scripts/prep_robots.py` | Regenerates robot cut-outs from the original photos |
| `scripts/gen_seed.py` | Regenerates seed products, placeholder art and `supabase/seed.sql` |

## Bulk updates from Excel

Admin → **Excel import** lets you update the live catalogue from a spreadsheet (.xlsx or .csv).

1. Click **Download catalogue (.xlsx)** to get every product as a sheet (or use your own sheet).
2. Edit prices, stock, descriptions, etc. Add new rows for new products.
3. Upload it. A preview shows which products will be updated, added, or need fixing.
4. Click **Apply** and the website updates immediately.

Rows match existing products by **Slug**, then by **Name** (case-insensitive). Empty cells keep the current value, so a sheet with just `Name` and `Price` only changes prices. New products need Name, Category and Price.

Columns: Slug, Name, Category, Type, Price, Old Price, Remaining, Short Description, Description, Image, YouTube Link, Specs (`Voltage: 5V; Pins: 20`), Visible (Yes/No). The Image column can be a web link, or a file name like `esp32.jpg` that you select in the preview; it is uploaded to that category's folder in Supabase Storage.

## 3D slicer (`/slicer`)

Visitors upload an STL (binary or ASCII), orient and scale it on the build plate, and slice it to G-code without anything leaving their browser. The slicer runs in a Web Worker:

- `src/lib/slicer/stl.js` parses STL and welds vertices; `contours.js` cuts each layer and stitches loops along shared mesh edges.
- `slicer.js` builds walls (offset with [Clipper](https://www.npmjs.com/package/clipper-lib)), top/bottom skin, infill (grid, lines, triangles, concentric), supports and skirt/brim.
- `gcode.js` writes Marlin/Klipper G-code and estimates time, filament weight and cost; `profiles.js` holds printer and material presets (filament prices link to the store's PLA/PETG products).
- `src/components/slicer/scene.js` renders the model and the layer-by-layer toolpath preview with three.js.
