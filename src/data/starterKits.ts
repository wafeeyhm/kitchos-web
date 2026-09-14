export interface StarterKitInfo {
  id: 'CAFE' | 'RESTAURANT' | 'CYBER_CAFE' | 'POPUP';
  title: string;
  badge: string;
  icon: string;
  accentColor: string;
  tagline: string;
  description: string;
  branchName: string;
  managerName: string;
  cashierName: string;
  sampleProducts: { name: string; category: string; price: number }[];
  inventoryHighlights: string[];
}

export const STARTER_KITS: StarterKitInfo[] = [
  {
    id: 'CAFE',
    title: 'Artisan Cafe & Roastery',
    badge: 'Specialty Coffee',
    icon: '☕',
    accentColor: 'from-amber-600 to-amber-900',
    tagline: 'High-speed espresso modifiers, dairy alternatives & pastry showcase',
    description:
      'Engineered for espresso bars, specialty bakeries, and tea houses requiring milligram-level beverage costing and oat milk recipe variations.',
    branchName: 'The Roasted Bean Cafe (Kiulap)',
    managerName: 'Rashid (PIN: 9999)',
    cashierName: 'Nurul (PIN: 1234)',
    sampleProducts: [
      { name: 'Spanish Latte', category: 'Beverages', price: 5.0 },
      { name: 'Iced Caramel Macchiato', category: 'Beverages', price: 5.5 },
      { name: 'Flat White', category: 'Beverages', price: 4.5 },
      { name: 'Fresh Baked Croissant', category: 'Pastries', price: 3.5 },
      { name: 'Truffle Shoestring Fries', category: 'Food', price: 5.5 },
    ],
    inventoryHighlights: ['House Blend Beans', 'Fresh Milk', 'Oat Milk', 'Vanilla Syrup', 'Croissant Dough'],
  },
  {
    id: 'RESTAURANT',
    title: 'Casual Dine-In Restaurant',
    badge: 'Full Service F&B',
    icon: '🍽️',
    accentColor: 'from-emerald-600 to-emerald-900',
    tagline: 'Kitchen KDS ticket routing, table notes, and dine-in vs takeaway',
    description:
      'Configured for family restaurants, bistros, and grills with hot kitchen lines, prep stations, and meal portion management.',
    branchName: 'Kitch Bistro & Grill (Gadong)',
    managerName: 'Chef Azman (PIN: 9999)',
    cashierName: 'Dina (PIN: 1234)',
    sampleProducts: [
      { name: 'Mi Goreng Special (with Egg)', category: 'Food', price: 4.5 },
      { name: 'Buttermilk Crispy Chicken Rice', category: 'Food', price: 6.5 },
      { name: 'Wagyu Smash Burger & Fries', category: 'Food', price: 8.5 },
      { name: 'Chicken Satay (6 Skewers)', category: 'Food', price: 5.0 },
      { name: 'Iced Calamansi Lemon Tea', category: 'Beverages', price: 2.5 },
    ],
    inventoryHighlights: ['Chicken Fillet', 'Jasmine Rice', 'Grade A Eggs', 'Wagyu Patties', 'Brioche Buns'],
  },
  {
    id: 'CYBER_CAFE',
    title: 'Cyber Cafe & Esports Lounge',
    badge: 'Gaming & Snacks',
    icon: '🎮',
    accentColor: 'from-indigo-600 to-indigo-900',
    tagline: 'Hourly rig rental services alongside instant hot food & canned drinks',
    description:
      'Tailored for gaming centers, pool halls, and LAN lounges combining time-based service billing with instant packaged noodles and energy boosters.',
    branchName: 'Nexus Esports Lounge (Airport Mall)',
    managerName: 'Ken (PIN: 9999)',
    cashierName: 'Faris (PIN: 1234)',
    sampleProducts: [
      { name: '1-Hour PC Station Pass', category: 'Services', price: 2.0 },
      { name: '3-Hour VIP Gaming Block', category: 'Services', price: 5.0 },
      { name: 'Indomie Double Goreng (Egg+Sausage)', category: 'Food', price: 3.2 },
      { name: 'Hot Alicafe Tongkat Ali', category: 'Beverages', price: 1.8 },
      { name: 'Milo Dinosaur Ais', category: 'Beverages', price: 3.0 },
    ],
    inventoryHighlights: ['Indomie Packets', 'Alicafe Sachets', 'Milo Powder', 'Fresh Eggs', 'Sausages'],
  },
  {
    id: 'POPUP',
    title: 'Pop-Up Stall & Food Truck',
    badge: 'Fast Turnaround',
    icon: '🚚',
    accentColor: 'from-rose-600 to-rose-900',
    tagline: 'Rapid cash presets, high-speed combos & Brunei QR e-wallet focus',
    description:
      'Optimized for night market stalls, street food trucks, and outdoor pop-ups needing rapid checkout, quick cash presets, and QR code payments.',
    branchName: 'Night Market Pop-Up (Pasar Gadong)',
    managerName: 'Sam (PIN: 9999)',
    cashierName: 'Aiman (PIN: 1234)',
    sampleProducts: [
      { name: 'Crispy Chicken Tenders Bucket', category: 'Food', price: 6.5 },
      { name: 'Cheesy Loaded Wedges', category: 'Food', price: 4.5 },
      { name: 'Hot Cinnamon Churros (6pcs)', category: 'Desserts', price: 4.0 },
      { name: 'Fizzy Honey Lemonade', category: 'Beverages', price: 3.0 },
      { name: 'Combo Meal (Tenders + Drink)', category: 'Combos', price: 8.5 },
    ],
    inventoryHighlights: ['Chicken Tenders', 'Potato Wedges', 'Cheddar Cheese', 'Churro Dough', 'Lemonade Syrup'],
  },
];