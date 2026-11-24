import { useEffect, useState } from 'react';
import { Select, Spin, type SelectProps } from 'antd';
import { api, qs } from '../api';
import { useAtraso } from '../hooks';
import type { Lista } from '../tipos';

interface Props<T> extends Omit<SelectProps, 'options' | 'onSearch' | 'showSearch' | 'onChange'> {
  endpoint: string;
  rotulo: (item: T) => string;
  descricao?: (item: T) => string;
  extra?: Record<string, string | number>;
  /** Rótulo para o valor atual (quando o item ainda não foi carregado). */
  rotuloInicial?: string;
  onChange?: (valor: number | null, item: T | null) => void;
}

/** Select que busca no servidor enquanto o usuário digita (clientes, condomínios...). */
export function SelecaoRemota<T extends { id: number }>({ endpoint, rotulo, descricao, extra, rotuloInicial, onChange, value, ...resto }: Props<T>) {
  const [texto, setTexto] = useState('');
  const termo = useAtraso(texto, 250);
  const [itens, setItens] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api
      .get<Lista<T>>(`${endpoint}${qs({ q: termo, limite: 20, ...extra })}`)
      .then((r) => ativo && setItens(r.itens))
      .catch(() => undefined)
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [endpoint, termo, JSON.stringify(extra)]); // eslint-disable-line react-hooks/exhaustive-deps

  const opcoes = itens.map((i) => ({
    value: i.id,
    label: rotulo(i),
    desc: descricao?.(i),
  }));
  if (value && rotuloInicial && !opcoes.some((o) => o.value === value)) {
    opcoes.unshift({ value: value as number, label: rotuloInicial, desc: undefined });
  }

  return (
    <Select
      {...resto}
      value={value}
      showSearch={{ filterOption: false, onSearch: setTexto }}
      notFoundContent={carregando ? <Spin size="small" /> : 'Nada encontrado'}
      options={opcoes}
      optionRender={(o) => (
        <div>
          <div>{o.data.label}</div>
          {o.data.desc && <div style={{ fontSize: 12, color: '#888' }}>{o.data.desc}</div>}
        </div>
      )}
      onChange={(v) => onChange?.(v ?? null, itens.find((i) => i.id === v) ?? null)}
    />
  );
}
