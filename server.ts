import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import PQueue from "p-queue";
import { GoogleGenAI } from "@google/genai";
import * as XLSX from "xlsx";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-app-token, x-auth-token, Content-Length, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Request logger
app.use((req, res, next) => {
  fs.appendFileSync("server.log", `[REQUEST] ${req.method} ${req.url}\n`);
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});

// Security Filter: Block direct HTTP access to data, json files, env, log files
app.use((req, res, next) => {
  const pathLower = req.path.toLowerCase();
  if (
    pathLower.startsWith("/data") ||
    pathLower.endsWith(".json") ||
    pathLower.endsWith(".env") ||
    pathLower.endsWith(".log") ||
    pathLower.includes(".git")
  ) {
    return res.status(404).send("Not Found");
  }
  next();
});

// Queues per spreadsheet ID
const sheetQueues = new Map<string, PQueue>();
function getQueue(spreadsheetId: string) {
  if (!sheetQueues.has(spreadsheetId)) {
    sheetQueues.set(spreadsheetId, new PQueue({ concurrency: 1 }));
  }
  return sheetQueues.get(spreadsheetId)!;
}

// AI Client
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// Users Management (Usuario y Contraseña) - Guardado seguro en data/users.json con hashes
const USERS_FILE = path.join(process.cwd(), "data", "users.json");

interface AppUser {
  id: string;
  username: string;
  passwordHash?: string;
  password?: string;
  name: string;
  role: "admin" | "operador" | "vendedor";
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "_inv_salt_2026").digest("hex");
}

function loadUsers(): AppUser[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf-8");
      const users: AppUser[] = JSON.parse(data);
      // Auto-hash any unhashed passwords for security
      let needsSave = false;
      users.forEach(u => {
        if (u.password && !u.passwordHash) {
          u.passwordHash = hashPassword(u.password);
          delete u.password;
          needsSave = true;
        }
      });
      if (needsSave) saveUsers(users);
      return users;
    }
  } catch (err) {
    console.error("Error reading data/users.json:", err);
  }
  return [
    { id: "1", username: "admin", passwordHash: hashPassword("admin123"), name: "Administrador General", role: "admin" },
    { id: "2", username: "operador", passwordHash: hashPassword("operador123"), name: "Operador de Almacén", role: "operador" },
    { id: "3", username: "vendedor", passwordHash: hashPassword("vendedor123"), name: "Asesor de Ventas", role: "vendedor" }
  ];
}

function saveUsers(users: AppUser[]) {
  if (!fs.existsSync(path.dirname(USERS_FILE))) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

// Global Config
let SPREADSHEET_ID = process.env.SPREADSHEET_ID || "129v_Lw-mBELjpjtVE0HT_DOgzJTid4_lAR-boqzxy9o";
let SPREADSHEET_URL = process.env.SPREADSHEET_URL || `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?usp=sharing`;
let APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";

// Session token generation & validation (Cryptographically secure random token)
const SESSIONS = new Map<string, { user: AppUser; expiresAt: number }>();

function generateToken(user: AppUser): string {
  const token = `inv_${crypto.randomBytes(32).toString("hex")}`;
  SESSIONS.set(token, {
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  });
  return token;
}

function getSessionUser(token?: string): AppUser | null {
  if (!token) return null;
  const clean = token.replace("Bearer ", "").trim();
  const session = SESSIONS.get(clean);
  if (session && session.expiresAt > Date.now()) {
    return session.user;
  }
  return null;
}

// -----------------------------------------------------------------------------
// AUTH ENDPOINTS (Usuario y Contraseña)
// -----------------------------------------------------------------------------

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Ingresa usuario y contraseña" });
  }

  const users = loadUsers();
  const hashedPassword = hashPassword(password);
  const user = users.find(
    u => u.username.toLowerCase().trim() === username.toLowerCase().trim() &&
         (u.passwordHash === hashedPassword || u.password === password)
  );

  if (!user) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] as string);
  const user = getSessionUser(authHeader);
  if (!user) {
    return res.status(401).json({ error: "Sesión no válida o expirada" });
  }
  res.json({ user });
});

app.get("/api/auth/users", (req, res) => {
  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] as string);
  const user = getSessionUser(authHeader);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Permiso denegado: sólo el Administrador puede ver la lista de usuarios" });
  }
  const users = loadUsers().map(({ password, passwordHash, ...rest }) => rest);
  res.json({ users });
});

