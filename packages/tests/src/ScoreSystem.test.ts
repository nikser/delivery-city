import { calculateDeliveryScore } from '../../server/src/game/ScoreSystem'
import { ORDER_TTL_HELD } from '../../shared/src/index'

describe('calculateDeliveryScore', () => {
  test('base всегда = 100', () => {
    const { base } = calculateDeliveryScore(Date.now() - ORDER_TTL_HELD * 0.5, ORDER_TTL_HELD)
    expect(base).toBe(100)
  })

  test('ratio > 0.75 → speedBonus = 100, total = 200', () => {
    // elapsed = ORDER_TTL_HELD * 0.1 → remaining = 0.9 * TTL → ratio = 0.9
    const pickedUpAt = Date.now() - ORDER_TTL_HELD * 0.1
    const { speedBonus, total } = calculateDeliveryScore(pickedUpAt, ORDER_TTL_HELD)
    expect(speedBonus).toBe(100)
    expect(total).toBe(200)
  })

  test('0.5 < ratio <= 0.75 → speedBonus = 50, total = 150', () => {
    // elapsed = ORDER_TTL_HELD * 0.35 → remaining = 0.65 * TTL → ratio = 0.65
    const pickedUpAt = Date.now() - ORDER_TTL_HELD * 0.35
    const { speedBonus, total } = calculateDeliveryScore(pickedUpAt, ORDER_TTL_HELD)
    expect(speedBonus).toBe(50)
    expect(total).toBe(150)
  })

  test('ratio <= 0.50 → speedBonus = 0, total = 100', () => {
    // elapsed = ORDER_TTL_HELD * 0.9 → remaining = 0.1 * TTL → ratio = 0.1
    const pickedUpAt = Date.now() - ORDER_TTL_HELD * 0.9
    const { speedBonus, total } = calculateDeliveryScore(pickedUpAt, ORDER_TTL_HELD)
    expect(speedBonus).toBe(0)
    expect(total).toBe(100)
  })
})
