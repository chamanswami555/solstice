/**
 * Criterion 8 of the spec: each pair of a text colour and the background it sits on has a contrast
 * of 4.5 to 1 or more, computed from the colour tokens. Focus rings and control edges need 3 to 1.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync(new URL("../app/tokens.css", import.meta.url), "utf8");

/** The value of one oklch colour token: lightness in percent, chroma, hue in degrees. */
function token(name: string): [number, number, number] {
  const found = tokens.match(new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!found) throw new Error(`no oklch value for --color-${name}`);
  return [Number(found[1]) / 100, Number(found[2]), Number(found[3])];
}

/** WCAG relative luminance of an oklch colour: OKLab, then linear sRGB (clipped to the gamut), then the weighted sum. */
function luminance([lightness, chroma, hue]: [number, number, number]): number {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (value: number) => Math.min(1, Math.max(0, value));
  const red = clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(front: string, back: string): number {
  const [light, dark] = [luminance(token(front)), luminance(token(back))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Every surface that text sits on: the page, the panels, a lit panel, a notice, a hovered quiet button. */
const SURFACES = ["paper", "paper-2", "paper-3", "cotton", "lit"];

describe("the colour tokens", () => {
  it("compute the known values of black and white, so the formula is right", () => {
    expect(luminance([1, 0, 0])).toBeCloseTo(1, 3);
    expect(luminance([0, 0, 0])).toBeCloseTo(0, 6);
  });

  it.each(SURFACES.flatMap((back) => ["ink", "muted", "error"].map((front) => [front, back])))("give %s text on %s 4.5 to 1 or more", (front, back) => {
    expect(contrast(front, back)).toBeGreaterThanOrEqual(4.5);
  });

  it("give the type on the dark button 4.5 to 1 or more", () => {
    expect(contrast("board-type", "board")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES.flatMap((back) => ["focus", "accent-2", "muted"].map((front) => [front, back])))(
    "give the %s ring or edge on %s 3 to 1 or more",
    (front, back) => {
      expect(contrast(front, back)).toBeGreaterThanOrEqual(3);
    },
  );
});
