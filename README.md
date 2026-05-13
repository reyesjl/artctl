# artctl

Minimal terminal-style art viewer built on top of The Met's collection data.

## The story

We started with the idea of a simple art browser, but relying on live Met API calls for normal page loads turned out to be fragile. Search, work pages, and gallery views were too dependent on upstream timing, image availability, and challenge behavior.

So we changed the shape of the app:
- ingest The Met's `MetObjects.csv` once into a local SQLite catalog
- serve the app from that local catalog
- hydrate images separately, slowly and explicitly, with delay and jitter

That gave us a stable local runtime and a controlled enrichment workflow.

## 1. Install

```bash
npm install
```

## 2. Get `MetObjects.csv`

Download `MetObjects.csv` from The Met's official Open Access data sources:

- Open Access page: https://www.metmuseum.org/about-the-met/policies-and-documents/open-access
- Open Access CSV repo: https://github.com/metmuseum/openaccess

The Met's Image and Data Resources page says the collection data CSV is available on GitHub and updated weekly:
- https://www.metmuseum.org/policies/image-resources

Place the file somewhere local, for example:

```bash
metropolitan/MetObjects.csv
```

## 3. Configure the local catalog DB

ARTCTL reads the catalog DB path from `.env.local`.

Default:

```env
CATALOG_DATABASE_PATH=artctl-catalog.sqlite
```

## 4. Ingest the catalog

Build the local SQLite catalog from the CSV:

```bash
node server/catalog-import-command.js metropolitan/MetObjects.csv
```

When we ran the full ingest once, it took about `15 seconds` to load the whole thing into SQLite.

You can also target a specific DB path explicitly:

```bash
node server/catalog-import-command.js metropolitan/MetObjects.csv /tmp/artctl-catalog.sqlite
```

## 5. Hydrate images

Hydration is separate from ingest. It fetches Met object records one at a time and stores only image-related fields into the local catalog.

Sweet-spot batch command:

```bash
node server/catalog-hydrate-command.js /tmp/artctl-catalog.sqlite --limit 1000 --delay-ms 800 --jitter-ms 500
```

That command has been a good balance for steady hydration without pushing the upstream too hard.

Other useful examples:

```bash
node server/catalog-hydrate-command.js --limit 10
node server/catalog-hydrate-command.js --object-id 5046 --object-id 4926
node server/catalog-hydrate-command.js path/to/catalog.sqlite --limit 10
```

Notes:
- progress logs go to stderr
- final JSON output goes to stdout
- `403` responses and non-JSON challenge responses abort the run conservatively

## 6. Run the app

Start the dev server:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

Run the production server:

```bash
npm run start
```

## 7. Deploy like `cortex`

This repo now has the same GitHub Actions deployment shape as `cortex`:

- `.github/workflows/deploy.yml` runs `npm ci`, `npm test`, and `npm run build` on pushes to `main`
- the deploy job SSHes into the server and runs `scripts/deploy.sh`
- `scripts/deploy.sh` installs dependencies, builds the app, restarts the systemd service, and verifies `GET /api/health`

Server-side templates live here:

- `deploy/systemd/artctl.service`
- `deploy/nginx/artctl.conf`

Recommended layout for running this on the same machine as the other app:

- deploy checkout at `/srv/artctl`
- systemd service name `artctl`
- app process listening on `127.0.0.1:3000`
- nginx routing the ARTCTL hostname to `/srv/artctl/dist` and proxying `/api/*` to port `3000`

Typical Ubuntu setup:

```bash
sudo mkdir -p /srv/artctl
sudo chown -R cortex:cortex /srv/artctl
sudo cp /srv/artctl/deploy/systemd/artctl.service /etc/systemd/system/artctl.service
sudo cp /srv/artctl/deploy/nginx/artctl.conf /etc/nginx/sites-available/artctl
sudo ln -sf /etc/nginx/sites-available/artctl /etc/nginx/sites-enabled/artctl
sudo systemctl daemon-reload
sudo systemctl enable artctl
sudo systemctl start artctl
sudo nginx -t
sudo systemctl reload nginx
```

If you are sharing the box with the other app, keep the ports distinct and set the correct `server_name` in `deploy/nginx/artctl.conf` before enabling the site.
The included systemd unit assumes you are reusing the existing `cortex` deploy user.

GitHub Actions deploy secrets should match `cortex`:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`

## Workflow summary

```bash
npm install
node server/catalog-import-command.js metropolitan/MetObjects.csv
node server/catalog-hydrate-command.js /tmp/artctl-catalog.sqlite --limit 1000 --delay-ms 800 --jitter-ms 500
npm run dev
```
