import { useState, useEffect } from 'react';
import { X, Check, Copy, ExternalLink, Link as LinkIcon, Database, CheckCircle2, AlertCircle } from 'lucide-react';

interface SheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadsheetId: string;
  onUpdateSpreadsheetId: (id: string) => void;
}

export default function SheetConfigModal({
  isOpen,
  onClose,
  spreadsheetId,
  onUpdateSpreadsheetId
}: SheetConfigModalProps) {
  const [currentId, setCurrentId] = useState(spreadsheetId);
  const [appsScriptUrl, setAppsScriptUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentId(spreadsheetId);
      // Fetch current config from server
      fetch('/api/config')
        .then(r => r.json())
        .then(data => {
          if (data.appsScriptUrl) setAppsScriptUrl(data.appsScriptUrl);
          if (data.spreadsheetId) setCurrentId(data.spreadsheetId);
        })
        .catch(() => {});
    }
  }, [isOpen, spreadsheetId]);

  if (!isOpen) return null;

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${currentId}/edit?usp=sharing`;

  const appsScriptCode = `/**
 * INVENTARIO PRO - GOOGLE APPS SCRIPT WEB APP
 * Copia y pega este script en: Extensiones > Apps Script en tu hoja de Google Sheets.
 * Luego haz clic en "Implementar" > "Nueva implementación" > "Aplicación web"
 * Ejecutar como: "Yo" | Quién tiene acceso: "Cualquier persona".
 */

function getInventorySheet(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() !== "Historial_Movimientos" && sheets[i].getLastRow() > 1) {
      return sheets[i];
    }
  }
  return sheets[0];
}

