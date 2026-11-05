import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, effectiveBackground, parseColor } from '../support/contrast';

const black = parseColor('rgb(0, 0, 0)');
const white = parseColor('rgb(255, 255, 255)');

describe('parseColor', () => {
  it('reads rgb, rgba and color(srgb) forms', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('color(srgb 1 0 0.5 / 0.25)')).toEqual({ r: 255, g: 0, b: 127.5, a: 0.25 });
  });

  it('throws on a colour it cannot read instead of guessing', () => {
    expect(() => parseColor('oklch(0.5 0.1 20)')).toThrow('Cannot parse colour');
    expect(() => parseColor('transparent')).toThrow('Cannot parse colour');
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    // Known pair: #767676 on white is the classic 4.54:1 AA threshold colour.
    expect(contrastRatio(parseColor('rgb(118, 118, 118)'), white)).toBeCloseTo(4.54, 2);
  });

  it('does not depend on argument order', () => {
    const a = parseColor('rgb(192, 32, 43)');
    const b = parseColor('rgb(36, 36, 36)');
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });

  it('shows the dark-mode accent failing as text and the lighter text accent passing', () => {
    const panel = parseColor('rgb(36, 36, 36)');
    expect(contrastRatio(parseColor('rgb(192, 32, 43)'), panel)).toBeLessThan(3);
    expect(contrastRatio(parseColor('rgb(255, 107, 115)'), panel)).toBeGreaterThan(4.5);
  });
});

describe('effectiveBackground', () => {
  it('uses the nearest opaque background', () => {
    expect(effectiveBackground(['rgb(36, 36, 36)', 'rgb(26, 26, 26)'])).toEqual({ r: 36, g: 36, b: 36, a: 1 });
  });

  it('skips fully transparent layers and composites translucent ones over what is behind', () => {
    expect(effectiveBackground(['rgba(0, 0, 0, 0)', 'rgb(26, 26, 26)'])).toEqual({ r: 26, g: 26, b: 26, a: 1 });
    expect(effectiveBackground(['rgba(0, 0, 0, 0.5)', 'rgb(200, 200, 200)'])).toEqual({ r: 100, g: 100, b: 100, a: 1 });
  });

  it('throws when nothing in the chain is opaque', () => {
    expect(() => effectiveBackground(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.5)'])).toThrow('No opaque background');
  });
});

describe('composite', () => {
  it('returns the top colour when it is opaque', () => {
    expect(composite({ ...white, a: 1 }, black)).toEqual({ ...white, a: 1 });
  });
});
