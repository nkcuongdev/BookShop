// Runs only the database-free suites, so the common edit-run loop does not pay
// for a dozen mongod startups. `npm test` still runs everything.
const { spawn } = require("child_process");
const path = require("path");

const listUnitTests = require("./list-unit-tests.js");

const child = spawn(
  process.execPath,
  ["--test", ...process.argv.slice(2), ...listUnitTests()],
  { stdio: "inherit", cwd: path.join(__dirname, "..") }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
