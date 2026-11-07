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
  const response = await fetch(`/api/inventory?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
    headers: getHeaders()
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Error al obtener inventario");
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
};

export const fetchHistory = async (spreadsheetId: string): Promise<any[]> => {
  const response = await fetch(`/api/history?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
    headers: getHeaders()
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Error al obtener historial");
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
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
