const fs = require('fs');
const initRDKitModule = require('@rdkit/rdkit');

const [input, output] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(input, 'utf8'));
const COLOURS = /#(?!000000|FFFFFF|ffffff)[0-9A-Fa-f]{6}/g;

initRDKitModule().then((RDKit) => {
  try {
    RDKit.prefer_coordgen(true);
  } catch (error) {
    // older builds draw with the built-in layout
  }
  const results = jobs.map((job) => {
    let mol = null;
    try {
      mol = RDKit.get_mol(job.smiles);
      if (!mol || !mol.is_valid()) return { ok: false, error: `'${job.smiles}' is not a valid SMILES string` };
      const atoms = mol.get_num_atoms();
      const width = Math.max(360, Math.min(780, 300 + atoms * 12));
      const height = Math.round(width * (atoms > 28 ? 0.78 : 0.62));
      const options = {
        width,
        height,
        bondLineWidth: 2,
        padding: 0.06,
        clearBackground: false,
        addStereoAnnotation: Boolean(job.stereo),
        annotationFontScale: 0.6,
        baseFontSize: 0.6,
      };
      let svg = mol.get_svg_with_highlights(JSON.stringify(options));
      if (!job.color) svg = svg.replace(COLOURS, '#000000');
      return { ok: true, svg };
    } catch (error) {
      return { ok: false, error: String(error && error.message || error) };
    } finally {
      if (mol) mol.delete();
    }
  });
  fs.writeFileSync(output, JSON.stringify(results));
});
