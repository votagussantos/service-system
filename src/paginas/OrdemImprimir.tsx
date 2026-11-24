import { useParams } from 'react-router';
import { Button, Skeleton } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { STATUS_OS_LABEL } from '../../shared/constantes';
import { urlArquivo } from '../api';
import { dataHora, dataSimples, dinheiro, enderecoCompleto } from '../formato';
import { useDados } from '../hooks';
import type { Empresa, Ordem } from '../tipos';

/** Versão para impressão / PDF da OS (comprovante para o cliente). */
export function PaginaOrdemImprimir() {
  const { id } = useParams();
  const { dados: o } = useDados<Ordem>(`/ordens/${id}`);
  const { dados: e } = useDados<Empresa>('/empresa');
  if (!o || !e) return <Skeleton active style={{ padding: 24 }} />;

  const fotos = o.fotos.filter((f) => f.r2_key);
  return (
    <div className="impressao">
      <div className="so-tela" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
        <Button onClick={() => window.close()}>Fechar</Button>
      </div>

      <table>
        <tbody>
          <tr>
            <td style={{ width: '65%', border: 0, padding: 0 }}>
              <h1>{e.nome_fantasia || e.razao_social || 'Empresa'}</h1>
              <div>{[e.razao_social, e.cnpj && `CNPJ ${e.cnpj}`].filter(Boolean).join(' · ')}</div>
              <div>{enderecoCompleto(e)}</div>
              <div>{[e.telefone, e.whatsapp && `WhatsApp ${e.whatsapp}`, e.email].filter(Boolean).join(' · ')}</div>
            </td>
            <td style={{ textAlign: 'right', border: 0, padding: 0 }}>
              <h1>ORDEM DE SERVIÇO</h1>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Nº {o.numero}</div>
              <div>{STATUS_OS_LABEL[o.status]}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Cliente</h2>
      <table>
        <tbody>
          <tr>
            <th style={{ width: 120 }}>Nome</th>
            <td>{o.cliente.nome}</td>
            <th style={{ width: 90 }}>CPF/CNPJ</th>
            <td>{o.cliente.cpf_cnpj}</td>
          </tr>
          <tr>
            <th>Local</th>
            <td colSpan={3}>
              {o.condominio ? `${o.condominio.nome} · ` : ''}
              {enderecoCompleto(o)}
            </td>
          </tr>
          <tr>
            <th>Contato</th>
            <td>{o.contato_nome || o.cliente.nome}</td>
            <th>Telefone</th>
            <td>{o.contato_telefone || o.cliente.telefone}</td>
          </tr>
        </tbody>
      </table>

      <h2>Atendimento</h2>
      <table>
        <tbody>
          <tr>
            <th style={{ width: 120 }}>Abertura</th>
            <td>{dataHora(o.criado_em)}</td>
            <th style={{ width: 90 }}>Técnico</th>
            <td>{[o.tecnico_nome, o.ajudante_nome].filter(Boolean).join(' / ')}</td>
          </tr>
          <tr>
            <th>Execução</th>
            <td>{o.concluida_em ? dataHora(o.concluida_em) : dataHora(o.data_agendada)}</td>
            <th>Veículo</th>
            <td>{o.veiculo_placa}</td>
          </tr>
          {o.local_servico && (
            <tr>
              <th>Onde</th>
              <td colSpan={3}>{o.local_servico}</td>
            </tr>
          )}
        </tbody>
      </table>
      <h2>Problema relatado</h2>
      <div className="caixa">{o.problema}</div>
      <h2>Serviço executado</h2>
      <div className="caixa">{o.servico_executado}</div>

      <h2>Serviços</h2>
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th style={{ width: 90 }}>Qtd.</th>
            <th style={{ width: 100 }}>Unitário</th>
            <th style={{ width: 100 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {o.itens.map((i) => (
            <tr key={i.id}>
              <td>{i.descricao}</td>
              <td>
                {i.quantidade} {i.unidade}
              </td>
              <td style={{ textAlign: 'right' }}>{dinheiro(i.valor_unitario)}</td>
              <td style={{ textAlign: 'right' }}>{dinheiro(i.quantidade * i.valor_unitario)}</td>
            </tr>
          ))}
          {o.desconto > 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: 'right' }}>
                Desconto{o.retorno_garantia ? ' (retorno em garantia)' : ''}
              </td>
              <td style={{ textAlign: 'right' }}>−{dinheiro(o.desconto)}</td>
            </tr>
          )}
          <tr>
            <th colSpan={3} style={{ textAlign: 'right' }}>
              TOTAL
            </th>
            <th style={{ textAlign: 'right' }}>{dinheiro(o.valor_total)}</th>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 6 }}>
        Pagamento: {o.forma_pagamento || '—'} · {o.pago ? 'Pago' : 'A receber'}
        {o.garantia_ate && <> · <b>Garantia até {dataSimples(o.garantia_ate)}</b></>}
        {o.retorno_garantia && o.origem_numero ? ` · Retorno em garantia da OS nº ${o.origem_numero}` : ''}
      </div>

      {fotos.length > 0 && (
        <>
          <h2>Fotos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {fotos.slice(0, 8).map((f) => (
              <div key={f.id}>
                <img src={urlArquivo(f.r2_key)} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                <div style={{ fontSize: 11 }}>{f.tipo === 'antes' ? 'Antes' : 'Depois'}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {e.texto_os && <div className="caixa" style={{ fontSize: 11, marginTop: 14 }}>{e.texto_os}</div>}

      <table style={{ marginTop: 28 }}>
        <tbody>
          <tr>
            <td style={{ border: 0, textAlign: 'center', width: '50%' }}>
              {o.assinatura_key ? <img src={urlArquivo(o.assinatura_key)} alt="" style={{ height: 70 }} /> : <div style={{ height: 70 }} />}
              <div style={{ borderTop: '1px solid #000', marginTop: 4 }}>{o.assinatura_nome || 'Assinatura do cliente'}</div>
            </td>
            <td style={{ border: 0, textAlign: 'center' }}>
              <div style={{ height: 70 }} />
              <div style={{ borderTop: '1px solid #000', marginTop: 4 }}>{o.tecnico_nome || 'Técnico responsável'}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