app.post("/api/auth/users", (req, res) => {
  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] as string);
  const user = getSessionUser(authHeader);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Permiso denegado: sólo el Administrador puede gestionar usuarios" });
  }

  const { id, username, password, name, role } = req.body;
  if (!username || !name) {
    return res.status(400).json({ error: "Faltan campos obligatorios (username, name)" });
  }

  const users = loadUsers();
  const existingIdx = id ? users.findIndex(u => u.id === id) : users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());

  if (existingIdx !== -1) {
    users[existingIdx].username = username;
    users[existingIdx].name = name;
    users[existingIdx].role = role || users[existingIdx].role || "operador";
    if (password && password.trim()) {
      users[existingIdx].passwordHash = hashPassword(password.trim());
      delete users[existingIdx].password;
    }
  } else {
    if (!password) {
      return res.status(400).json({ error: "Para nuevos usuarios se requiere contraseña" });
    }
    users.push({
      id: Date.now().toString(),
      username: username.toLowerCase().trim(),
      passwordHash: hashPassword(password.trim()),
      name,
      role: role || "operador"
    });
  }

  saveUsers(users);
  res.json({ success: true, users: users.map(({ password, passwordHash, ...rest }) => rest) });
});

app.delete("/api/auth/users/:id", (req, res) => {
  const authHeader = req.headers.authorization || (req.headers["x-auth-token"] as string);
  const user = getSessionUser(authHeader);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Permiso denegado" });
  }

  const { id } = req.params;
  const users = loadUsers();
  const target = users.find(u => u.id === id);
  if (!target) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  // Prevent deleting self or last admin
  if (target.id === user.id) {
    return res.status(400).json({ error: "No puedes eliminar tu propio usuario en sesión" });
  }
  const admins = users.filter(u => u.role === "admin");
  if (target.role === "admin" && admins.length <= 1) {
    return res.status(400).json({ error: "No puedes eliminar el único administrador del sistema" });
  }

  const filtered = users.filter(u => u.id !== id);
  saveUsers(filtered);
  res.json({ success: true, users: filtered.map(({ password, passwordHash, ...rest }) => rest) });
});

// -----------------------------------------------------------------------------
// GOOGLE SHEETS CONFIGURATION & STATUS
// -----------------------------------------------------------------------------

app.get("/api/config", (req, res) => {
  res.json({
    spreadsheetId: SPREADSHEET_ID,
    spreadsheetUrl: SPREADSHEET_URL,
    appsScriptUrl: APPS_SCRIPT_URL,
    hasAppsScript: !!APPS_SCRIPT_URL,
    hasServiceAccount: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) || fs.existsSync(path.join(process.cwd(), "service-account.json")),
    canRead: true,
    canWrite: !!APPS_SCRIPT_URL || !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || fs.existsSync(path.join(process.cwd(), "service-account.json")))
  });
});

app.post("/api/config", (req, res) => {
  const { spreadsheetId, appsScriptUrl } = req.body;
  if (spreadsheetId) {
    SPREADSHEET_ID = spreadsheetId;
    SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;
  }
  if (appsScriptUrl !== undefined) {
    APPS_SCRIPT_URL = appsScriptUrl.trim();
  }

  // Update .env file
  try {
    let envContent = fs.readFileSync(".env", "utf-8");
    if (spreadsheetId) {
      envContent = envContent.replace(/SPREADSHEET_ID=.*/, `SPREADSHEET_ID=${SPREADSHEET_ID}`);
      envContent = envContent.replace(/SPREADSHEET_URL=.*/, `SPREADSHEET_URL=${SPREADSHEET_URL}`);
    }
    if (appsScriptUrl !== undefined) {
      if (envContent.includes("APPS_SCRIPT_URL=")) {
        envContent = envContent.replace(/APPS_SCRIPT_URL=.*/, `APPS_SCRIPT_URL=${APPS_SCRIPT_URL}`);
      } else {
        envContent += `\nAPPS_SCRIPT_URL=${APPS_SCRIPT_URL}`;
      }
    }
    fs.writeFileSync(".env", envContent, "utf-8");
  } catch (err) {
    console.warn("Could not persist to .env:", err);
  }

  res.json({
    success: true,
    spreadsheetId: SPREADSHEET_ID,
    spreadsheetUrl: SPREADSHEET_URL,
    appsScriptUrl: APPS_SCRIPT_URL
  });
});

// -----------------------------------------------------------------------------
// HELPER: READ PUBLIC GOOGLE SHEET VIA GVIZ CSV
// -----------------------------------------------------------------------------

