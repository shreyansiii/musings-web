"use client";

import { useEffect, useRef } from "react";

export default function HeroCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let p5Instance: any;
    let cancelled = false;

    Promise.all([import("p5"), import("@/lib/heroSketch")]).then(
      ([p5Module, sketchModule]) => {
        if (cancelled || !containerRef.current) return;
        const P5 = p5Module.default;
        const sketch = sketchModule.default;
        p5Instance = new P5(sketch, containerRef.current);
      }
    );

    return () => {
      cancelled = true;
      if (p5Instance) p5Instance.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 -z-10 pointer-events-none"
      aria-hidden="true"
    />
  );
}