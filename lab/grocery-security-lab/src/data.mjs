// Disposable lab fixtures only. All state is in memory and resets on restart.
// None of the addresses, phone numbers or emails refer to real customers.
export const ACCOUNTS = Object.freeze([
  { id: 'owner', email: 'owner@sprout.local', displayName: 'Morgan Patel', role: 'owner', password: 'OwnerDemo!26' },
  { id: 'customer-a', email: 'alice@sprout.local', displayName: 'Alice Green', role: 'customer', password: 'AppleA!26' },
  { id: 'customer-b', email: 'bob@sprout.local', displayName: 'Bob Berry', role: 'customer', password: 'BerryB!26' }
]);

const products = [
  { sku: 'apple-01', name: 'Honeycrisp Apples', category: 'Fruit', price: 160, unit: '1 kg', emoji: '🍎', stock: 37, badge: 'Bestseller', shade: 'peach' },
  { sku: 'avocado-02', name: 'Ripe Avocados', category: 'Fruit', price: 220, unit: '2 pieces', emoji: '🥑', stock: 24, badge: 'Fresh pick', shade: 'mint' },
  { sku: 'bread-03', name: 'Sourdough Bread', category: 'Bakery', price: 190, unit: '1 loaf', emoji: '🍞', stock: 18, badge: '', shade: 'butter' },
  { sku: 'milk-04', name: 'Farm Fresh Milk', category: 'Dairy', price: 72, unit: '1 litre', emoji: '🥛', stock: 43, badge: '', shade: 'lavender' },
  { sku: 'carrot-05', name: 'Organic Carrots', category: 'Vegetables', price: 85, unit: '500 g', emoji: '🥕', stock: 28, badge: 'Organic', shade: 'peach' },
  { sku: 'spinach-06', name: 'Baby Spinach', category: 'Vegetables', price: 95, unit: '250 g', emoji: '🥬', stock: 19, badge: '', shade: 'mint' },
  { sku: 'coffee-07', name: 'House Blend Coffee', category: 'Pantry', price: 390, unit: '250 g', emoji: '☕', stock: 15, badge: 'Small batch', shade: 'butter' },
  { sku: 'eggs-08', name: 'Free Range Eggs', category: 'Dairy', price: 110, unit: '6 pieces', emoji: '🥚', stock: 32, badge: '', shade: 'lavender' }
];

export function createInitialState() {
  return {
    store: {
      storeName: 'Sprout & Stone', tagline: 'Good food. Great little days.',
      ownerName: 'Morgan Patel', supportEmail: 'hello@sprout.local',
      supportPhone: '+91 90000 00000', pickupNote: 'Pickup available 9 AM – 8 PM',
      neighbourhood: 'Indiranagar, Bengaluru'
    },
    products: structuredClone(products),
    addresses: [
      { addressId: 'address-a-101', ownerUserId: 'customer-a', label: 'Home', line1: '12 Maple Lane', city: 'Bengaluru', postalCode: '560001', deliveryNote: 'Please ring the bell', privateMarker: 'ADDRESS_A_PRIVATE_84A1' },
      { addressId: 'address-b-102', ownerUserId: 'customer-b', label: 'Home', line1: '45 Cedar Street', city: 'Bengaluru', postalCode: '560008', deliveryNote: 'Leave at the front desk', privateMarker: 'ADDRESS_B_PRIVATE_57B3' }
    ],
    orders: [
      { orderId: 'order-a-1001', ownerUserId: 'customer-a', status: 'Out for delivery', placedAt: '2026-10-28', items: [{ sku: 'apple-01', name: 'Honeycrisp Apples', quantity: 2, price: 160 }, {sku:'bread-03', name:'Sourdough Bread',quantity:1,price:190}], total: 510, deliveryAddressId: 'address-a-101', deliveryInstructions: 'Please ring the bell', privateMarker: 'ORDER_A_PRIVATE_71C9' },
      { orderId: 'order-b-1002', ownerUserId: 'customer-b', status: 'Preparing', placedAt: '2026-10-30', items: [{ sku: 'milk-04', name: 'Farm Fresh Milk', quantity: 2, price: 72 },{sku:'coffee-07',name:'House Blend Coffee',quantity:1,price:390}], total: 534, deliveryAddressId: 'address-b-102', deliveryInstructions: 'Leave at the front desk', privateMarker: 'ORDER_B_PRIVATE_48D2' },
      { orderId: 'order-a-1003', ownerUserId: 'customer-a', status: 'Delivered', placedAt: '2026-10-24', items: [{ sku: 'carrot-05', name: 'Organic Carrots', quantity: 1, price:85 }], total: 85, deliveryAddressId: 'address-a-101', deliveryInstructions: 'Please ring the bell', privateMarker: 'ORDER_A_PRIVATE_70E3' }
    ],
    nextOrderId: 1004
  };
}

export function publicUser(user) { return { userId: user.id, displayName: user.displayName, role: user.role, email: user.email }; }
