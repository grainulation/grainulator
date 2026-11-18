"use strict";

const formats = require("./formats.js");

const name = "exports";
const version = require("../package.json").version;
const description = "Turn evidence sprint artifacts into shareable formats";

module.exports = {
  name,
  version,
  description,
  ...formats,
};
