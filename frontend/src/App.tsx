import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Cpu,
  Fan,
  HardDrive,
  List,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Server,
  ShieldAlert,
  Thermometer,
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
  const [futmadAccessView, setFutmadAccessView] = useState<'both' | 'chart' | 'list'>('both');
  const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
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

  // Enfocar y desplazar el gráfico al último día por defecto
  useEffect(() => {
    const daily = data?.futmad?.daily_accesses;
    if (daily && daily.length > 0) {
      const lastDay = daily[daily.length - 1].date;
      setSelectedChartDate((prev) => prev || lastDay);
    }
    if (chartScrollRef.current) {
      chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
    }
  }, [data, activeTab, futmadAccessView]);

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

            {/* Estado Hardware Raspberry Pi */}
            {data.raspberry?.available && (
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Raspberry Pi · Estado del Servidor</span>
                  </h2>
                  {data.raspberry.uptime_formatted && (
                    <span className="text-[11px] font-mono text-slate-300 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                      Uptime: <strong className="text-white">{data.raspberry.uptime_formatted}</strong>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* CPU Host */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>CPU Host</span>
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <p className="text-xl font-black text-cyan-400 font-mono">
                      {data.raspberry.cpu_percent !== null && data.raspberry.cpu_percent !== undefined
                        ? `${data.raspberry.cpu_percent}%`
                        : 'N/D'}
                    </p>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, data.raspberry.cpu_percent || 0)}%` }}
                        className="h-full bg-cyan-400"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {data.raspberry.cpu_cores || '-'} núcleos · Load:{' '}
                      <span className="font-mono text-slate-200">{data.raspberry.load_1m ?? '-'}</span>
                    </p>
                  </div>

                  {/* RAM Host */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Memoria RAM</span>
                      <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <p className="text-xl font-black text-indigo-400 font-mono">
                      {data.raspberry.ram_percent !== null && data.raspberry.ram_percent !== undefined
                        ? `${data.raspberry.ram_percent}%`
                        : 'N/D'}
                    </p>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(100, data.raspberry.ram_percent || 0)}%` }}
                        className="h-full bg-indigo-400"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {data.raspberry.ram_used_mb ? `${Math.round(data.raspberry.ram_used_mb)} MB` : '-'} /{' '}
                      {data.raspberry.ram_total_mb ? `${Math.round(data.raspberry.ram_total_mb)} MB` : '-'}
                    </p>
                  </div>

                  {/* Temperatura SoC */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Temperatura</span>
                      <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <p
                      className={`text-xl font-black font-mono ${
                        (data.raspberry.temperature_c || 0) >= 75
                          ? 'text-rose-400'
                          : (data.raspberry.temperature_c || 0) >= 60
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {data.raspberry.temperature_c !== null && data.raspberry.temperature_c !== undefined
                        ? `${data.raspberry.temperature_c} °C`
                        : 'N/D'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {(data.raspberry.temperature_c || 0) >= 75
                        ? 'Temperatura alta'
                        : (data.raspberry.temperature_c || 0) >= 60
                        ? 'Carga térmica moderada'
                        : 'Temperatura óptima'}
                    </p>
                  </div>

                  {/* Ventilador */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Ventilador</span>
                      <Fan
                        className={`w-3.5 h-3.5 ${
                          data.raspberry.fan_active ? 'text-emerald-400 animate-spin' : 'text-slate-500'
                        }`}
                      />
                    </div>
                    <p
                      className={`text-base sm:text-lg font-black ${
                        data.raspberry.fan_active
                          ? 'text-emerald-400'
                          : data.raspberry.fan_detected
                          ? 'text-slate-300'
                          : 'text-slate-500'
                      }`}
                    >
                      {data.raspberry.fan_status || 'No detectado'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {data.raspberry.fan_rpm !== null && data.raspberry.fan_rpm !== undefined
                        ? `${data.raspberry.fan_rpm} RPM`
                        : data.raspberry.fan_level !== null && data.raspberry.fan_level !== undefined
                        ? `Velocidad: ${data.raspberry.fan_level}%`
                        : data.raspberry.fan_detected
                        ? 'Control térmico activo'
                        : 'Sin sensor RPM/PWM'}
                    </p>
                  </div>
                </div>
              </div>
            )}

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

            {/* Contenedores Docker en Ejecución (CPU & RAM) */}
            {data.dokploy.containers.length > 0 && (
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                    <span>Consumo por Contenedor ({data.dokploy.containers.length})</span>
                  </h2>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-cyan-300">
                      CPU Total: <strong>{data.dokploy.total_cpu_percent ?? 0}%</strong>
                    </span>
                    <span className="text-indigo-300">
                      RAM Total: <strong>{Math.round(data.dokploy.total_memory_mb ?? 0)} MB</strong>
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-950">
                        <th className="py-2.5 px-3.5">Contenedor</th>
                        <th className="py-2.5 px-3.5">Estado</th>
                        <th className="py-2.5 px-3.5 text-cyan-300">CPU %</th>
                        <th className="py-2.5 px-3.5 text-indigo-300">RAM Usada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {data.dokploy.containers.map((c) => (
                        <tr key={c.name} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2.5 px-3.5 font-mono text-white font-semibold truncate max-w-[260px]">
                            {c.name}
                          </td>
                          <td className="py-2.5 px-3.5 text-emerald-300 text-[11px]">
                            {c.status || c.state}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-cyan-300">
                            {c.cpu_percent !== null && c.cpu_percent !== undefined
                              ? `${c.cpu_percent.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono">
                            {c.memory_mb !== null && c.memory_mb !== undefined ? (
                              <span className="text-indigo-300 font-bold">
                                {c.memory_mb.toFixed(1)} MB
                                {c.memory_percent !== null && c.memory_percent !== undefined && (
                                  <span className="text-slate-400 font-normal ml-1.5">
                                    ({c.memory_percent.toFixed(1)}%)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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

            {/* Accesos y Registros por Día: Personas Anónimas, Registradas y Nuevas Altas */}
            {(() => {
              const daily = data.futmad.daily_accesses || [];
              const maxDayValue = Math.max(
                1,
                ...daily.map((d) =>
                  Math.max(d.anonymous_accesses, d.registered_accesses, d.new_registrations || 0, 1)
                )
              );
              const totalAnon14d = daily.reduce((acc, d) => acc + d.anonymous_accesses, 0);
              const totalReg14d = daily.reduce((acc, d) => acc + d.registered_accesses, 0);
              const totalSignups14d = daily.reduce((acc, d) => acc + (d.new_registrations || 0), 0);
              const reversedDaily = [...daily].reverse();

              const formatShortDay = (ymd: string) => {
                const parts = ymd.split('-');
                return parts.length === 3 ? `${parts[2]}/${parts[1]}` : ymd;
              };

              const formatFullDay = (ymd: string) => {
                const parts = ymd.split('-');
                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ymd;
              };

              return (
                <div className="bg-slate-900 border border-white/80 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-rose-400" />
                        <span>Accesos y Nuevos Registros por Día (Últimos 14 días)</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Acumulado 14 días:{' '}
                        <strong className="text-sky-400">{totalAnon14d} accesos anónimos</strong> ·{' '}
                        <strong className="text-emerald-400">{totalReg14d} accesos registrados</strong> ·{' '}
                        <strong className="text-amber-400">{totalSignups14d} nuevos registros</strong>
                      </p>
                    </div>

                    {/* Selector Modo Gráfico / Lista / Ambos */}
                    <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setFutmadAccessView('both')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          futmadAccessView === 'both'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Ambos
                      </button>
                      <button
                        type="button"
                        onClick={() => setFutmadAccessView('chart')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          futmadAccessView === 'chart'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        <span>Gráfico</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFutmadAccessView('list')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          futmadAccessView === 'list'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>Lista</span>
                      </button>
                    </div>
                  </div>

                  {/* Leyenda */}
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold">
                      <span className="w-3 h-3 rounded-sm bg-sky-400 inline-block" />
                      Accesos Personas Anónimas
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
                      <span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" />
                      Accesos Personas Registradas
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
                      <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />
                      Nuevos Registros (Altas por día)
                    </span>
                  </div>

                  {/* MODO GRÁFICO */}
                  {(futmadAccessView === 'both' || futmadAccessView === 'chart') && (() => {
                    const lastDayDate = daily.length > 0 ? daily[daily.length - 1].date : null;
                    const focusedDate = selectedChartDate || lastDayDate;
                    const focusedDay =
                      daily.find((item) => item.date === focusedDate) ||
                      (daily.length > 0 ? daily[daily.length - 1] : null);

                    return (
                      <div className="space-y-2.5">
                        {focusedDay && (
                          <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-rose-500/40 text-xs space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[11px]">
                                  {focusedDay.date === lastDayDate ? 'Último día (Hoy)' : 'Día seleccionado'}
                                </span>
                                <strong className="font-mono text-white text-sm">
                                  {formatFullDay(focusedDay.date)}
                                </strong>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span className="text-sky-300">
                                  Anónimos: <strong className="font-mono text-white">{focusedDay.anonymous_accesses}</strong>
                                </span>
                                <span className="text-emerald-300">
                                  Registrados: <strong className="font-mono text-white">{focusedDay.registered_accesses}</strong>
                                </span>
                                <span className="text-amber-300">
                                  Nuevos registros: <strong className="font-mono text-white">{focusedDay.new_registrations || 0}</strong>
                                </span>
                              </div>
                            </div>

                            {focusedDay.registered_users_detail && focusedDay.registered_users_detail.length > 0 && (
                              <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] text-slate-400 mr-1">Usuarios registrados ese día:</span>
                                {focusedDay.registered_users_detail.map((ru) => (
                                  <span
                                    key={ru.email}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-200"
                                  >
                                    <span className="font-medium truncate max-w-[180px]">
                                      {ru.name ? `${ru.name} (${ru.email})` : ru.email}
                                    </span>
                                    <strong className="font-mono text-emerald-400">×{ru.count}</strong>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          ref={chartScrollRef}
                          className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 pt-6 overflow-x-auto"
                        >
                          <div className="min-w-[600px] h-52 flex items-end justify-between gap-1.5 pt-4 pb-2 border-b border-slate-800">
                            {daily.map((d) => {
                              const signups = d.new_registrations || 0;
                              const isFocused = d.date === focusedDate;
                              const anonHeightPct = Math.round(
                                (d.anonymous_accesses / maxDayValue) * 100
                              );
                              const regHeightPct = Math.round(
                                (d.registered_accesses / maxDayValue) * 100
                              );
                              const signupHeightPct = Math.round((signups / maxDayValue) * 100);
                              return (
                                <button
                                  type="button"
                                  key={d.date}
                                  onClick={() => setSelectedChartDate(d.date)}
                                  className={`flex-1 flex flex-col items-center justify-end h-full rounded-xl px-1 py-1 transition-all cursor-pointer focus:outline-none ${
                                    isFocused
                                      ? 'bg-rose-500/15 ring-1 ring-rose-500/60 shadow-inner'
                                      : 'hover:bg-slate-900/70'
                                  }`}
                                  title={`${formatFullDay(d.date)} · Anónimos: ${d.anonymous_accesses} · Registrados: ${d.registered_accesses} · Nuevos Registros: ${signups}`}
                                >
                                  <div className="w-full flex items-end justify-center gap-0.5 h-36 px-0.5">
                                    {/* Barra Anónimos */}
                                    <div className="flex-1 max-w-[13px] h-full flex flex-col justify-end items-center">
                                      {d.anonymous_accesses > 0 && (
                                        <span className="text-[9px] font-mono font-bold text-sky-300 mb-0.5">
                                          {d.anonymous_accesses}
                                        </span>
                                      )}
                                      <div
                                        style={{
                                          height:
                                            d.anonymous_accesses > 0
                                              ? `${Math.max(anonHeightPct, 10)}%`
                                              : '3px',
                                        }}
                                        className={`w-full rounded-t-sm transition-all ${
                                          d.anonymous_accesses > 0
                                            ? 'bg-gradient-to-t from-sky-600 to-sky-400 shadow-sm shadow-sky-500/30'
                                            : 'bg-slate-800'
                                        }`}
                                      />
                                    </div>

                                    {/* Barra Registrados */}
                                    <div className="flex-1 max-w-[13px] h-full flex flex-col justify-end items-center">
                                      {d.registered_accesses > 0 && (
                                        <span className="text-[9px] font-mono font-bold text-emerald-300 mb-0.5">
                                          {d.registered_accesses}
                                        </span>
                                      )}
                                      <div
                                        style={{
                                          height:
                                            d.registered_accesses > 0
                                              ? `${Math.max(regHeightPct, 10)}%`
                                              : '3px',
                                        }}
                                        className={`w-full rounded-t-sm transition-all ${
                                          d.registered_accesses > 0
                                            ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-sm shadow-emerald-500/30'
                                            : 'bg-slate-800'
                                        }`}
                                      />
                                    </div>

                                    {/* Barra Nuevos Registros */}
                                    <div className="flex-1 max-w-[13px] h-full flex flex-col justify-end items-center">
                                      {signups > 0 && (
                                        <span className="text-[9px] font-mono font-bold text-amber-300 mb-0.5">
                                          {signups}
                                        </span>
                                      )}
                                      <div
                                        style={{
                                          height:
                                            signups > 0
                                              ? `${Math.max(signupHeightPct, 10)}%`
                                              : '3px',
                                        }}
                                        className={`w-full rounded-t-sm transition-all ${
                                          signups > 0
                                            ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-sm shadow-amber-500/30'
                                            : 'bg-slate-800'
                                        }`}
                                      />
                                    </div>
                                  </div>
                                  <span
                                    className={`text-[10px] font-mono mt-2 px-1.5 py-0.5 rounded-md ${
                                      isFocused
                                        ? 'bg-rose-500 text-white font-bold'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {formatShortDay(d.date)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* MODO LISTA */}
                  {(futmadAccessView === 'both' || futmadAccessView === 'list') && (
                    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-950">
                            <th className="py-2.5 px-3.5">Día</th>
                            <th className="py-2.5 px-3.5 text-sky-300">Accesos Anónimos</th>
                            <th className="py-2.5 px-3.5 text-emerald-300">Accesos Registrados</th>
                            <th className="py-2.5 px-3.5 text-amber-300">Nuevos Registros</th>
                            <th className="py-2.5 px-3.5">Total Accesos</th>
                            <th className="py-2.5 px-3.5 w-32">Proporción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {reversedDaily.map((d) => {
                            const signups = d.new_registrations || 0;
                            const anonPct =
                              d.total_accesses > 0
                                ? Math.round((d.anonymous_accesses / d.total_accesses) * 100)
                                : 0;
                            const regPct =
                              d.total_accesses > 0 ? 100 - anonPct : 0;

                            return (
                              <tr
                                key={d.date}
                                className="hover:bg-slate-900/60 transition-colors"
                              >
                                <td className="py-2.5 px-3.5 font-mono font-bold text-white">
                                  {formatFullDay(d.date)}
                                </td>
                                <td className="py-2.5 px-3.5">
                                  <span className="font-mono font-black text-sky-400 text-sm">
                                    {d.anonymous_accesses}
                                  </span>
                                  <span className="text-[11px] text-slate-400 ml-1.5">
                                    ({d.anonymous_unique} únicos)
                                  </span>
                                </td>
                                <td className="py-2.5 px-3.5">
                                  <div>
                                    <span className="font-mono font-black text-emerald-400 text-sm">
                                      {d.registered_accesses}
                                    </span>
                                    <span className="text-[11px] text-slate-400 ml-1.5">
                                      ({d.registered_unique} cuentas)
                                    </span>
                                  </div>
                                  {d.registered_users_detail && d.registered_users_detail.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {d.registered_users_detail.map((ru) => (
                                        <span
                                          key={ru.email}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-200"
                                          title={ru.email}
                                        >
                                          <span className="truncate max-w-[130px]">{ru.name || ru.email}</span>
                                          <strong className="font-mono text-emerald-400">×{ru.count}</strong>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3.5">
                                  <span
                                    className={`font-mono font-black text-sm ${
                                      signups > 0 ? 'text-amber-400' : 'text-slate-500'
                                    }`}
                                  >
                                    {signups}
                                  </span>
                                  {signups > 0 && (
                                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded-md ml-1.5">
                                      +{signups} alta{signups === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3.5 font-mono font-bold text-white">
                                  {d.total_accesses}
                                </td>
                                <td className="py-2.5 px-3.5">
                                  {d.total_accesses > 0 ? (
                                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
                                      <div
                                        style={{ width: `${anonPct}%` }}
                                        className="bg-sky-400 h-full"
                                        title={`Anónimos: ${anonPct}%`}
                                      />
                                      <div
                                        style={{ width: `${regPct}%` }}
                                        className="bg-emerald-400 h-full"
                                        title={`Registrados: ${regPct}%`}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-600">Sin actividad</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

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
                      <span className="inline-flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/25 text-emerald-300">
                        <span>Accesos (14d):</span>
                        <strong className="font-mono text-emerald-400">{u.access_count_14d ?? 0}</strong>
                      </span>
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

            {/* Contenedores Docker en Ejecución (CPU & RAM) */}
            {data.dokploy.containers.length > 0 && (
              <div className="bg-slate-900 border border-white/80 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                    <span>Consumo por Contenedor ({data.dokploy.containers.length})</span>
                  </h2>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-cyan-300">
                      CPU Total: <strong>{data.dokploy.total_cpu_percent ?? 0}%</strong>
                    </span>
                    <span className="text-indigo-300">
                      RAM Total: <strong>{Math.round(data.dokploy.total_memory_mb ?? 0)} MB</strong>
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase bg-slate-950">
                        <th className="py-2.5 px-3.5">Contenedor</th>
                        <th className="py-2.5 px-3.5">Estado</th>
                        <th className="py-2.5 px-3.5 text-cyan-300">CPU %</th>
                        <th className="py-2.5 px-3.5 text-indigo-300">RAM Usada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {data.dokploy.containers.map((c) => (
                        <tr key={c.name} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2.5 px-3.5 font-mono text-white font-semibold truncate max-w-[260px]">
                            {c.name}
                          </td>
                          <td className="py-2.5 px-3.5 text-emerald-300 text-[11px]">
                            {c.status || c.state}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-cyan-300">
                            {c.cpu_percent !== null && c.cpu_percent !== undefined
                              ? `${c.cpu_percent.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono">
                            {c.memory_mb !== null && c.memory_mb !== undefined ? (
                              <span className="text-indigo-300 font-bold">
                                {c.memory_mb.toFixed(1)} MB
                                {c.memory_percent !== null && c.memory_percent !== undefined && (
                                  <span className="text-slate-400 font-normal ml-1.5">
                                    ({c.memory_percent.toFixed(1)}%)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
