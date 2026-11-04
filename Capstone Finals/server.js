import "dotenv/config";
import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3000);
const configuredReminderHours = Number(process.env.REMINDER_HOURS_BEFORE || 24);
const reminderHoursBefore = Number.isFinite(configuredReminderHours) ? Math.max(1, Math.floor(configuredReminderHours)) : 24;
const scrypt = promisify(scryptCallback);
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const databaseSsl = process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: true,
        ...(process.env.DB_SSL_CA ? { ca: readFileSync(process.env.DB_SSL_CA) } : {})
    }
    : undefined;

function normalizeDateColumn(value, fieldName) {
    if (value === undefined || value === null || value === "") return null;

    let year;
    let month;
    let day;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new TypeError(`${fieldName} must be a valid date.`);
        year = value.getFullYear();
        month = value.getMonth() + 1;
        day = value.getDate();
    } else if (typeof value === "string") {
        const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (dateOnly) {
            [, year, month, day] = dateOnly;
            year = Number(year);
            month = Number(month);
            day = Number(day);
        } else if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) throw new TypeError(`${fieldName} must be a valid date.`);
            year = parsed.getFullYear();
            month = parsed.getMonth() + 1;
            day = parsed.getDate();
        } else {
            throw new TypeError(`${fieldName} must be a valid date.`);
        }
    } else {
        throw new TypeError(`${fieldName} must be a valid date.`);
    }

    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() + 1 !== month || parsedDate.getUTCDate() !== day) {
        throw new TypeError(`${fieldName} must be a valid date.`);
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMaternalRecordUpdateError(error) {
    const connectionErrors = new Set([
        "ECONNREFUSED",
        "ETIMEDOUT",
        "PROTOCOL_CONNECTION_LOST",
        "ER_CON_COUNT_ERROR"
    ]);
    if (connectionErrors.has(error.code)) {
        return "MySQL is unavailable. Check that the database server is running and connection settings are correct.";
    }

    if (["ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR"].includes(error.code)) {
        return "The database schema is missing a required field or table. Check the schema and server console.";
    }

    if (["ER_TRUNCATED_WRONG_VALUE", "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD", "ER_DATA_OUT_OF_RANGE"].includes(error.code)) {
        return `The database rejected a field value (${error.code}). Check the date and numeric fields.`;
    }

    return `Maternal record update failed (${error.code || "database error"}). Check the server console for details.`;
}

app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use(express.static(currentDirectory));

const databasePool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "maternadb",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    ssl: databaseSsl,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: ["DATE"]
});
let inventoryTableSetup;
let authTableSetup;
let resourceNeedsTableSetup;
let supplyDistributionsTableSetup;
let maternalRecordColumnsSetup;
let prenatalVisitsTableSetup;

function hashSessionToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = await scrypt(password, salt, 64);
    return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
    const [algorithm, salt, hash] = String(storedHash || "").split("$");
    if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(hash || "")) return false;
    const derivedKey = await scrypt(password, salt, 64);
    return timingSafeEqual(derivedKey, Buffer.from(hash, "hex"));
}