async function fetchSheetDataGviz(sheetId: string, sheetName?: string): Promise<any[][]> {
  let url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  if (sheetName) {
    url += `&sheet=${encodeURIComponent(sheetName)}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error al leer hoja de Google Sheets (Status ${response.status})`);
  }

  const csvText = await response.text();
  const workbook = XLSX.read(csvText, { type: "string", raw: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
  return rows;
}

// -----------------------------------------------------------------------------
// GOOGLE SHEETS READ ENDPOINTS
// -----------------------------------------------------------------------------

app.get("/api/inventory", async (req, res) => {
  const sheetId = (req.query.spreadsheetId as string) || SPREADSHEET_ID;
  const queue = getQueue(sheetId);

  try {
    const data = await queue.add(async () => {
      // 1. If Apps Script URL is set, try fetching through it first
      if (APPS_SCRIPT_URL) {
        try {
          const asRes = await fetch(`${APPS_SCRIPT_URL}?action=getInventory`, { redirect: "follow" });
          if (asRes.ok) {
            const json = await asRes.json();
            if (json.values && Array.isArray(json.values)) {
              return json.values;
            }
          }
        } catch (asErr) {
          console.warn("Apps Script inventory fetch failed, falling back to gviz:", asErr);
        }
      }

      // 2. Direct fast GViz fetch (works for shared/public sheets with zero auth)
      return await fetchSheetDataGviz(sheetId);
    });

    res.json(data);
  } catch (err: any) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: err.message || "Error al cargar inventario" });
  }
});

app.get("/api/history", async (req, res) => {
  const sheetId = (req.query.spreadsheetId as string) || SPREADSHEET_ID;
  const queue = getQueue(sheetId);

  try {
    const data = await queue.add(async () => {
      // 1. If Apps Script URL is set, try fetching through it
      if (APPS_SCRIPT_URL) {
        try {
          const asRes = await fetch(`${APPS_SCRIPT_URL}?action=getHistory`, { redirect: "follow" });
          if (asRes.ok) {
            const json = await asRes.json();
            if (json.values && Array.isArray(json.values)) {
              // Return rows starting from row 1 (excluding header)
              return json.values.slice(1);
            }
          }
        } catch (asErr) {
          console.warn("Apps Script history fetch failed, falling back to gviz:", asErr);
        }
      }

      // 2. Direct fast GViz fetch for Historial_Movimientos
      try {
        const rows = await fetchSheetDataGviz(sheetId, "Historial_Movimientos");
        return rows.length > 1 ? rows.slice(1) : [];
      } catch (err) {
        console.warn("Historial_Movimientos sheet not found or empty");
        return [];
      }
    });

    res.json(data);
  } catch (err: any) {
    console.error("Error fetching history:", err);
    res.status(500).json({ error: err.message || "Error al cargar historial" });
  }
});

// -----------------------------------------------------------------------------
// GOOGLE SHEETS WRITE / EDIT ENDPOINTS
// -----------------------------------------------------------------------------

app.post("/api/inventory/adjust", async (req, res) => {
  const { spreadsheetId, rowIndex, codigo, nombre, almacen, oldStock, variation, motivo } = req.body;
  const sheetId = spreadsheetId || SPREADSHEET_ID;

  if (rowIndex === undefined || variation === undefined) {
    return res.status(400).json({ error: "Faltan parámetros de ajuste (rowIndex, variation)" });
  }

  const queue = getQueue(sheetId);
  try {
    const result = await queue.add(async () => {
      // Case 1: Google Apps Script Web App configured (Recommended)
      if (APPS_SCRIPT_URL) {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "adjustStock",
            rowIndex,
            codigo,
            nombre,
            almacen,
            oldStock,
            variation,
            motivo
          }),
          redirect: "follow"
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Error en Google Apps Script (${response.status}): ${text}`);
        }

        const json = await response.json();
        return json;
      }

      // Case 2: Service Account configured
      const saPath = path.join(process.cwd(), "service-account.json");
      if (fs.existsSync(saPath) || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)) {
        const auth = new google.auth.GoogleAuth({
          keyFile: fs.existsSync(saPath) ? saPath : undefined,
          credentials: !fs.existsSync(saPath) ? {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n")
          } : undefined,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"]
        });

        const sheets = google.sheets({ version: "v4", auth });
        const newStock = Number(oldStock) + Number(variation);

        // Fetch headers to find stock column
        const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: "A1:Z1"
        });
        const headers = headerRes.data.values?.[0] || [];
        const stockColIndex = headers.findIndex((h: string) =>
          ["stock", "cantidad", "cant", "qty"].some(kw => (h || "").toLowerCase().trim().includes(kw))
        );
        const colLetter = stockColIndex !== -1 ? String.fromCharCode(65 + stockColIndex) : "I";

        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: `${colLetter}${rowIndex + 2}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[newStock]] }
        });

        // Append to history
        const tipo = variation > 0 ? "Ingreso" : "Salida";
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: "Historial_Movimientos!A:I",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[
              new Date().toISOString(),
              codigo || "N/A",
              nombre || "Desconocido",
              almacen || "General",
              tipo,
              oldStock,
              newStock,
              variation,
              motivo || tipo
            ]]
          }
        });

        return { success: true, newStock };
      }

      // Case 3: Neither configured yet
      return {
        success: false,
        setupRequired: true,
        message: "Para guardar cambios directamente en la hoja de Google Sheets, vincula el Google Apps Script o tu Cuenta de Servicio."
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error("Error adjusting stock:", err);
    res.status(500).json({ error: err.message || "Error al ajustar stock" });
  }
});

