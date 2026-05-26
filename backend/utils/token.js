const jwt = require("jsonwebtoken");

function generateJWTToken(payload, expiresIn = '2h') {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });  
}

module.exports = generateJWTToken;