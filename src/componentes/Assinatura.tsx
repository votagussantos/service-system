import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Button, Space } from 'antd';
import { ClearOutlined } from '@ant-design/icons';

/** Quadro para o cliente assinar com o dedo. */
export function Assinatura({
  onChange,
  canvasRef: ref,
}: {
  onChange: (vazia: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const desenhando = useRef(false);
  const [vazia, setVazia] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      const ctx = c.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';
      setVazia(true);
      onChange(true);
    };
    ajustar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ponto = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <canvas
        ref={ref}
        className="quadro-assinatura"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          desenhando.current = true;
          const ctx = ref.current!.getContext('2d')!;
          const p = ponto(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 0.1, p.y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!desenhando.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const p = ponto(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (vazia) {
            setVazia(false);
            onChange(false);
          }
        }}
        onPointerUp={() => (desenhando.current = false)}
        onPointerCancel={() => (desenhando.current = false)}
      />
      <Space style={{ marginTop: 8 }}>
        <Button
          icon={<ClearOutlined />}
          onClick={() => {
            const c = ref.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            setVazia(true);
            onChange(true);
          }}
        >
          Limpar
        </Button>
      </Space>
    </div>
  );
}

export function assinaturaParaBlob(canvas: HTMLCanvasElement | null): Promise<Blob | null> {
  if (!canvas) return Promise.resolve(null);
  return new Promise((ok) => canvas.toBlob(ok, 'image/png'));
}
