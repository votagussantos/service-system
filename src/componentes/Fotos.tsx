import { useRef, useState } from 'react';
import { App, Button, Image, Popconfirm, Space, Tag, Typography } from 'antd';
import { CameraOutlined, CloudUploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { api, urlArquivo } from '../api';
import type { FotoOS, Ordem } from '../tipos';
import { comprimirImagem } from './imagem';

interface PropsGaleria {
  fotos: FotoOS[];
  podeEditar: boolean;
  onAdicionar: (tipo: 'antes' | 'depois', blob: Blob) => Promise<void> | void;
  onRemover: (foto: FotoOS) => Promise<void> | void;
  /** Mostra só um dos tipos (tela de atendimento por etapas). */
  tipos?: ('antes' | 'depois')[];
}

/** Fotos antes/depois. No celular, o botão abre direto a câmera. */
export function Galeria({ fotos, podeEditar, onAdicionar, onRemover, tipos = ['antes', 'depois'] }: PropsGaleria) {
  const entrada = useRef<HTMLInputElement>(null);
  const [tipoAtual, setTipoAtual] = useState<'antes' | 'depois'>('antes');
  const [enviando, setEnviando] = useState(false);
  const { message } = App.useApp();

  const escolher = (tipo: 'antes' | 'depois') => {
    setTipoAtual(tipo);
    entrada.current?.click();
  };

  return (
    <div>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={async (e) => {
          const arquivos = Array.from(e.target.files ?? []);
          e.target.value = '';
          setEnviando(true);
          try {
            for (const a of arquivos) await onAdicionar(tipoAtual, await comprimirImagem(a));
          } catch (err) {
            message.error((err as Error).message);
          } finally {
            setEnviando(false);
          }
        }}
      />
      {tipos.map((tipo) => {
        const lista = fotos.filter((f) => f.tipo === tipo);
        return (
          <div key={tipo} style={{ marginBottom: 12 }}>
            <Space style={{ marginBottom: 8 }}>
              <Typography.Text strong>{tipo === 'antes' ? 'Antes' : 'Depois'}</Typography.Text>
              <Typography.Text type="secondary">({lista.length})</Typography.Text>
              {podeEditar && (
                <Button size="small" icon={<CameraOutlined />} loading={enviando && tipoAtual === tipo} onClick={() => escolher(tipo)}>
                  Adicionar foto
                </Button>
              )}
            </Space>
            {lista.length > 0 && (
              <Image.PreviewGroup>
                <div className="galeria">
                  {lista.map((f) => (
                    <div className="foto" key={f.id}>
                      <Image src={f.url_local ?? urlArquivo(f.r2_key)} alt={`Foto ${tipo}`} />
                      {f.pendente && (
                        <Tag className="marca" color="orange" icon={<CloudUploadOutlined />}>
                          no celular
                        </Tag>
                      )}
                      {podeEditar && (
                        <Popconfirm title="Remover esta foto?" okText="Remover" cancelText="Não" onConfirm={() => onRemover(f)}>
                          <Button className="acao" size="small" danger shape="circle" icon={<DeleteOutlined />} aria-label="Remover foto" />
                        </Popconfirm>
                      )}
                    </div>
                  ))}
                </div>
              </Image.PreviewGroup>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Galeria ligada direto à API (uso no escritório, com internet). */
export function GaleriaFotos({ ordem, podeEnviar, aoMudar }: { ordem: Ordem; podeEnviar: boolean; aoMudar: () => void }) {
  return (
    <Galeria
      fotos={ordem.fotos}
      podeEditar={podeEnviar}
      onAdicionar={async (tipo, blob) => {
        await api.put(`/ordens/${ordem.id}/fotos/${crypto.randomUUID()}?tipo=${tipo}`, blob, { 'Content-Type': blob.type || 'image/jpeg' });
        aoMudar();
      }}
      onRemover={async (f) => {
        await api.del(`/ordens/${ordem.id}/fotos/${f.id}`);
        aoMudar();
      }}
    />
  );
}
