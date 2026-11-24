import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.locale('pt-br');
dayjs.extend(relativeTime);

export { dayjs };

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const dinheiro = (v: number | null | undefined) => (v === null || v === undefined ? '—' : moeda.format(v));

export const data = (v: string | null | undefined) => (v ? dayjs(v).format('DD/MM/YYYY') : '—');
export const dataHora = (v: string | null | undefined) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—');
/** "AAAA-MM-DD" sem fuso (ex.: garantia_ate). */
export const dataSimples = (v: string | null | undefined) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '—');
export const relativo = (v: string | null | undefined) => (v ? dayjs(v).fromNow() : '—');

export function hojeISO(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function soDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D+/g, '');
}

export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function mascaraDocumento(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function mascaraCep(v: string): string {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

interface ComEndereco {
  logradouro?: string;
  numero?: string | number;
  numero_endereco?: string;
  complemento?: string;
  unidade?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
}

export function enderecoCurto(e: ComEndereco): string {
  const num = e.numero_endereco ?? (typeof e.numero === 'string' ? e.numero : '');
  const linha = [e.logradouro, num].filter(Boolean).join(', ');
  const extra = [e.unidade || e.complemento, e.bairro].filter(Boolean).join(' - ');
  return [linha, extra].filter(Boolean).join(' - ') || 'Endereço não informado';
}

export function enderecoCompleto(e: ComEndereco): string {
  const cidade = [e.cidade, e.uf].filter(Boolean).join('/');
  return [enderecoCurto(e), cidade].filter(Boolean).join(' - ');
}

export function linkMapa(e: ComEndereco): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(e))}`;
}

export function linkWhatsApp(telefone: string, texto = ''): string {
  let d = soDigitos(telefone);
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
