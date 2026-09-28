/**
 * Development server for the interface, with hot reload.
 * Usage: bun scripts/dev.ts [--port 3000]
 */
import index from '../src/ui/index.html';

const argPort = process.argv.indexOf('--port');
const port = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  development: { hmr: true, console: true },
  routes: { '/*': index },
});

console.log(`Iceland Inc. interface: ${server.url}`);
