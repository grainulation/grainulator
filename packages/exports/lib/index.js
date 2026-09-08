"use strict";

const formats = require("./formats.js");

const name = "mill";
const version = require("../package.json").version;
const description = "Turn wheat sprint artifacts into shareable formats";

module.exports = {
  name,
  version,
  description,
  ...formats,
};