async function ensureAuthTables() {
    if (!authTableSetup) {
        authTableSetup = (async () => {
            await databasePool.query(`
                CREATE TABLE IF NOT EXISTS app_users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(80) NOT NULL UNIQUE,
                    display_name VARCHAR(160) NOT NULL,
                    role ENUM('bhw', 'municipality', 'admin') NOT NULL,
                    barangay VARCHAR(120) NULL,
                    password_hash VARCHAR(200) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            const [barangayColumn] = await databasePool.execute(`
                SELECT COUNT(*) AS column_count
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'barangay'
            `);
            if (!Number(barangayColumn[0].column_count)) {
                await databasePool.query("ALTER TABLE app_users ADD COLUMN barangay VARCHAR(120) NULL AFTER role");
            }
            const [roleColumns] = await databasePool.execute(`
                SELECT COLUMN_TYPE AS column_type
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'role'
            `);
            if (roleColumns.length && !roleColumns[0].column_type.includes("'admin'")) {
                await databasePool.query("ALTER TABLE app_users MODIFY role ENUM('bhw', 'municipality', 'admin') NOT NULL");
            }
            await databasePool.query(`
                CREATE TABLE IF NOT EXISTS app_sessions (
                    token_hash CHAR(64) PRIMARY KEY,
                    user_id INT NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_app_sessions_expiry (expires_at),
                    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
                )
            `);

            const bootstrapAccounts = [
                {
                    username: process.env.BOOTSTRAP_BHW_USERNAME,
                    displayName: process.env.BOOTSTRAP_BHW_NAME,
                    password: process.env.BOOTSTRAP_BHW_PASSWORD,
                    role: "bhw",
                    barangay: process.env.BOOTSTRAP_BHW_BARANGAY || "Tagapo"
                },
                {
                    username: process.env.BOOTSTRAP_MUNICIPALITY_USERNAME,
                    displayName: process.env.BOOTSTRAP_MUNICIPALITY_NAME,
                    password: process.env.BOOTSTRAP_MUNICIPALITY_PASSWORD,
                    role: "municipality",
                    barangay: null
                },
                {
                    username: process.env.BOOTSTRAP_ADMIN_USERNAME,
                    displayName: process.env.BOOTSTRAP_ADMIN_NAME,
                    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
                    role: "admin",
                    barangay: null
                },
                {
                    username: process.env.BOOTSTRAP_BHW_APLAYA_USERNAME || "brgy.aplaya",
                    displayName: process.env.BOOTSTRAP_BHW_APLAYA_NAME || "Barangay Aplaya Health Worker",
                    password: process.env.BOOTSTRAP_BHW_APLAYA_PASSWORD,
                    role: "bhw",
                    barangay: "Aplaya"
                },
                {
                    username: process.env.BOOTSTRAP_BHW_CAINGIN_USERNAME || "brgy.caingin",
                    displayName: process.env.BOOTSTRAP_BHW_CAINGIN_NAME || "Barangay Caingin Health Worker",
                    password: process.env.BOOTSTRAP_BHW_CAINGIN_PASSWORD,
                    role: "bhw",
                    barangay: "Caingin"
                },
                {
                    username: process.env.BOOTSTRAP_BHW_DITA_USERNAME || "brgy.dita",
                    displayName: process.env.BOOTSTRAP_BHW_DITA_NAME || "Barangay Dita Health Worker",
                    password: process.env.BOOTSTRAP_BHW_DITA_PASSWORD,
                    role: "bhw",
                    barangay: "Dita"
                },
                {
                    username: process.env.BOOTSTRAP_BHW_TAGAPO_USERNAME || "brgy.tagapo",
                    displayName: process.env.BOOTSTRAP_BHW_TAGAPO_NAME || "Barangay Tagapo Health Worker",
                    password: process.env.BOOTSTRAP_BHW_TAGAPO_PASSWORD,
                    role: "bhw",
                    barangay: "Tagapo"
                }
            ].filter(account => account.username || account.password || account.displayName);

            for (const account of bootstrapAccounts) {
                if (!account.username || !account.displayName) {
                    throw new Error(`A username and display name are required for the ${account.role} account.`);
                }
                const normalizedUsername = account.username.trim().toLowerCase();
                if (!/^[a-z0-9._-]{3,80}$/.test(normalizedUsername) || account.displayName.trim().length > 160) {
                    throw new Error(`The ${account.role} account username or display name is invalid.`);
                }
                const [existing] = await databasePool.execute(
                    "SELECT id FROM app_users WHERE username = ? LIMIT 1",
                    [normalizedUsername]
                );
                if (existing.length) {
                    if (account.role === "bhw") {
                        await databasePool.execute(
                            "UPDATE app_users SET display_name = ?, role = 'bhw', barangay = ? WHERE id = ?",
                            [account.displayName.trim(), account.barangay, existing[0].id]
                        );
                    } else if (account.role === "admin") {
                        await databasePool.execute(
                            "UPDATE app_users SET display_name = ?, role = 'admin', barangay = NULL WHERE id = ?",
                            [account.displayName.trim(), existing[0].id]
                        );
                    }
                    continue;
                }

                const generatedPassword = !account.password && process.env.BOOTSTRAP_GENERATE_PASSWORDS !== "false"
                    ? randomBytes(18).toString("base64url")
                    : null;
                const initialPassword = account.password || generatedPassword;
                if (!initialPassword || initialPassword.length < 12) {
                    throw new Error(`Complete bootstrap username, name, and a 12-character password are required for the ${account.role} account.`);
                }
                await databasePool.execute(
                    "INSERT INTO app_users (username, display_name, role, barangay, password_hash) VALUES (?, ?, ?, ?, ?)",
                    [normalizedUsername, account.displayName.trim(), account.role, account.barangay, await hashPassword(initialPassword)]
                );
                if (generatedPassword) {
                    console.log(`Initial ${account.role} account created. One-time credentials — username: ${normalizedUsername}; password: ${generatedPassword}`);
                } else {
                    console.log(`Initial ${account.role} account created for ${normalizedUsername}.`);
                }
            }
        })().catch(error => {
            authTableSetup = null;
            throw error;
        });
    }
    await authTableSetup;
}

function getSessionToken(request) {
    const cookies = request.headers.cookie || "";
    const sessionCookie = cookies.split(";").map(value => value.trim()).find(value => value.startsWith("maternacare_session="));
    return sessionCookie ? decodeURIComponent(sessionCookie.slice("maternacare_session=".length)) : "";
}

function setSessionCookie(response, token) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.setHeader("Set-Cookie", `maternacare_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
}

function clearSessionCookie(response) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.setHeader("Set-Cookie", `maternacare_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

async function authenticate(request, response, next) {
    try {
        await ensureAuthTables();
        const token = getSessionToken(request);
        if (!token) return response.status(401).json({ error: "Please sign in." });
        const [rows] = await databasePool.execute(`
            SELECT u.id, u.username, u.display_name, u.role, u.barangay
            FROM app_sessions s
            INNER JOIN app_users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > NOW()
            LIMIT 1
        `, [hashSessionToken(token)]);
        if (!rows.length) {
            clearSessionCookie(response);
            return response.status(401).json({ error: "Your session has expired. Please sign in again." });
        }
        request.user = rows[0];
        return next();
    } catch (error) {
        console.error("Authentication check failed:", error.message);
        return response.status(503).json({ error: "Authentication service is unavailable." });
    }
}

async function ensureInventoryTable() {
    if (!inventoryTableSetup) {
        inventoryTableSetup = databasePool.query(`
            CREATE TABLE IF NOT EXISTS barangay_inventory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                barangay VARCHAR(120) NOT NULL,
                item_name VARCHAR(160) NOT NULL,
                category VARCHAR(80) NOT NULL,
                quantity DECIMAL(12, 2) UNSIGNED NOT NULL DEFAULT 0,
                unit VARCHAR(30) NOT NULL,
                minimum_quantity DECIMAL(12, 2) UNSIGNED NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_barangay_inventory_barangay (barangay),
                INDEX idx_barangay_inventory_item (item_name)
            )
        `).catch(error => {
            inventoryTableSetup = null;
            throw error;
        });
    }
    await inventoryTableSetup;
}

async function ensureResourceNeedsTable() {
    if (!resourceNeedsTableSetup) {
        resourceNeedsTableSetup = databasePool.query(`
            CREATE TABLE IF NOT EXISTS barangay_resource_needs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                barangay VARCHAR(120) NOT NULL,
                item_name VARCHAR(160) NOT NULL,
                category ENUM('Medicines', 'Medical supplies', 'Equipment', 'Services', 'Other resources') NOT NULL,
                quantity DECIMAL(12, 2) UNSIGNED NOT NULL,
                unit VARCHAR(30) NOT NULL,
                priority ENUM('Routine', 'High', 'Urgent') NOT NULL DEFAULT 'Routine',
                details TEXT NOT NULL,
                status ENUM('Submitted', 'Under Review', 'Approved', 'Fulfilled', 'Declined') NOT NULL DEFAULT 'Submitted',
                reviewed_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_barangay_resource_needs_barangay (barangay),
                INDEX idx_barangay_resource_needs_status (status),
                INDEX idx_barangay_resource_needs_priority (priority),
                FOREIGN KEY (reviewed_by) REFERENCES app_users(id) ON DELETE SET NULL
            )
        `).catch(error => {
            resourceNeedsTableSetup = null;
            throw error;
        });
    }
    await resourceNeedsTableSetup;
}

async function ensureSupplyDistributionsTable() {
    if (!supplyDistributionsTableSetup) {
        supplyDistributionsTableSetup = (async () => {
            await ensureInventoryTable();
            await ensureResourceNeedsTable();
            await databasePool.query(`
                CREATE TABLE IF NOT EXISTS barangay_supply_distributions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    inventory_id INT NULL,
                    resource_need_id INT NULL,
                    barangay VARCHAR(120) NOT NULL,
                    item_name VARCHAR(160) NOT NULL,
                    category VARCHAR(80) NOT NULL,
                    quantity DECIMAL(12, 2) UNSIGNED NOT NULL,
                    unit VARCHAR(30) NOT NULL,
                    distribution_date DATE NOT NULL,
                    notes TEXT,
                    distributed_by INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_supply_distributions_date (distribution_date),
                    INDEX idx_supply_distributions_barangay (barangay),
                    INDEX idx_supply_distributions_need (resource_need_id),
                    FOREIGN KEY (inventory_id) REFERENCES barangay_inventory(id) ON DELETE SET NULL,
                    FOREIGN KEY (resource_need_id) REFERENCES barangay_resource_needs(id) ON DELETE SET NULL,
                    FOREIGN KEY (distributed_by) REFERENCES app_users(id) ON DELETE SET NULL
                )
            `);
        })().catch(error => {
            supplyDistributionsTableSetup = null;
            throw error;
        });
    }
    await supplyDistributionsTableSetup;
}

async function ensureMaternalRecordColumns() {
    if (!maternalRecordColumnsSetup) {
        maternalRecordColumnsSetup = (async () => {
            const [columns] = await databasePool.execute(`
                SELECT COLUMN_NAME AS column_name
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'maternal_records'
                  AND COLUMN_NAME IN ('barangay', 'age', 'zone', 'archived', 'health_profile', 'pregnancy_history')
            `);
            const existingColumns = new Set(columns.map(column => column.column_name));
            if (!existingColumns.has("barangay")) {
                await databasePool.query("ALTER TABLE maternal_records ADD COLUMN barangay VARCHAR(120) NULL AFTER patient_id");
            }
            if (!existingColumns.has("age")) {
                await databasePool.query("ALTER TABLE maternal_records ADD COLUMN age INT NULL AFTER full_name");
            }
            if (!existingColumns.has("zone")) {
                await databasePool.query("ALTER TABLE maternal_records ADD COLUMN zone VARCHAR(100) NULL AFTER purok");
            }
            if (!existingColumns.has("archived")) {
                await databasePool.query("ALTER TABLE maternal_records ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE");
            }
            if (!existingColumns.has("health_profile")) {
                await databasePool.query("ALTER TABLE maternal_records ADD COLUMN health_profile JSON NULL");
            }
            if (!existingColumns.has("pregnancy_history")) {
                await databasePool.query("ALTER TABLE maternal_records ADD COLUMN pregnancy_history JSON NULL");
            }
        })().catch(error => {
            maternalRecordColumnsSetup = null;
            throw error;
        });
    }
    await maternalRecordColumnsSetup;
}

async function ensurePrenatalVisitsTable() {
    if (!prenatalVisitsTableSetup) {
        prenatalVisitsTableSetup = (async () => {
            await ensureMaternalRecordColumns();
            await databasePool.query(`
                CREATE TABLE IF NOT EXISTS vital_signs_entries (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    maternal_record_id INT NOT NULL,
                    recorded_by INT NULL,
                    date DATE NOT NULL,
                    blood_pressure VARCHAR(50),
                    pulse_rate VARCHAR(20),
                    respiratory_rate VARCHAR(20),
                    remarks TEXT,
                    aog VARCHAR(50),
                    height VARCHAR(20),
                    weight VARCHAR(20),
                    fundal_height VARCHAR(20),
                    fht VARCHAR(20),
                    presentation VARCHAR(100),
                    chief_complaint TEXT,
                    to_come_back DATE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (maternal_record_id) REFERENCES maternal_records(id) ON DELETE CASCADE,
                    INDEX idx_vital_signs_date (date)
                )
            `);
            const [columns] = await databasePool.execute(`
                SELECT COUNT(*) AS column_count
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'vital_signs_entries'
                  AND COLUMN_NAME = 'recorded_by'
            `);
            if (!Number(columns[0].column_count)) {
                await databasePool.query("ALTER TABLE vital_signs_entries ADD COLUMN recorded_by INT NULL AFTER maternal_record_id");
            }
        })().catch(error => {
            prenatalVisitsTableSetup = null;
            throw error;
        });
    }
    await prenatalVisitsTableSetup;
}

function prepareResourceNeed(body) {
    const source = body || {};
    const textFields = [
        ["item_name", "Resource or service", 160],
        ["category", "Category", 40],
        ["unit", "Unit", 30],
        ["priority", "Priority", 10],
        ["details", "Reason or details", 2000]
    ];
    for (const [field, label, maxLength] of textFields) {
        if (typeof source[field] !== "string" || !source[field].trim()) {
            return { error: `${label} is required.` };
        }
        if (source[field].trim().length > maxLength) {
            return { error: `${label} must be ${maxLength} characters or fewer.` };
        }
    }
    const categories = ["Medicines", "Medical supplies", "Equipment", "Services", "Other resources"];
    const priorities = ["Routine", "High", "Urgent"];
    if (!categories.includes(source.category)) return { error: "Choose a valid resource category." };
    if (!priorities.includes(source.priority)) return { error: "Choose a valid priority." };
    if (typeof source.quantity !== "number" || !Number.isFinite(source.quantity) || source.quantity <= 0 || source.quantity > 9999999999.99) {
        return { error: "Quantity needed must be a positive number within the supported range." };
    }
    return {
        values: [
            source.item_name.trim(),
            source.category,
            source.quantity,
            source.unit.trim(),
            source.priority,
            source.details.trim()
        ]
    };
}

function prepareInventoryEntry(body) {
    const source = body || {};
    const requiredText = (field, label, maxLength) => {
        if (typeof source[field] !== "string" || !source[field].trim()) {
            return { error: `${label} is required.` };
        }
        const value = source[field].trim();
        if (value.length > maxLength) return { error: `${label} must be ${maxLength} characters or fewer.` };
        return { value };
    };

    const barangay = requiredText("barangay", "Barangay", 120);
    const itemName = requiredText("item_name", "Resource name", 160);
    const category = requiredText("category", "Category", 80);
    const unit = requiredText("unit", "Unit", 30);
    for (const field of [barangay, itemName, category, unit]) {
        if (field.error) return { error: field.error };
    }

    const quantity = Number(source.quantity);
    const minimumQuantity = Number(source.minimum_quantity);
    const maxQuantity = 9999999999.99;
    if (typeof source.quantity !== "number" || !Number.isFinite(quantity) || quantity < 0 || quantity > maxQuantity) {
        return { error: "Available quantity must be a non-negative number within the supported range." };
    }
    if (typeof source.minimum_quantity !== "number" || !Number.isFinite(minimumQuantity) || minimumQuantity < 0 || minimumQuantity > maxQuantity) {
        return { error: "Minimum stock level must be a non-negative number within the supported range." };
    }
    if (source.notes !== undefined && (typeof source.notes !== "string" || source.notes.length > 2000)) {
        return { error: "Notes must be 2,000 characters or fewer." };
    }

    return {
        values: [
            barangay.value,
            itemName.value,
            category.value,
            quantity,
            unit.value,
            minimumQuantity,
            (source.notes || "").trim()
        ]
    };
}

function normalizePhilippineNumber(value) {
    const digits = String(value || "").replace(/[^0-9+]/g, "");
    if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
    if (/^639\d{9}$/.test(digits)) return `+${digits}`;
    if (/^\+639\d{9}$/.test(digits)) return digits;
    return null;
}

async function sendPhilSms(recipient, message) {
    const normalizedRecipient = normalizePhilippineNumber(recipient);
    if (!normalizedRecipient || typeof message !== "string" || !message.trim()) {
        throw new Error("A valid Philippine number and message are required.");
    }

    if (!process.env.PHILSMS_API_TOKEN || !process.env.PHILSMS_SENDER_ID) {
        throw new Error("PhilSMS environment variables are not configured.");
    }

    const philsmsResponse = await fetch(process.env.PHILSMS_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.PHILSMS_API_TOKEN}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            recipient: normalizedRecipient,
            sender_id: process.env.PHILSMS_SENDER_ID,
            message: message.trim()
        })
    });

    const result = await philsmsResponse.json().catch(() => ({}));
    if (!philsmsResponse.ok) {
        const providerMessage = result.message || result.error || result.errors?.[0]?.message;
        throw new Error(providerMessage || `PhilSMS rejected the request (${philsmsResponse.status}).`);
    }

    return { normalizedRecipient, result };
}

async function getNextPatientId() {
    const [rows] = await databasePool.execute(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(patient_id, 3) AS UNSIGNED)), 0) + 1 AS next_number
        FROM maternal_records
        WHERE patient_id REGEXP '^M-[0-9]+$'
    `);
    return `M-${String(rows[0].next_number).padStart(3, "0")}`;
}

