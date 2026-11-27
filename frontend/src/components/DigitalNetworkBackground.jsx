import { useEffect, useRef } from "react";

const COLUMNS = 12;
const ROWS = 8;
const FRAME_INTERVAL = 1000 / 30;

export default function DigitalNetworkBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrameTime = 0;
    let staticTime = 0;

    function resize() {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw(staticTime);
    }

    function draw(time) {
      const dark = document.documentElement.dataset.theme !== "light";
      const rotation = motionPreference.matches ? 0.12 : time * 0.00012;
      const tilt = motionPreference.matches ? -0.08 : Math.sin(time * 0.00016) * 0.08;
      const focalLength = Math.max(width, height) * 1.25;
      const points = [];
      const horizontalGap = width / (COLUMNS - 1);
      const verticalGap = height / (ROWS - 1);
      const centerX = width / 2;
      const centerY = height / 2;

      context.clearRect(0, 0, width, height);

      for (let row = 0; row < ROWS; row += 1) {
        for (let column = 0; column < COLUMNS; column += 1) {
          const x = column * horizontalGap - centerX;
          const y = row * verticalGap - centerY;
          const z =
            Math.sin(column * 0.8 + time * 0.00045) * 52 +
            Math.cos(row * 0.9 - time * 0.00035) * 42;
          const rotatedX = x * Math.cos(rotation) - z * Math.sin(rotation);
          const rotatedZ = x * Math.sin(rotation) + z * Math.cos(rotation);
          const rotatedY = y * Math.cos(tilt) - rotatedZ * Math.sin(tilt);
          const depth = y * Math.sin(tilt) + rotatedZ * Math.cos(tilt);
          const perspective = focalLength / (focalLength + depth);

          points.push({
            x: centerX + rotatedX * perspective,
            y: centerY + rotatedY * perspective,
            perspective,
            depth,
          });
        }
      }

      const lineColor = dark ? "91, 174, 218" : "36, 104, 173";
      for (let row = 0; row < ROWS; row += 1) {
        for (let column = 0; column < COLUMNS; column += 1) {
          const index = row * COLUMNS + column;
          const point = points[index];
          const neighbors = [
            column + 1 < COLUMNS ? index + 1 : -1,
            row + 1 < ROWS ? index + COLUMNS : -1,
            row + 1 < ROWS && column + 1 < COLUMNS ? index + COLUMNS + 1 : -1,
          ];

          for (const neighborIndex of neighbors) {
            if (neighborIndex < 0) continue;
            const neighbor = points[neighborIndex];
            const depthOpacity = Math.max(
              0.035,
              0.19 - Math.abs(point.depth + neighbor.depth) / 4200,
            );
            context.beginPath();
            context.moveTo(point.x, point.y);
            context.lineTo(neighbor.x, neighbor.y);
            context.strokeStyle = `rgba(${lineColor}, ${dark ? depthOpacity : depthOpacity * 1.65})`;
            context.lineWidth = dark ? 0.7 : 0.9;
            context.stroke();
          }
        }
      }

      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const pulse = (Math.sin(time * 0.001 + index * 1.7) + 1) / 2;
        const radius = 0.8 + pulse * 1.1;
        const glow = dark ? 0.34 : 0.42;
        const pointColor = dark ? "91, 190, 211" : "33, 128, 181";
        context.beginPath();
        context.arc(point.x, point.y, radius * point.perspective, 0, Math.PI * 2);
        context.fillStyle = `rgba(${pointColor}, ${glow * point.perspective})`;
        context.shadowBlur = dark ? 9 : 5;
        context.shadowColor = dark
          ? "rgba(91, 190, 211, 0.55)"
          : "rgba(33, 128, 181, 0.58)";
        context.fill();
      }
      context.shadowBlur = 0;

      if (!motionPreference.matches && !document.hidden) {
        frame = window.requestAnimationFrame(animate);
      }
    }

    function animate(time) {
      if (time - lastFrameTime < FRAME_INTERVAL) {
        frame = window.requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = time;
      staticTime = time;
      draw(time);
    }

    function updateMotion() {
      window.cancelAnimationFrame(frame);
      if (motionPreference.matches) {
        draw(staticTime);
      } else {
        frame = window.requestAnimationFrame(animate);
      }
    }

    function updateVisibility() {
      window.cancelAnimationFrame(frame);
      if (document.hidden || motionPreference.matches) {
        draw(staticTime);
      } else {
        frame = window.requestAnimationFrame(animate);
      }
    }

    const themeObserver = new MutationObserver(() => draw(staticTime));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", updateVisibility);
    motionPreference.addEventListener("change", updateMotion);
    resize();
    updateMotion();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", updateVisibility);
      motionPreference.removeEventListener("change", updateMotion);
      themeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="digital-network-background"
      aria-hidden="true"
    />
  );
}
