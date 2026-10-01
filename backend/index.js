const { ConfigurationError } = require('./config/environment');
const { StartupError, start } = require('./startup');

if (require.main === module) {
    start().catch((error) => {
        if (error instanceof ConfigurationError || error instanceof StartupError) console.error(error.message);
        else console.error('Application startup failed');
        process.exitCode = 1;
    });
}

module.exports = { start };
