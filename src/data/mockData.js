export const user = {
  name: 'Alex Johnson',
  email: 'alex.johnson@email.com',
  plan: 'free', // 'free' | 'purchase' | null (not enrolled)
  enrolled: true,
  depositPaid: true,
  depositReturned: false,
  chargerSerial: 'SWTCH-HM-20481',
  chargerModel: 'SWTCH Level 2 Smart Charger',
  chargerConnected: true,
  totalKwh: 1247,
  totalEarnings: 37.41,
  pendingPayout: 37.41,
  nextPayoutAt: 100,
  depositAmount: 300,
};

export const plans = [
  {
    id: 'free',
    name: 'Free Charger Plan',
    price: 0,
    deposit: 300,
    depositNote: 'Refundable after ~1,500 kWh (~3–5 months)',
    ratePerKwh: 0.03,
    bonusKwh: 5000,
    bonusRate: 0.01,
    maxRate: 0.10,
    highlight: false,
    features: [
      'Free Level 2 smart charger',
      'Earn $0.03/kWh from the start',
      'Refundable $300 deposit',
      'Bonus earnings every 5,000 kWh',
      'No monthly fees',
      'Direct deposit payouts at $100',
    ],
  },
  {
    id: 'purchase',
    name: 'Purchase Plan',
    price: 499,
    deposit: 0,
    ratePerKwh: 0.05,
    bonusKwh: 5000,
    bonusRate: 0.01,
    maxRate: 0.10,
    highlight: true,
    features: [
      'Own your Level 2 smart charger',
      'Earn $0.05/kWh — highest base rate',
      'No deposit required',
      'Bonus earnings every 5,000 kWh',
      'No monthly fees',
      'Direct deposit payouts at $100',
    ],
  },
];

export const chargingSessions = [
  { id: 1, date: '2026-03-17', start: '22:05', end: '06:30', kwh: 32.4, earned: 0.97, duration: '8h 25m', location: 'Home' },
  { id: 2, date: '2026-03-16', start: '21:45', end: '05:10', kwh: 28.1, earned: 0.84, duration: '7h 25m', location: 'Home' },
  { id: 3, date: '2026-03-15', start: '23:00', end: '04:45', kwh: 21.6, earned: 0.65, duration: '5h 45m', location: 'Home' },
  { id: 4, date: '2026-03-13', start: '20:30', end: '06:00', kwh: 35.2, earned: 1.06, duration: '9h 30m', location: 'Home' },
  { id: 5, date: '2026-03-12', start: '22:15', end: '05:30', kwh: 29.8, earned: 0.89, duration: '7h 15m', location: 'Home' },
  { id: 6, date: '2026-03-11', start: '21:00', end: '04:20', kwh: 27.3, earned: 0.82, duration: '7h 20m', location: 'Home' },
  { id: 7, date: '2026-03-09', start: '22:45', end: '06:15', kwh: 33.7, earned: 1.01, duration: '7h 30m', location: 'Home' },
  { id: 8, date: '2026-03-08', start: '20:00', end: '05:00', kwh: 38.5, earned: 1.16, duration: '9h 00m', location: 'Home' },
  { id: 9, date: '2026-03-06', start: '22:30', end: '05:45', kwh: 26.9, earned: 0.81, duration: '7h 15m', location: 'Home' },
  { id: 10, date: '2026-03-05', start: '21:15', end: '04:00', kwh: 24.4, earned: 0.73, duration: '6h 45m', location: 'Home' },
];

export const monthlyStats = [
  { month: 'Sep', kwh: 198, earned: 5.94 },
  { month: 'Oct', kwh: 241, earned: 7.23 },
  { month: 'Nov', kwh: 215, earned: 6.45 },
  { month: 'Dec', kwh: 267, earned: 8.01 },
  { month: 'Jan', kwh: 189, earned: 5.67 },
  { month: 'Feb', kwh: 137, earned: 4.11 },
];

export const weeklyStats = [
  { day: 'Mon', kwh: 32.4 },
  { day: 'Tue', kwh: 0 },
  { day: 'Wed', kwh: 28.1 },
  { day: 'Thu', kwh: 21.6 },
  { day: 'Fri', kwh: 35.2 },
  { day: 'Sat', kwh: 0 },
  { day: 'Sun', kwh: 29.8 },
];

export const carbonImpact = {
  co2OffsetKg: 562.3,
  treesEquivalent: 25,
  gasGallonsSaved: 148.4,
};