app.post("/api/inventory/add", async (req, res) => {
  const { spreadsheetId, product, rowIndex } = req.body;
  const sheetId = spreadsheetId || SPREADSHEET_ID;

  if (!product) return res.status(400).json({ error: "Datos del producto requeridos" });

  const queue = getQueue(sheetId);
  try {
    const result = await queue.add(async () => {
      if (APPS_SCRIPT_URL) {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: rowIndex !== undefined ? "editProduct" : "addProduct",
            product,
            rowIndex
          }),
          redirect: "follow"
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Error en Google Apps Script (${response.status}): ${text}`);
        }

        return await response.json();
      }

      return {
        success: false,
        setupRequired: true,
        message: "Para agregar o editar productos directamente en la hoja de Google Sheets, vincula el Google Apps Script."
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error("Error adding/editing product:", err);
    res.status(500).json({ error: err.message || "Error al guardar producto" });
  }
});

app.post("/api/inventory/edit", async (req, res) => {
  const { spreadsheetId, rowIndex, product } = req.body;
  const sheetId = spreadsheetId || SPREADSHEET_ID;

  if (!product || rowIndex === undefined) {
    return res.status(400).json({ error: "Faltan parámetros (product, rowIndex)" });
  }

  const queue = getQueue(sheetId);
  try {
    const result = await queue.add(async () => {
      if (APPS_SCRIPT_URL) {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "editProduct",
            product,
            rowIndex
          }),
          redirect: "follow"
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Error en Google Apps Script (${response.status}): ${text}`);
        }

        return await response.json();
      }

      return {
        success: false,
        setupRequired: true,
        message: "Para editar productos directamente en la hoja de Google Sheets, vincula el Google Apps Script."
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error("Error editing product:", err);
    res.status(500).json({ error: err.message || "Error al editar producto" });
  }
});

// -----------------------------------------------------------------------------
// AI GENERATION & BARCODE LOOKUP
// -----------------------------------------------------------------------------

app.post("/api/ai/generate", async (req, res) => {
  const { nombre, marca, categoria } = req.body;
  if (!nombre || !marca || !categoria) return res.status(400).json({ error: "Missing fields" });

  try {
    if (!ai) {
      return res.json({
        descripcion: `${nombre} de la marca ${marca}, ideal para su categoría ${categoria}.`,
        nombreAlternativo: `${nombre} ${marca}`
      });
    }

    const prompt = `Actúa como un experto en inventarios y ventas. Genera una 'Descripción' atractiva y detallada (1-2 oraciones) y un 'Nombre alternativo' corto y comercial para el siguiente producto:
Nombre: ${nombre}
Marca: ${marca}
Categoría: ${categoria}

Responde ÚNICAMENTE en formato JSON válido con esta estructura exacta:
{"descripcion": "...", "nombreAlternativo": "..."}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response");
    const json = JSON.parse(text);
    res.json(json);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/barcode", async (req, res) => {
  const { code } = req.query;
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    const data = await response.json();
    if (data.product && data.product.product_name) {
      res.json({ name: data.product.product_name, brand: data.product.brands || "" });
    } else {
      res.status(404).json({ error: "Product not found" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// VITE SPA INTEGRATION & SERVER STARTUP
// -----------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Inventario Pro Server running on http://localhost:${PORT}`);
  });
}

startServer();
