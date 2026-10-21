# TV browser checks

Drive `/tv/live` in Edge/Chrome against the local demo API (real backend code, throwaway local PostgreSQL).

1. Start the local database and demo API (see docs/TV-COMMAND-CENTER.md > Tests):
   `DATABASE_URL=<local postgres> node backend/tests/tools/tvDemo.js` (writes the display token to the file named by `TV_DEMO_OUT`).
2. Build the app against it and serve it: `VITE_API_URL=http://127.0.0.1:5099/api npx vite build --outDir /tmp/tvdist && npx vite preview --outDir /tmp/tvdist --port 4173`.
3. `npm i --no-save puppeteer-core`, then `node tv-visual/tv-visual.mjs <outDir> <demo.json>` (screenshots + checks) and
   `node tv-visual/large-roster.mjs <outDir> <demo.json> <employees>` (start the demo with `--employees=120`).

Edit the `executablePath` at the top of each script if Edge is installed elsewhere.
