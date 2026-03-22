export function calculateDeliveryScore(
  pickedUpAt: number,
  orderTTL: number
): { base: number; speedBonus: number; total: number } {
  const base = 100
  const elapsed = Date.now() - pickedUpAt
  const remaining = orderTTL - elapsed
  const ratio = remaining / orderTTL

  let speedBonus = 0
  if (ratio > 0.75) {
    speedBonus = 100
  } else if (ratio > 0.5) {
    speedBonus = 50
  }

  return { base, speedBonus, total: base + speedBonus }
}
