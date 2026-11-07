import React, { useState, useRef, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';
import { addProduct } from '../utils/sheets';
import { X, Sparkles, ChevronDown, ChevronUp, Check } from 'lucide-react';

interface AddProductModalProps {
  spreadsheetId: string;
  products?: any[];
  onClose: () => void;
  onSuccess: () => void;
  duplicateProduct?: any;
  editProduct?: any;
  rowIndex?: number;
}

interface AutocompleteInputProps {
  label: string;
  name: string;
  value: string;
  required?: boolean;
  onChange: (name: string, value: string) => void;
  suggestions: string[];
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
}

// Custom highly accessible Autocomplete Input Component
function AutocompleteInput({
  label,
  name,
  value,
  required = false,
  onChange,
  suggestions,
  placeholder = "",
  type = "text",
  min,
  step
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on what user has typed (case-insensitive fuzzy/prefix matching)
  const filtered = suggestions.filter(s => {
    if (!s || !value) return false;
    const itemLower = s.toString().toLowerCase().trim();
    const valLower = value.toString().toLowerCase().trim();
    // Suggest if it contains the value, but is not exactly the same
    return itemLower.includes(valLower) && itemLower !== valLower;
  }).slice(0, 6); // Limit to 6 suggestions for visual elegance

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        e.preventDefault();
        onChange(name, filtered[highlightedIndex]);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <label className="block text-sm font-semibold text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        required={required}
        min={min}
        step={step}
        placeholder={placeholder}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          onChange(name, e.target.value);
          setIsOpen(true);
          setHighlightedIndex(0); // auto-highlight the first match
        }}
        onKeyDown={handleKeyDown}
        className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 transition-all bg-white"
        autoComplete="off"
      />

      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 max-h-48 overflow-y-auto py-1.5 divide-y divide-gray-50">
          <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50">
            Sugerencias encontradas
          </div>
          {filtered.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                onChange(name, suggestion);
                setIsOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full text-left px-3.5 py-2.5 text-sm flex items-center justify-between transition-colors ${
                index === highlightedIndex ? 'bg-blue-50/80 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{suggestion}</span>
              {index === highlightedIndex && <Check className="w-3.5 h-3.5 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AddProductModal({ spreadsheetId, products = [], onClose, onSuccess, duplicateProduct, editProduct, rowIndex }: AddProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAdditional, setShowAdditional] = useState(() => {
    if (duplicateProduct) {
      return !!(
        duplicateProduct.modelo ||
        duplicateProduct.precio ||
        duplicateProduct.nombreAlt ||
        duplicateProduct.descripcion
      );
    }
    if (editProduct) {
      return !!(
        editProduct.modelo ||
        editProduct.precio ||
        editProduct.nombreAlt ||
        editProduct.descripcion ||
        editProduct.codigo
      );
    }
    return false;
  });
  
  const [formData, setFormData] = useState(() => {
    const savedAlmacen = sessionStorage.getItem('last_almacen') || '';
    const savedUbicacion = sessionStorage.getItem('last_ubicacion') || '';
    
    if (editProduct) {
      return {
        codigo: editProduct.codigo || '',
        nombre: editProduct.nombre || '',
        marca: editProduct.marca || '',
        modelo: editProduct.modelo || '',
        categoria: editProduct.categoria || '',
        almacen: editProduct.almacen || '',
        stock: editProduct.stock || 0,
        precio: editProduct.precio || 0,
        nombreAlt: editProduct.nombreAlt || '',
        descripcion: editProduct.descripcion || '',
        ubicacion: editProduct.ubicacion || ''
      };
    }

    if (duplicateProduct) {
      return {
        codigo: duplicateProduct.codigo || '',
        nombre: duplicateProduct.nombre || '',
        marca: duplicateProduct.marca || '',
        modelo: duplicateProduct.modelo || '',
        categoria: duplicateProduct.categoria || '',
        almacen: savedAlmacen,
        stock: 0,
        precio: duplicateProduct.precio || 0,
        nombreAlt: duplicateProduct.nombreAlt || '',
        descripcion: duplicateProduct.descripcion || '',
        ubicacion: savedUbicacion
      };
    }

    return {
      codigo: '',
      nombre: '',
      marca: '',
      modelo: '',
      categoria: '',
      almacen: savedAlmacen,
      stock: 0,
      precio: 0,
      nombreAlt: '',
      descripcion: '',
      ubicacion: savedUbicacion
    };
  });

  // Extract unique lists from current inventory for the auto-suggestions
  const productsList = Array.isArray(products) ? products : [];
  
  // Filter products by selected brand for the product name recommendations
  const filteredProductsByMarca = formData.marca
    ? productsList.filter(p => (p.marca || '').toString().toLowerCase().trim() === formData.marca.toLowerCase().trim())
    : productsList;

  const suggestedNombres = Array.from(new Set(filteredProductsByMarca.map(p => p.nombre).filter(Boolean).map(x => x.toString()))).sort();
  const suggestedMarcas = Array.from(new Set(productsList.map(p => p.marca).filter(Boolean).map(x => x.toString()))).sort();
  const suggestedCategorias = Array.from(new Set(productsList.map(p => p.categoria).filter(Boolean).map(x => x.toString()))).sort();
  const suggestedModelos = Array.from(new Set(productsList.map(p => p.modelo).filter(Boolean).map(x => x.toString()))).sort();
  const suggestedUbicaciones = Array.from(new Set(productsList.map(p => p.ubicacion).filter(Boolean).map(x => x.toString()))).sort();

  // Combine custom warehouses in the sheet with the default ones
  const defaultAlmacenes = ["Almacén Principal", "Tienda 1", "Tienda 2", "Tienda 3", "Almacén Secundario"];
  const sheetAlmacenes = productsList.map(p => p.almacen).filter(Boolean).map(x => x.toString());
  const suggestedAlmacenes = Array.from(new Set([...defaultAlmacenes, ...sheetAlmacenes])).sort();

  const handleFieldChange = (name: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      
      if (name === 'nombre' && value) {
        const matchedProduct = productsList.find(p => 
          p.nombre && p.nombre.toString().toLowerCase().trim() === value.toLowerCase().trim()
        );
        if (matchedProduct) {
          if (matchedProduct.marca) {
            updated.marca = matchedProduct.marca.toString();
          }
          if (matchedProduct.categoria) {
            updated.categoria = matchedProduct.categoria.toString();
          }
        }
      }
      
      return updated;
    });
  };

  const handleStandardChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerateIA = async () => {
    if (!formData.nombre || !formData.marca || !formData.categoria) {
      alert("Por favor, llena primero los campos obligatorios: Nombre, Marca y Categoría antes de usar la IA.");
      return;
    }

    setGenerating(true);
    try {
      const data = await fetchWithAuth('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          marca: formData.marca,
          categoria: formData.categoria
        })
      });
      if (data.descripcion || data.nombreAlternativo) {
        setFormData(prev => ({
          ...prev,
          descripcion: data.descripcion || prev.descripcion,
          nombreAlt: data.nombreAlternativo || prev.nombreAlt
        }));
        // Automatically expand the details section to show the generated values
        setShowAdditional(true);
      }
    } catch (err) {
      console.error(err);
      alert("Error al generar con IA");
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parseNum = (val: any) => {
        if (!val) return 0;
        const parsed = parseFloat(String(val).replace(/,/g, '.').replace(/[^0-9.-]/g, ''));
        return isNaN(parsed) ? 0 : parsed;
      };

      const productData = {
        ...formData,
        stock: parseNum(formData.stock),
        precio: parseNum(formData.precio)
      };
      
      const targetRowIndex = rowIndex !== undefined ? rowIndex : (products?.length || 0);
      
      await addProduct(spreadsheetId, productData, targetRowIndex);
      
      if (formData.almacen) {
        sessionStorage.setItem('last_almacen', formData.almacen);
      }
      if (formData.ubicacion) {
        sessionStorage.setItem('last_ubicacion', formData.ubicacion);
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al guardar el producto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>

      {/* Modal Container */}
      <div className="relative bg-white rounded-2xl text-left shadow-2xl transform transition-all w-full max-w-2xl overflow-hidden z-10 border border-gray-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {editProduct ? 'Editar Producto' : 'Registrar Nuevo Producto'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {editProduct ? 'Modifica los datos del producto existente' : 'Completa los datos de inventario y ubicación a continuación'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form id="add-product-form" onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* PRIMARY FIELDS - REQUESTED PRIORITY ORDER */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Campos Principales
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Nombre */}
              <div className="sm:col-span-2">
                <AutocompleteInput
                  label="Nombre del Producto"
                  name="nombre"
                  value={formData.nombre}
                  required={true}
                  onChange={handleFieldChange}
                  suggestions={suggestedNombres}
                  placeholder="Ej. Cable HDMI 2.0 Ultra HD"
                />
              </div>

              {/* 2. Categoría */}
              <div>
                <AutocompleteInput
                  label="Categoría"
                  name="categoria"
                  value={formData.categoria}
                  required={true}
                  onChange={handleFieldChange}
                  suggestions={suggestedCategorias}
                  placeholder="Ej. Cables / Conectores"
                />
              </div>

              {/* 3. Marca */}
              <div>
                <AutocompleteInput
                  label="Marca"
                  name="marca"
                  value={formData.marca}
                  required={true}
                  onChange={handleFieldChange}
                  suggestions={suggestedMarcas}
                  placeholder="Ej. Opalux"
                />
              </div>

              {/* 4. Stock Inicial */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Stock Inicial <span className="text-red-500">*</span>
                </label>
                <div className="flex rounded-xl shadow-sm">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, stock: Math.max(0, Number(prev.stock) - 1) }))}
                    className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 font-bold transition-colors"
                  >
                    -
                  </button>
                  <input
                    required
                    type="number"
                    min="0"
                    name="stock"
                    value={formData.stock}
                    onChange={handleStandardChange}
                    className="flex-1 min-w-0 block w-full px-3 py-2.5 border border-gray-300 text-center text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, stock: Number(prev.stock) + 1 }))}
                    className="inline-flex items-center px-4 rounded-r-xl border border-l-0 border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 5. Almacén */}
              <div>
                <AutocompleteInput
                  label="Almacén de Destino"
                  name="almacen"
                  value={formData.almacen}
                  required={true}
                  onChange={handleFieldChange}
                  suggestions={suggestedAlmacenes}
                  placeholder="Ej. Almacén Principal"
                />
              </div>

              {/* 6. Ubicación */}
              <div className="sm:col-span-2">
                <AutocompleteInput
                  label="Ubicación (Pasillo / Estante)"
                  name="ubicacion"
                  value={formData.ubicacion}
                  required={false}
                  onChange={handleFieldChange}
                  suggestions={suggestedUbicaciones}
                  placeholder="Ej. Pasillo A - Estante 3"
                />
              </div>
            </div>
          </div>

          {/* COLLAPSIBLE DETAILS / ADDITIONAL FIELDS */}
          <div className="border-t border-gray-100 pt-5">
            <button
              type="button"
              onClick={() => setShowAdditional(!showAdditional)}
              className="flex items-center justify-between w-full text-left py-2 text-gray-900 font-semibold focus:outline-none"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Información Adicional (Opcional)
                </span>
              </div>
              {showAdditional ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {showAdditional && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 animate-fadeIn">
                
                {/* Código Interno */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Código Interno / Barras
                  </label>
                  <input
                    type="text"
                    name="codigo"
                    value={formData.codigo}
                    onChange={handleStandardChange}
                    placeholder="Se autogenerará si se deja en blanco"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  />
                </div>

                {/* Modelo */}
                <div>
                  <AutocompleteInput
                    label="Modelo"
                    name="modelo"
                    value={formData.modelo}
                    onChange={handleFieldChange}
                    suggestions={suggestedModelos}
                    placeholder="Ej. OP-9030"
                  />
                </div>

                {/* Nombre Alternativo */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Nombre Alternativo
                  </label>
                  <input
                    type="text"
                    name="nombreAlt"
                    value={formData.nombreAlt}
                    onChange={handleStandardChange}
                    placeholder="Nombre comercial alterno"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  />
                </div>

                {/* Precio */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Precio ($)
                  </label>
                  <div className="relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <span className="text-gray-400 sm:text-sm font-bold">$</span>
                    </div>
                    <input
                      type="text"
                      name="precio"
                      value={formData.precio === 0 ? "" : formData.precio}
                      onChange={handleStandardChange}
                      placeholder="0.00"
                      className="w-full pl-8 pr-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white font-medium"
                    />
                  </div>
                </div>

                {/* Descripción */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Descripción Comercial / Detalles
                  </label>
                  <textarea
                    name="descripcion"
                    rows={2}
                    value={formData.descripcion}
                    onChange={handleStandardChange}
                    placeholder="Detalles sobre características del producto..."
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white"
                  />
                </div>

                {/* AI Helper Banner */}
                <div className="sm:col-span-2 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-1">
                  <div>
                    <h5 className="text-xs font-bold text-blue-900 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 fill-blue-600/30" />
                      Asistente de Autocompletado IA
                    </h5>
                    <p className="text-xs text-blue-700 mt-0.5 max-w-md">
                      Genera automáticamente el Nombre Alternativo y la Descripción Comercial basándote en el Nombre, Marca y Categoría.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateIA}
                    disabled={generating || !formData.nombre || !formData.marca || !formData.categoria}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50 transition-colors whitespace-nowrap shadow-sm"
                  >
                    {generating ? 'Generando...' : 'Autocompletar con IA'}
                  </button>
                </div>

              </div>
            )}
          </div>

        </form>

        {/* Modal Actions Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row-reverse gap-3">
          <button
            type="submit"
            form="add-product-form"
            disabled={loading}
            className="w-full sm:w-auto inline-flex justify-center items-center rounded-xl border border-transparent shadow-sm px-5 py-2.5 bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
          >
            {loading ? 'Guardando...' : (editProduct ? 'Guardar Cambios' : 'Guardar Producto')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto inline-flex justify-center items-center rounded-xl border border-gray-300 shadow-sm px-5 py-2.5 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
