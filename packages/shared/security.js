"use strict";

// Entrada de servidor. O barrel público não carrega este módulo,
// porque o site estático não resolve node:crypto.
module.exports = require("./dist/security-f11/index.js");
