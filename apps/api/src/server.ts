import { llmClientFromEnv } from '@trao/core';
import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';
import { Runner } from './services/runner.js';

async function main(): Promise<void> {
  await connectDb(config.mongodbUri);
  const llm = llmClientFromEnv(process.env, (e) => console.log(`llm ${e.type}`, JSON.stringify(e)));
  const runner = new Runner({
    deps: {
      llm,
      crawl: { policy: { allowPrivate: config.allowPrivateUrls } },
    },
    concurrency: config.runnerConcurrency,
    log: (m) => console.log(m),
  });
  const recovered = await runner.recover();
  if (recovered) console.log(`runner: resumed ${recovered} unfinished kit(s)`);

  const app = createApp(runner, llm);
  app.listen(config.port, () => console.log(`api listening on :${config.port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
