const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

require('./startups/db')();

const app = express();

app.use(morgan('dev'));
app.use(helmet());

require('./startups/routes')(app);

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});