app.get("/api/database-status", async (request, response) => {
    try {
        await databasePool.query("SELECT 1");
        return response.json({ connected: true });
    } catch (error) {
        return response.status(503).json({ connected: false, error: "MySQL is not connected." });
    }
});

app.post("/api/auth/login", async (request, response) => {
    const username = typeof request.body?.username === "string" ? request.body.username.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!username || !password) return response.status(400).json({ error: "Username and password are required." });

    try {
        await ensureAuthTables();
        const [users] = await databasePool.execute(
            "SELECT id, username, display_name, role, barangay, password_hash FROM app_users WHERE username = ? LIMIT 1",
            [username]
        );
        if (!users.length || !await verifyPassword(password, users[0].password_hash)) {
            return response.status(401).json({ error: "Incorrect username or password." });
        }

        const token = randomBytes(32).toString("base64url");
        await databasePool.execute("DELETE FROM app_sessions WHERE expires_at <= NOW()");
        await databasePool.execute(
            "INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))",
            [hashSessionToken(token), users[0].id]
        );
        setSessionCookie(response, token);
        return response.json({
            id: users[0].id,
            username: users[0].username,
            displayName: users[0].display_name,
            role: users[0].role,
            barangay: users[0].barangay
        });
    } catch (error) {
        console.error("Sign-in failed:", error.message);
        return response.status(503).json({ error: "Sign-in is unavailable. Check the database connection." });
    }
});

app.get("/api/auth/session", async (request, response) => {
    try {
        await ensureAuthTables();
        const token = getSessionToken(request);
        if (!token) return response.json({ authenticated: false });
        const [rows] = await databasePool.execute(`
            SELECT u.id, u.username, u.display_name, u.role, u.barangay
            FROM app_sessions s
            INNER JOIN app_users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > NOW()
            LIMIT 1
        `, [hashSessionToken(token)]);
        if (!rows.length) {
            clearSessionCookie(response);
            return response.json({ authenticated: false });
        }
        const { id, username, display_name: displayName, role, barangay } = rows[0];
        return response.json({ authenticated: true, id, username, displayName, role, barangay });
    } catch (error) {
        console.error("Session lookup failed:", error.message);
        return response.status(503).json({ error: "Authentication service is unavailable." });
    }
});

app.post("/api/auth/logout", async (request, response) => {
    try {
        await ensureAuthTables();
        const token = getSessionToken(request);
        if (token) {
            await databasePool.execute("DELETE FROM app_sessions WHERE token_hash = ?", [hashSessionToken(token)]);
        }
        clearSessionCookie(response);
        return response.status(204).end();
    } catch (error) {
        console.error("Sign-out failed:", error.message);
        return response.status(503).json({ error: "Sign-out failed. Please try again." });
    }
});

app.use("/api", authenticate);

