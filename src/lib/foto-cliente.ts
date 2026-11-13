import { FOTO } from "./acessorios";

export type FotoPronta = { previa: string; base64: string };

/**
 * Prepara no navegador a foto de um acessório: reduz para até 800 px no lado
 * maior e grava como JPEG, baixando a qualidade se ainda ficar pesada. Assim
 * a foto do celular, de vários megabytes, chega ao site com menos de 400 KB.
 */
export async function prepararFoto(arquivo: File): Promise<FotoPronta> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    throw new Error("Não consegui abrir essa imagem. Use uma foto em JPG, PNG ou WebP.");
  }
  const escala = Math.min(1, FOTO.lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const g = canvas.getContext("2d")!;
  // JPEG não tem transparência: fundo branco para PNG recortado não sair preto
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const qualidade of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
    if (blob && blob.size <= FOTO.bytes) {
      const previa = await new Promise<string>((ok, erro) => {
        const leitor = new FileReader();
        leitor.onload = () => ok(String(leitor.result));
        leitor.onerror = () => erro(new Error("Não consegui ler a imagem."));
        leitor.readAsDataURL(blob);
      });
      canvas.width = canvas.height = 0;
      return { previa, base64: previa.slice(previa.indexOf(",") + 1) };
    }
  }
  canvas.width = canvas.height = 0;
  throw new Error("Essa imagem ficou pesada demais mesmo reduzida. Tente outra foto.");
}
