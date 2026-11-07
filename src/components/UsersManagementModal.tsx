import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus, Trash2, KeyRound, Shield, Check, AlertCircle } from 'lucide-react';
import { getAuthToken, AppUser } from '../auth';

interface UsersManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
}

export default function UsersManagementModal({ isOpen, onClose, currentUser }: UsersManagementModalProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for creating / editing user
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'operador' | 'vendedor'>('operador');
  const [password, setPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Error al obtener usuarios');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setShowAddForm(false);
      setEditingUserId(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenAdd = () => {
    setEditingUserId(null);
    setUsername('');
    setName('');
    setRole('operador');
    setPassword('');
    setShowAddForm(true);
    setError(null);
  };

  const handleOpenEdit = (u: AppUser) => {
    setEditingUserId(u.id);
    setUsername(u.username);
    setName(u.name);
    setRole(u.role);
    setPassword(''); // leave blank unless updating
    setShowAddForm(true);
    setError(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        username: username.trim(),
        name: name.trim(),
        role
      };
      if (editingUserId) {
        payload.id = editingUserId;
        if (password) payload.password = password;
      } else {
        if (!password) {
          setError('Ingresa una contraseña para el nuevo usuario');
          return;
        }
        payload.password = password;
      }

      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al guardar usuario');
      }

      setSuccessMsg(editingUserId ? '¡Usuario actualizado!' : '¡Usuario creado con éxito!');
      setShowAddForm(false);
      setEditingUserId(null);
      await loadUsers();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (u: AppUser) => {
    if (!confirm(`¿Estás seguro de eliminar el usuario "${u.username}" (${u.name})?`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/auth/users/${u.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al eliminar usuario');
      }
      setSuccessMsg(`Usuario ${u.username} eliminado`);
      await loadUsers();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-xl w-full p-6 text-left relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Gestión de Usuarios</h2>
            <p className="text-xs text-gray-500">Administra quiénes pueden ingresar y editar el inventario</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {showAddForm ? (
            <form onSubmit={handleSaveUser} className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                {editingUserId ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Usuario (Login)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. juan"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {editingUserId ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUserId ? 'Dejar en blanco para conservar' : '••••••••'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Rol / Permiso</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full text-xs bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="operador">Operador (Ajustes de stock y consulta)</option>
                    <option value="vendedor">Ventas (Sólo consulta)</option>
                    <option value="admin">Administrador (Control total)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  {editingUserId ? 'Actualizar Usuario' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-gray-600">
                Usuarios Registrados ({users.length})
              </span>
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Agregar Usuario</span>
              </button>
            </div>
          )}

          {/* Lista de usuarios */}
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden bg-white">
            {loading ? (
              <div className="p-6 text-center text-xs text-gray-400">Cargando usuarios...</div>
            ) : users.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">No hay usuarios registrados</div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="p-3.5 flex items-center justify-between hover:bg-gray-50/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'operador' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <span>{u.name}</span>
                        {u.id === currentUser.id && (
                          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-normal">
                            (Tú)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2">
                        <span>@{u.username}</span>
                        <span>•</span>
                        <span className="capitalize font-medium text-gray-700">{u.role}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(u)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      title="Editar usuario o cambiar contraseña"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {u.id !== currentUser.id && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar usuario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-left text-[11px] text-amber-900 flex items-start gap-2">
            <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              <strong>Seguridad garantizada:</strong> Las contraseñas están encriptadas con algoritmos criptográficos (SHA-256 + Salt) y el archivo de usuarios está protegido en el servidor contra cualquier acceso web directo.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex justify-end mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
