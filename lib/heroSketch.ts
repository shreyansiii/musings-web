import type P5 from "p5";

const INK = "#1a1a1a";

type ShapeType = "heart" | "star" | "diamond" | "spiral" | "sparkle";
const shapeTypes: ShapeType[] = ["heart", "star", "diamond", "spiral", "sparkle", "star", "sparkle"];

export default function heroSketch(p: P5) {
  const iconCount = 7;
  const repelRadius = 130;
  const maxPush = 55;

  let icons: {
    baseX: number;
    baseY: number;
    size: number;
    shapeType: ShapeType;
    driftOffsetX: number;
    driftOffsetY: number;
    wobbleOffset: number;
    offsetX: number;
    offsetY: number;
  }[] = [];

  p.setup = () => {
    const parent = p.canvas?.parentElement;
    const w = parent?.clientWidth ?? p.windowWidth;
    const h = parent?.clientHeight ?? 400;
    p.createCanvas(w, h);
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);
    p.noFill();

    icons = [];
    for (let i = 0; i < iconCount; i++) {
      const shapeType = shapeTypes[i % shapeTypes.length];
      icons.push({
        baseX: p.random(p.width),
        baseY: p.random(p.height),
        size: shapeType === "sparkle" ? p.random(6, 11) : p.random(14, 26),
        shapeType,
        driftOffsetX: p.random(1000),
        driftOffsetY: p.random(1000),
        wobbleOffset: p.random(1000),
        offsetX: 0,
        offsetY: 0,
      });
    }
  };

  // Adds a small noise-based hand-wobble to any point
  const wobble = (x: number, y: number, seed: number, t: number) => {
    const n1 = p.noise(seed, t) - 0.5;
    const n2 = p.noise(seed + 50, t) - 0.5;
    return [x + n1 * 3, y + n2 * 3];
  };

  const drawHeart = (cx: number, cy: number, s: number, seed: number, t: number) => {
    p.beginShape();
    for (let a = 0; a <= 360; a += 12) {
      const rad = (a * Math.PI) / 180;
      const hx = 16 * Math.pow(Math.sin(rad), 3);
      const hy =
        13 * Math.cos(rad) -
        5 * Math.cos(2 * rad) -
        2 * Math.cos(3 * rad) -
        Math.cos(4 * rad);
      const [wx, wy] = wobble(cx + (hx * s) / 16, cy - (hy * s) / 16, seed + a, t);
      p.vertex(wx, wy);
    }
    p.endShape(p.CLOSE);
  };

  const drawStar = (cx: number, cy: number, s: number, seed: number, t: number) => {
    p.beginShape();
    const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const r = i % 2 === 0 ? s : s * 0.45;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      const [wx, wy] = wobble(x, y, seed + i * 10, t);
      p.vertex(wx, wy);
    }
    p.endShape(p.CLOSE);
  };

  const drawDiamond = (cx: number, cy: number, s: number, seed: number, t: number) => {
    p.beginShape();
    const corners = [
      [cx, cy - s],
      [cx + s * 0.65, cy],
      [cx, cy + s],
      [cx - s * 0.65, cy],
    ];
    corners.forEach(([x, y], i) => {
      const [wx, wy] = wobble(x, y, seed + i * 15, t);
      p.vertex(wx, wy);
    });
    p.endShape(p.CLOSE);
  };

  const drawSpiral = (cx: number, cy: number, s: number, seed: number, t: number) => {
    p.beginShape();
    p.noFill();
    const turns = 2.2;
    for (let a = 0; a <= 360 * turns; a += 10) {
      const rad = (a * Math.PI) / 180;
      const r = (a / (360 * turns)) * s;
      const x = cx + Math.cos(rad) * r;
      const y = cy + Math.sin(rad) * r;
      const [wx, wy] = wobble(x, y, seed + a, t);
      p.vertex(wx, wy);
    }
    p.endShape();
  };

  const drawSparkle = (cx: number, cy: number, s: number, seed: number, t: number) => {
    p.beginShape();
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i;
      const r = i % 2 === 0 ? s : s * 0.25;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      const [wx, wy] = wobble(x, y, seed + i * 10, t);
      p.vertex(wx, wy);
    }
    p.endShape(p.CLOSE);
  };

  p.draw = () => {
    p.clear();
    const t = p.frameCount * 0.004;

    icons.forEach((icon) => {
      const driftX = (p.noise(icon.driftOffsetX + t) - 0.5) * 150;
      const driftY = (p.noise(icon.driftOffsetY + t) - 0.5) * 100;
      const baseCurrentX = icon.baseX + driftX;
      const baseCurrentY = icon.baseY + driftY;

      const dx = baseCurrentX + icon.offsetX - p.mouseX;
      const dy = baseCurrentY + icon.offsetY - p.mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < repelRadius && dist > 0.01) {
        const strength = p.map(dist, 0, repelRadius, maxPush, 0);
        icon.offsetX += (dx / dist) * strength * 0.15;
        icon.offsetY += (dy / dist) * strength * 0.15;
      }
      icon.offsetX *= 0.9;
      icon.offsetY *= 0.9;

      const x = baseCurrentX + icon.offsetX;
      const y = baseCurrentY + icon.offsetY;

      p.stroke(INK);
      const wt = t * 0.5;

      // Draw each icon twice with slightly different noise seeds — like a
      // marker retracing its own line, giving that hand-drawn imperfection.
      [
        { weight: 2.6, seedShift: 0 },
        { weight: 1.6, seedShift: 37 },
      ].forEach(({ weight, seedShift }) => {
        p.strokeWeight(weight);
        const seed = icon.wobbleOffset + seedShift;
        if (icon.shapeType === "heart") drawHeart(x, y, icon.size, seed, wt);
        else if (icon.shapeType === "star") drawStar(x, y, icon.size, seed, wt);
        else if (icon.shapeType === "diamond") drawDiamond(x, y, icon.size, seed, wt);
        else if (icon.shapeType === "sparkle") drawSparkle(x, y, icon.size, seed, wt);
        else drawSpiral(x, y, icon.size, seed, wt);
      });
    });
  };

  p.windowResized = () => {
    const parent = p.canvas?.parentElement;
    const w = parent?.clientWidth ?? p.windowWidth;
    const h = parent?.clientHeight ?? 400;
    p.resizeCanvas(w, h);
  };
}