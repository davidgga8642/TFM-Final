import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OJO: esto apunta a backend/database.sqlite (lo mismo que db.js)
const dbPath = path.join(__dirname, "..", "database.sqlite");

sqlite3.verbose();
const db = new sqlite3.Database(dbPath);

db.get("SELECT COUNT(*) as c FROM users", (err, row) => {
  if (err) {
    console.error("❌ verify-db error:", err.message);
  } else {
    console.log("✅ USERS_IN_DB =", row.c);
  }
  db.close();
});