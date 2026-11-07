import { useState, useEffect } from 'react';
import { logoutUser } from '../auth';
import { Plus, Minus, Search, Download, Settings, RefreshCw, Copy, Edit2, Sparkles } from 'lucide-react';
import { fetchInventory, adjustStock } from '../utils/sheets';
import AddProductModal from './AddProductModal';
import HomologationModal from './HomologationModal';
import * as XLSX from 'xlsx';

interface Product {
  rowIndex: number;
  codigo: string;
  nombre: string;
  nombreAlt: string;
  descripcion: string;
  modelo: string;
  categoria: string;
  marca: string;
  stock: number;
  precio: number;
  almacen: string;
  ubicacion: string;
}

export default function InventoryTable({ spreadsheetId, onResetSpreadsheet }: { spreadsheetId: string, onResetSpreadsheet: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedMarca, setSelectedMarca] = useState('');
  const [selectedAlmacen, setSelectedAlmacen] = useState('');
  const [selectedUbicacion, setSelectedUbicacion] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isHomologationModalOpen, setIsHomologationModalOpen] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<number | null>(null);
  const [adjustmentModal, setAdjustmentModal] = useState<{
    product: Product;
    variation: number;
    cantidad: number;
    motivo: string;
    customMotivo: string;
  } | null>(null);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  const loadInventoryData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInventory(spreadsheetId);
      
      if (Array.isArray(data) && data.length > 0) {
        const headers = data[0].map((h: any) => (h || '').toString().toLowerCase().trim());
        
        const getColIdx = (kws: string[], def: number) => {
          const idx = headers.findIndex((h: string) => kws.some(kw => h.includes(kw)));
          return idx !== -1 ? idx : def;
        };

        const idxCodigo = getColIdx(["código", "codigo", "code", "interno"], 1);
        const idxNombre = getColIdx(["nombre", "producto", "name", "item"], 2);
        const idxNombreAlt = getColIdx(["alternativo", "alt", "alias"], 3);
        const idxDescripcion = getColIdx(["descripción", "descripcion", "description", "detalles"], 4);
        const idxModelo = getColIdx(["modelo", "model"], 5);
        const idxCategoria = getColIdx(["categoría", "categoria", "category"], 6);
        const idxMarca = getColIdx(["marca", "brand"], 7);
        const idxStock = getColIdx(["stock", "cantidad", "cant", "qty", "quantity"], 8);
        const idxPrecio = getColIdx(["precio", "price", "costo", "val"], 9);
        const idxAlmacen = getColIdx(["almacén", "almacen", "warehouse", "tienda", "deposito"], 10);
        const idxUbicacion = getColIdx(["ubicación", "ubicacion", "location", "pasillo", "estante"], 11);

        const parseNum = (val: any) => {
          if (val === undefined || val === null || val === '') return 0;
          if (typeof val === 'number') return val;
          const parsed = parseFloat(String(val).replace(/,/g, '.').replace(/[^0-9.-]/g, ''));
          return isNaN(parsed) ? 0 : parsed;
        };

        const dataRows = data.slice(1);
        const formatted = dataRows.map((row: any[], index: number) => ({
          rowIndex: index, // 0-based index relative to data rows
          codigo: (row[idxCodigo] || '').toString().trim(),
          nombre: (row[idxNombre] || '').toString().trim(),
          nombreAlt: (row[idxNombreAlt] || '').toString().trim(),
          descripcion: (row[idxDescripcion] || '').toString().trim(),
          modelo: (row[idxModelo] || '').toString().trim(),
          categoria: (row[idxCategoria] || '').toString().trim(),
          marca: (row[idxMarca] || '').toString().trim(),
          stock: parseNum(row[idxStock]),
          precio: parseNum(row[idxPrecio]),
          almacen: (row[idxAlmacen] || '').toString().trim(),
          ubicacion: (row[idxUbicacion] || '').toString().trim()
        }));

        let nextCodeIndex = 1;
        const nameToCodeMap = new Map<string, string>();
        
        // First pass: collect existing codes
        formatted.forEach(p => {
          if (p.nombre && p.codigo) {
            const key = p.nombre.toLowerCase();
            if (!nameToCodeMap.has(key)) {
              nameToCodeMap.set(key, p.codigo);
            }
            const match = p.codigo.match(/^BI0*(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num >= nextCodeIndex) nextCodeIndex = num + 1;
            }
          }
        });
        
        // Second pass: assign codes
        formatted.forEach(p => {
          if (p.nombre) {
            const key = p.nombre.toLowerCase();
            if (nameToCodeMap.has(key)) {
              p.codigo = nameToCodeMap.get(key)!;
            } else {
              const newCode = `BI${String(nextCodeIndex).padStart(3, '0')}`;
              nameToCodeMap.set(key, newCode);
              p.codigo = newCode;
              nextCodeIndex++;
            }
          } else if (!p.codigo) {
             const newCode = `BI${String(nextCodeIndex).padStart(3, '0')}`;
             p.codigo = newCode;
             nextCodeIndex++;
          }
        });

        setProducts(formatted);
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('IAP_PROXY_ERROR')) {
        setError(`Error Inesperado (Proxy/HTML). Para continuar, abre la app en una nueva pestaña. Detalle: ${err.message}`);
      } else {
        setError(err.message || 'No se pudo conectar con la hoja de cálculo. Asegúrate de tener permisos o que el ID sea correcto.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset filters when switching sheet
    setSearch('');
    setSelectedMarca('');
    setSelectedAlmacen('');
    setSelectedUbicacion('');
    loadInventoryData();
  }, [spreadsheetId]);

  // Extract unique filter options dynamically from current loaded inventory
  const uniqueMarcas = Array.from(new Set(products.map(p => p.marca).filter(Boolean))).sort();
  const uniqueAlmacenes = Array.from(new Set(products.map(p => p.almacen).filter(Boolean))).sort();
  const uniqueUbicaciones = Array.from(new Set(products.map(p => p.ubicacion).filter(Boolean))).sort();

  const handleOpenAdjustModal = (product: Product, direction: number) => {
    setAdjustmentError(null);
    setAdjustmentModal({
      product,
      variation: direction,
      cantidad: 1,
      motivo: direction > 0 ? 'Ingreso de mercadería' : 'Venta registrada',
      customMotivo: ''
    });
  };

  const handleConfirmAdjustment = async () => {
    if (!adjustmentModal) return;
    const { product, variation, cantidad, motivo, customMotivo } = adjustmentModal;
    const finalMotivo = motivo === 'Otro...' ? customMotivo.trim() : motivo;
    if (motivo === 'Otro...' && !finalMotivo) {
      setAdjustmentError('Por favor especifica el motivo');
      return;
    }
    if (cantidad <= 0) {
      setAdjustmentError('La cantidad debe ser mayor que cero');
      return;
    }

    setAdjusting(product.rowIndex);
    const finalVariation = variation * cantidad;

    try {
      await adjustStock(spreadsheetId, {
        rowIndex: product.rowIndex,
        codigo: product.codigo,
        nombre: product.nombre,
        almacen: product.almacen,
        oldStock: product.stock,
        variation: finalVariation,
        motivo: finalMotivo || (variation > 0 ? 'Ingreso' : 'Salida')
      });
      setAdjustmentModal(null);
      await loadInventoryData();
    } catch (err: any) {
      console.error(err);
      setAdjustmentError(err.message || 'Error al ajustar el stock');
    } finally {
      setAdjusting(null);
    }
  };

  const handleExportXLSX = () => {
    const rows = products.map(p => ({
      "Nombre *": p.nombre || "Producto sin nombre",
      "Código Interno": p.codigo || "",
      "Modelo": p.modelo || "",
      "Código Sunat": "",
      "Tipo de Unidad *": "NIU",
      "Tipo de Moneda *": "PEN",
      "Precio Venta *": p.precio || 0,
      "Tipo Afectación IGV (Venta) *": 10,
      "Tiene IGV": "SI",
      "Precio Compra": "",
      "Tipo Afectación IGV (Compra)": 10,
      "Stock *": p.stock || 0,
      "Stock Mínimo": "",
      "Categoría": p.categoria || "",
      "Marca": p.marca || "",
      "Descripción": p.descripcion || "",
      "Nombre Secundario": p.nombreAlt || "",
      "Código Lote": "",
      "Fec. Vencimiento": "",
      "Código de Barras": "",
      "Imagen (URL)": "",
      "Línea de Producto": "",
      "Registro Sanitario": "",
      "Código DIGEMID": "",
      "Código de Fábrica": ""
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    
    XLSX.writeFile(workbook, `inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filtered = products.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) || 
                          p.codigo.toLowerCase().includes(search.toLowerCase()) ||
                          p.almacen.toLowerCase().includes(search.toLowerCase());
    const matchesMarca = !selectedMarca || p.marca === selectedMarca;
    const matchesAlmacen = !selectedAlmacen || p.almacen === selectedAlmacen;
    const matchesUbicacion = !selectedUbicacion || p.ubicacion === selectedUbicacion;

    return matchesSearch && matchesMarca && matchesAlmacen && matchesUbicacion;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {error && (
        <div className="p-4 bg-red-50 border-b border-red-100 text-red-600 text-sm font-medium flex flex-col sm:flex-row justify-between items-center gap-4">
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
              placeholder="Buscar por nombre o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={loadInventoryData}
              className="p-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              title="Recargar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleExportXLSX}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors flex-1 sm:flex-none"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar Excel</span>
            </button>
            <button
              onClick={() => setIsHomologationModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-800 border border-amber-200 font-medium rounded-lg hover:bg-amber-100 transition-colors flex-1 sm:flex-none"
              title="Detectar duplicados y homologar nombres"
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Unificar Nombres</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4" />
              Nuevo Producto
            </button>
            <button
              onClick={onResetSpreadsheet}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Cambiar hoja de cálculo"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamic Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Marca</label>
            <select
              value={selectedMarca}
              onChange={(e) => setSelectedMarca(e.target.value)}
              className="block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"
            >
              <option value="">Todas las marcas</option>
              {uniqueMarcas.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

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
            <label className="block text-xs font-medium text-gray-500 mb-1">Filtrar por Ubicación</label>
            <select
              value={selectedUbicacion}
              onChange={(e) => setSelectedUbicacion(e.target.value)}
              className="block w-full px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-xs"
            >
              <option value="">Todas las ubicaciones</option>
              {uniqueUbicaciones.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ajuste</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading && products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Cargando inventario...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No se encontraron productos que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtered.map((product) => (
                <tr key={`${product.rowIndex}-${product.codigo}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {product.codigo}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{product.nombre}</div>
                    <div className="text-sm text-gray-500">{product.marca} {product.modelo ? `- ${product.modelo}` : ''}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {product.almacen}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {product.ubicacion || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                    {product.stock}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        disabled={adjusting === product.rowIndex || product.stock <= 0}
                        onClick={() => handleOpenAdjustModal(product, -1)}
                        className="p-1 rounded-full text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Venta / Restar Stock"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <button
                        disabled={adjusting === product.rowIndex}
                        onClick={() => handleOpenAdjustModal(product, 1)}
                        className="p-1 rounded-full text-green-600 hover:bg-green-50 disabled:opacity-50"
                        title="Ingreso / Sumar Stock"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setDuplicateProduct(product);
                          setIsAddModalOpen(true);
                        }}
                        className="p-1 rounded-full text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Duplicar Producto"
                      >
                        <Copy className="w-4.5 h-4.5" />
                      </button>
                      <button
                        onClick={() => {
                          setEditProduct(product);
                          setIsAddModalOpen(true);
                        }}
                        className="p-1 rounded-full text-slate-600 hover:bg-slate-100 transition-colors"
                        title="Editar Producto"
                      >
                        <Edit2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isAddModalOpen && (
        <AddProductModal 
          spreadsheetId={spreadsheetId}
          products={products}
          duplicateProduct={duplicateProduct}
          editProduct={editProduct}
          rowIndex={editProduct ? editProduct.rowIndex : undefined}
          onClose={() => {
            setIsAddModalOpen(false);
            setDuplicateProduct(null);
            setEditProduct(null);
          }}
          onSuccess={() => {
            setIsAddModalOpen(false);
            setDuplicateProduct(null);
            setEditProduct(null);
            loadInventoryData();
          }}
        />
      )}

      {isHomologationModalOpen && (
        <HomologationModal
          spreadsheetId={spreadsheetId}
          products={products}
          onClose={() => setIsHomologationModalOpen(false)}
          onSuccess={() => {
            setIsHomologationModalOpen(false);
            loadInventoryData();
          }}
        />
      )}

      {adjustmentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                Registrar Movimiento de Stock
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {adjustmentModal.product.nombre} ({adjustmentModal.product.codigo})
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              {adjustmentError && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                  {adjustmentError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de Movimiento</label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentError(null);
                      setAdjustmentModal(prev => prev ? {
                        ...prev,
                        variation: 1,
                        motivo: prev.motivo === 'Venta registrada' || prev.motivo === 'Producto dañado / mermas' ? 'Ingreso de mercadería' : prev.motivo
                      } : null);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      adjustmentModal.variation > 0
                        ? 'bg-green-50 border-green-200 text-green-700 font-bold'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Ingreso (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentError(null);
                      setAdjustmentModal(prev => prev ? {
                        ...prev,
                        variation: -1,
                        motivo: prev.motivo === 'Ingreso de mercadería' ? 'Venta registrada' : prev.motivo
                      } : null);
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      adjustmentModal.variation < 0
                        ? 'bg-red-50 border-red-200 text-red-700 font-bold'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Salida (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Cantidad</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <button
                    type="button"
                    onClick={() => setAdjustmentModal(prev => prev ? { ...prev, cantidad: Math.max(1, prev.cantidad - 1) } : null)}
                    className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 font-bold"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    className="flex-1 min-w-0 block w-full px-3 py-2 border border-gray-300 text-center text-sm outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={adjustmentModal.cantidad}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 1);
                      setAdjustmentModal(prev => prev ? { ...prev, cantidad: val } : null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setAdjustmentModal(prev => prev ? { ...prev, cantidad: prev.cantidad + 1 } : null)}
                    className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 font-bold"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Motivo</label>
                <select
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
                  value={adjustmentModal.motivo}
                  onChange={(e) => {
                    setAdjustmentError(null);
                    setAdjustmentModal(prev => prev ? { ...prev, motivo: e.target.value } : null);
                  }}
                >
                  {adjustmentModal.variation > 0 ? (
                    <>
                      <option value="Ingreso de mercadería">Ingreso de mercadería</option>
                      <option value="Devolución de cliente">Devolución de cliente</option>
                      <option value="Inventario físico / Ajuste">Inventario físico / Ajuste</option>
                      <option value="Otro...">Otro (especificar)...</option>
                    </>
                  ) : (
                    <>
                      <option value="Venta registrada">Venta registrada</option>
                      <option value="Producto dañado / mermas">Producto dañado / mermas</option>
                      <option value="Inventario físico / Ajuste">Inventario físico / Ajuste</option>
                      <option value="Otro...">Otro (especificar)...</option>
                    </>
                  )}
                </select>
              </div>

              {adjustmentModal.motivo === 'Otro...' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Escribe el Motivo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Traspaso entre almacenes"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={adjustmentModal.customMotivo}
                    onChange={(e) => {
                      setAdjustmentError(null);
                      setAdjustmentModal(prev => prev ? { ...prev, customMotivo: e.target.value } : null);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustmentModal(null)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={adjusting !== null}
                onClick={handleConfirmAdjustment}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm flex items-center justify-center min-w-[100px]"
              >
                {adjusting !== null ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
