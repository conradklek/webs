import { resolve } from 'path';

export const config = {
  host: 'http://localhost:11434',
  models: {
    chat: 'deepseek-r1:1.5b',
    embedding: 'nomic-embed-text:v1.5',
  },
  db: {
    path: '.webs/ai.db',
  },
  worker: {
    path: resolve(import.meta.dir, 'ai.worker.js'),
  },
};
