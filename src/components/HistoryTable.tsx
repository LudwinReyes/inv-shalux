import { useEffect, useState } from 'react';
import { Search, RefreshCw, Download } from 'lucide-react';
import { logoutUser } from '../auth';

import { fetchHistory } from '../utils/sheets';

interface HistoryRecord {
  fecha: string;
  codigo: string;
  producto: string;
  almacen: string;
  tipo: string;
  cantAnterior: string;
  cantNueva: string;
  variacion: string;
  motivo: string;
}

export default function HistoryTable({ spreadsheetId }: { spreadsheetId: string }) {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedAlmacen, setSelectedAlmacen] = useState('');
  const [selectedTipo, setSelectedTipo] = useState('');

  const loadHistoryData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHistory(spreadsheetId);
      if (Array.isArray(data)) {
        const formatted = data.map((row: any[]) => ({
          fecha: row[0] || '',
          codigo: row[1] || '',
          producto: row[2] || '',
          almacen: row[3] || '',
          tipo: row[4] || '',
          cantAnterior: row[5] || '0',
          cantNueva: row[6] || '0',
          variacion: row[7] || '0',
          motivo: row[8] || ''
        }));
        // Show newest first
        setHistory(formatted.reverse());
      } else {
        setHistory([]);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('IAP_PROXY_ERROR')) {
        setError(`Error Inesperado (Proxy/HTML). Para continuar, abre la app en una nueva pestaña. Detalle: ${err.message}`);
      } else {
        setError(err.message || 'No se pudo cargar el historial de cambios.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistoryData();
  }, [spreadsheetId]);

  const uniqueAlmacenes = Array.from(new Set(history.map(h => h.almacen).filter(Boolean))).sort();
  const uniqueTipos = Array.from(new Set(history.map(h => h.tipo).filter(Boolean))).sort();

  const handleExportCSV = () => {
    if (history.length === 0) return;
    const headers = ["Fecha", "Código", "Producto", "Almacén", "Tipo", "Cant. Anterior", "Cant. Nueva", "Variación", "Motivo"];
    const csvRows = [
      headers.join(','),
      ...history.map(h => [
        `"${h.fecha}"`,
        `"${h.codigo}"`,
        `"${h.producto}"`,
        `"${h.almacen}"`,
        `"${h.tipo}"`,
        h.cantAnterior,
        h.cantNueva,
        h.variacion,
        `"${h.motivo}"`
      ].join(','))
    ];
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Historial_Movimientos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = history.filter(h => {
    const matchesSearch = h.producto.toLowerCase().includes(search.toLowerCase()) || 
                          h.codigo.toLowerCase().includes(search.toLowerCase()) ||
                          h.motivo.toLowerCase().includes(search.toLowerCase());
    const matchesAlmacen = !selectedAlmacen || h.almacen === selectedAlmacen;
    const matchesTipo = !selectedTipo || h.tipo === selectedTipo;

    return matchesSearch && matchesAlmacen && matchesTipo;
  });

  const formatDate = (isoString: string) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-col gap-4">
        
        {/* Search & Actions Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm outline-none"
              placeholder="Buscar por código, producto o motivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={fetchHistory}
              className="p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title="Recargar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors flex-1 sm:flex-none"
            >
              <Download className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Dynamic Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Almacén</label>
            <select
              value={selectedAlmacen}
              onChange={(e) => setSelectedAlmacen(e.target.value)}
              className="block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"
            >
              <option value="">Todos los almacenes</option>
              {uniqueAlmacenes.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Tipo de Cambio</label>
            <select
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"
            >
              <option value="">Todos los tipos</option>
              {uniqueTipos.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

      </div>

      {error && (
        <div className="m-4 p-4 bg-red-50 text-red-700 rounded-lg text-sm font-medium border border-red-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex flex-col gap-1">
            <span>{error}</span>
            <span className="text-xs text-gray-500 font-normal">
              Si acabas de ingresar o si tu sesión expiró (dura 1 hora), haz clic en el botón de la derecha para reconectar con Google.
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            {(error.toLowerCase().includes('token') || error.toLowerCase().includes('credential') || error.toLowerCase().includes('auth') || error.toLowerCase().includes('sesión') || error.toLowerCase().includes('permis') || error.toLowerCase().includes('permission') || error.toLowerCase().includes('unauthorized') || error.toLowerCase().includes('conectar')) && (
              <button 
                onClick={() => {
                  logoutUser();
                  window.location.reload();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap text-xs font-semibold"
              >
                Cerrar Sesión y Reconectar
              </button>
            )}
            {error.includes('nueva pestaña') && (
              <button 
                onClick={() => window.open(window.location.href, '_blank')}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 whitespace-nowrap text-xs font-semibold"
              >
                Abrir App Directamente
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha / Hora</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Previo</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Nuevo</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Variación</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading && history.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  Cargando historial de cambios...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  No se encontraron registros de cambios.
                </td>
              </tr>
            ) : (
              filtered.map((record, index) => (
                <tr key={`${record.fecha}-${index}`} className="hover:bg-gray-50 text-sm">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {formatDate(record.fecha)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {record.codigo}
                  </td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    {record.producto}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {record.almacen}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      record.tipo === 'Ingreso' || record.tipo === 'Ingreso Inicial'
                        ? 'bg-green-100 text-green-800'
                        : record.tipo === 'Salida'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {record.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-500">
                    {record.cantAnterior}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 font-bold">
                    {record.cantNueva}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-semibold">
                    <span className={Number(record.variacion) > 0 ? 'text-green-600' : Number(record.variacion) < 0 ? 'text-red-600' : 'text-gray-500'}>
                      {Number(record.variacion) > 0 ? `+${record.variacion}` : record.variacion}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {record.motivo || <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
