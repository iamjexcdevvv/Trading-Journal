const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

require('dotenv').config({
    path: envFile
});
require('./config/passport');

const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ level: 'debug' }),
    new winston.transports.File({ filename: 'logs/errors.log', level: 'error' })
  ]
})

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    logger.on('finish', () => {
        process.exit(1);
    })
    logger.end();
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
    logger.on('finish', () => {
        process.exit(1);
    })
    logger.end();
});

require('./startups/db')();

const app = express();

if (app.get('env') === 'development') {
    app.use(morgan('dev'));
    console.log('Morgan enabled in development mode');
}
else {
    app.use(morgan('combined'));
}

app.use(helmet());

require('./startups/routes')(app, logger);

app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running on port ' + (process.env.PORT || 3000));
});