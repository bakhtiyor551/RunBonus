/** Единый ключ категории: число или строка (shoes, tshirt…). */
export function normalizeCategoryId(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

export function categoryMapKey(raw) {
  const id = normalizeCategoryId(raw);
  return id == null ? null : String(id);
}
