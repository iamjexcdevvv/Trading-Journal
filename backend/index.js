require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

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