import React, { useState, useEffect } from 'react';
import { getCurrentUser, loginWithCredentials, logoutUser, AppUser } from './auth';
import { 
  Package, 
  History, 
  LogOut, 
  User as UserIcon, 
  Lock, 
  Eye, 
  EyeOff, 
  Database, 
  ExternalLink, 
  AlertCircle,
  ShieldCheck,
  SlidersHorizontal,
  Users
} from 'lucide-react';
import InventoryTable from './components/InventoryTable';
import HistoryTable from './components/HistoryTable';
import SheetConfigModal from './components/SheetConfigModal';
import UsersManagementModal from './components/UsersManagementModal';

export default function App() {
  const [user, setUser] = useState<AppUser | null>(() => getCurrentUser());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'inventario' | 'historial'>('inventario');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);

  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlSheetId = urlParams.get('sheet');
    if (urlSheetId) {
      localStorage.setItem('spreadsheetId', urlSheetId);
      const url = new URL(window.location.href);
      url.searchParams.delete('sheet');
      window.history.replaceState({}, '', url.toString());
      return urlSheetId;
    }
    return localStorage.getItem('spreadsheetId') || '129v_Lw-mBELjpjtVE0HT_DOgzJTid4_lAR-boqzxy9o';
  });

  useEffect(() => {
    localStorage.setItem('spreadsheetId', spreadsheetId);
  }, [spreadsheetId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setLoginError('Por favor ingresa usuario y contraseña');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const loggedUser = await loginWithCredentials(username.trim(), password);
      setUser(loggedUser);
    } catch (err: any) {
      setLoginError(err.message || 'Error al iniciar sesión');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    logoutUser();
    setUser(null);
  };

  // If NOT logged in, show User & Password Login Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-100 to-slate-200 flex flex-col justify-center items-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-200/80 max-w-md w-full text-center">
          <div className="inline-flex p-3.5 bg-blue-50 text-blue-600 rounded-2xl mb-4 shadow-xs">
            <Package className="w-10 h-10" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inventario Pro</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-1 mb-6">
            Gestión y sincronización en tiempo real con Google Sheets
          </p>

          {loginError && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-left text-xs text-red-800 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Ej. admin o operador"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 bg-gray-50/50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-blue-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-2 py-3 px-4 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
            >
              {isLoggingIn ? 'Verificando...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Información de la Hoja Conectada */}
          <div className="mt-5 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-left text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <Database className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate text-[11px]">
                Google Sheet: <strong className="text-slate-800">129v_Lw...</strong>
              </span>
            </div>
            <a
              href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-800 shrink-0 p-1"
              title="Abrir hoja de cálculo"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Application
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <span className="font-bold text-lg text-gray-900 tracking-tight">Inventario Pro</span>
              </div>

              {/* Botón de estado de la hoja de cálculo */}
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors cursor-pointer"
                title="Configuración y estado de Google Sheets"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Google Sheet Conectado</span>
                <SlidersHorizontal className="w-3 h-3 text-emerald-700 ml-1" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón Gestión de Usuarios para Administradores */}
              {user.role === 'admin' && (
                <button
                  onClick={() => setIsUsersModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                  title="Gestión de usuarios y contraseñas"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Usuarios</span>
                </button>
              )}

              {/* Perfil del usuario autenticado */}
              <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-xl">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-gray-800 leading-tight">{user.name}</div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                    <span className="capitalize">{user.role}</span>
                  </div>
                </div>
              </div>

              {/* Botón Configuración para móviles */}
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Configuración de Google Sheets"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {/* Cerrar Sesión */}
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        <div className="space-y-6">
          <div className="flex border-b border-gray-200 gap-2">
            <button
              onClick={() => setActiveTab('inventario')}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 font-semibold text-xs sm:text-sm transition-colors cursor-pointer ${
                activeTab === 'inventario'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Inventario y Stock</span>
            </button>
            <button
              onClick={() => setActiveTab('historial')}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 font-semibold text-xs sm:text-sm transition-colors cursor-pointer ${
                activeTab === 'historial'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Historial de Movimientos</span>
            </button>
          </div>

          {activeTab === 'inventario' ? (
            <InventoryTable
              spreadsheetId={spreadsheetId}
              onResetSpreadsheet={() => setIsConfigModalOpen(true)}
            />
          ) : (
            <HistoryTable spreadsheetId={spreadsheetId} />
          )}
        </div>
      </main>

      {/* Modal de Configuración y Código de Apps Script */}
      <SheetConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        spreadsheetId={spreadsheetId}
        onUpdateSpreadsheetId={(newId) => setSpreadsheetId(newId)}
      />

      {/* Modal de Gestión de Usuarios y Permisos */}
      <UsersManagementModal
        isOpen={isUsersModalOpen}
        onClose={() => setIsUsersModalOpen(false)}
        currentUser={user}
      />
    </div>
  );
}
