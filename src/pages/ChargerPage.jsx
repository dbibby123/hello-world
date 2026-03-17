import { Wifi, Zap, Thermometer, Clock, CheckCircle2, AlertCircle, RefreshCw, Settings } from 'lucide-react';
import { user } from '../data/mockData';

const InfoRow = ({ label, value, highlight }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
    <span className="text-sm text-gray-400">{label}</span>
    <span className={`text-sm font-medium ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</span>
  </div>
);

export default function ChargerPage() {
  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Charger</h1>
        <p className="text-gray-400 mt-1">Manage your SWTCH Level 2 home charger</p>
      </div>

      {/* Status card */}
      <div className="bg-gradient-to-br from-emerald-900/30 to-gray-900 border border-emerald-500/30 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-emerald-400" fill="currentColor" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{user.chargerModel}</h2>
              <p className="text-sm text-gray-400">S/N: {user.chargerSerial}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-4 py-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-sm text-emerald-400 font-medium">Online</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Wifi, label: 'Network', value: 'Connected', color: 'emerald' },
            { icon: Zap, label: 'Output', value: '7.2 kW', color: 'yellow' },
            { icon: Thermometer, label: 'Temp', value: '21°C', color: 'blue' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-gray-900/60 rounded-xl p-3 text-center">
              <Icon className={`w-4 h-4 text-${color}-400 mx-auto mb-1`} />
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-sm font-semibold text-${color}-300 mt-0.5`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Charger details */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Charger Details</h3>
          <InfoRow label="Model" value="SWTCH Level 2 (32A)" />
          <InfoRow label="Connector" value="J1772 / NEMA 14-50" />
          <InfoRow label="Max Power" value="7.68 kW" />
          <InfoRow label="Voltage" value="240V" />
          <InfoRow label="Firmware" value="v4.2.1" />
          <InfoRow label="Program" value="Free Charger Plan" highlight />
        </div>

        {/* Charging schedule */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Smart Schedule</h3>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Active</span>
          </div>
          <div className="space-y-3">
            {[
              { day: 'Mon – Fri', time: '11:00 PM – 7:00 AM', note: 'Off-peak rates' },
              { day: 'Sat – Sun', time: '10:00 PM – 8:00 AM', note: 'Weekend off-peak' },
            ].map(({ day, time, note }) => (
              <div key={day} className="bg-gray-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">{day}</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-sm text-emerald-300">{time}</p>
                <p className="text-xs text-gray-500 mt-0.5">{note}</p>
              </div>
            ))}
          </div>
          <button className="mt-3 w-full text-sm text-emerald-400 hover:text-emerald-300 transition py-2 border border-emerald-500/20 rounded-xl">
            Edit Schedule
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Notifications</h3>
        <div className="space-y-3">
          {[
            { label: 'Charge complete', desc: 'Alert when vehicle is fully charged', enabled: true },
            { label: 'Earnings milestone', desc: 'Notify when payout threshold reached', enabled: true },
            { label: 'Offline alert', desc: 'Alert if charger goes offline', enabled: true },
            { label: 'Weekly report', desc: 'Weekly energy & earnings summary', enabled: false },
          ].map(({ label, desc, enabled }) => (
            <div key={label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              <button className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-700'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-300 border border-gray-700 hover:border-gray-600 hover:text-white transition">
          <RefreshCw className="w-4 h-4" />
          Restart Charger
        </button>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-300 border border-gray-700 hover:border-gray-600 hover:text-white transition">
          <Settings className="w-4 h-4" />
          Advanced Settings
        </button>
      </div>
    </div>
  );
}
