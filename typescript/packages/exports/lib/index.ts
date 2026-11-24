import formats = require("./formats.js");

const name = "exports";
const version = require("../package.json").version;
const description = "Turn evidence sprint artifacts into shareable formats";

export = {
	name,
	version,
	description,
	...formats,
};
