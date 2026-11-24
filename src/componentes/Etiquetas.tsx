import { Space, Tag, Tooltip } from 'antd';
import { SafetyCertificateOutlined, RedoOutlined, ThunderboltOutlined, RollbackOutlined } from '@ant-design/icons';
import { STATUS_OS_COR, STATUS_OS_LABEL, type StatusOS } from '../../shared/constantes';
import { dataSimples } from '../formato';

export function TagStatus({ status }: { status: StatusOS }) {
  return <Tag color={STATUS_OS_COR[status]}>{STATUS_OS_LABEL[status]}</Tag>;
}

interface Sinais {
  status?: StatusOS;
  em_garantia?: number;
  garantia_ate?: string | null;
  reincidencia?: number;
  retorno_garantia?: number;
  prioridade?: string;
}

/** Selos que chamam atenção: em garantia, reincidência, retorno em garantia, urgente. */
export function Selos({ o, comStatus = true }: { o: Sinais; comStatus?: boolean }) {
  return (
    <Space size={4} wrap>
      {comStatus && o.status && <TagStatus status={o.status} />}
      {o.prioridade === 'urgente' && (
        <Tag color="red" icon={<ThunderboltOutlined />}>
          Urgente
        </Tag>
      )}
      {!!o.em_garantia && (
        <Tooltip title={`Garantia até ${dataSimples(o.garantia_ate)}`}>
          <Tag color="green" icon={<SafetyCertificateOutlined />}>
            Em garantia
          </Tag>
        </Tooltip>
      )}
      {!!o.retorno_garantia && (
        <Tag color="cyan" icon={<RollbackOutlined />}>
          Retorno em garantia
        </Tag>
      )}
      {!!o.reincidencia && (
        <Tooltip title="Já houve serviço concluído neste endereço/cliente recentemente">
          <Tag color="volcano" icon={<RedoOutlined />}>
            Reincidência
          </Tag>
        </Tooltip>
      )}
    </Space>
  );
}
