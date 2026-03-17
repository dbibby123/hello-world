import { Leaf, Wind, Droplets, TreePine, Car } from 'lucide-react';
import { carbonImpact, user } from '../data/mockData';
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts';

const ImpactCard = ({ icon: Icon, value, unit, label, color }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
    <div className={`w-12 h-12 rounded-2xl bg-${color}-500/15 flex items-center justify-center mx-auto mb-3`}>
      <Icon className={`w-6 h-6 text-${color}-400`} />
    </div>
    <p className="text-3xl font-bold text-white">{value}</p>
    <p className="text-sm text-gray-400">{unit}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

const carbonData = [
  { name: 'CO₂', value: Math.min((carbonImpact.co2OffsetKg / 1000) * 100, 100), fill: '#10b981' },
];

export default function GreenImpact() {
  const carbonCreditsEarned = (user.totalKwh * 0.015).toFixed(1); // example credit calculation

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Green Impact</h1>
        <p className="text-gray-400 mt-1">Your positive environmental contribution from home EV charging</p>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-950/50 to-gray-900 border border-emerald-500/20 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 text-center md:text-left">
            <p className="text-sm text-emerald-400 font-semibold uppercase tracking-wide mb-2">Total CO₂ Offset</p>
            <p className="text-5xl font-black text-white">{carbonImpact.co2OffsetKg} <span className="text-2xl text-gray-400">kg</span></p>
            <p className="text-gray-400 mt-2">
              Since joining the SWTCH Home Charging Program, your EV has avoided emitting this much CO₂ compared to a gasoline vehicle.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
                Canada Clean Fuels Regulation
              </span>
              <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full">
                {carbonCreditsEarned} carbon credits generated
              </span>
            </div>
          </div>
          <div className="w-40 h-40 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={carbonData} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={10} />
                <Tooltip
                  content={() => (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-2 text-xs text-emerald-400">
                      {carbonImpact.co2OffsetKg} kg CO₂ saved
                    </div>
                  )}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Impact cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ImpactCard icon={Leaf} value={carbonImpact.co2OffsetKg} unit="kg CO₂ avoided" label="vs. gasoline vehicle" color="emerald" />
        <ImpactCard icon={TreePine} value={carbonImpact.treesEquivalent} unit="trees equivalent" label="carbon sequestered" color="green" />
        <ImpactCard icon={Car} value={carbonImpact.gasGallonsSaved} unit="gas gallons saved" label="not burned" color="yellow" />
        <ImpactCard icon={Wind} value={(carbonImpact.co2OffsetKg / 1000).toFixed(2)} unit="tonnes of CO₂" label="offset lifetime" color="blue" />
      </div>

      {/* How credits work */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white mb-4">How Carbon Credits Work</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              step: '1',
              title: 'You charge at home',
              desc: 'Your SWTCH Level 2 charger records every kWh delivered to your EV and reports it securely to SWTCH.',
              color: 'emerald',
            },
            {
              step: '2',
              title: 'Credits are generated',
              desc: "SWTCH pools your charging data with thousands of others to generate credits under Canada's Clean Fuels Regulation.",
              color: 'blue',
            },
            {
              step: '3',
              title: 'You get paid',
              desc: 'SWTCH sells the pooled carbon credits and shares the revenue with you — $0.03–$0.10 per kWh charged.',
              color: 'yellow',
            },
          ].map(({ step, title, desc, color }) => (
            <div key={step} className="flex gap-4">
              <div className={`w-8 h-8 bg-${color}-500/15 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-${color}-400`}>
                {step}
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">{title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
