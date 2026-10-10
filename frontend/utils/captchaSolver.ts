/**
 * CampusLynx captcha solver.
 *
 * The portal renders a 310x60 PNG with 5 unrotated characters in a bold Arial
 * face, struck through by a wavy line. We build glyph templates on a canvas at
 * the same size/font, trace the strike-through line, and match each character
 * via the Dice coefficient while ignoring the line.
 *
 * The matching strategy (strike-line tracing, Dice scoring, gap-based advance
 * and glyph disambiguation) is adapted from the MIT-licensed lazyportal
 * project (github.com/jitendradara12/lazyportal) and tuned for our flow.
 */

const CHARACTERS = "abcdefghjkmnpqrstuvwxyz23456789";
const BASELINES = [42, 43, 44, 45];
const WIDTH = 310;
const HEIGHT = 60;

interface GlyphTemplate {
  width: number;
  points: Array<[number, number]>;
}

type TemplateMap = Record<string, Record<number, GlyphTemplate>>;

let cachedTemplates: TemplateMap | null = null;

function createContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas.getContext("2d", { willReadFrequently: true });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Captcha image could not be read"));
    image.src = source;
  });
}

function buildTemplates(context: CanvasRenderingContext2D): TemplateMap {
  const templates: TemplateMap = {};
  context.font = "bold 40px Arial, 'Liberation Sans', sans-serif";
  context.textBaseline = "alphabetic";

  for (const character of CHARACTERS) {
    templates[character] = {};
    for (const baseline of BASELINES) {
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = "black";
      context.fillText(character, 50, baseline);
      const measured = context.measureText(character);
      const templateWidth = Math.ceil(measured.width) + 20;
      const data = context.getImageData(40, 0, templateWidth, HEIGHT).data;

      let minX = templateWidth;
      let maxX = -1;
      for (let y = 10; y < 55; y += 1) {
        for (let x = 0; x < templateWidth; x += 1) {
          if (data[(y * templateWidth + x) * 4 + 3] > 128) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
      }

      const width =
        maxX >= minX ? maxX - minX + 1 : Math.round(measured.width);
      const points: Array<[number, number]> = [];
      if (maxX >= minX) {
        for (let y = 10; y < 55; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            if (data[(y * templateWidth + x) * 4 + 3] > 128) {
              points.push([x - minX, y]);
            }
          }
        }
      }
      templates[character][baseline] = { width, points };
    }
  }
  return templates;
}

/**
 * Resolve the glyph pairs the matcher most often confuses by inspecting the
 * distinctive stroke of the wider candidate.
 */
function disambiguate(
  charA: string,
  charB: string,
  curX: number,
  isDark: (x: number, y: number) => boolean,
  lineY: number[],
  width: number
): string {
  const pair = new Set([charA, charB]);

  const countDark = (x0: number, x1: number, y0: number, y1: number): number => {
    let dark = 0;
    for (let x = Math.round(x0); x <= Math.round(x1); x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (Math.abs(y - lineY[x]) > 1 && isDark(x, y)) dark += 1;
      }
    }
    return dark;
  };

  // 'm' has a third vertical leg that 'r'/'n' lack.
  if (charA === "r" || charA === "n" || pair.has("m")) {
    if (countDark(curX + 20, curX + 28, 26, 42) >= 7) return "m";
  }

  // 'w' has a fourth diagonal stroke that 'v'/'u' lack.
  if (charA === "v" || charA === "u" || pair.has("w")) {
    if (countDark(curX + 20, curX + 28, 24, 42) >= 7) return "w";
  }

  // 'e' has a solid horizontal crossbar that 'c' lacks.
  if (pair.has("c") && pair.has("e")) {
    return countDark(curX + width * 0.45, curX + width * 0.85, 26, 32) >= 4
      ? "e"
      : "c";
  }

  // 'h' has a tall ascender that 'n' lacks.
  if (pair.has("n") && pair.has("h")) {
    return countDark(curX, curX + 6, 14, 21) >= 4 ? "h" : "n";
  }

  return charA;
}

