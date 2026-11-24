// Verify the dashboard's in-page model and farm-plan derivation match lib/model.ts exactly.
// Loads app.js in node with a window stub (no document), then compares every board row.
import { readFileSync } from 'node:fs';

const dataJs = readFileSync('out/data.js', 'utf8');
const radar = JSON.parse(dataJs.replace(/^window\.RADAR=/, '').replace(/;\s*$/, ''));
const board = JSON.parse(readFileSync('out/board.json', 'utf8')).rows;

// Stub a browser window with the data, but no document: app.js exposes Farm + RadarModel
// and then returns before touching the DOM.
const windowStub = { RADAR: radar };
globalThis.window = windowStub;
const appJs = readFileSync('dashboard/app.js', 'utf8');
eval(appJs);

const { Farm, RadarModel } = windowStub;
if (!Farm || !RadarModel) {
  console.error('FAIL: app.js did not expose window.Farm / window.RadarModel');
  process.exit(1);
}

let impliedMismatch = 0;
let farmMismatch = 0;
const boardBySlug = new Map(board.map((r) => [r.slug, r]));
for (const row of radar.rows) {
  const recomputed = RadarModel.impliedOf(row, radar.model);
  if (recomputed !== row.implied_value_usd) {
    impliedMismatch++;
    if (impliedMismatch <= 3) console.log('implied mismatch:', row.slug, 'data.js', row.implied_value_usd, 'page', recomputed);
  }
  const steps = Farm.farmSteps(row);
  const boardRow = boardBySlug.get(row.slug);
  const same = boardRow !== undefined && steps.length === boardRow.farm_steps.length && steps.every((s, i) => s === boardRow.farm_steps[i]);
  if (!same) {
    farmMismatch++;
    if (farmMismatch <= 2) {
      console.log('farm mismatch:', row.slug);
      for (let i = 0; i < Math.max(steps.length, boardRow.farm_steps.length); i++) {
        if (steps[i] !== boardRow.farm_steps[i]) {
          console.log('  page :', steps[i]);
          console.log('  board:', boardRow.farm_steps[i]);
        }
      }
    }
  }
}
console.log('rows checked:', radar.rows.length);
console.log('implied-value mismatches (page vs board):', impliedMismatch);
console.log('farm-plan mismatches (page vs board):', farmMismatch);
if (impliedMismatch > 0 || farmMismatch > 0) process.exit(1);
console.log('OK: the page recomputes every row and rebuilds every farm plan identically.');
