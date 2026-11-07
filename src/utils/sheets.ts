import { getAuthToken } from '../auth';

const getHeaders = () => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  return headers;
};

export const fetchInventory = async (spreadsheetId: string): Promise<any[]> => {
  // 1. Try fetching via Backend API
  try {
    const response = await fetch(`/api/inventory?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
      headers: getHeaders()
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn("Backend /api/inventory call failed, attempting direct live sheet fetch:", err);
  }

  // 2. High-resilience direct Google Sheets GViz fallback (works even during server cold-starts)
  try {
    const gvizRes = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`);
    if (gvizRes.ok) {
      const csv = await gvizRes.text();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(csv, { type: 'string', raw: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows && rows.length > 0) {
        return rows;
      }
    }
  } catch (gvizErr) {
    console.error("Direct sheet fetch fallback failed:", gvizErr);
  }

  throw new Error("No se pudo cargar el inventario. Verifica tu conexión o recarga la página.");
};

export const fetchHistory = async (spreadsheetId: string): Promise<any[]> => {
  // 1. Try fetching via Backend API
  try {
    const response = await fetch(`/api/history?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
      headers: getHeaders()
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn("Backend /api/history call failed, attempting direct live sheet fetch:", err);
  }

  // 2. High-resilience direct Google Sheets GViz fallback
  try {
    const gvizRes = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=Historial_Movimientos&tqx=out:csv`);
    if (gvizRes.ok) {
      const csv = await gvizRes.text();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(csv, { type: 'string', raw: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      return rows.length > 1 ? rows.slice(1) : [];
    }
  } catch (gvizErr) {
    console.error("Direct history fetch fallback failed:", gvizErr);
  }

  return [];
};

export const addProduct = async (spreadsheetId: string, product: any, rowIndex?: number): Promise<any> => {
  const response = await fetch('/api/inventory/add', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      spreadsheetId,
      product,
      rowIndex
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    throw new Error(result.error || "Error al guardar el producto");
  }

  if (result.setupRequired) {
    throw new Error(result.message || "Se requiere vincular el Google Apps Script para guardar cambios");
  }

  return result;
};

export const adjustStock = async (spreadsheetId: string, data: any): Promise<any> => {
  const { rowIndex, codigo, nombre, almacen, oldStock, variation, motivo } = data;

  const response = await fetch('/api/inventory/adjust', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      spreadsheetId,
      rowIndex,
      codigo,
      nombre,
      almacen,
      oldStock,
      variation,
      motivo
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    throw new Error(result.error || "Error al ajustar el stock");
  }

  if (result.setupRequired) {
    throw new Error(result.message || "Se requiere vincular el Google Apps Script para guardar cambios");
  }

  return result;
};
