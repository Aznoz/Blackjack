// Vlákno pro výpočet tahů bota – hledání nesmí blokovat hlavní server (ostatní hry).
import { parentPort } from 'node:worker_threads';
import { bestMove } from './ai.js';

parentPort.on('message', ({ id, ...opts }) => {
  let move = null;
  try { move = bestMove(opts); } catch (e) { console.error('sachy bot:', e); }
  parentPort.postMessage({ id, move });
});
