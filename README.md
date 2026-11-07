# Inventario Pro (Google Sheets)

Sistema de gestión de inventarios con sincronización en tiempo real usando Google Sheets como base de datos central.

## 🚀 Inicio Rápido

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar servidor:**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 🔐 Cuentas de Acceso (Usuario y Contraseña)

Se han configurado perfiles listos para usar en `users.json`:

| Usuario | Contraseña | Rol | Permisos |
| :--- | :--- | :--- | :--- |
| **admin** | `admin123` | Administrador | Control total: inventario, stock, historial y configuración |
| **operador** | `operador123` | Operador | Ajustes de stock (+/-), consulta y altas |
| **vendedor** | `vendedor123` | Ventas | Consulta de precios, stock y ubicaciones |

*Puedes modificar o agregar usuarios en cualquier momento editando el archivo `users.json`.*

---

## 📊 Hoja de Cálculo Vinculada

- **URL:** [Ver Google Sheets](https://docs.google.com/spreadsheets/d/129v_Lw-mBELjpjtVE0HT_DOgzJTid4_lAR-boqzxy9o/edit?usp=sharing)
- **ID:** `129v_Lw-mBELjpjtVE0HT_DOgzJTid4_lAR-boqzxy9o`

### ⚡ Sincronización Bidireccional (Lectura y Edición)

1. **Lectura en tiempo real:**
   Activa de inmediato sin ninguna configuración adicional. La app lee directamente los productos e historial de la hoja compartida.

2. **Edición y Guardado directo en Google Sheets (Google Apps Script):**
   Para que las modificaciones hechas desde la interfaz (ajuste de stock, nuevos productos o edición) se escriban directamente en el Excel en la nube sin requerir inicio de sesión de Google a cada usuario:
   
   - Abre tu hoja de cálculo: [Google Sheets](https://docs.google.com/spreadsheets/d/129v_Lw-mBELjpjtVE0HT_DOgzJTid4_lAR-boqzxy9o/edit?usp=sharing)
   - Ve a **Extensiones > Apps Script**.
   - Pega el código de [google-apps-script/Code.gs](google-apps-script/Code.gs) (también puedes copiarlo en 1 clic desde el botón "Google Sheet Conectado" dentro de la app).
   - Haz clic en **Implementar > Nueva implementación**:
     - Tipo: **Aplicación web**
     - Ejecutar como: **"Yo"**
     - Quién tiene acceso: **"Cualquier persona"**
   - Copia la URL generada (`/exec`) y pégala en el panel de configuración de la app o en `APPS_SCRIPT_URL=` de tu `.env`.
