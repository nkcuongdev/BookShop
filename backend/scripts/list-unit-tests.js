// The suites split by what they actually touch, not by filename: anything that
// requires mongoose or a model needs a mongod and belongs to the slow suite.
// Filenames alone lie here (several *.test.js files without an ".integration"
// tag really are integration tests), so classify by content instead and stay
// correct as tests are added.
const fs = require("fs");
const path = require("path");

const TEST_DIR = path.join(__dirname, "..", "test");
const NEEDS_DB =
  /require\(["'](?:mongoose|mongodb-memory-server)["']\)|require\(["']\.\.\/src\/models/;

function listUnitTests() {
  const unit = fs
    .readdirSync(TEST_DIR)
    .filter((file) => file.endsWith(".test.js"))
    .filter((file) =>
      !NEEDS_DB.test(fs.readFileSync(path.join(TEST_DIR, file), "utf8"))
    )
    .map((file) => path.join("test", file));

  if (unit.length === 0) {
    throw new Error("No database-free test files found.");
  }
  return unit;
}

module.exports = listUnitTests;

// Also usable directly, for piping into other commands.
if (require.main === module) {
  process.stdout.write(listUnitTests().join(" "));
}
