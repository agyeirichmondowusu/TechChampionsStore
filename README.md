# TechChampionStore

E-commerce site for IoT components and robot kits (Vite + React + Tailwind + Supabase).

## Run it

```bash
npm install
cp .env.example .env      # leave blank for demo mode
npm run dev               # http://localhost:5173
npm run build             # production build in dist/
```

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
