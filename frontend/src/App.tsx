import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Server,
  ShieldAlert,
  Trophy,
  Unlock,
  Users,
} from 'lucide-react';
import {
  DashboardOverview,
  fetchDashboardOverview,
  getStoredToken,
  setStoredToken,
  verifyPin,
} from './services/api';

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return 'Sin registro';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export function App() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const [activeTab, setActiveTab] = useState<'global' | 'futmad' | 'georisk'>('global');
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const overview = await fetchDashboardOverview(token);
      setData(overview);
    } catch (err: any) {
      if (!getStoredToken()) {
        setToken(null);
      } else {
        setError(err?.message || 'No se pudo cargar el cuadro de mando.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, loadData]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setPinError('Introduce el PIN de 4 dígitos.');
      return;
    }
    setIsVerifying(true);
    setPinError(null);
    try {
      const newToken = await verifyPin(pin);
      setToken(newToken);
      setPin('');
    } catch (err: any) {
      setPinError(err?.message || 'PIN incorrecto.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white">Homelab Pulse</h1>
            <p className="text-xs text-slate-400">
              Cuadro de Mando & Analítica de Aplicaciones en Dokploy
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                setPinError(null);
              }}
              placeholder="••••"
              className="w-full text-center text-2xl font-mono tracking-[0.6em] py-3 px-4 rounded-2xl bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-white"
            />
            {pinError && (
              <p className="text-xs text-rose-400 text-center bg-rose-500/10 border border-rose-500/20 rounded-xl py-2 px-3">
                {pinError}
              </p>
            )}
            <button
              type="submit"
              disabled={isVerifying || pin.length !== 4}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Lock className="w-4 h-4" />
              <span>{isVerifying ? 'Verificando...' : 'Entrar al Cuadro de Mando'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Cabecera superior */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Homelab Pulse · Cuadro de Mando
              </h1>
              <p className="text-[11px] text-slate-400">
                {data ? `Actualizado: ${formatDateTime(data.generated_at)}` : 'Cargando telemetría...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
              title="Refrescar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={() => {
                setStoredToken(null);
                setToken(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-semibold transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bloquear</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-6">
        {/* Selector de Pestañas */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl">
          <button
            onClick={() => setActiveTab('global')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'global'
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Dokploy & Global</span>
          </button>
          <button
            onClick={() => setActiveTab('futmad')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'futmad'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Fútbol Base Madrid</span>
          </button>
          <button
            onClick={() => setActiveTab('georisk')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'georisk'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>GeoRisk Inmo</span>
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {error}
          </div>
        )}

        {data && activeTab === 'global' && (
          <div className="space-y-6">
            {/* KPIs Globales */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Contenedores Activos</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">
                  {data.dokploy.containers_running}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Usuarios Registrados</p>
                <p className="text-2xl font-black text-white mt-1">
                  {data.global_kpis.total_registered_users}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Activos (24h)</p>
                <p className="text-2xl font-black text-cyan-400 mt-1">
                  {data.global_kpis.active_users_24h}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Visitantes Únicos (24h)</p>
                <p className="text-2xl font-black text-indigo-400 mt-1">
                  {data.global_kpis.unique_visitors_24h}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Errores (24h)</p>
                <p className="text-2xl font-black text-rose-400 mt-1">
                  {data.global_kpis.errors_24h}
                </p>
              </div>
            </div>

            {/* Proyectos en Dokploy */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                <span>Estado de Proyectos en Dokploy</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.dokploy.projects.map((p) => (
                  <div
                    key={p.project_id}
                    className="bg-slate-900 border border-white/80 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">{p.name}</h3>
                      <span className="text-[10px] font-mono text-slate-400">
                        {p.services.length} servicios
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {p.services.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between text-xs bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800"
                        >
                          <span className="font-medium text-slate-200">
                            {s.name}{' '}
                            <span className="text-[10px] text-slate-500">({s.kind})</span>
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                              s.status === 'done'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : s.status === 'idle'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {data && activeTab === 'futmad' && (
          <div className="space-y-6">
            {/* KPIs FutMad */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Personas Registradas</p>
                <p className="text-2xl font-black text-white mt-1">
                  {data.futmad.registered_users_total}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Usuarios con Acceso (24h)</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">
                  {data.futmad.active_users_24h}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Visitantes Únicos (visitor_id)</p>
                <p className="text-2xl font-black text-rose-400 mt-1">
                  {data.futmad.unique_visitors_total}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">Equipos / Sedes Guardadas</p>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {data.futmad.favorite_teams_total} / {data.futmad.favorite_campos_total}
                </p>
              </div>
            </div>

            {/* Interacción por tipo de evento */}
            {Object.keys(data.futmad.events_by_type).length > 0 && (
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Interacción registrada en Fútbol Base Madrid
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.futmad.events_by_type).map(([evType, count]) => (
                    <span
                      key={evType}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                    >
                      <span className="font-mono text-slate-300">{evType}</span>
                      <strong className="text-rose-400 font-black">{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Listado de Usuarios Registrados y Último Acceso */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-rose-400" />
                <span>Usuarios Registrados y Último Acceso ({data.futmad.users.length})</span>
              </h2>
              <div className="space-y-2">
                {data.futmad.users.map((u, idx) => (
                  <div
                    key={u.id}
                    className={`rounded-2xl p-3.5 border border-white/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                      idx % 2 === 0 ? 'bg-[#0c1424]' : 'bg-[#162136]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-rose-400 shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">
                          {u.email}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {u.name || 'Usuario'} · Proveedor: {u.auth_provider}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 bg-slate-950/90 px-2.5 py-1 rounded-lg border border-slate-800">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span className="text-slate-400">Último acceso:</span>
                        <strong className="text-white">{formatDateTime(u.last_login_at)}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1 bg-slate-950/90 px-2.5 py-1 rounded-lg border border-slate-800 text-slate-300">
                        <span>Alta: {formatDateTime(u.created_at)}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {data && activeTab === 'georisk' && (
          <div className="space-y-6">
            {/* Embudo de Conversión GeoRisk */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">1. Visitantes Únicos</p>
                <p className="text-2xl font-black text-white mt-1">
                  {data.georisk.unique_visitors_total}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Hoy: {data.georisk.unique_visitors_24h}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">2. Inmuebles Consultados</p>
                <p className="text-2xl font-black text-cyan-400 mt-1">
                  {data.georisk.property_searches_total}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">3. Clics en "Desbloquear"</p>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {data.georisk.unlock_clicks_total}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  1 Inf: {data.georisk.unlock_by_plan.SINGLE_REPORT_699 || 0} · Pack 3:{' '}
                  {data.georisk.unlock_by_plan.PACK_3_1490 || 0}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4">
                <p className="text-[11px] text-slate-400">4. Problemas / Errores</p>
                <p className="text-2xl font-black text-rose-400 mt-1">
                  {data.georisk.errors_total}
                </p>
              </div>
            </div>

            {/* Consola de Problemas / Errores en GeoRisk */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Problemas y Errores Detectados en GeoRisk ({data.georisk.recent_errors.length})</span>
              </h2>
              {data.georisk.recent_errors.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                  No se han registrado errores en GeoRisk todavía.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.georisk.recent_errors.map((errEv) => (
                    <div
                      key={errEv.id}
                      className="rounded-2xl p-3.5 bg-rose-950/30 border border-rose-500/40 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-rose-300 uppercase">
                          {errEv.event_type} · {errEv.path || '/'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(errEv.created_at)}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-white">
                        {JSON.stringify(errEv.metadata)}
                      </p>
                      <p className="text-[10px] text-slate-400">Visitor: {errEv.visitor_id}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Últimos eventos de GeoRisk */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Unlock className="w-4 h-4 text-amber-400" />
                <span>Actividad Reciente en GeoRisk ({data.georisk.recent_events.length})</span>
              </h2>
              {data.georisk.recent_events.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                  Aún no se han recibido eventos de GeoRisk.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.georisk.recent_events.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-2xl p-3 bg-slate-900 border border-white/80 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-amber-300">{ev.event_type}</span>{' '}
                        <span className="text-slate-400">{ev.path}</span>
                        {Object.keys(ev.metadata).length > 0 && (
                          <p className="text-[11px] font-mono text-slate-300 truncate">
                            {JSON.stringify(ev.metadata)}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {formatDateTime(ev.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
