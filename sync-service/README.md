# Festival PWA External Sync Service

This is a small decoupled service that fetches WordPress pages and pushes the
extracted PWA payload to the Festival PWA plugin. It can run as:

- a cron-triggered CLI script (`node sync.js`)
- a long-lived worker with a scheduler
- a Docker container
- a GitHub Action / scheduled cloud function

The WordPress site itself is not involved in the actual crawling/extraction,
so heavy page downloads and DOM parsing happen outside the WP process.

## How it works

1. Reads config (`config.json`) describing the WP site and which pages to sync.
2. Fetches each configured page from WP (public URL or WP API).
3. Extracts content using the same logic the plugin used (`snapshot` or `raw`).
4. POSTs a JSON payload to `https://wp-site.example/wp-json/festival/v1/sync-batch`.
5. Plugin receives payload, validates secret, writes JSON files to `pwa/data/`,
   writes snapshots to `pwa/snapshots/`, and updates the manifest.

## Config

See `config.example.json`.

## Run

```bash
npm install
node sync.js
```

## Deployment ideas

- Cron job on a small VPS: `*/15 * * * * cd /opt/sync-service && node sync.js`
- Docker + cron sidecar
- GitHub Actions scheduled workflow that pushes to WP REST endpoint
- AWS Lambda / Google Cloud Run scheduled job
