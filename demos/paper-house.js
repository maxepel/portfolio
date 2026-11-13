// Normalized pin plan: doorstep first so the guide begins at his front door.
const PLAN = [
  [.40, .96], [.64, .96], [.08, .96], [.92, .96],
  [.08, .36], [.92, .36], [.50, .04], [.40, .64], [.64, .64],
  [.17, .49], [.31, .49], [.31, .65], [.17, .65],
  [.71, .49], [.85, .49], [.85, .65], [.71, .65]
];
export const HOUSE_LINKS = [
  [0, 1], [2, 0], [1, 3], [2, 4], [3, 5],
  [4, 6], [6, 5], [4, 5], [0, 7], [7, 8], [8, 1],
  [9, 10], [10, 11], [11, 12], [12, 9],
  [13, 14], [14, 15], [15, 16], [16, 13]
];

export function threadHousePins(rect, viewportWidth, scroll = 0) {
  const size = Math.min(350, Math.max(160, rect.width - 30));
  const height = size * .94;
  const left = rect.left + (rect.width - size) / 2;
  const top = rect.top + scroll + (rect.height - height) / 2 + 12;
  return PLAN.map(([x, y]) => ({
    x: (left + x * size) / viewportWidth,
    y: top + y * height
  }));
}
