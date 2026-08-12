import { loadConfig } from '../src/foundation/config.js';
import { createLogger } from '../src/foundation/logger.js';
import { createDatabase, migrate } from '../src/foundation/database.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const db = createDatabase(config.database, logger);
try { await migrate(db, logger); logger.info('migrations complete'); }
finally { await db.end(); }
