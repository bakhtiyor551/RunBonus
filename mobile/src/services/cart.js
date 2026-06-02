const CART_KEY = 'rb_shop_cart';

export function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function cartCount() {
  return getCart().reduce((n, i) => n + (Number(i.quantity) || 1), 0);
}

export function addToCart(item) {
  const cart = getCart();
  const idx = cart.findIndex((i) => i.productId === item.productId && i.size === item.size);
  if (idx >= 0) {
    cart[idx].quantity = (Number(cart[idx].quantity) || 1) + (Number(item.quantity) || 1);
  } else {
    cart.push({ ...item, quantity: Number(item.quantity) || 1 });
  }
  saveCart(cart);
  return cart;
}

export function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
  return cart;
}

export function clearCart() {
  localStorage.removeItem(CART_KEY);
}