function getOrCreateHistorySheet(ss) {
  var sheet = ss.getSheetByName("Historial_Movimientos");
  if (!sheet) {
    sheet = ss.insertSheet("Historial_Movimientos");
    sheet.appendRow(["Fecha / Hora", "Código", "Producto", "Almacén", "Tipo", "Stock Previo", "Stock Nuevo", "Variación", "Motivo"]);
  }
  return sheet;
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
    if (action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({ status: "ok", name: ss.getName() })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "getInventory") {
      return ContentService.createTextOutput(JSON.stringify({ values: getInventorySheet(ss).getDataRange().getValues() })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === "getHistory") {
      var h = ss.getSheetByName("Historial_Movimientos");
      return ContentService.createTextOutput(JSON.stringify({ values: h ? h.getDataRange().getValues() : [] })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === "adjustStock") {
      var inv = getInventorySheet(ss);
      var headers = inv.getRange(1, 1, 1, inv.getLastColumn()).getValues()[0];
      var stockCol = 9; // Default I
      for (var c = 0; c < headers.length; c++) {
        var h = (headers[c] || "").toString().toLowerCase().trim();
        if (h.indexOf("stock") !== -1 || h.indexOf("cantidad") !== -1 || h.indexOf("cant") !== -1) {
          stockCol = c + 1;
          break;
        }
      }
      var row = Number(data.rowIndex) + 2;
      var newStock = Number(data.oldStock) + Number(data.variation);
      inv.getRange(row, stockCol).setValue(newStock);

      var hist = getOrCreateHistorySheet(ss);
      var tipo = data.variation > 0 ? "Ingreso" : "Salida";
      hist.appendRow([new Date().toISOString(), data.codigo || "N/A", data.nombre || "Desconocido", data.almacen || "General", tipo, data.oldStock, newStock, data.variation, data.motivo || tipo]);
      return ContentService.createTextOutput(JSON.stringify({ success: true, newStock: newStock })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "addProduct" || action === "editProduct") {
      var inv = getInventorySheet(ss);
      var headers = inv.getRange(1, 1, 1, inv.getLastColumn()).getValues()[0];
      var prod = data.product || {};
      var colIdx = function(kws, def) {
        for (var i = 0; i < headers.length; i++) {
          var h = (headers[i] || "").toString().toLowerCase().trim();
          for (var k = 0; k < kws.length; k++) {
            if (h.indexOf(kws[k]) !== -1) return i;
          }
        }
        return def;
      };
      var idxId = colIdx(["#", "num", "id"], 0);
      var idxCodigo = colIdx(["código", "codigo", "code"], 1);
      var idxNombre = colIdx(["nombre", "producto", "name"], 2);
      var idxNombreAlt = colIdx(["alternativo", "alt"], 3);
      var idxDescripcion = colIdx(["descripción", "descripcion"], 4);
      var idxModelo = colIdx(["modelo", "model"], 5);
      var idxCategoria = colIdx(["categoría", "categoria"], 6);
      var idxMarca = colIdx(["marca", "brand"], 7);
      var idxStock = colIdx(["stock", "cantidad"], 8);
      var idxPrecio = colIdx(["precio", "price"], 9);
      var idxAlmacen = colIdx(["almacén", "almacen"], 10);
      var idxUbicacion = colIdx(["ubicación", "ubicacion"], 11);

      var isEdit = (action === "editProduct" || (data.rowIndex !== undefined && data.rowIndex !== null && data.rowIndex < inv.getLastRow() - 1));
      var targetRow = isEdit ? (Number(data.rowIndex) + 2) : (inv.getLastRow() + 1);

      var rowValues = [];
      if (isEdit) {
        rowValues = inv.getRange(targetRow, 1, 1, headers.length).getValues()[0];
      } else {
        for (var h = 0; h < headers.length; h++) rowValues.push("");
        rowValues[idxId] = targetRow - 1;
      }

      if (prod.codigo !== undefined) rowValues[idxCodigo] = prod.codigo;
      if (prod.nombre !== undefined) rowValues[idxNombre] = prod.nombre;
      if (prod.nombreAlt !== undefined) rowValues[idxNombreAlt] = prod.nombreAlt;
      if (prod.descripcion !== undefined) rowValues[idxDescripcion] = prod.descripcion;
      if (prod.modelo !== undefined) rowValues[idxModelo] = prod.modelo;
      if (prod.categoria !== undefined) rowValues[idxCategoria] = prod.categoria;
      if (prod.marca !== undefined) rowValues[idxMarca] = prod.marca;
      if (prod.stock !== undefined) rowValues[idxStock] = Number(prod.stock) || 0;
      if (prod.precio !== undefined) rowValues[idxPrecio] = Number(prod.precio) || 0;
      if (prod.almacen !== undefined) rowValues[idxAlmacen] = prod.almacen;
      if (prod.ubicacion !== undefined) rowValues[idxUbicacion] = prod.ubicacion;

      inv.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
      return ContentService.createTextOutput(JSON.stringify({ success: true, targetRow: targetRow })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: "Acción no soportada" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: currentId.trim(),
          appsScriptUrl: appsScriptUrl.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        onUpdateSpreadsheetId(data.spreadsheetId);
        setTestResult({ success: true, message: '¡Configuración guardada con éxito!' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: 'Error al guardar la configuración' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!appsScriptUrl) {
      setTestResult({ success: false, message: 'Pega primero la URL de tu aplicación web (termina en /exec)' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${appsScriptUrl}?action=ping`, { redirect: 'follow' });
      const data = await res.json();
      if (data.status === 'ok') {
        setTestResult({ success: true, message: `¡Conexión verificada con la hoja "${data.name || 'Google Sheet'}"!` });
      } else {
        setTestResult({ success: false, message: `Respuesta inesperada: ${JSON.stringify(data)}` });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: 'No se pudo conectar con el Apps Script. Revisa que esté publicado con acceso "Cualquier persona".' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-2xl w-full p-6 text-left relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Configuración de Google Sheets</h2>
            <p className="text-xs text-gray-500">Conexión directa bidireccional (Lectura y Edición en tiempo real)</p>
          </div>
        </div>

        {/* Hoja actual */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-gray-500 tracking-wider">Hoja Conectada</span>
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
            >
              <span>Abrir hoja en Google Sheets</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">ID de la Hoja de Cálculo:</label>
            <input
              type="text"
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
              className="w-full text-xs font-mono bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1 text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Lectura activa en tiempo real (3,000+ productos sincronizados).</span>
          </div>
        </div>

        {/* Sincronización de Edición via Apps Script */}
        <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 mb-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4 text-blue-600" />
                Habilitar Edición Directa (Apps Script Webhook)
              </h3>
              <p className="text-xs text-blue-800 mt-1">
                Permite que los cambios de stock, agregar productos y editar detalles se reflejen instantáneamente en tu hoja sin que los usuarios necesiten cuenta de Google.
              </p>
            </div>
            <button
              onClick={handleCopyCode}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? '¡Código Copiado!' : 'Copiar Código Apps Script'}</span>
            </button>
          </div>

          <div className="text-xs bg-white/90 p-3 rounded-lg border border-blue-100 text-gray-700 space-y-1">
            <p className="font-semibold text-gray-900">Pasos rápidos (toma menos de 1 minuto):</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Abre tu hoja de cálculo y ve al menú: <strong>Extensiones &gt; Apps Script</strong>.</li>
              <li>Pega el código copiado con el botón de arriba y guarda.</li>
              <li>Haz clic en el botón azul superior <strong>Implementar &gt; Nueva implementación</strong>.</li>
              <li>Elige tipo <strong>Aplicación web</strong>, Ejecutar como: <em>"Yo"</em>, Quién tiene acceso: <em>"Cualquier persona"</em>.</li>
              <li>Copia la <strong>URL de la aplicación web</strong> que te da Google (termina en <code>/exec</code>) y pégala abajo:</li>
            </ol>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-800 block mb-1">
              URL de la Aplicación Web (Google Apps Script):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={appsScriptUrl}
                onChange={(e) => setAppsScriptUrl(e.target.value)}
                className="flex-1 text-xs font-mono bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !appsScriptUrl}
                className="px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50 cursor-pointer"
              >
                {testing ? 'Probando...' : 'Probar'}
              </button>
            </div>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              testResult.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
