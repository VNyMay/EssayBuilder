const readline = require('readline');
const { renderFile } = require('./render.js');

const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  let reply;
  try {
    const [input, output, mode, pagesFile] = JSON.parse(line);
    reply = { ok: true, message: renderFile(input, output, mode, pagesFile) };
  } catch (error) {
    reply = { ok: false, error: String((error && error.message) || error) };
  }
  process.stdout.write(`${JSON.stringify(reply)}\n`);
});
