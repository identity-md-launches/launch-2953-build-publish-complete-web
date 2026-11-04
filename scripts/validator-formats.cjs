// Used by the generator and bundled into the standalone browser module.
// Keep the BigInt comparison: Number would round uint64/96/256 boundary values.
module.exports = {};
for (const bits of [64, 96, 256]) {
  module.exports[`uint${bits}-decimal`] = {
    type: "string",
    validate: (value) =>
      /^(0|[1-9][0-9]*)$/.test(value) &&
      value.length <= 78 &&
      BigInt(value) < (1n << BigInt(bits)),
  };
}
