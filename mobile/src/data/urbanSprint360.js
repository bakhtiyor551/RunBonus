/** Ракурсы Urban Sprint (Night Pulse) — из макета / отдельные PNG в public/products/urban-sprint/ */
const BASE = '/products/urban-sprint';

export const URBAN_SPRINT_360_ANGLES = [
  { id: 'left', label: 'Левый бок', src: `${BASE}/angle-left.png` },
  { id: 'front', label: 'Перед', src: `${BASE}/angle-front.png` },
  { id: 'right', label: 'Правый бок', src: `${BASE}/angle-right.png` },
  { id: 'back', label: 'Задник', src: `${BASE}/angle-back.png` },
  { id: 'top', label: 'Верх', src: `${BASE}/angle-top.png` },
  { id: 'sole', label: 'Подошва', src: `${BASE}/angle-sole.png` },
];

/** Крупный вид по умолчанию */
export const URBAN_SPRINT_HERO = `${BASE}/view-main.png`;
