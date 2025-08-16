"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
// src/db.ts
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config(); // ensure env is loaded even if app.ts hasn't run yet
const pg_1 = require("pg");
// Optional override to force discrete mode
const forceDiscrete = process.env.FORCE_DB_DISCRETE === '1';
const useDiscrete = forceDiscrete ||
    !!process.env.PGUSER ||
    !!process.env.PGPASSWORD ||
    !!process.env.PGHOST ||
    !!process.env.PGDATABASE;
console.log(`DB config mode: ${useDiscrete ? 'discrete vars' : 'DATABASE_URL'}`);
exports.pool = useDiscrete
    ? new pg_1.Pool({
        user: process.env.PGUSER || 'strotadmin',
        // IMPORTANT: ensure it's a string; empty string is fine but undefined isn't
        password: (process.env.PGPASSWORD ?? ''),
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'strot_db',
    })
    : new pg_1.Pool({
        connectionString: process.env.DATABASE_URL,
    });
// Optional boot-time connectivity check
exports.pool
    .query('select current_user as user, current_database() as db')
    .then(r => {
    const row = r.rows?.[0];
    console.log(`✅ DB reachable: user=${row?.user}, db=${row?.db}`);
})
    .catch(e => {
    console.error('❌ DB not reachable:', e.code, e.message);
});
