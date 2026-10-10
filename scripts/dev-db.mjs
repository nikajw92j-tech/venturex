// Starts a throwaway local PostgreSQL server for development when you don't
// have Postgres or Docker installed. Data lives in ./.devdb (git-ignored).
//   npm run db:local      → starts Postgres on port 5433 and keeps running
// Then set DATABASE_URL=postgresql://venturex:venturex@localhost:5433/venturex
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(".devdb");
const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "venturex",
  password: "venturex",
  port: 5433,
  persistent: true,
  // UTF-8 is required for Georgian and Russian content
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

// A crashed/killed server leaves postmaster.pid behind; remove it if that process is gone.
const pidFile = path.join(dataDir, "postmaster.pid");
if (fs.existsSync(pidFile)) {
  const pid = Number(fs.readFileSync(pidFile, "utf8").split(/\r?\n/)[0]);
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {}
  if (alive) {
    console.log(`Postgres already running (pid ${pid}) on port 5433`);
    process.exit(0);
  }
  fs.rmSync(pidFile);
}

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("venturex");

console.log("Local Postgres running: postgresql://venturex:venturex@localhost:5433/venturex");
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
