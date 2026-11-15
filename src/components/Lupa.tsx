"use client";

import { useEffect } from "react";

/** Área de uma carta que pode ser ampliada: o próprio <img> ou um elemento com um <img> dentro. */
const AREA = "[data-lupa]";
const ESPERA_DO_MOUSE = 180;
const ESPERA_DO_TOQUE = 1000;

/** No Scryfall, a mesma imagem existe num tamanho maior; a prévia traduzida já é o que há. */
const grande = (src: string) => (src.includes("cards.scryfall.io") ? src.replace("/normal/", "/large/").replace("/small/", "/large/") : src);

/**
 * Lupa das cartas: com o mouse parado em cima de uma carta, ela aparece
 * ampliada ao lado do cursor; no celular, segurar o dedo um segundo abre a
 * carta no meio da tela e o toque seguinte fecha. Fica uma vez no layout e
 * vale para qualquer carta marcada com `data-lupa`.
 */
export function Lupa() {
  useEffect(() => {
    const lupa = document.createElement("div");
    lupa.className = "lupa";
    lupa.setAttribute("aria-hidden", "true");
    const fundo = document.createElement("div");
    fundo.className = "lupa-fundo";
    const fim = new AbortController();
    const sinal = fim.signal;

    let alvo: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let mx = 0, my = 0;
    const parar = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const imgDe = (el: Element) => (el instanceof HTMLImageElement ? el : el.querySelector("img"));
    const areaDe = (t: EventTarget | null) => {
      const area = t instanceof Element ? t.closest(AREA) : null;
      return area && imgDe(area) ? area : null;
    };

    const posicionar = () => {
      if (lupa.classList.contains("toque")) return;
      const w = lupa.offsetWidth, h = lupa.offsetHeight, m = 16, vw = window.innerWidth, vh = window.innerHeight;
      let x = mx + 28;
      if (x + w + m > vw) x = mx - 28 - w; // à direita do mouse; se não couber, à esquerda
      x = Math.max(m, Math.min(x, vw - w - m));
      const y = Math.max(m, Math.min(my - h / 2, vh - h - m));
      lupa.style.left = `${x}px`;
      lupa.style.top = `${y}px`;
    };
    const esconder = () => {
      parar();
      alvo = null;
      lupa.classList.remove("on", "toque");
      fundo.classList.remove("on");
      fundo.remove();
    };
    const mostrar = (area: Element, toque = false) => {
      const img = imgDe(area);
      if (!img || !img.isConnected || alvo !== area) return;
      // dentro de uma janela aberta (<dialog>), a lupa vai junto, senão ficaria por baixo dela
      const pai = img.closest("dialog[open]") ?? document.body;
      if (toque) {
        pai.appendChild(fundo);
        requestAnimationFrame(() => fundo.classList.add("on"));
      }
      pai.appendChild(lupa);
      const src = img.currentSrc || img.src;
      lupa.style.backgroundImage = `url("${grande(src)}"), url("${src}")`;
      lupa.classList.toggle("toque", toque);
      posicionar();
      lupa.classList.add("on");
    };

    // mouse: parado em cima da carta
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      document.addEventListener(
        "mousemove",
        (ev) => {
          mx = ev.clientX;
          my = ev.clientY;
          const novo = areaDe(ev.target);
          if (novo !== alvo) {
            esconder();
            alvo = novo;
            if (novo) timer = setTimeout(() => mostrar(novo), ESPERA_DO_MOUSE);
            return;
          }
          if (lupa.classList.contains("on")) posicionar();
        },
        { passive: true, signal: sinal },
      );
      document.addEventListener("mouseleave", esconder, { signal: sinal });
      // rolar, arrastar, clicar ou digitar tira a carta da frente
      for (const tipo of ["scroll", "dragstart", "mousedown", "keydown", "blur"])
        window.addEventListener(tipo, esconder, { passive: true, capture: true, signal: sinal });
    }

    // toque: segurar um segundo sem arrastar
    let x0 = 0, y0 = 0, aberta = false, solto = false;
    document.addEventListener(
      "touchstart",
      (ev) => {
        if (aberta) return;
        const area = areaDe(ev.target);
        if (!area || ev.touches.length > 1) return;
        x0 = ev.touches[0].clientX;
        y0 = ev.touches[0].clientY;
        parar();
        alvo = area;
        timer = setTimeout(() => {
          timer = null;
          mostrar(area, true);
          aberta = true;
          solto = false;
          try {
            navigator.vibrate?.(15);
          } catch {
            // sem vibração, segue igual
          }
        }, ESPERA_DO_TOQUE);
      },
      { passive: true, signal: sinal },
    );
    document.addEventListener(
      "touchmove",
      (ev) => {
        if (aberta || !timer) return;
        const p = ev.touches[0];
        // o dedo andou: a pessoa está rolando a página
        if (Math.hypot(p.clientX - x0, p.clientY - y0) > 10) {
          parar();
          alvo = null;
        }
      },
      { passive: true, signal: sinal },
    );
    document.addEventListener(
      "touchend",
      (ev) => {
        if (!aberta) {
          parar();
          if (!lupa.classList.contains("on")) alvo = null;
          return;
        }
        // soltou o dedo: a carta continua aberta e o toque não vira clique no que está embaixo
        if (lupa.classList.contains("on") && !solto) {
          solto = true;
          if (ev.cancelable) ev.preventDefault();
        }
      },
      { signal: sinal },
    );
    // com a carta aberta, o próximo toque em qualquer lugar fecha (e não clica no que está embaixo)
    const fechar = (ev: Event) => {
      if (!aberta) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (!solto) return;
      esconder();
      aberta = false;
    };
    fundo.addEventListener("click", fechar, { signal: sinal });
    lupa.addEventListener("click", fechar, { signal: sinal });
    // segurar o dedo numa imagem abriria o menu do navegador
    document.addEventListener(
      "contextmenu",
      (ev) => {
        if (aberta || (timer && areaDe(ev.target))) ev.preventDefault();
      },
      { signal: sinal },
    );

    return () => {
      fim.abort();
      esconder();
      lupa.remove();
    };
  }, []);

  return null;
}
