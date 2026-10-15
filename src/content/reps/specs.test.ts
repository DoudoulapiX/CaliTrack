import { COUNTED_EXERCISES } from './movements'
import { COUNTED_MOVEMENTS, COUNTER_PARAMS, defaultVariant, SPEC_ALTERNATIVES, SPECS, specFor } from './specs'

describe('seuils des mouvements', () => {
  it.each(COUNTED_MOVEMENTS)('%s : en bas < demi-répétition < en haut', (movement) => {
    const spec = SPECS[movement]
    expect(spec.movement).toBe(movement)
    expect(spec.flexed).toBeLessThan(spec.attempt)
    expect(spec.attempt).toBeLessThan(spec.extended)
    expect(spec.minRepMs).toBeGreaterThan(0)
    expect(spec.minRepMs).toBeLessThan(COUNTER_PARAMS.maxRepMs)
    expect(spec.need.length).toBeGreaterThan(0)
  })

  it('valident squats et curls, laissent pompes, dips et tractions en essai', () => {
    expect(COUNTED_MOVEMENTS.filter((movement) => SPECS[movement].validated)).toEqual(['squat', 'curl'])
  })

  it('suivent le tableau de la conception', () => {
    expect(SPECS.squat).toMatchObject({ flexed: 120, extended: 150, signal: 'kneeAngle', space: '3d' })
    expect(SPECS.pushup).toMatchObject({ flexed: 105, extended: 145, view: 'side', sides: 'best' })
    expect(SPECS.dip).toMatchObject({ flexed: 105, extended: 145, view: 'side', maxTorsoTilt: 45 })
    expect(SPECS.pullup).toMatchObject({ flexed: 0.45, extended: 0.8, signal: 'hangRatio', sides: 'mean' })
    expect(SPECS.curl).toMatchObject({ flexed: 80, extended: 130, sides: 'perArm', maxUpperArmTilt: 60 })
    // Tractions filmées de dos : pas de nez.
    expect(SPECS.pullup.need).toEqual([11, 12, 13, 14, 15, 16])
    // Lâcher les barres termine la série ; ailleurs, seule la position compte.
    expect(COUNTED_MOVEMENTS.filter((movement) => SPECS[movement].leaveAnchor !== null)).toEqual([
      'dip',
      'pullup',
    ])
    // Pieds au sol, mains au sol ou sur la barre : fixés dans la pièce ; le coude des curls ne l'est pas.
    expect(COUNTED_MOVEMENTS.filter((movement) => SPECS[movement].anchorFixed)).toEqual([
      'squat',
      'pushup',
      'dip',
      'pullup',
    ])
    expect(SPECS.dip.leaveAnchor).toBeGreaterThan(SPECS.dip.maxAnchorDrift)
    expect(SPECS.pullup.leaveAnchor).toBeGreaterThan(SPECS.pullup.maxAnchorDrift)
  })

  it('ont des seuils communs cohérents', () => {
    expect(COUNTER_PARAMS.tooFar).toBeLessThan(COUNTER_PARAMS.tooClose)
    expect(COUNTER_PARAMS.idleMinMs).toBeLessThan(COUNTER_PARAMS.idleMaxMs)
    expect(COUNTER_PARAMS.darkVisibility[0]).toBeLessThan(COUNTER_PARAMS.darkVisibility[1])
    expect(COUNTER_PARAMS.darkVisibility[1]).toBeGreaterThan(COUNTER_PARAMS.minVisibility)
  })
})

describe('specFor', () => {
  it('rend les seuils du mouvement sans réglage propre', () => {
    for (const movement of COUNTED_MOVEMENTS)
      expect(specFor(defaultVariant(movement))).toEqual(SPECS[movement])
  })

  it('applique les réglages de chaque variante', () => {
    const knee = specFor({ movement: 'pushup', overrides: { bodyLine: 'knee' } })
    expect(knee.bodyLine).toBe('knee')
    expect(knee.need).toEqual([11, 12, 13, 14, 15, 16, 23, 24, 25, 26])
    expect(specFor({ movement: 'pushup', overrides: { minTorsoTilt: 25 } }).minTorsoTilt).toBe(25)
    expect(specFor({ movement: 'dip', overrides: { maxTorsoTilt: 50 } }).maxTorsoTilt).toBe(50)
    const bar = specFor({ movement: 'curl', overrides: { bothArms: true } })
    expect(bar).toMatchObject({ bothArms: true, sides: 'min' })
  })

  it('met en essai une variante pas encore vérifiée, et les curls à la barre', () => {
    expect(specFor({ movement: 'curl', overrides: { trial: true } })).toEqual({
      ...SPECS.curl,
      validated: false,
    })
    expect(specFor({ movement: 'squat', overrides: { trial: true } })).toEqual({
      ...SPECS.squat,
      validated: false,
    })
    expect(specFor({ movement: 'curl', overrides: { bothArms: true } }).validated).toBe(false)
    expect(specFor({ movement: 'curl', overrides: { trial: false } }).validated).toBe(true)
    expect(specFor(defaultVariant('curl')).validated).toBe(true)
  })

  it('donne des seuils à chaque exercice compté', () => {
    for (const variant of Object.values(COUNTED_EXERCISES)) {
      expect(specFor(variant).movement).toBe(variant.movement)
    }
    expect(specFor(COUNTED_EXERCISES['pushup-incline']!).minTorsoTilt).toBe(25)
    expect(specFor(COUNTED_EXERCISES.Barbell_Curl!).bothArms).toBe(true)
    expect(specFor(COUNTED_EXERCISES.Hammer_Curls!).bothArms).toBe(false)
  })
})

describe('réglages à comparer', () => {
  it('portent sur des mouvements connus et restent cohérents', () => {
    for (const [name, { movement, patch }] of Object.entries(SPEC_ALTERNATIVES)) {
      expect(name.startsWith(`${movement}:`)).toBe(true)
      const spec = { ...SPECS[movement], ...patch }
      expect(spec.flexed).toBeLessThan(spec.attempt)
      expect(spec.attempt).toBeLessThan(spec.extended)
    }
  })
})
