const readline = require('readline');
const { renderFile } = require('./render.js');

const reader = readline.createInterface({ input: process.stdin });
reader.on('line', (line) => {
  let reply;
  try {
    const [input, output, mode, pages] = JSON.parse(line);
    reply = { ok: true, text: renderFile(input, output, mode, pages) };
  } catch (error) {
    reply = { ok: false, error: String(error && error.stack || error) };
  }
  process.stdout.write(`${JSON.stringify(reply)}\n`);
});
