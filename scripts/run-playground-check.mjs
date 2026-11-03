import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

// Reserve an available loopback port rather than reusing a developer's preview.
const probe = net.createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ['scripts/preview.mjs'], {
  env: { ...process.env, GRAINULATOR_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const stopped = once(preview, 'exit');
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local playground did not start')), 10000);
    preview.stdout.on('data', bytes => {
      if (bytes.toString().includes(url)) { clearTimeout(timeout); resolve(); }
    });
    preview.once('error', error => { clearTimeout(timeout); reject(error); });
    preview.once('exit', code => { clearTimeout(timeout); reject(new Error(`Local playground exited (${code})`)); });
  });
  const check = spawn(process.execPath, ['scripts/playground-check.mjs'], {
    env: { ...process.env, GRAINULATOR_TEST_URL: url }, stdio: 'inherit',
  });
  const [code] = await once(check, 'exit');
  process.exitCode = code ?? 1;
} finally {
  preview.kill('SIGTERM');
  await stopped;
}
