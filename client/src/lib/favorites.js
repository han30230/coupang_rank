const KEY = 'coupang_favorites_v1';

export function loadLocalFavorites() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveLocalFavorites(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function isFav(localFavs, productId) {
  const id = String(productId || '');
  return localFavs.some((x) => String(x.productId) === id);
}

