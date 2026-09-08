import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildSite() {
  const output = path.join(root, 'dist/site');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await fs.cp(path.join(root, 'site'), output, { recursive: true, errorOnExist: true });
  const playground = path.join(output, 'playground/index.html');
  const html = await fs.readFile(playground, 'utf8');
  if (!html.includes('name="research-mode" content="local"')) throw Error('Missing playground execution mode');
  await fs.writeFile(playground, html.replace('name="research-mode" content="local"', 'name="research-mode" content="static"'));
  await fs.writeFile(path.join(output, '.nojekyll'), '');
  for (const file of ['index.html', 'playground/index.html', 'playground.html', 'research.html', 'research/redirect.js', 'research/playground.js', 'privacy.html', 'install.html', 'CNAME', 'favicon-32.png', 'sw.js']) {
    if (!(await fs.stat(path.join(output, file))).isFile()) throw Error(`Missing site artifact: ${file}`);
  }
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildSite());
