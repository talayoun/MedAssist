import React, { useRef, useEffect } from 'react';

interface Props {
  onDraw?: () => void;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}

export function SignatureCanvas({ onDraw, canvasRef: externalRef }: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const ref = externalRef ?? internalRef;
  const drawing = useRef(false);

  const getPos = (e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!ref.current) return;
    drawing.current = true;
    const event = e.nativeEvent;
    const touch = (event as TouchEvent).touches?.[0];
    const pos = getPos(touch ?? (event as MouseEvent), ref.current);
    const ctx = ref.current.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || !ref.current) return;
    e.preventDefault();
    const event = e.nativeEvent;
    const touch = (event as TouchEvent).touches?.[0];
    const pos = getPos(touch ?? (event as MouseEvent), ref.current);
    const ctx = ref.current.getContext('2d')!;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    onDraw?.();
  };

  const stopDrawing = () => {
    drawing.current = false;
  };

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext('2d')!;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
  }, []);

  return (
    <canvas
      ref={ref}
      width={320}
      height={160}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={stopDrawing}
      style={{
        border: '2px solid #cbd5e1',
        borderRadius: '12px',
        background: '#fff',
        touchAction: 'none',
        display: 'block',
        width: '100%',
        maxWidth: '320px',
      }}
    />
  );
}

export function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