export async function solveCampusLynxCaptcha(
  imageDataUrl: string
): Promise<string> {
  if (typeof document === "undefined" || !imageDataUrl) return "";

  const context = createContext();
  if (!context) return "";

  const image = await loadImage(imageDataUrl);
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, WIDTH, HEIGHT).data;

  const isDark = (x: number, y: number): boolean => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) return false;
    const index = (py * WIDTH + px) * 4;
    const background = 55 + (px / WIDTH) * 200;
    return (
      (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 <
      Math.min(background - 25, 140)
    );
  };

  // Locate the strike-through line where it enters from the right edge.
  let startY = 30;
  let foundStart = false;
  for (let x = 275; x >= 240 && !foundStart; x -= 1) {
    for (let y = 4; y <= 56; y += 1) {
      if (isDark(x, y) && isDark(x - 1, y)) {
        startY = y;
        foundStart = true;
        break;
      }
    }
  }
  if (!foundStart) {
    for (let y = 0; y < HEIGHT; y += 1) {
      if (isDark(260, y)) {
        startY = y;
        break;
      }
    }
  }

  // Trace the line leftward, following the nearest dark pixel.
  const lineY = new Array<number>(WIDTH).fill(-1);
  let currentY = startY;
  for (let x = 259; x >= 10; x -= 1) {
    for (const delta of [0, -1, 1, -2, 2, -3, 3]) {
      if (isDark(x, currentY + delta)) {
        currentY += delta;
        break;
      }
    }
    lineY[x] = currentY;
  }

  // 3-tap median smoothing to flatten 1px spikes when crossing stems.
  for (let x = 11; x < 259; x += 1) {
    if (lineY[x - 1] !== -1 && lineY[x] !== -1 && lineY[x + 1] !== -1) {
      const a = lineY[x - 1];
      const b = lineY[x];
      const c = lineY[x + 1];
      lineY[x] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    }
  }

  // First character starts at the first column with meaningful off-line ink.
  let cursor = 18;
  for (let x = 12; x < 28; x += 1) {
    let columnDark = 0;
    for (let y = 15; y < 50; y += 1) {
      if (Math.abs(y - lineY[x]) > 1 && isDark(x, y)) columnDark += 1;
    }
    if (columnDark >= 5) {
      cursor = x - 1;
      break;
    }
  }

  if (!cachedTemplates) cachedTemplates = buildTemplates(context);
  const templates = cachedTemplates;

  let solved = "";
  for (let position = 0; position < 5; position += 1) {
    let bestChar = "";
    let bestScore = -999;
    let bestWidth = 22;
    let bestShift = 0;
    let secondChar = "";
    let secondScore = -999;

    for (const character of CHARACTERS) {
      let charScore = -999;
      let charWidth = 22;
      let charShift = 0;

      for (const baseline of BASELINES) {
        const template = templates[character][baseline];
        for (let shift = -2; shift <= 2; shift += 1) {
          let bothDark = 0;
          let validCandidate = 0;
          for (const [tx, ty] of template.points) {
            const px = cursor + shift + tx;
            if (Math.abs(ty - lineY[px]) <= 1) continue;
            validCandidate += 1;
            if (isDark(px, ty)) bothDark += 1;
          }
          if (validCandidate === 0) continue;

          let imageDarkInBox = 0;
          for (let y = 10; y < 55; y += 1) {
            for (let x = 0; x < template.width; x += 1) {
              const px = cursor + shift + x;
              if (Math.abs(y - lineY[px]) <= 1) continue;
              if (isDark(px, y)) imageDarkInBox += 1;
            }
          }

          const dice = (2 * bothDark) / (validCandidate + imageDarkInBox);
          if (dice > charScore) {
            charScore = dice;
            charWidth = template.width;
            charShift = shift;
          }
        }
      }

      if (charScore > bestScore) {
        secondScore = bestScore;
        secondChar = bestChar;
        bestScore = charScore;
        bestChar = character;
        bestWidth = charWidth;
        bestShift = charShift;
      } else if (charScore > secondScore) {
        secondScore = charScore;
        secondChar = character;
      }
    }

    // No confident match (blank / resized / heavily noisy): signal failure.
    if (!bestChar || bestScore < 0.15) return "";

    const needsCheck =
      (secondChar !== "" && bestScore - secondScore < 0.08) ||
      bestChar === "n" ||
      bestChar === "r" ||
      bestChar === "u" ||
      bestChar === "v";

    let finalChar = bestChar;
    if (needsCheck) {
      finalChar = disambiguate(
        bestChar,
        secondChar,
        cursor + bestShift,
        isDark,
        lineY,
        bestWidth
      );
      if (finalChar === "m") bestWidth = templates["m"][44].width;
      if (finalChar === "w") bestWidth = templates["w"][44].width;
    }
    solved += finalChar;

    // Advance with gap detection to avoid cumulative drift.
    const expectedX = cursor + bestShift + bestWidth;
    let gapStart = -1;
    let inGap = false;
    for (let x = expectedX - 3; x <= expectedX + 5; x += 1) {
      let columnDark = 0;
      for (let y = 15; y < 50; y += 1) {
        if (Math.abs(y - lineY[x]) > 1 && isDark(x, y)) columnDark += 1;
      }
      if (columnDark <= 2) {
        inGap = true;
      } else if (inGap && columnDark >= 4) {
        gapStart = x;
        break;
      }
    }

    if (gapStart !== -1 && Math.abs(gapStart - expectedX) <= 4) {
      cursor = gapStart;
    } else {
      cursor = expectedX;
    }
  }

  return solved;
}
