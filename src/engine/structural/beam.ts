export const GRAVITY = 9.80665; // m/s², standard gravity

/** Second moment of area of a rectangular section, mm⁴. */
export function rectInertia(breadthMm: number, depthMm: number): number {
  return (breadthMm * depthMm ** 3) / 12;
}

/** Elastic section modulus of a rectangular section, mm³. */
export function rectSectionModulus(breadthMm: number, depthMm: number): number {
  return (breadthMm * depthMm ** 2) / 6;
}

/** Mid-span deflection, simply supported beam, uniformly distributed load w (N/mm): 5wL⁴/(384EI). */
export function deflectionSimpleUdl(wNPerMm: number, spanMm: number, eMpa: number, iMm4: number): number {
  return (5 * wNPerMm * spanMm ** 4) / (384 * eMpa * iMm4);
}

/** Mid-span deflection, simply supported beam, central point load P (N): PL³/(48EI). */
export function deflectionSimplePointCenter(pN: number, spanMm: number, eMpa: number, iMm4: number): number {
  return (pN * spanMm ** 3) / (48 * eMpa * iMm4);
}

/** Maximum bending moment, simply supported, UDL: wL²/8 (N·mm). */
export function momentSimpleUdl(wNPerMm: number, spanMm: number): number {
  return (wNPerMm * spanMm ** 2) / 8;
}

/** Maximum bending moment, simply supported, central point load: PL/4 (N·mm). */
export function momentSimplePointCenter(pN: number, spanMm: number): number {
  return (pN * spanMm) / 4;
}

export function kgToN(kg: number): number {
  return kg * GRAVITY;
}
