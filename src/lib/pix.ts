/**
 * Gera o "Pix copia e cola" (BR Code estático, padrão EMV do Banco Central).
 * Não depende de banco nem de gateway: o código leva a chave, o valor e um
 * identificador, e o recebimento é conferido no extrato.
 */

function campo(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, "0") + valor;
}

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), como exige o BR Code. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e caracteres fora do conjunto aceito pelos apps de banco. */
function ascii(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, "")
    .trim()
    .slice(0, max);
}

export type DadosPix = {
  chave: string;
  recebedor: string;
  cidade: string;
  centavos: number;
  /** Identificador da cobrança; só letras e números, até 25 caracteres. */
  txid: string;
};

export function gerarPixCopiaECola(dados: DadosPix): string {
  const txid = dados.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", dados.chave.trim());
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (dados.centavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", ascii(dados.recebedor, 25) || "RECEBEDOR") +
    campo("60", ascii(dados.cidade, 15) || "BRASIL") +
    campo("62", campo("05", txid)) +
    "6304";
  return semCrc + crc16(semCrc);
}
