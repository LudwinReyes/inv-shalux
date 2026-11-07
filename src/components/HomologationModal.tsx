import { useState, useEffect } from 'react';
import { addProduct } from '../utils/sheets';
import { X, Sparkles, AlertTriangle, Check, ArrowRight, Tag, HelpCircle, RefreshCw } from 'lucide-react';

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

interface HomologationModalProps {
  spreadsheetId: string;
  products: Product[];
  onClose: () => void;
  onSuccess: () => void;
}

// Jaccard similarity to find similar product names
const getSimilarity = (name1: string, name2: string) => {
  const stopWords = new Set(["y", "de", "con", "en", "el", "la", "un", "una", "del", "por", "para", "x", "cm", "w", "v", "e27"]);
  const clean = (s: string) => s.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
  
  const words1 = clean(name1);
  const words2 = clean(name2);
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let intersection = 0;
  set1.forEach(w => {
    if (set2.has(w)) intersection++;
  });
  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
};

export default function HomologationModal({ spreadsheetId, products, onClose, onSuccess }: HomologationModalProps) {
  const [activeTab, setActiveTab] = useState<'sugerencias' | 'manual'>('sugerencias');
  const [groups, setGroups] = useState<Product[][]>([]);
  
  // Selection states for manual matching
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Flow control
  const [selectedGroupToHomologate, setSelectedGroupToHomologate] = useState<Product[] | null>(null);
  const [chosenName, setChosenName] = useState('');
  const [customName, setCustomName] = useState('');
  const [unifyMarca, setUnifyMarca] = useState(true);
  const [chosenMarca, setChosenMarca] = useState('');
  const [unifyCategoria, setUnifyCategoria] = useState(true);
  const [chosenCategoria, setChosenCategoria] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [success, setSuccess] = useState(false);

  // Group similar products dynamically
  useEffect(() => {
    const groupsList: Product[][] = [];
    const visited = new Set<number>();
    
    for (let i = 0; i < products.length; i++) {
      if (visited.has(i)) continue;
      const p1 = products[i];
      const currentGroup = [p1];
      
      for (let j = i + 1; j < products.length; j++) {
        if (visited.has(j)) continue;
        const p2 = products[j];
        
        // Match if brands overlap, or if at least one is blank, or they are very similar names
        const b1 = (p1.marca || '').toString().toLowerCase().trim();
        const b2 = (p2.marca || '').toString().toLowerCase().trim();
        const brandMatch = b1 === b2 || !b1 || !b2;
        
        if (brandMatch) {
          const sim = getSimilarity(p1.nombre, p2.nombre);
          // 0.40 similarity threshold is perfect for fuzzy matches
          if (sim >= 0.40) {
            currentGroup.push(p2);
            visited.add(j);
          }
        }
      }
      
      if (currentGroup.length > 1) {
        groupsList.push(currentGroup);
        visited.add(i);
      }
    }
    
    setGroups(groupsList);
  }, [products]);

  // Set defaults when selecting a group to homologate
  const handleStartHomologation = (group: Product[]) => {
    setSelectedGroupToHomologate(group);
    setChosenName(group[0].nombre);
    setCustomName('');
    
    // Default marca & category from first product in group with populated value
    const firstPopulatedMarca = group.find(p => p.marca)?.marca || '';
    setChosenMarca(firstPopulatedMarca);
    
    const firstPopulatedCat = group.find(p => p.categoria)?.categoria || '';
    setChosenCategoria(firstPopulatedCat);
  };

  const handleConfirm = async () => {
    if (!selectedGroupToHomologate) return;
    setLoading(true);
    setSuccess(false);
    
    const finalName = customName.trim() || chosenName;
    
    try {
      for (let i = 0; i < selectedGroupToHomologate.length; i++) {
        const p = selectedGroupToHomologate[i];
        setStatusMessage(`Actualizando producto ${i + 1} de ${selectedGroupToHomologate.length}...`);
        
        const targetCodigo = selectedGroupToHomologate[0]?.codigo || '';
        const updatedProduct = {
          ...p,
          nombre: finalName,
          codigo: targetCodigo,
          marca: unifyMarca ? chosenMarca : p.marca,
          categoria: unifyCategoria ? chosenCategoria : p.categoria
        };

        await addProduct(spreadsheetId, updatedProduct, p.rowIndex);
      }
      
      setSuccess(true);
      setStatusMessage('¡Productos homologados con éxito en Google Sheets!');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      alert('Error al homologar los productos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filtering for manual tab
  const filteredProductsManual = products.filter(p => {
    const term = searchTerm.toLowerCase();
    return p.nombre.toLowerCase().includes(term) || 
           p.codigo.toLowerCase().includes(term) ||
           (p.marca || '').toLowerCase().includes(term);
  });

  const handleToggleProductManual = (rowIndex: number) => {
    setSelectedProductIds(prev => 
      prev.includes(rowIndex) 
        ? prev.filter(id => id !== rowIndex) 
        : [...prev, rowIndex]
    );
  };

  const handleStartManualHomologation = () => {
    const selectedList = products.filter(p => selectedProductIds.includes(p.rowIndex));
    if (selectedList.length < 2) {
      alert('Por favor selecciona al menos 2 productos para homologar');
      return;
    }
    handleStartHomologation(selectedList);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              Homologación de Nombres y Duplicados
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Identifica productos idénticos registrados con nombres diferentes y unifícalos para evitar errores de stock
            </p>
          </div>
          <button onClick={onClose} disabled={loading} className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        {!selectedGroupToHomologate ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              <button
                onClick={() => setActiveTab('sugerencias')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === 'sugerencias'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Sugerencias de Duplicados ({groups.length})
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === 'manual'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Selección Manual
              </button>
            </div>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeTab === 'sugerencias' ? (
                groups.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <Check className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <h4 className="font-bold text-gray-800">¡Todo en orden!</h4>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                      No se detectaron productos adicionales con nombres sospechosamente similares o duplicados.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      Se han agrupado los productos que comparten la mayoría de palabras clave en su nombre. Puedes homologarlos para que tengan exactamente el mismo nombre de producto.
                    </p>

                    {groups.map((group, groupIdx) => {
                      const totalStock = group.reduce((acc, p) => acc + p.stock, 0);
                      const uniqueBrands = Array.from(new Set(group.map(p => p.marca).filter(Boolean)));
                      return (
                        <div key={groupIdx} className="border border-gray-100 rounded-xl bg-white shadow-xs overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-100 flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-700">
                              Grupo #{groupIdx + 1} {uniqueBrands.length > 0 ? `(${uniqueBrands.join(', ')})` : ''}
                            </span>
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                              {group.length} productos • Stock Total: {totalStock}
                            </span>
                          </div>
                          
                          <div className="divide-y divide-gray-50 p-2">
                            {group.map((p, idx) => (
                              <div key={idx} className="p-2 flex justify-between items-center text-xs">
                                <div className="space-y-0.5">
                                  <div className="font-bold text-gray-800">{p.nombre}</div>
                                  <div className="text-[10px] text-gray-500 flex gap-2">
                                    <span>Almacén: <b className="text-gray-700 font-semibold">{p.almacen || 'General'}</b></span>
                                    <span>Ubicación: <b className="text-gray-700 font-semibold">{p.ubicacion || 'Sin ub.'}</b></span>
                                    <span>Código: <b className="text-gray-700 font-semibold">{p.codigo || 'S/C'}</b></span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-4">
                                  <div className="font-bold text-gray-900">{p.stock} u.</div>
                                  <div className="text-[10px] text-gray-400">S/. {p.precio}</div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="p-2.5 bg-slate-50 border-t border-gray-100 flex justify-end">
                            <button
                              onClick={() => handleStartHomologation(group)}
                              className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                            >
                              Homologar Nombres
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Buscar para seleccionar productos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button
                      onClick={handleStartManualHomologation}
                      disabled={selectedProductIds.length < 2}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors disabled:opacity-50"
                    >
                      Homologar Seleccionados ({selectedProductIds.length})
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-500">
                    Selecciona dos o más productos que representan el mismo artículo pero tienen nombres escritos de forma distinta.
                  </p>

                  <div className="border border-gray-100 rounded-xl divide-y divide-gray-100 max-h-[350px] overflow-y-auto bg-white">
                    {filteredProductsManual.map((p) => {
                      const isChecked = selectedProductIds.includes(p.rowIndex);
                      return (
                        <div 
                          key={p.rowIndex} 
                          onClick={() => handleToggleProductManual(p.rowIndex)}
                          className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors select-none ${
                            isChecked ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // Handled by div onClick
                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-gray-900 truncate">{p.nombre}</div>
                            <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {p.marca && <span>Marca: <b className="text-gray-700">{p.marca}</b></span>}
                              {p.categoria && <span>Cat: <b className="text-gray-700">{p.categoria}</b></span>}
                              <span>Almacén: <b className="text-gray-700">{p.almacen || 'General'}</b></span>
                              <span>Código: <b className="text-gray-700">{p.codigo || 'S/C'}</b></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-bold text-xs text-gray-800">
                            {p.stock} u.
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : (
          /* STEP 2: Configure & Apply Homologation */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              {/* Product cards list being homologated */}
              <div className="bg-slate-50 border border-gray-200/60 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-700 mb-2">
                  Productos que serán unificados ({selectedGroupToHomologate.length}):
                </h4>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto divide-y divide-slate-200/50">
                  {selectedGroupToHomologate.map((p, idx) => (
                    <div key={idx} className="pt-1.5 first:pt-0 text-[11px] flex justify-between">
                      <span className="font-semibold text-slate-800">{p.nombre}</span>
                      <span className="text-slate-500 shrink-0 ml-4 font-medium">
                        {p.almacen || 'General'} ({p.stock} u.)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form to choose correct values */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Selecciona el nombre correcto que deseas aplicar:
                  </label>
                  <div className="space-y-2">
                    {/* Unique names as options */}
                    {Array.from(new Set(selectedGroupToHomologate.map(p => p.nombre))).map((name, idx) => (
                      <label 
                        key={idx} 
                        className={`flex items-center gap-3 p-3 border rounded-xl text-xs cursor-pointer hover:bg-slate-50 transition-colors ${
                          chosenName === name && !customName ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'
                        }`}
                        onClick={() => {
                          setChosenName(name);
                          setCustomName('');
                        }}
                      >
                        <input
                          type="radio"
                          name="correct_name"
                          checked={chosenName === name && !customName}
                          onChange={() => {}} // handled by click
                          className="text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="font-semibold text-gray-800">{name}</span>
                      </label>
                    ))}

                    {/* Custom input option */}
                    <div className={`p-3 border rounded-xl text-xs transition-colors ${
                      customName ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'
                    }`}>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="correct_name"
                          checked={!!customName}
                          onChange={() => {
                            if (!customName) {
                              setCustomName(chosenName);
                            }
                          }}
                          className="text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="font-semibold text-gray-700">Escribir un nombre personalizado:</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Escribe el nombre definitivo del producto..."
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="mt-2 w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </div>

                {/* Additional homogenizations: Brand & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                  {/* Brand Unification */}
                  <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 mb-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={unifyMarca}
                        onChange={(e) => setUnifyMarca(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Homologar Marca</span>
                    </label>
                    <select
                      value={chosenMarca}
                      onChange={(e) => setChosenMarca(e.target.value)}
                      disabled={!unifyMarca}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none disabled:bg-gray-100 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">(Ninguna)</option>
                      {Array.from(new Set(products.map(p => p.marca).filter(Boolean))).sort().map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category Unification */}
                  <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-700 mb-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={unifyCategoria}
                        onChange={(e) => setUnifyCategoria(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Homologar Categoría</span>
                    </label>
                    <select
                      value={chosenCategoria}
                      onChange={(e) => setChosenCategoria(e.target.value)}
                      disabled={!unifyCategoria}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none disabled:bg-gray-100 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">(Ninguna)</option>
                      {Array.from(new Set(products.map(p => p.categoria).filter(Boolean))).sort().map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

              </div>
            </div>

            {/* Status / Loading footer */}
            {statusMessage && (
              <div className="px-6 py-2 bg-slate-100 text-slate-700 text-xs font-semibold text-center flex items-center justify-center gap-2">
                {!success && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                {success && <Check className="w-3.5 h-3.5 text-green-600" />}
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Footer buttons */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between bg-gray-50">
              <button
                type="button"
                onClick={() => setSelectedGroupToHomologate(null)}
                disabled={loading}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Volver
              </button>
              
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading || success || !(customName.trim() || chosenName)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {loading ? 'Guardando cambios...' : 'Confirmar y Actualizar Excel'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
