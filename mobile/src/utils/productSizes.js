/** Размеры в наличии для выбранного цвета (или общие, если цвета без своих размеров). */
export function sizesForColor(product, selectedColor) {
  if (!product) return [];

  const colors = product.colors?.length ? product.colors : [];
  const perColorCatalog = colors.some((c) => c.id != null && Array.isArray(c.sizes));

  if (perColorCatalog) {
    const color =
      selectedColor?.id != null
        ? colors.find((c) => c.id === selectedColor.id) || selectedColor
        : colors.find((c) => c.label === selectedColor?.label) || selectedColor;
    return (color?.sizes || []).filter((s) => s.in_stock);
  }

  return (product.sizes || []).filter((s) => s.in_stock);
}

export function productHasStock(product, selectedColor = null) {
  return sizesForColor(product, selectedColor).length > 0;
}
