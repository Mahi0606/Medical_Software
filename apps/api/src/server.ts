import { buildApp } from './app.js';
import { startBackupScheduler } from './services/backup.js';
import { startMessagingDispatcher } from './services/messaging.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildApp();
app.listen({ port, host }).then(() => {
  startBackupScheduler(app);
  startMessagingDispatcher(app);
}).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
