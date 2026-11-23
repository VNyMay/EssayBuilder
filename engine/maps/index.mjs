import { renderMap } from './render.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const specs = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const results = [];
for (const spec of specs) {
  try {
    results.push(await renderMap(spec));
  } catch (error) {
    results.push({ error: error.message });
  }
}
process.stdout.write(JSON.stringify(results));
