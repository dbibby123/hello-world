import { User, CreditCard, Bell, Shield, ChevronRight, DollarSign } from 'lucide-react';
import { user } from '../data/mockData';

const Section = ({ title, children }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">{title}</h3>
    {children}
  </div>
);

const SettingRow = ({ icon: Icon, label, value, action, danger }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
    <div className="flex items-center gap-3">
      {Icon && <Icon className={`w-4 h-4 ${danger ? 'text-red-400' : 'text-gray-400'}`} />}
      <div>
        <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
        {value && <p className="text-xs text-gray-500">{value}</p>}
      </div>
    </div>
    <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition">
      {action || 'Edit'}
      <ChevronRight className="w-3 h-3" />
    </button>
  </div>
);

export default function Settings() {
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account and program settings</p>
      </div>

      <Section title="Account">
        <SettingRow icon={User} label="Full Name" value={user.name} />
        <SettingRow icon={User} label="Email Address" value={user.email} />
        <SettingRow icon={Shield} label="Password" value="Last changed 3 months ago" />
      </Section>

      <Section title="Earnings & Payouts">
        <div className="flex items-center justify-between py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-white">Current Rate</p>
              <p className="text-xs text-gray-500">Based on total kWh charged</p>
            </div>
          </div>
          <span className="text-sm text-emerald-400 font-semibold">$0.03/kWh</span>
        </div>
        <div className="flex items-center justify-between py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-white">Payout Method</p>
              <p className="text-xs text-gray-500">Direct deposit — RBC ••••4821</p>
            </div>
          </div>
          <button className="text-xs text-gray-400 hover:text-white transition flex items-center gap-1">
            Edit <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-white">Payout Threshold</p>
              <p className="text-xs text-gray-500">Pay out when balance reaches</p>
            </div>
          </div>
          <span className="text-sm text-white font-medium">$100.00</span>
        </div>
      </Section>

      <Section title="Plan">
        <div className="flex items-center justify-between py-3 border-b border-gray-800">
          <div>
            <p className="text-sm font-medium text-white">Free Charger Plan</p>
            <p className="text-xs text-gray-500">$300 deposit · Refundable after 1,500 kWh</p>
          </div>
          <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">Active</span>
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-white">Deposit Status</p>
            <p className="text-xs text-gray-500">1,247 / 1,500 kWh charged</p>
          </div>
          <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-full">Pending</span>
        </div>
      </Section>

      <Section title="Notifications">
        {[
          { label: 'Email notifications', value: 'Earnings reports, alerts' },
          { label: 'Push notifications', value: 'Charge complete, offline alerts' },
          { label: 'Monthly statement', value: 'Sent on the 1st of each month' },
        ].map(({ label, value }) => (
          <SettingRow key={label} label={label} value={value} />
        ))}
      </Section>

      <Section title="Danger Zone">
        <SettingRow label="Leave Program" value="Remove your charger from the network" danger action="Leave" />
      </Section>
    </div>
  );
}
