/**
 * INVENTARIO PRO - GOOGLE APPS SCRIPT WEB APP
 * 
 * Este script se vincula a tu hoja de cálculo para permitir lectura y edición
 * directa desde la aplicación sin necesidad de Google OAuth para cada usuario.
 * 
 * INSTRUCCIONES DE INSTALACIÓN (30 segundos):
 * 1. En tu hoja de cálculo, ve al menú superior: Extensiones > Apps Script.
 * 2. Borra cualquier código que aparezca y pega este código completo.
 * 3. Haz clic en "Guardar" (ícono de disco).
 * 4. Haz clic en el botón azul superior "Implementar" > "Nueva implementación".
 * 5. En el engranaje "Seleccionar tipo", elige "Aplicación web".
 * 6. Configura:
 *    - Descripción: Inventario Pro API
 *    - Ejecutar como: "Yo" (tu cuenta de Google)
 *    - Quién tiene acceso: "Cualquier persona" (Anyone)
 * 7. Haz clic en "Implementar" y autoriza los permisos si te los pide.
 * 8. Copia la "URL de la aplicación web" (termina en /exec) y pégala en la app.
 */

function getInventorySheet(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var title = sheets[i].getName();
    if (title !== "Historial_Movimientos") {
      var rows = sheets[i].getLastRow();
      if (rows > 1) return sheets[i];
    }
  }
  return sheets[0];
}

function getOrCreateHistorySheet(ss) {
  var sheet = ss.getSheetByName("Historial_Movimientos");
  if (!sheet) {
    sheet = ss.insertSheet("Historial_Movimientos");
    var headers = [
      "Fecha / Hora", "Código", "Producto", "Almacén", "Tipo",
      "Stock Previo", "Stock Nuevo", "Variación", "Motivo"
    ];
    sheet.appendRow(headers);
  }
  return sheet;
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "getInventory";
    
    if (action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({
        status: "ok",
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "getInventory") {
      var sheet = getInventorySheet(ss);
      var values = sheet.getDataRange().getValues();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        sheetName: sheet.getName(),
        values: values
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "getHistory") {
      var hSheet = ss.getSheetByName("Historial_Movimientos");
      var values = hSheet ? hSheet.getDataRange().getValues() : [];
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        values: values
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ error: "Acción no reconocida" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    var action = data.action;

    // --- ACCIÓN: AJUSTAR STOCK (+ o -) ---
    if (action === "adjustStock") {
      var invSheet = getInventorySheet(ss);
      var headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
      
      var stockCol = -1;
      for (var c = 0; c < headers.length; c++) {
        var hName = (headers[c] || "").toString().toLowerCase().trim();
        if (hName.indexOf("stock") !== -1 || hName.indexOf("cantidad") !== -1 || hName.indexOf("cant") !== -1) {
          stockCol = c + 1; // 1-based
          break;
        }
      }
      if (stockCol === -1) stockCol = 9; // Columna I por defecto

      var rowNumber = Number(data.rowIndex) + 2; // +2 porque fila 1 son encabezados y rowIndex es base 0
      var oldStock = Number(data.oldStock) || 0;
      var variation = Number(data.variation) || 0;
      var newStock = oldStock + variation;

      // Actualizar celda de stock
      invSheet.getRange(rowNumber, stockCol).setValue(newStock);

      // Registrar movimiento en Historial_Movimientos
      var histSheet = getOrCreateHistorySheet(ss);
      var tipo = variation > 0 ? "Ingreso" : "Salida";
      var historyRow = [
        new Date().toISOString(),
        data.codigo || "N/A",
        data.nombre || "Desconocido",
        data.almacen || "General",
        tipo,
        oldStock,
        newStock,
        variation,
        data.motivo || tipo
      ];
      histSheet.appendRow(historyRow);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        newStock: newStock,
        updatedRow: rowNumber
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACCIÓN: AGREGAR O EDITAR PRODUCTO ---
    if (action === "addProduct" || action === "editProduct") {
      var invSheet = getInventorySheet(ss);
      var headers = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
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

      var idxId = colIdx(["#", "num", "id", "index"], 0);
      var idxCodigo = colIdx(["código", "codigo", "code", "interno"], 1);
      var idxNombre = colIdx(["nombre", "producto", "name", "item"], 2);
      var idxNombreAlt = colIdx(["alternativo", "alt", "alias"], 3);
      var idxDescripcion = colIdx(["descripción", "descripcion", "description", "detalles"], 4);
      var idxModelo = colIdx(["modelo", "model"], 5);
      var idxCategoria = colIdx(["categoría", "categoria", "category"], 6);
      var idxMarca = colIdx(["marca", "brand"], 7);
      var idxStock = colIdx(["stock", "cantidad", "cant", "qty", "quantity"], 8);
      var idxPrecio = colIdx(["precio", "price", "costo", "val"], 9);
      var idxAlmacen = colIdx(["almacén", "almacen", "warehouse", "tienda", "deposito"], 10);
      var idxUbicacion = colIdx(["ubicación", "ubicacion", "location", "pasillo", "estante"], 11);

      var isEdit = (action === "editProduct" || (data.rowIndex !== undefined && data.rowIndex !== null && data.rowIndex < invSheet.getLastRow() - 1));
      var targetRow = isEdit ? (Number(data.rowIndex) + 2) : (invSheet.getLastRow() + 1);

      var rowValues = [];
      if (isEdit) {
        rowValues = invSheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
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

      invSheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);

      if (!isEdit && (Number(prod.stock) || 0) > 0) {
        var histSheet = getOrCreateHistorySheet(ss);
        histSheet.appendRow([
          new Date().toISOString(),
          prod.codigo || ("BI" + (targetRow - 1)),
          prod.nombre || "Nuevo Producto",
          prod.almacen || "General",
          "Ingreso Inicial",
          0,
          Number(prod.stock) || 0,
          Number(prod.stock) || 0,
          "Alta de producto"
        ]);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        targetRow: targetRow
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: "Acción POST no soportada: " + action }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
