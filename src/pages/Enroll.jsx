import { useState } from 'react';
import { Zap, CheckCircle2, ArrowRight, DollarSign, Zap as ZapIcon } from 'lucide-react';
import { plans } from '../data/mockData';

const steps = ['Choose Plan', 'Account Info', 'Shipping', 'Confirm'];

export default function Enroll({ onComplete }) {
  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', address: '', city: '', province: 'ON', postal: '' });

  const handleNext = () => {
    if (step < steps.length - 1) setStep(s => s + 1);
    else onComplete(selectedPlan);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 p-6">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
          <Zap className="w-6 h-6 text-white" fill="currentColor" />
        </div>
        <span className="text-2xl font-bold text-white">SWTCH</span>
        <span className="text-sm text-emerald-400 font-medium ml-1">Home Charging Program</span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-10">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              i < step ? 'bg-emerald-500/20 text-emerald-400' :
              i === step ? 'bg-emerald-500 text-white' :
              'bg-gray-800 text-gray-500'
            }`}>
              {i < step ? <CheckCircle2 className="w-3 h-3" /> : <span>{i + 1}</span>}
              {s}
            </div>
            {i < steps.length - 1 && <div className="w-6 h-px bg-gray-700" />}
          </div>
        ))}
      </div>

      <div className="w-full max-w-3xl">
        {/* Step 0: Plan selection */}
        {step === 0 && (
          <div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">Choose Your Plan</h2>
            <p className="text-gray-400 text-center mb-8">
              Both plans include a Level 2 smart charger and earn you money from Canada's Clean Fuels carbon credit program.
            </p>
            <div className="grid md:grid-cols-2 gap-5">
              {plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`text-left rounded-2xl border-2 p-6 transition-all ${
                    selectedPlan === plan.id
                      ? 'border-emerald-500 bg-emerald-500/5'
                      : plan.highlight
                      ? 'border-gray-600 bg-gray-900 hover:border-gray-500'
                      : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                  }`}
                >
                  {plan.highlight && (
                    <span className="inline-block text-xs bg-emerald-500 text-white font-semibold px-2 py-0.5 rounded-full mb-3">
                      BEST VALUE
                    </span>
                  )}
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    {selectedPlan === plan.id && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-bold text-white">${plan.price}</span>
                    {plan.price > 0 && <span className="text-gray-400 text-sm">one-time</span>}
                    {plan.price === 0 && <span className="text-gray-400 text-sm">charger</span>}
                  </div>
                  {plan.deposit > 0 && (
                    <p className="text-xs text-yellow-400 mb-3">+ ${plan.deposit} refundable deposit · {plan.depositNote}</p>
                  )}
                  <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2 mb-4">
                    <ZapIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-emerald-400">Earn ${plan.ratePerKwh.toFixed(2)}/kWh</span>
                    <span className="text-xs text-gray-500 ml-1">up to $0.10/kWh</span>
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Account info */}
        {step === 1 && (
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-white mb-2">Create Your Account</h2>
            <p className="text-gray-400 mb-6">We'll use this to set up your earnings profile.</p>
            <div className="space-y-4">
              {[
                { key: 'name', label: 'Full Name', placeholder: 'Jane Smith' },
                { key: 'email', label: 'Email Address', placeholder: 'jane@example.com', type: 'email' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
                  <input
                    type={type || 'text'}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Shipping */}
        {step === 2 && (
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-white mb-2">Shipping Address</h2>
            <p className="text-gray-400 mb-6">Where should we ship your Level 2 charger?</p>
            <div className="space-y-4">
              {[
                { key: 'address', label: 'Street Address', placeholder: '123 Main Street' },
                { key: 'city', label: 'City', placeholder: 'Toronto' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
                  <input
                    type="text"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Province</label>
                  <select
                    value={form.province}
                    onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
                  >
                    {['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={form.postal}
                    onChange={e => setForm(f => ({ ...f, postal: e.target.value }))}
                    placeholder="M5V 1A1"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">You're all set!</h2>
            <p className="text-gray-400 mb-6">
              Review your selection and launch your account to start earning from your home EV charging.
            </p>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-left mb-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Order Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Plan</span>
                  <span className="text-white font-medium">
                    {plans.find(p => p.id === selectedPlan)?.name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Charger</span>
                  <span className="text-white font-medium">SWTCH Level 2 Smart Charger</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Earn rate</span>
                  <span className="text-emerald-400 font-semibold">
                    ${plans.find(p => p.id === selectedPlan)?.ratePerKwh.toFixed(2)}/kWh
                  </span>
                </div>
                <div className="border-t border-gray-800 pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-gray-300">Total due today</span>
                  <span className="text-white">
                    {selectedPlan === 'free' ? '$300 deposit' : '$499'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-6 py-3 rounded-xl text-sm font-medium text-gray-400 border border-gray-700 hover:border-gray-600 hover:text-white transition"
            >
              Back
            </button>
          ) : <div />}
          <button
            onClick={handleNext}
            disabled={step === 0 && !selectedPlan}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {step === steps.length - 1 ? 'Start Earning' : 'Continue'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
