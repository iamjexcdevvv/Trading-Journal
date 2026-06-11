const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

require('dotenv').config({
    path: envFile
});
require('./config/passport');

const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');

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

require('./startups/routes')(app);

app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running on port ' + (process.env.PORT || 3000));
});