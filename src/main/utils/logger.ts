import log from 'electron-log/main';
import { app } from 'electron';
import path from 'node:path';

// Configure electron-log for production
log.initialize();

// Set log file location
log.transports.file.resolvePathFn = () => {
  return path.join(app.getPath('userData'), 'logs', 'main.log');
};

// File transport settings
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';

// Console transport: only in development
log.transports.console.level = app.isPackaged ? false : 'debug';

// File transport: always active
log.transports.file.level = 'info';

// Override console.log/error/warn so all existing code gets logged to file
// automatically. log.errorHandler.startCatching() only captures unhandled
// errors — it does NOT redirect console.log/warn/error. We must explicitly
// override them so that all the `console.log('[Setup] ...')` calls throughout
// the codebase are captured in the production log file.
log.errorHandler.startCatching();

// Redirect console methods to electron-log so production builds capture all output
if (app.isPackaged) {
  Object.assign(console, {
    log: log.info.bind(log),
    warn: log.warn.bind(log),
    error: log.error.bind(log),
    info: log.info.bind(log),
    debug: log.debug.bind(log),
  });
}

export default log;