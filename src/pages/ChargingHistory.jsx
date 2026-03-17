import { Battery, Download, Filter, Calendar, ChevronDown } from 'lucide-react';
import { chargingSessions } from '../data/mockData';

const statusColor = {
  Completed: 'text-emerald-400 bg-emerald-500/10',
};

export default function ChargingHistory() {
  const totalKwh = chargingSessions.reduce((s, c) => s + c.kwh, 0);
  const totalEarned = chargingSessions.reduce((s, c) => s + c.earned, 0);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Charging History</h1>
          <p className="text-gray-400 mt-1">All charging sessions for your home charger</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-400 border border-gray-700 hover:border-gray-600 hover:text-white transition">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{chargingSessions.length}</p>
          <p className="text-sm text-gray-400 mt-1">Total Sessions</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalKwh.toFixed(1)}</p>
          <p className="text-sm text-gray-400 mt-1">kWh Charged</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">${totalEarned.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-1">Carbon Credits Earned</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-400 bg-gray-900 border border-gray-800 hover:border-gray-700 transition">
          <Calendar className="w-4 h-4" />
          March 2026
          <ChevronDown className="w-3 h-3" />
        </button>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-gray-400 bg-gray-900 border border-gray-800 hover:border-gray-700 transition">
          <Filter className="w-4 h-4" />
          All Sessions
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Sessions table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-5 gap-4 px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <span className="col-span-2">Session</span>
          <span className="text-right">Energy</span>
          <span className="text-right">Duration</span>
          <span className="text-right">Earned</span>
        </div>
        <div className="divide-y divide-gray-800">
          {chargingSessions.map(session => (
            <div key={session.id} className="grid grid-cols-5 gap-4 px-5 py-4 items-center hover:bg-gray-800/50 transition">
              <div className="col-span-2 flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Battery className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{session.date}</p>
                  <p className="text-xs text-gray-500">{session.start} – {session.end}</p>
                </div>
              </div>
              <p className="text-sm text-white text-right font-medium">{session.kwh} kWh</p>
              <p className="text-sm text-gray-400 text-right">{session.duration}</p>
              <p className="text-sm text-emerald-400 text-right font-semibold">+${session.earned.toFixed(2)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
