/** Deterministic catalogue + order fixtures shared by the ML test suites. */

export const products = [
  {
    _id: "p_apple",
    name: "Fresh Red Apple",
    category: "Fruits",
    price: 120,
    offerPrice: 99,
    image: ["apple.png"],
    description: ["Crisp seasonal apple", "Rich in fibre"],
    inStock: true,
  },
  {
    _id: "p_green_apple",
    name: "Green Apple",
    category: "Fruits",
    price: 130,
    offerPrice: 110,
    image: ["green-apple.png"],
    description: ["Tart green apple", "Rich in fibre"],
    inStock: true,
  },
  {
    _id: "p_banana",
    name: "Organic Banana",
    category: "Fruits",
    price: 60,
    offerPrice: 50,
    image: ["banana.png"],
    description: ["Sweet ripe banana", "High potassium"],
    inStock: true,
  },
  {
    _id: "p_milk",
    name: "Amul Full Cream Milk",
    category: "Dairy",
    price: 70,
    offerPrice: 65,
    image: ["milk.png"],
    description: ["Full cream dairy milk", "Pasteurised"],
    inStock: true,
  },
  {
    _id: "p_cheese",
    name: "Cheddar Cheese Block",
    category: "Dairy",
    price: 320,
    offerPrice: 299,
    image: ["cheese.png"],
    description: ["Aged cheddar dairy cheese"],
    inStock: true,
  },
  {
    _id: "p_bread",
    name: "Brown Bread Loaf",
    category: "Bakery",
    price: 55,
    offerPrice: 45,
    image: ["bread.png"],
    description: ["Whole wheat bakery bread"],
    inStock: true,
  },
  {
    _id: "p_cake",
    name: "Chocolate Cake Slice",
    category: "Bakery",
    price: 250,
    offerPrice: 220,
    image: ["cake.png"],
    description: ["Rich chocolate bakery cake"],
    inStock: false,
  },
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * Baskets crafted so milk+bread co-occur strongly, which lets the
 * collaborative signal be asserted independently of text similarity.
 */
export function makeOrders(now = new Date("2026-01-20T10:00:00Z")) {
  const at = (daysAgo) => new Date(now.getTime() - daysAgo * DAY);

  return [
    { _id: "o1", createdAt: at(1), items: [{ product: "p_milk", quantity: 2 }, { product: "p_bread", quantity: 1 }] },
    { _id: "o2", createdAt: at(2), items: [{ product: "p_milk", quantity: 1 }, { product: "p_bread", quantity: 2 }] },
    { _id: "o3", createdAt: at(3), items: [{ product: "p_milk", quantity: 3 }, { product: "p_bread", quantity: 1 }] },
    { _id: "o4", createdAt: at(4), items: [{ product: "p_milk", quantity: 1 }, { product: "p_banana", quantity: 1 }] },
    { _id: "o5", createdAt: at(5), items: [{ product: "p_apple", quantity: 4 }] },
    { _id: "o6", createdAt: at(6), items: [{ product: "p_bread", quantity: 1 }, { product: "p_cheese", quantity: 1 }] },
    { _id: "o7", createdAt: at(7), items: [{ product: "p_milk", quantity: 2 }, { product: "p_bread", quantity: 1 }] },
  ];
}

/** Strictly increasing daily demand, used to assert an upward forecast trend. */
export function makeRisingOrders(now = new Date("2026-01-20T10:00:00Z")) {
  const orders = [];
  for (let daysAgo = 9; daysAgo >= 0; daysAgo--) {
    const units = 10 - daysAgo; // 1 unit nine days ago ... 10 units today
    orders.push({
      _id: `rising_${daysAgo}`,
      createdAt: new Date(now.getTime() - daysAgo * DAY),
      items: [{ product: "p_milk", quantity: units }],
    });
  }
  return orders;
}