app.use("/api", (request, response, next) => {
    if (request.user.role !== "admin") return next();

    const isAdminAccountRoute = request.path === "/admin/users"
        && ["GET", "POST"].includes(request.method);
    const isAdminPasswordResetRoute = request.method === "POST"
        && /^\/admin\/users\/\d+\/password$/.test(request.path);
    const isOwnPasswordRoute = request.method === "POST" && request.path === "/auth/password";
    if (isAdminAccountRoute || isAdminPasswordResetRoute || isOwnPasswordRoute) return next();

    return response.status(403).json({ error: "Admin accounts can only manage user accounts and their own password." });
});

app.get("/api/admin/users", async (request, response) => {
    if (request.user.role !== "admin") {
        return response.status(403).json({ error: "Administrator access is required to manage user accounts." });
    }

    try {
        const [users] = await databasePool.execute(`
            SELECT id, username, display_name, role, barangay, created_at
            FROM app_users
            ORDER BY role ASC, display_name ASC, username ASC
        `);
        return response.json(users);
    } catch (error) {
        console.error("Admin account list failed:", error.message);
        return response.status(503).json({ error: "User accounts could not be loaded." });
    }
});

app.post("/api/admin/users", async (request, response) => {
    if (request.user.role !== "admin") {
        return response.status(403).json({ error: "Administrator access is required to create user accounts." });
    }

    const username = typeof request.body?.username === "string" ? request.body.username.trim().toLowerCase() : "";
    const displayName = typeof request.body?.displayName === "string" ? request.body.displayName.trim() : "";
    const role = request.body?.role;
    const barangay = role === "bhw" && typeof request.body?.barangay === "string"
        ? request.body.barangay.trim()
        : null;
    const password = typeof request.body?.password === "string" ? request.body.password : "";

    if (!/^[a-z0-9._-]{3,80}$/.test(username)) {
        return response.status(400).json({ error: "Username must be 3–80 characters and use letters, numbers, dots, underscores, or hyphens." });
    }
    if (!displayName || displayName.length > 160) {
        return response.status(400).json({ error: "Display name is required and must be 160 characters or fewer." });
    }
    if (!["bhw", "municipality", "admin"].includes(role)) {
        return response.status(400).json({ error: "Choose a valid account role." });
    }
    if (role === "bhw" && (!barangay || barangay.length > 120)) {
        return response.status(400).json({ error: "A barangay of 1–120 characters is required for BHW accounts." });
    }
    if (password.length < 12 || password.length > 128) {
        return response.status(400).json({ error: "Password must be between 12 and 128 characters." });
    }

    try {
        const [result] = await databasePool.execute(`
            INSERT INTO app_users (username, display_name, role, barangay, password_hash)
            VALUES (?, ?, ?, ?, ?)
        `, [username, displayName, role, barangay, await hashPassword(password)]);
        return response.status(201).json({ id: result.insertId });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return response.status(409).json({ error: "That username is already in use." });
        }
        console.error("Admin account creation failed:", error.message);
        return response.status(503).json({ error: "The user account could not be created." });
    }
});

app.post("/api/admin/users/:id/password", async (request, response) => {
    if (request.user.role !== "admin") {
        return response.status(403).json({ error: "Administrator access is required to reset account passwords." });
    }

    const userId = Number(request.params.id);
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return response.status(400).json({ error: "A valid user account is required." });
    }
    if (userId === request.user.id) {
        return response.status(400).json({ error: "Use Change password to update your own password." });
    }
    if (password.length < 12 || password.length > 128) {
        return response.status(400).json({ error: "Password must be between 12 and 128 characters." });
    }

    try {
        const [result] = await databasePool.execute(
            "UPDATE app_users SET password_hash = ? WHERE id = ?",
            [await hashPassword(password), userId]
        );
        if (!result.affectedRows) return response.status(404).json({ error: "User account was not found." });
        await databasePool.execute("DELETE FROM app_sessions WHERE user_id = ?", [userId]);
        return response.status(204).end();
    } catch (error) {
        console.error("Admin password reset failed:", error.message);
        return response.status(503).json({ error: "The account password could not be reset." });
    }
});

app.get("/api/mothers", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required to view maternal records." });
    }

    try {
        await ensureMaternalRecordColumns();
        const [rows] = await databasePool.execute(`
            SELECT patient_id, barangay, full_name, age, zone, date_of_birth, husband_name, delivery_type, gender,
                   remarks, address, purok, contact_number, email, blood_pressure, chief_complaint,
                   pulse_rate, respiratory_rate, last_menstrual_period, expected_delivery_date,
                   para, abortion, living_children, age_of_gestation, weight, height, fetal_heart_tone,
                   presentation, fundal_height, next_appointment, term, preterm, high_risk,
                   barangay_residency_number, manual_gravida, health_profile, pregnancy_history
            FROM maternal_records
            WHERE barangay = ? AND archived = FALSE
            ORDER BY full_name ASC, patient_id ASC
        `, [request.user.barangay]);
        return response.json(rows.map(row => ({
            ...row,
            id: row.patient_id,
            name: row.full_name,
            contact: row.contact_number || "",
            lmp: row.last_menstrual_period,
            g: Number.parseInt(String(row.manual_gravida || "").replace(/\D/g, ""), 10) || 1,
            p: Number(row.para) || 0,
            t: Number(row.term) || 0,
            pr: Number(row.preterm) || 0,
            a: Number(row.abortion) || 0,
            l: Number(row.living_children) || 0,
            isHighRisk: Boolean(row.high_risk),
            health_profile: typeof row.health_profile === "string"
                ? JSON.parse(row.health_profile)
                : row.health_profile || {},
            pregnancy_history: typeof row.pregnancy_history === "string"
                ? JSON.parse(row.pregnancy_history)
                : row.pregnancy_history || {},
            databaseSaved: true
        })));
    } catch (error) {
        console.error("Maternal records load failed:", error.message);
        return response.status(503).json({ error: "Maternal records are unavailable. Check the database connection." });
    }
});

app.get("/api/appointments", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required to view appointments." });
    }

    try {
        await ensureMaternalRecordColumns();
        const [rows] = await databasePool.execute(`
            SELECT a.id AS database_id, m.patient_id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
                   TIME_FORMAT(a.appointment_time, '%H:%i') AS appointment_time, a.purpose, a.status
            FROM appointments a
            INNER JOIN maternal_records m ON m.id = a.maternal_record_id
            WHERE m.barangay = ? AND m.archived = FALSE AND a.status = 'Scheduled'
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
        `, [request.user.barangay]);
        return response.json(rows.map(row => ({
            id: `A-${row.database_id}`,
            databaseId: row.database_id,
            motherId: row.patient_id,
            date: row.appointment_date,
            time: row.appointment_time,
            purpose: row.purpose,
            status: row.status
        })));
    } catch (error) {
        console.error("Appointments load failed:", error.message);
        return response.status(503).json({ error: "Appointments are unavailable. Check the database connection." });
    }
});

app.post("/api/auth/password", async (request, response) => {
    const currentPassword = typeof request.body?.currentPassword === "string" ? request.body.currentPassword : "";
    const newPassword = typeof request.body?.newPassword === "string" ? request.body.newPassword : "";
    if (newPassword.length < 12 || newPassword.length > 128) {
        return response.status(400).json({ error: "The new password must be between 12 and 128 characters." });
    }

    try {
        const [users] = await databasePool.execute(
            "SELECT password_hash FROM app_users WHERE id = ? LIMIT 1",
            [request.user.id]
        );
        if (!users.length || !await verifyPassword(currentPassword, users[0].password_hash)) {
            return response.status(400).json({ error: "The current password is incorrect." });
        }
        const token = getSessionToken(request);
        const tokenHash = hashSessionToken(token);
        await databasePool.execute(
            "UPDATE app_users SET password_hash = ? WHERE id = ?",
            [await hashPassword(newPassword), request.user.id]
        );
        await databasePool.execute(
            "DELETE FROM app_sessions WHERE user_id = ? AND token_hash <> ?",
            [request.user.id, tokenHash]
        );
        return response.status(204).end();
    } catch (error) {
        console.error("Password update failed:", error.message);
        return response.status(503).json({ error: "Password could not be updated. Please try again." });
    }
});

