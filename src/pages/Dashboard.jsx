import { DollarSign, Zap, Leaf, TrendingUp, ChevronRight, CheckCircle2, Clock, Battery } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { user, monthlyStats, weeklyStats, chargingSessions, carbonImpact } from '../data/mockData';

const StatCard = ({ icon: Icon, label, value, sub, color = 'emerald', trend }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-10 h-10 rounded-xl bg-${color}-500/15 flex items-center justify-center`}>
        <Icon className={`w-5 h-5 text-${color}-400`} />
      </div>
      {trend && (
        <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
          {trend}
        </span>
      )}
    </div>
    <p className="text-2xl font-bold text-white">{value}</p>
    <p className="text-sm text-gray-400 mt-1">{label}</p>
    {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm">
        <p className="text-gray-400 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="font-semibold">
            {p.name}: {p.name === 'Earnings' ? `$${p.value.toFixed(2)}` : `${p.value} kWh`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard({ onNavigate }) {
  const depositProgress = Math.min((user.totalKwh / 1500) * 100, 100);
  const payoutProgress = Math.min((user.pendingPayout / user.nextPayoutAt) * 100, 100);
  const currentRate = 0.03 + Math.floor(user.totalKwh / 5000) * 0.01;
  const nextBonusKwh = 5000 - (user.totalKwh % 5000);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Good evening, Alex 👋</h1>
          <p className="text-gray-400 mt-1">Your charger is connected and earning carbon credits.</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-2">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-sm text-emerald-400 font-medium">Charger Online</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total Earned"
          value={`$${user.totalEarnings.toFixed(2)}`}
          sub={`$${user.pendingPayout.toFixed(2)} pending payout`}
          color="emerald"
          trend="+$1.01 today"
        />
        <StatCard
          icon={Zap}
          label="Total Energy"
          value={`${user.totalKwh.toLocaleString()} kWh`}
          sub="Lifetime charging"
          color="yellow"
        />
        <StatCard
          icon={TrendingUp}
          label="Current Rate"
          value={`$${currentRate.toFixed(2)}/kWh`}
          sub={`Next bonus in ${nextBonusKwh.toLocaleString()} kWh`}
          color="blue"
        />
        <StatCard
          icon={Leaf}
          label="CO₂ Offset"
          value={`${carbonImpact.co2OffsetKg} kg`}
          sub={`≈ ${carbonImpact.treesEquivalent} trees planted`}
          color="green"
        />
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deposit return progress */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold text-white">Deposit Return Progress</span>
            </div>
            <span className="text-xs text-gray-400">{user.totalKwh} / 1,500 kWh</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all"
              style={{ width: `${depositProgress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-xs text-gray-500">
              {depositProgress >= 100 ? '✓ Deposit returned!' : `${(1500 - user.totalKwh)} kWh until $300 deposit is returned`}
            </p>
            <p className="text-xs text-yellow-400 font-medium">{depositProgress.toFixed(0)}%</p>
          </div>
        </div>

        {/* Payout progress */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">Next Payout Progress</span>
            </div>
            <span className="text-xs text-gray-400">${user.pendingPayout.toFixed(2)} / $100</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
              style={{ width: `${payoutProgress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <p className="text-xs text-gray-500">${(100 - user.pendingPayout).toFixed(2)} more until direct deposit</p>
            <p className="text-xs text-emerald-400 font-medium">{payoutProgress.toFixed(0)}%</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly earnings chart */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Monthly Energy & Earnings</h2>
            <span className="text-xs text-gray-500">Last 6 months</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyStats} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="kwhGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="kwh"
                name="Energy"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#kwhGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly bar chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">This Week</h2>
            <span className="text-xs text-emerald-400">147.1 kWh</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyStats} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs">
                      <p className="text-gray-400">{label}</p>
                      <p className="text-emerald-400 font-semibold">{payload[0].value} kWh</p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="kwh" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent sessions */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Recent Sessions</h2>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
          >
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-3">
          {chargingSessions.slice(0, 3).map(session => (
            <div key={session.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                  <Battery className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{session.date}</p>
                  <p className="text-xs text-gray-500">{session.start} – {session.end} · {session.duration}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{session.kwh} kWh</p>
                <p className="text-xs text-emerald-400">+${session.earned.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