app.get("/api/inventory", async (request, response) => {
    try {
        await ensureInventoryTable();
        const query = `
            SELECT id, barangay, item_name, category, quantity, unit, minimum_quantity, notes, updated_at
            FROM barangay_inventory
            ${request.user.role === "bhw" ? "WHERE barangay = ?" : ""}
            ORDER BY barangay ASC, item_name ASC
        `;
        const [rows] = await databasePool.execute(query, request.user.role === "bhw" ? [request.user.barangay] : []);
        return response.json(rows);
    } catch (error) {
        console.error("Resource inventory load failed:", error.message);
        return response.status(503).json({ error: "Resource inventory is unavailable. Check that MySQL is running and the database credentials are correct." });
    }
});

app.post("/api/inventory", async (request, response) => {
    if (request.user.role === "bhw" && request.body?.barangay !== request.user.barangay) {
        return response.status(403).json({ error: "You can only manage inventory for your assigned barangay." });
    }
    const prepared = prepareInventoryEntry(request.body);
    if (prepared.error) return response.status(400).json({ error: prepared.error });

    try {
        await ensureInventoryTable();
        const [result] = await databasePool.execute(`
            INSERT INTO barangay_inventory (barangay, item_name, category, quantity, unit, minimum_quantity, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, prepared.values);
        return response.status(201).json({ id: result.insertId });
    } catch (error) {
        console.error("Resource inventory save failed:", error.message);
        return response.status(503).json({ error: "Resource inventory could not be saved. Check the MySQL connection." });
    }
});

app.put("/api/inventory/:id", async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return response.status(400).json({ error: "A valid resource ID is required." });
    }
    const prepared = prepareInventoryEntry(request.body);
    if (prepared.error) return response.status(400).json({ error: prepared.error });
    if (request.user.role === "bhw" && request.body?.barangay !== request.user.barangay) {
        return response.status(403).json({ error: "You can only manage inventory for your assigned barangay." });
    }

    try {
        await ensureInventoryTable();
        const [existingRows] = await databasePool.execute(
            `SELECT id FROM barangay_inventory WHERE id = ? ${request.user.role === "bhw" ? "AND barangay = ?" : ""} LIMIT 1`,
            request.user.role === "bhw" ? [id, request.user.barangay] : [id]
        );
        if (!existingRows.length) return response.status(404).json({ error: "Resource not found." });
        await databasePool.execute(`
            UPDATE barangay_inventory
            SET barangay = ?, item_name = ?, category = ?, quantity = ?, unit = ?, minimum_quantity = ?, notes = ?
            WHERE id = ?
        `, [...prepared.values, id]);
        return response.json({ id });
    } catch (error) {
        console.error("Resource inventory update failed:", error.message);
        return response.status(503).json({ error: "Resource inventory could not be updated. Check the MySQL connection." });
    }
});

app.delete("/api/inventory/:id", async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
        return response.status(400).json({ error: "A valid resource ID is required." });
    }

    try {
        await ensureInventoryTable();
        const [result] = await databasePool.execute(
            `DELETE FROM barangay_inventory WHERE id = ? ${request.user.role === "bhw" ? "AND barangay = ?" : ""}`,
            request.user.role === "bhw" ? [id, request.user.barangay] : [id]
        );
        if (!result.affectedRows) return response.status(404).json({ error: "Resource not found." });
        return response.status(204).end();
    } catch (error) {
        console.error("Resource inventory deletion failed:", error.message);
        return response.status(503).json({ error: "Resource inventory could not be deleted. Check the MySQL connection." });
    }
});

app.get("/api/resource-needs", async (request, response) => {
    try {
        await ensureResourceNeedsTable();
        const [rows] = await databasePool.execute(`
            SELECT n.id, n.barangay, n.item_name, n.category, n.quantity, n.unit, n.priority,
                   n.details, n.status, n.created_at, n.updated_at,
                   reviewer.display_name AS reviewed_by_name
            FROM barangay_resource_needs n
            LEFT JOIN app_users reviewer ON reviewer.id = n.reviewed_by
            ${request.user.role === "bhw" ? "WHERE n.barangay = ?" : ""}
            ORDER BY FIELD(n.status, 'Submitted', 'Under Review', 'Approved', 'Declined', 'Fulfilled'),
                     FIELD(n.priority, 'Urgent', 'High', 'Routine'),
                     n.created_at DESC
        `, request.user.role === "bhw" ? [request.user.barangay] : []);
        return response.json(rows);
    } catch (error) {
        console.error("Resource needs load failed:", error.message);
        return response.status(503).json({ error: "Reported resource needs are unavailable. Check the database connection." });
    }
});

app.post("/api/resource-needs", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "Only an assigned barangay account can submit a resource need." });
    }
    const prepared = prepareResourceNeed(request.body);
    if (prepared.error) return response.status(400).json({ error: prepared.error });
    try {
        await ensureResourceNeedsTable();
        const [result] = await databasePool.execute(`
            INSERT INTO barangay_resource_needs
                (barangay, item_name, category, quantity, unit, priority, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [request.user.barangay, ...prepared.values]);
        return response.status(201).json({ id: result.insertId, status: "Submitted" });
    } catch (error) {
        console.error("Resource need submission failed:", error.message);
        return response.status(503).json({ error: "Resource need could not be submitted. Check the database connection." });
    }
});

app.patch("/api/resource-needs/:id/status", async (request, response) => {
    if (request.user.role !== "municipality") {
        return response.status(403).json({ error: "Only municipality officials can review resource needs." });
    }
    const id = Number(request.params.id);
    const status = request.body?.status;
    const allowedStatuses = ["Under Review", "Approved", "Fulfilled", "Declined"];
    if (!Number.isSafeInteger(id) || id < 1) {
        return response.status(400).json({ error: "A valid resource need ID is required." });
    }
    if (!allowedStatuses.includes(status)) {
        return response.status(400).json({ error: "Choose a valid review status." });
    }
    try {
        await ensureResourceNeedsTable();
        const [result] = await databasePool.execute(`
            UPDATE barangay_resource_needs
            SET status = ?, reviewed_by = ?
            WHERE id = ?
        `, [status, request.user.id, id]);
        if (!result.affectedRows) {
            const [existing] = await databasePool.execute("SELECT id FROM barangay_resource_needs WHERE id = ? LIMIT 1", [id]);
            if (!existing.length) return response.status(404).json({ error: "Resource need not found." });
        }
        return response.json({ id, status });
    } catch (error) {
        console.error("Resource need review update failed:", error.message);
        return response.status(503).json({ error: "Resource need status could not be updated. Check the database connection." });
    }
});

app.get("/api/supply-distributions", async (request, response) => {
    if (request.user.role !== "municipality") {
        return response.status(403).json({ error: "Only municipality officials can view supply distributions." });
    }

    try {
        await ensureSupplyDistributionsTable();
        const [rows] = await databasePool.execute(`
            SELECT d.id, d.inventory_id, d.resource_need_id, d.barangay, d.item_name, d.category,
                   d.quantity, d.unit, DATE_FORMAT(d.distribution_date, '%Y-%m-%d') AS distribution_date,
                   d.notes, d.created_at, distributor.display_name AS distributed_by_name,
                   need.item_name AS requested_item_name
            FROM barangay_supply_distributions d
            LEFT JOIN app_users distributor ON distributor.id = d.distributed_by
            LEFT JOIN barangay_resource_needs need ON need.id = d.resource_need_id
            ORDER BY d.distribution_date DESC, d.id DESC
        `);
        return response.json(rows);
    } catch (error) {
        console.error("Supply distributions load failed:", error.message);
        return response.status(503).json({ error: "Supply distributions are unavailable. Check the database connection." });
    }
});

app.post("/api/supply-distributions", async (request, response) => {
    if (request.user.role !== "municipality") {
        return response.status(403).json({ error: "Only municipality officials can record supply distributions." });
    }

    const inventoryId = Number(request.body?.inventory_id);
    const rawQuantity = request.body?.quantity;
    const quantityText = String(rawQuantity ?? "");
    const quantity = Number(rawQuantity);
    const resourceNeedId = request.body?.resource_need_id === undefined
        || request.body.resource_need_id === null
        || request.body.resource_need_id === ""
        ? null
        : Number(request.body.resource_need_id);
    let distributionDate;
    try {
        distributionDate = normalizeDateColumn(request.body?.distribution_date, "Distribution date");
    } catch (error) {
        return response.status(400).json({ error: error.message });
    }
    const notes = typeof request.body?.notes === "string" ? request.body.notes.trim() : "";

    if (!Number.isSafeInteger(inventoryId) || inventoryId < 1) {
        return response.status(400).json({ error: "Choose a valid barangay inventory item." });
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(quantityText) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 9999999999.99) {
        return response.status(400).json({ error: "Distribution quantity must be greater than zero and have no more than two decimal places." });
    }
    const quantityCents = Math.round(quantity * 100);
    if (resourceNeedId !== null && (!Number.isSafeInteger(resourceNeedId) || resourceNeedId < 1)) {
        return response.status(400).json({ error: "Choose a valid resource request or leave it blank." });
    }
    if (!distributionDate) {
        return response.status(400).json({ error: "A distribution date is required." });
    }
    if (request.body?.notes !== undefined && (typeof request.body.notes !== "string" || request.body.notes.length > 2000)) {
        return response.status(400).json({ error: "Notes must be 2,000 characters or fewer." });
    }

    let connection;
    let transactionStarted = false;
    try {
        await ensureSupplyDistributionsTable();
        connection = await databasePool.getConnection();
        await connection.beginTransaction();
        transactionStarted = true;

        const [inventoryRows] = await connection.execute(`
            SELECT id, barangay, item_name, category, quantity, unit
            FROM barangay_inventory
            WHERE id = ?
            FOR UPDATE
        `, [inventoryId]);
        if (!inventoryRows.length) {
            await connection.rollback();
            transactionStarted = false;
            return response.status(404).json({ error: "The selected barangay inventory item was not found." });
        }
        const inventoryItem = inventoryRows[0];
        const newInventoryQuantityCents = Math.round(Number(inventoryItem.quantity) * 100) + quantityCents;
        if (newInventoryQuantityCents > 999999999999) {
            await connection.rollback();
            transactionStarted = false;
            return response.status(400).json({ error: "This distribution would exceed the maximum quantity the inventory can store." });
        }
        const newInventoryQuantity = newInventoryQuantityCents / 100;

        let nextRequestStatus = null;
        if (resourceNeedId !== null) {
            const [needRows] = await connection.execute(`
                SELECT id, barangay, item_name, category, quantity, unit, status
                FROM barangay_resource_needs
                WHERE id = ?
                FOR UPDATE
            `, [resourceNeedId]);
            if (!needRows.length) {
                await connection.rollback();
                transactionStarted = false;
                return response.status(404).json({ error: "The linked resource request was not found." });
            }

            const need = needRows[0];
            const sameItem = String(need.item_name).trim().toLowerCase() === String(inventoryItem.item_name).trim().toLowerCase();
            const sameCategory = String(need.category).trim().toLowerCase() === String(inventoryItem.category).trim().toLowerCase();
            const sameUnit = String(need.unit).trim().toLowerCase() === String(inventoryItem.unit).trim().toLowerCase();
            if (need.barangay !== inventoryItem.barangay || !sameItem || !sameCategory || !sameUnit) {
                await connection.rollback();
                transactionStarted = false;
                return response.status(400).json({ error: "The linked request must match the selected inventory item, category, unit, and barangay." });
            }
            if (["Fulfilled", "Declined"].includes(need.status)) {
                await connection.rollback();
                transactionStarted = false;
                return response.status(400).json({ error: "A fulfilled or declined request cannot receive another distribution." });
            }

            const [distributionTotals] = await connection.execute(`
                SELECT COALESCE(SUM(quantity), 0) AS quantity_distributed
                FROM barangay_supply_distributions
                WHERE resource_need_id = ?
            `, [resourceNeedId]);
            const totalAfterDistributionCents = Math.round(Number(distributionTotals[0].quantity_distributed) * 100) + quantityCents;
            const requestedQuantityCents = Math.round(Number(need.quantity) * 100);
            if (totalAfterDistributionCents > requestedQuantityCents) {
                await connection.rollback();
                transactionStarted = false;
                return response.status(400).json({ error: "Distribution quantity exceeds the remaining amount on this request." });
            }
            nextRequestStatus = totalAfterDistributionCents >= requestedQuantityCents ? "Fulfilled" : "Approved";
        }

        await connection.execute(`
            INSERT INTO barangay_supply_distributions
                (inventory_id, resource_need_id, barangay, item_name, category, quantity, unit, distribution_date, notes, distributed_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            inventoryItem.id,
            resourceNeedId,
            inventoryItem.barangay,
            inventoryItem.item_name,
            inventoryItem.category,
            quantityText,
            inventoryItem.unit,
            distributionDate,
            notes,
            request.user.id
        ]);
        await connection.execute(
            "UPDATE barangay_inventory SET quantity = ? WHERE id = ?",
            [newInventoryQuantity, inventoryItem.id]
        );
        if (nextRequestStatus) {
            await connection.execute(`
                UPDATE barangay_resource_needs
                SET status = ?, reviewed_by = ?
                WHERE id = ?
            `, [nextRequestStatus, request.user.id, resourceNeedId]);
        }
        await connection.commit();
        transactionStarted = false;
        return response.status(201).json({
            inventory_id: inventoryItem.id,
            quantity: newInventoryQuantity,
            resource_need_status: nextRequestStatus
        });
    } catch (error) {
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error("Supply distribution rollback failed:", rollbackError.message);
            }
        }
        console.error("Supply distribution save failed:", error.message);
        return response.status(503).json({ error: "Supply distribution could not be recorded. Check the database connection." });
    } finally {
        if (connection) connection.release();
    }
});

function preparePrenatalVisit(body) {
    const source = body || {};
    const validDate = value => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!validDate(source.date)) return { error: "A valid visit date is required." };

    const optionalText = (field, label, maxLength) => {
        const value = source[field];
        if (value === undefined || value === null || value === "") return { value: null };
        if (typeof value !== "string") return { error: `${label} must be text.` };
        const trimmed = value.trim();
        if (trimmed.length > maxLength) return { error: `${label} must be ${maxLength} characters or fewer.` };
        return { value: trimmed || null };
    };
    const optionalMeasurement = (field, label, maxLength = 20) => {
        const value = source[field];
        if (value === undefined || value === null || value === "") return { value: null };
        if ((typeof value !== "string" && typeof value !== "number") || !/^\d{1,4}(\.\d{1,2})?$/.test(String(value).trim())) {
            return { error: `${label} must be a non-negative number.` };
        }
        const normalized = String(value).trim();
        if (normalized.length > maxLength) return { error: `${label} is too long.` };
        return { value: normalized };
    };

    const bloodPressure = optionalText("blood_pressure", "Blood pressure", 50);
    const pulseRate = optionalMeasurement("pulse_rate", "Pulse rate");
    const respiratoryRate = optionalMeasurement("respiratory_rate", "Respiratory rate");
    const aog = optionalMeasurement("aog", "Gestational age");
    const height = optionalMeasurement("height", "Height");
    const weight = optionalMeasurement("weight", "Weight");
    const fundalHeight = optionalMeasurement("fundal_height", "Fundal height");
    const fetalHeartTone = optionalMeasurement("fht", "Fetal heart tone");
    const presentation = optionalText("presentation", "Presentation", 100);
    const chiefComplaint = optionalText("chief_complaint", "Notes", 2000);
    const toComeBack = source.to_come_back === undefined || source.to_come_back === null || source.to_come_back === ""
        ? { value: null }
        : validDate(source.to_come_back)
            ? { value: source.to_come_back }
            : { error: "Next follow-up date must be a valid date." };
    const fields = [bloodPressure, pulseRate, respiratoryRate, aog, height, weight, fundalHeight, fetalHeartTone, presentation, chiefComplaint, toComeBack];
    const invalidField = fields.find(field => field.error);
    if (invalidField) return { error: invalidField.error };

    return {
        values: [
            source.date,
            bloodPressure.value,
            pulseRate.value,
            respiratoryRate.value,
            null,
            aog.value,
            height.value,
            weight.value,
            fundalHeight.value,
            fetalHeartTone.value,
            presentation.value,
            chiefComplaint.value,
            toComeBack.value
        ]
    };
}

app.get("/api/mothers/:patientId/prenatal-visits", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required." });
    }
    const patientId = String(request.params.patientId || "").trim();
    if (!patientId || patientId.length > 50) return response.status(400).json({ error: "A valid patient ID is required." });

    try {
        await ensurePrenatalVisitsTable();
        const [mothers] = await databasePool.execute(
            "SELECT id FROM maternal_records WHERE patient_id = ? AND barangay = ? AND archived = FALSE LIMIT 1",
            [patientId, request.user.barangay]
        );
        if (!mothers.length) return response.status(404).json({ error: "This mother record is not available to your barangay." });

        const [visits] = await databasePool.execute(`
            SELECT v.id, v.date, v.blood_pressure, v.pulse_rate, v.respiratory_rate, v.remarks, v.aog, v.height,
                   v.weight, v.fundal_height, v.fht, v.presentation, v.chief_complaint, v.to_come_back,
                   v.created_at, u.display_name AS recorded_by_name
            FROM vital_signs_entries v
            LEFT JOIN app_users u ON u.id = v.recorded_by
            WHERE v.maternal_record_id = ?
            ORDER BY v.date DESC, v.id DESC
        `, [mothers[0].id]);
        return response.json(visits);
    } catch (error) {
        console.error("Prenatal visit history load failed:", error.message);
        return response.status(503).json({ error: "Prenatal visit history is unavailable. Check the database connection." });
    }
});

app.post("/api/mothers/:patientId/prenatal-visits", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required." });
    }
    const patientId = String(request.params.patientId || "").trim();
    if (!patientId || patientId.length > 50) return response.status(400).json({ error: "A valid patient ID is required." });
    const prepared = preparePrenatalVisit(request.body);
    if (prepared.error) return response.status(400).json({ error: prepared.error });

    try {
        await ensurePrenatalVisitsTable();
        const [mothers] = await databasePool.execute(
            "SELECT id FROM maternal_records WHERE patient_id = ? AND barangay = ? AND archived = FALSE LIMIT 1",
            [patientId, request.user.barangay]
        );
        if (!mothers.length) return response.status(404).json({ error: "This mother record is not available to your barangay." });

        const [result] = await databasePool.execute(`
            INSERT INTO vital_signs_entries (
                maternal_record_id, recorded_by, date, blood_pressure, pulse_rate, respiratory_rate, remarks,
                aog, height, weight, fundal_height, fht, presentation, chief_complaint, to_come_back
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [mothers[0].id, request.user.id, ...prepared.values]);
        return response.status(201).json({ id: result.insertId });
    } catch (error) {
        console.error("Prenatal visit save failed:", error.message);
        return response.status(503).json({ error: "Prenatal visit could not be saved. Check the database connection." });
    }
});

app.post("/api/mothers", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required to register a mother." });
    }
    const mother = request.body || {};
    if (!mother.patient_id || !mother.full_name || !mother.contact_number) {
        return response.status(400).json({ error: "Patient ID, full name, and contact number are required." });
    }

    let dateColumns;
    try {
        dateColumns = {
            dateOfBirth: normalizeDateColumn(mother.date_of_birth, "Date of birth"),
            lastMenstrualPeriod: normalizeDateColumn(mother.last_menstrual_period, "Last menstrual period"),
            expectedDeliveryDate: normalizeDateColumn(mother.expected_delivery_date, "Expected delivery date"),
            nextAppointment: normalizeDateColumn(mother.next_appointment, "Next appointment")
        };
    } catch (error) {
        return response.status(400).json({ error: error.message });
    }

    const valueOrNull = value => value === "" || value === undefined ? null : value;
    const query = `
        INSERT INTO maternal_records (
            patient_id, barangay, full_name, age, zone, date_of_birth, husband_name, delivery_type, gender,
            remarks, form_timestamp, address, purok, contact_number, email,
            blood_pressure, chief_complaint, pulse_rate, respiratory_rate,
            last_menstrual_period, expected_delivery_date, para, abortion, living_children,
            age_of_gestation, weight, height, fetal_heart_tone, presentation, fundal_height,
            next_appointment, term, preterm, high_risk, barangay_residency_number, manual_gravida,
            health_profile, pregnancy_history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        await ensureMaternalRecordColumns();
        const patientId = await getNextPatientId();
        const values = [
            patientId, request.user.barangay, mother.full_name, valueOrNull(mother.age), valueOrNull(mother.zone),
            dateColumns.dateOfBirth,
            valueOrNull(mother.husband_name), valueOrNull(mother.delivery_type), valueOrNull(mother.gender),
            valueOrNull(mother.remarks), new Date(), valueOrNull(mother.address), valueOrNull(mother.purok),
            mother.contact_number, valueOrNull(mother.email), valueOrNull(mother.blood_pressure),
            valueOrNull(mother.chief_complaint), valueOrNull(mother.pulse_rate), valueOrNull(mother.respiratory_rate),
            dateColumns.lastMenstrualPeriod, dateColumns.expectedDeliveryDate,
            valueOrNull(mother.para), valueOrNull(mother.abortion), valueOrNull(mother.living_children),
            valueOrNull(mother.age_of_gestation), valueOrNull(mother.weight), valueOrNull(mother.height),
            valueOrNull(mother.fetal_heart_tone), valueOrNull(mother.presentation), valueOrNull(mother.fundal_height),
            dateColumns.nextAppointment, valueOrNull(mother.term), valueOrNull(mother.preterm),
            Boolean(mother.high_risk), valueOrNull(mother.barangay_residency_number), valueOrNull(mother.manual_gravida),
            valueOrNull(JSON.stringify(mother.health_profile || {})),
            valueOrNull(JSON.stringify(mother.pregnancy_history || {}))
        ];
        const [result] = await databasePool.execute(query, values);
        return response.status(201).json({ id: result.insertId, patient_id: patientId });
    } catch (error) {
        console.error("Maternal record save failed:", error.message);
        if (error.code === "ER_DUP_ENTRY") {
            return response.status(409).json({ error: "That patient ID already exists in MySQL." });
        }
        return response.status(503).json({ error: "MySQL save failed. Check that MySQL is running and .env credentials are correct." });
    }
});

app.put("/api/mothers/:patientId", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required to update a mother." });
    }

    const patientId = String(request.params.patientId || "").trim();
    const mother = request.body || {};
    if (!patientId || patientId.length > 50 || !mother.full_name || !mother.contact_number) {
        return response.status(400).json({ error: "A valid patient ID, full name, and contact number are required." });
    }

    let dateColumns;
    try {
        dateColumns = {
            dateOfBirth: normalizeDateColumn(mother.date_of_birth, "Date of birth"),
            lastMenstrualPeriod: normalizeDateColumn(mother.last_menstrual_period, "Last menstrual period"),
            expectedDeliveryDate: normalizeDateColumn(mother.expected_delivery_date, "Expected delivery date"),
            nextAppointment: normalizeDateColumn(mother.next_appointment, "Next appointment")
        };
    } catch (error) {
        return response.status(400).json({ error: error.message });
    }

    const valueOrNull = value => value === "" || value === undefined ? null : value;
    const query = `
        UPDATE maternal_records SET
            full_name = ?, age = ?, zone = ?, date_of_birth = ?, husband_name = ?, delivery_type = ?, gender = ?,
            remarks = ?, address = ?, purok = ?, contact_number = ?, email = ?,
            blood_pressure = ?, chief_complaint = ?, pulse_rate = ?, respiratory_rate = ?,
            last_menstrual_period = ?, expected_delivery_date = ?, para = ?, abortion = ?, living_children = ?,
            age_of_gestation = ?, weight = ?, height = ?, fetal_heart_tone = ?, presentation = ?, fundal_height = ?,
            next_appointment = ?, term = ?, preterm = ?, high_risk = ?, barangay_residency_number = ?,
            manual_gravida = ?, health_profile = ?, pregnancy_history = ?
        WHERE patient_id = ? AND barangay = ? AND archived = FALSE
    `;

    try {
        await ensureMaternalRecordColumns();
        const [result] = await databasePool.execute(query, [
            mother.full_name, valueOrNull(mother.age), valueOrNull(mother.zone),
            dateColumns.dateOfBirth, valueOrNull(mother.husband_name),
            valueOrNull(mother.delivery_type), valueOrNull(mother.gender), valueOrNull(mother.remarks),
            valueOrNull(mother.address), valueOrNull(mother.purok), mother.contact_number,
            valueOrNull(mother.email), valueOrNull(mother.blood_pressure), valueOrNull(mother.chief_complaint),
            valueOrNull(mother.pulse_rate), valueOrNull(mother.respiratory_rate),
            dateColumns.lastMenstrualPeriod, dateColumns.expectedDeliveryDate,
            valueOrNull(mother.para), valueOrNull(mother.abortion), valueOrNull(mother.living_children),
            valueOrNull(mother.age_of_gestation), valueOrNull(mother.weight), valueOrNull(mother.height),
            valueOrNull(mother.fetal_heart_tone), valueOrNull(mother.presentation), valueOrNull(mother.fundal_height),
            dateColumns.nextAppointment, valueOrNull(mother.term), valueOrNull(mother.preterm),
            Boolean(mother.high_risk), valueOrNull(mother.barangay_residency_number),
            valueOrNull(mother.manual_gravida), valueOrNull(JSON.stringify(mother.health_profile || {})),
            valueOrNull(JSON.stringify(mother.pregnancy_history || {})),
            patientId, request.user.barangay
        ]);
        if (!result.affectedRows) {
            const [records] = await databasePool.execute(
                "SELECT id FROM maternal_records WHERE patient_id = ? AND barangay = ? AND archived = FALSE LIMIT 1",
                [patientId, request.user.barangay]
            );
            if (!records.length) return response.status(404).json({ error: "This mother record is not available to your barangay." });
        }
        return response.json({ patient_id: patientId });
    } catch (error) {
        console.error("Maternal record update failed:", error.code || "unknown error", error.message);
        return response.status(503).json({ error: getMaternalRecordUpdateError(error) });
    }
});

app.delete("/api/mothers/:patientId", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required to archive a mother." });
    }
    const patientId = String(request.params.patientId || "").trim();
    if (!patientId || patientId.length > 50) return response.status(400).json({ error: "A valid patient ID is required." });

    try {
        await ensureMaternalRecordColumns();
        const [result] = await databasePool.execute(
            "UPDATE maternal_records SET archived = TRUE WHERE patient_id = ? AND barangay = ? AND archived = FALSE",
            [patientId, request.user.barangay]
        );
        if (!result.affectedRows) {
            const [records] = await databasePool.execute(
                "SELECT id FROM maternal_records WHERE patient_id = ? AND barangay = ? LIMIT 1",
                [patientId, request.user.barangay]
            );
            if (!records.length) return response.status(404).json({ error: "This mother record is not available to your barangay." });
        }
        return response.status(204).end();
    } catch (error) {
        console.error("Maternal record archive failed:", error.message);
        return response.status(503).json({ error: "Maternal record could not be archived. Check the database connection." });
    }
});

app.post("/api/appointments", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required to manage appointments." });
    }
    const { patient_id: patientId, appointment_date: appointmentDate, appointment_time: appointmentTime, purpose } = request.body || {};
    if (typeof patientId !== "string" || !patientId.trim()
        || typeof appointmentDate !== "string" || !appointmentDate
        || typeof appointmentTime !== "string" || !appointmentTime
        || typeof purpose !== "string" || !purpose.trim() || purpose.trim().length > 255) {
        return response.status(400).json({ error: "Patient ID, appointment date, time, and purpose are required." });
    }

    let normalizedAppointmentDate;
    try {
        normalizedAppointmentDate = normalizeDateColumn(appointmentDate, "Appointment date");
    } catch (error) {
        return response.status(400).json({ error: error.message });
    }

    try {
        await ensureMaternalRecordColumns();
        const [motherRows] = await databasePool.execute(
            "SELECT id FROM maternal_records WHERE patient_id = ? AND barangay = ? AND archived = FALSE LIMIT 1",
            [patientId, request.user.barangay]
        );
        if (!motherRows.length) {
            return response.status(404).json({ error: "The mother must be saved in MySQL before booking an appointment." });
        }
        const [result] = await databasePool.execute(`
            INSERT INTO appointments (maternal_record_id, appointment_date, appointment_time, purpose)
            VALUES (?, ?, ?, ?)
        `, [motherRows[0].id, normalizedAppointmentDate, appointmentTime, purpose.trim()]);

        return response.status(201).json({ id: result.insertId, status: "Scheduled" });
    } catch (error) {
        console.error("Appointment save failed:", error.message);
        return response.status(503).json({ error: "MySQL appointment save failed." });
    }
});

app.delete("/api/appointments/:id", async (request, response) => {
    if (request.user.role !== "bhw" || !request.user.barangay) {
        return response.status(403).json({ error: "An assigned barangay health-worker account is required to manage appointments." });
    }
    try {
        await ensureMaternalRecordColumns();
        await databasePool.execute(`
            UPDATE appointments a
            INNER JOIN maternal_records m ON m.id = a.maternal_record_id
            SET a.status = 'Cancelled'
            WHERE a.id = ? AND m.barangay = ? AND m.archived = FALSE
        `, [request.params.id, request.user.barangay]);
        return response.status(204).end();
    } catch (error) {
        console.error("Appointment cancellation failed:", error.message);
        return response.status(503).json({ error: "MySQL appointment cancellation failed." });
    }
});

app.post("/api/send-sms", async (request, response) => {
    if (request.user.role !== "bhw") {
        return response.status(403).json({ error: "Municipality accounts can access barangay resource inventory only." });
    }
    const { recipient, message } = request.body || {};

    try {
        const { result } = await sendPhilSms(recipient, message);
        return response.json(result);
    } catch (error) {
        console.error("PhilSMS request failed:", error.message);
        const status = error.message.includes("required") || error.message.includes("not configured") ? 400 : 502;
        return response.status(status).json({ error: error.message });
    }
});

async function runAppointmentReminders() {
    if (!process.env.PHILSMS_API_TOKEN || !process.env.PHILSMS_SENDER_ID) return;

    try {
        const [appointments] = await databasePool.execute(`
            SELECT a.id, a.appointment_date, a.appointment_time, a.purpose,
                   m.id AS maternal_record_id, m.full_name, m.contact_number
            FROM appointments a
            INNER JOIN maternal_records m ON m.id = a.maternal_record_id
            WHERE a.status = 'Scheduled'
              AND TIMESTAMP(a.appointment_date, a.appointment_time) > NOW()
              AND TIMESTAMP(a.appointment_date, a.appointment_time) <= DATE_ADD(NOW(), INTERVAL ${reminderHoursBefore} HOUR)
              AND NOT EXISTS (
                  SELECT 1 FROM sms_logs s
                  WHERE s.provider_message_id = CONCAT('appointment-reminder:', a.id)
                    AND s.status = 'Sent'
              )
        `);

        for (const appointment of appointments) {
            const reminderKey = `appointment-reminder:${appointment.id}`;
            const message = `MaternaCare reminder: Hello ${appointment.full_name}. Your ${appointment.purpose} is scheduled for ${appointment.appointment_date} at ${appointment.appointment_time}. Please visit the Barangay Health Center on time.`;

            try {
                const { normalizedRecipient, result } = await sendPhilSms(appointment.contact_number, message);
                await databasePool.execute(`
                    INSERT INTO sms_logs (maternal_record_id, recipient, message, provider_message_id, status, provider_response)
                    VALUES (?, ?, ?, ?, 'Sent', ?)
                `, [appointment.maternal_record_id, normalizedRecipient, message, reminderKey, JSON.stringify(result)]);
                console.log(`Automatic appointment reminder sent for appointment ${appointment.id}.`);
            } catch (error) {
                console.error(`Automatic reminder failed for appointment ${appointment.id}:`, error.message);
            }
        }
    } catch (error) {
        console.error("Appointment reminder check failed:", error.message);
    }
}

app.listen(port, "0.0.0.0", () => {
    console.log(`MaternaCare is running on port ${port}`);
    ensureAuthTables().catch(error => {
        console.error("Authentication setup failed:", error.message);
    });
    runAppointmentReminders();
    setInterval(runAppointmentReminders, 60 * 1000);
});
