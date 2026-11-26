import './index.css';
import Alpine from 'alpinejs';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'dimensiona_eletrico_offline_v1';

// Remove comentários // e /* */ e vírgulas finais fora de strings para suportar JSONC e JSON
export function stripJsonComments(raw: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }

    // Comentário de linha //
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < raw.length && raw[i] !== '\n') i++;
      continue;
    }

    // Comentário de bloco /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  // Remove vírgulas finais antes de } ou ] fora de strings
  return out.replace(/,\s*([}\]])/g, '$1');
}

// DIS-NOR-030 Catalog
export interface CatalogItem {
  nome: string;
  tab: number;
  item: string;
  potSugerida: number;
  descricao: string;
}

export const CATALOGO_DIS_NOR_030: CatalogItem[] = [
  { nome: 'Chuveiro', tab: 7, item: 'b', potSugerida: 5500, descricao: 'Aparelho de aquecimento de água por passagem' },
  { nome: 'Torneira Elétrica', tab: 7, item: 'b', potSugerida: 4500, descricao: 'Aquecedor instantâneo de torneira' },
  { nome: 'Aquecedor de Água', tab: 7, item: 'b', potSugerida: 5000, descricao: 'Aquecedor de passagem' },
  { nome: 'Ferro Elétrico', tab: 7, item: 'b', potSugerida: 1200, descricao: 'Ferro de passar roupas' },
  { nome: 'Aquecedor Central / Boiler', tab: 8, item: 'c', potSugerida: 2000, descricao: 'Aquecedor por acumulação' },
  { nome: 'Secadora de Roupa', tab: 9, item: 'd', potSugerida: 2000, descricao: 'Secadora centrífuga/tambor' },
  { nome: 'Máquina de Lavar', tab: 9, item: 'd', potSugerida: 1000, descricao: 'Lavadora de roupas automática' },
  { nome: 'Lavadora', tab: 9, item: 'd', potSugerida: 1000, descricao: 'Lavadora de roupas' },
  { nome: 'Lava-Louças', tab: 9, item: 'd', potSugerida: 1500, descricao: 'Máquina lava-louças' },
  { nome: 'Micro-ondas', tab: 9, item: 'd', potSugerida: 1400, descricao: 'Forno micro-ondas' },
  { nome: 'Forno Elétrico', tab: 9, item: 'e', potSugerida: 2000, descricao: 'Forno de embutir ou bancada' },
  { nome: 'Fogão Elétrico / Cooktop', tab: 10, item: 'e', potSugerida: 6000, descricao: 'Cooktop de indução ou elétrico' },
  { nome: 'Ar-Condicionado', tab: 12, item: 'f', potSugerida: 1550, descricao: 'Condicionador de ar split/janela' },
  { nome: 'Estação de Recarga Veicular (Wallbox)', tab: 13, item: 'g', potSugerida: 7400, descricao: 'Carregador de veículo elétrico' }
];

// Condutores PVC, referência B1 (70°C): [seção mm², 2 carregados (mono/bi), 3 carregados (tri)]
export const CABOS_PVC_B1: [number, number, number][] = [
  [0.5, 9, 8],
  [0.75, 11, 10],
  [1.0, 14, 12],
  [1.5, 17.5, 15.5],
  [2.5, 24, 21],
  [4.0, 32, 28],
  [6.0, 41, 36],
  [10.0, 57, 50],
  [16.0, 76, 68],
  [25.0, 101, 89],
  [35.0, 125, 110],
  [50.0, 151, 134],
  [70.0, 192, 171],
  [95.0, 232, 207]
];

// Fatores DIS-NOR-030
const T12: [number, number][] = [[10, 1.0], [20, 0.90], [30, 0.82], [40, 0.80], [50, 0.77]];

const faixa = (faixas: [number, number][], valor: number, padrao: number): number => {
  const achado = faixas.find(([limite]) => valor <= limite);
  return achado ? achado[1] : padrao;
};

const idx = (array: number[], quantidade: number, padrao: number): number => {
  return array[quantidade - 1] ?? padrao;
};

export const FATOR_DEMANDA: Record<number, (p: number, q: number) => number> = {
  6: (p: number) => faixa([
    [1000, 0.86], [2000, 0.75], [3000, 0.66], [4000, 0.59], [5000, 0.52],
    [6000, 0.45], [7000, 0.40], [8000, 0.35], [9000, 0.31], [10000, 0.27]
  ], p, 0.24),

  7: (_p: number, q: number) => idx([
    1.0, 1.0, 0.84, 0.76, 0.70, 0.65, 0.60, 0.57, 0.54, 0.52, 0.49,
    0.48, 0.46, 0.45, 0.44, 0.43, 0.42, 0.41, 0.40, 0.40, 0.39, 0.39, 0.39
  ], q, 0.38),

  8: (_p: number, q: number) => idx([1.0, 0.72], q, 0.38),

  9: (_p: number, q: number) => faixa([[1, 1.0], [4, 0.70], [6, 0.60]], q, 0.50),

  10: (_p: number, q: number) => idx([
    1.0, 0.60, 0.48, 0.40, 0.37, 0.35, 0.33, 0.32,
    0.31, 0.30, 0.30, 0.28, 0.28, 0.28, 0.28
  ], q, 0.26),

  12: (_p: number, q: number) => faixa(T12, q, 0.75),
  13: (_p: number, q: number) => faixa(T12, q, 0.75)
};

export const DISJUNTORES_PADRAO = [10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125];

export function sugerirDisjuntor(ip: number, izCorrigido: number): number {
  for (const d of DISJUNTORES_PADRAO) {
    if (d >= ip && d <= izCorrigido) {
      return d;
    }
  }
  for (const d of DISJUNTORES_PADRAO) {
    if (d >= ip) {
      return d;
    }
  }
  return Math.ceil(ip * 1.25);
}

// Algoritmo de particionamento e equilíbrio de circuitos
interface ItemCircuito {
  c: string;
  p: number;
  i?: number;
}

const soma = (itens: ItemCircuito[]) => itens.reduce((acc, it) => acc + it.p, 0);

function dividirEquilibrado(itens: ItemCircuito[], total: number, maxPorCircuito: number): ItemCircuito[][] {
  if (!itens.length) return [];
  const n = Math.max(1, Math.ceil(total / maxPorCircuito));
  const alvo = total / n;
  const fila = [...itens];
  const resultado: ItemCircuito[][] = [];
  let parcial: ItemCircuito[] = [];

  while (fila.length > 0) {
    if (parcial.length === 0) {
      parcial.push(fila.shift()!);
    }
    if (fila.length > 0 && (soma(parcial) + fila[fila.length - 1].p <= maxPorCircuito) && soma(parcial) < alvo) {
      parcial.push(fila.pop()!);
    } else {
      resultado.push(parcial);
      parcial = [];
    }
  }
  if (parcial.length > 0) {
    resultado.push(parcial);
  }
  return resultado;
}

// Alpine store/data initialization
declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

window.Alpine = Alpine;

Alpine.data('dimensionamentoApp', () => ({
  step: 1,
  projeto: {
    nome: 'Residência Unifamiliar',
    cliente: 'Cliente Padrão',
    responsavel: 'Eng. Eletricista Responsável',
    art: 'ART/RRT Nº 0001/2026',
    local: 'Salvador - BA (Área de Concessão Neoenergia Coelba)'
  },
  // Parâmetros elétricos
  V: 127,
  inst: 'Trifásico',
  fca: 0.57, // 4 ou 5 circuitos no mesmo eletroduto
  fct: 1.00, // 30°C ambiente
  balanceamentoAtivo: true,
  
  // Lista de cômodos (inicializado com exemplo da planilha)
  rooms: [
    { nome: 'Sala de Estar', area: 30.20, perim: 12.80, mol: false },
    { nome: 'Sala de Jantar', area: 13.50, perim: 15.00, mol: false },
    { nome: 'Dormitório I', area: 11.55, perim: 13.60, mol: false },
    { nome: 'Dormitório II', area: 13.60, perim: 14.80, mol: false },
    { nome: 'Corredor', area: 1.00, perim: 4.00, mol: false },
    { nome: 'Varanda', area: 6.30, perim: 10.20, mol: false },
    { nome: 'Suíte', area: 3.64, perim: 8.20, mol: true },
    { nome: 'Banheiro', area: 3.64, perim: 8.20, mol: true },
    { nome: 'Cozinha', area: 7.84, perim: 11.20, mol: true }
  ],

  // Aparelhos (TUEs)
  apps: [
    { nome: 'Ar-Condicionado', pot: 1550, qtd: 2, tab: '' },
    { nome: 'Chuveiro', pot: 4000, qtd: 1, tab: '' },
    { nome: 'Chuveiro', pot: 5000, qtd: 1, tab: '' },
    { nome: 'Micro-ondas', pot: 1500, qtd: 1, tab: '' },
    { nome: 'Forno Elétrico', pot: 1500, qtd: 1, tab: '' },
    { nome: 'Secadora de Roupa', pot: 1500, qtd: 1, tab: '' },
    { nome: 'Ferro Elétrico', pot: 1000, qtd: 2, tab: '' }
  ],

  // UI state
  novoComodo: { nome: '', area: 0, perim: 0, mol: false },
  novoAparelho: { nome: '', pot: 1500, qtd: 1, tab: '' },
  showProjetoModal: false,
  showHelpModal: false,
  showShortcutsModal: false,
  showIOSGuide: false,
  openExportMenu: false,
  openImportMenu: false,
  helpTopic: '',
  notification: '',

  // Estado PWA & Off-line
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  offlineReady: false,
  isInstalled: false,
  isIOS: false,
  isInstallable: false,
  deferredPrompt: null as BeforeInstallPromptEvent | null,

  init() {
    // Restaurar dados salvos localmente (garante continuidade 100% off-line)
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved && typeof saved === 'object') {
          if (saved.projeto) this.projeto = { ...this.projeto, ...saved.projeto };
          if (typeof saved.V === 'number') this.V = saved.V;
          if (typeof saved.inst === 'string') this.inst = saved.inst;
          if (typeof saved.fca === 'number') this.fca = saved.fca;
          if (typeof saved.fct === 'number') this.fct = saved.fct;
          if (typeof saved.balanceamentoAtivo === 'boolean') this.balanceamentoAtivo = saved.balanceamentoAtivo;
          if (Array.isArray(saved.rooms) && saved.rooms.length > 0) this.rooms = saved.rooms;
          if (Array.isArray(saved.apps) && saved.apps.length > 0) this.apps = saved.apps;
        }
      }
    } catch {
      // Ignora falha de leitura de armazenamento local
    }

    const salvarLocal = () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            projeto: this.projeto,
            V: this.V,
            inst: this.inst,
            fca: this.fca,
            fct: this.fct,
            balanceamentoAtivo: this.balanceamentoAtivo,
            rooms: this.rooms,
            apps: this.apps,
          })
        );
      } catch {
        // Ignora erro de cota de armazenamento
      }
    };

    this.$watch('projeto', salvarLocal);
    this.$watch('V', (val: number) => {
      if (val === 380 && this.inst !== 'Trifásico') {
        this.inst = 'Trifásico';
        this.notificar('Tensão 380 V (F-F-F): Instalação ajustada para Trifásico.');
      }
      salvarLocal();
    });
    this.$watch('inst', (val: string) => {
      if (val !== 'Trifásico' && this.V === 380) {
        this.V = 220;
        this.notificar('380 V (F-F-F) exige sistema Trifásico. Tensão ajustada para 220 V.');
      }
      salvarLocal();
    });
    this.$watch('fca', salvarLocal);
    this.$watch('fct', salvarLocal);
    this.$watch('balanceamentoAtivo', salvarLocal);
    this.$watch('rooms', salvarLocal);
    this.$watch('apps', salvarLocal);

    // Detecção de modo standalone / iOS e instalação PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    this.isInstalled = isStandalone;
    this.isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.isInstallable = true;
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.isInstallable = false;
      this.deferredPrompt = null;
      this.notificar('Aplicativo instalado! Disponível off-line na sua tela inicial.');
    });

    // Monitoramento de conectividade (On-line / Off-line)
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notificar('Conexão restabelecida.');
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notificar('Modo off-line ativo — todos os cálculos e PDFs continuam funcionando.');
    });

    // Registro do Service Worker para funcionamento completo off-line
    if ('serviceWorker' in navigator) {
      if (navigator.serviceWorker.controller) {
        this.offlineReady = true;
      }
      registerSW({
        immediate: true,
        onOfflineReady: () => {
          this.offlineReady = true;
          this.notificar('Aplicativo pronto para funcionar 100% off-line!');
        },
        onNeedRefresh: () => {
          this.notificar('Nova versão disponível e atualizada automaticamente.');
        },
      });
    }

    window.addEventListener('afterprint', () => {
      delete document.body.dataset.print;
    });

    // Configuração de Teclas de Atalho Globais
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Fechar modal ou menus dropdown com Escape
      if (e.key === 'Escape') {
        if (
          this.showShortcutsModal ||
          this.showProjetoModal ||
          this.showIOSGuide ||
          this.openExportMenu ||
          this.openImportMenu
        ) {
          this.showShortcutsModal = false;
          this.showProjetoModal = false;
          this.showIOSGuide = false;
          this.openExportMenu = false;
          this.openImportMenu = false;
          return;
        }
      }

      // Atalhos com a tecla Alt (Alt + 1..4, Alt+C, Alt+A, Alt+P, Alt+R, Alt+M)
      if (e.altKey) {
        const key = e.key.toLowerCase();
        
        // Step 1 Tab: Alt + 1
        if (key === '1') {
          e.preventDefault();
          this.step = 1;
          this.notificar('Passo 1: Cômodos & Cargas (Alt + 1)');
        }
        // Step 2 Tab: Alt + 2
        else if (key === '2') {
          e.preventDefault();
          this.step = 2;
          this.notificar('Passo 2: Aparelhos TUE (Alt + 2)');
        }
        // Step 3 Tab: Alt + 3
        else if (key === '3') {
          e.preventDefault();
          this.step = 3;
          this.notificar('Passo 3: Demanda DIS-NOR-030 (Alt + 3)');
        }
        // Step 4 Tab: Alt + 4
        else if (key === '4') {
          e.preventDefault();
          this.step = 4;
          this.notificar('Passo 4: Quadro de Circuitos (Alt + 4)');
        }
        // Botão "+ Adicionar Cômodo": Alt + C
        else if (key === 'c') {
          e.preventDefault();
          this.step = 1;
          this.addComodo();
          this.$nextTick(() => {
            const inputs = document.querySelectorAll<HTMLInputElement>('.room-nome-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
          });
        }
        // Botão "+ Adicionar Aparelho": Alt + A
        else if (key === 'a') {
          e.preventDefault();
          this.step = 2;
          this.addApp();
          this.$nextTick(() => {
            const inputs = document.querySelectorAll<HTMLInputElement>('.app-nome-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
          });
        }
        // Botão "Próximo Passo": Alt + P ou Alt + Seta Direita
        else if (key === 'p' || key === 'arrowright') {
          e.preventDefault();
          if (this.step < 4) {
            this.step++;
            this.notificar(`Próximo Passo: ${this.step} (Alt + P)`);
          }
        }
        // Botão "Passo Anterior": Alt + Seta Esquerda
        else if (key === 'arrowleft') {
          e.preventDefault();
          if (this.step > 1) {
            this.step--;
            this.notificar(`Passo Anterior: ${this.step} (Alt + ←)`);
          }
        }
        // Botão "Relatório (PDF)" / "Exportar Relatório PDF": Alt + R
        else if (key === 'r') {
          e.preventDefault();
          this.imprimir('rel');
        }
        // Botão "Memorial (PDF)": Alt + M
        else if (key === 'm') {
          e.preventDefault();
          this.imprimir('mem');
        }
      }
      // Atalho de avanço alternativo: Ctrl + Enter
      else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (this.step < 4) {
          this.step++;
          this.notificar(`Próximo Passo: ${this.step} (Ctrl + Enter)`);
        }
      }
      // Abrir modal de ajuda de atalhos com a tecla '?' quando fora de inputs
      else if (e.key === '?' && !['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        this.showShortcutsModal = !this.showShortcutsModal;
      }
    });
  },

  async instalarPWA() {
    if (!this.deferredPrompt) {
      if (this.isIOS) {
        this.showIOSGuide = true;
      }
      return;
    }
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      this.isInstalled = true;
      this.isInstallable = false;
      this.deferredPrompt = null;
    }
  },

  notificar(msg: string) {
    this.notification = msg;
    setTimeout(() => {
      if (this.notification === msg) this.notification = '';
    }, 3500);
  },

  // Utilitário de formatação numérica brasileira
  n(val: any, decimals = 0): string {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },

  // Potência máxima por circuito terminal (10A)
  potenciaMaxCircuito(): number {
    if (this.V === 380) {
      return Math.round(Math.sqrt(3) * 380 * 10);
    }
    return this.V * 10;
  },

  // Cômodos com nome válido
  cValidos() {
    return this.rooms.filter(r => r.nome.trim() !== '');
  },

  // Normaliza texto removendo acentos para comparação normativa segura
  normalizarNome(nome: string): string {
    return (nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  },

  // Classifica o critério de número mínimo de tomadas conforme NBR 5410 item 9.5.2.2.1 (alíneas 'a' a 'e')
  regraTomadaComodo(r: { nome: string; area: number; perim: number; mol?: boolean }): {
    alinea: 'a' | 'b' | 'c' | 'd' | 'e_225' | 'e_6' | 'e_maior_6';
    divisor: number | null;
    fixa: number | null;
    descricao: string;
  } {
    const n = this.normalizarNome(r.nome);
    const a = Number(r.area) || 0;

    // Alínea 'a': em banheiros (e análogos: toaletes, lavabos, wc, suítes), pelo menos 1 ponto de tomada
    const isBanheiro =
      /\b(banheiros?|bwc|toaletes?|lavabos?|wc)\b/.test(n) ||
      (/\bsuites?\b/.test(n) && !/\b(dormitorios?|quartos?)\b/.test(n));
    if (isBanheiro) {
      return { alinea: 'a', divisor: null, fixa: 1, descricao: 'Alínea a (banheiro/análogo)' };
    }

    // Alínea 'c': em varandas, pelo menos 1 ponto de tomada
    if (/\b(varandas?|sacadas?)\b/.test(n)) {
      return { alinea: 'c', divisor: null, fixa: 1, descricao: 'Alínea c (varanda)' };
    }

    // Alínea 'b': em cozinhas, copas, copas-cozinhas, áreas de serviço, cozinha-área de serviço, lavanderias
    // e locais análogos: 1 ponto para cada 3,5 m ou fração de perímetro (independente da área)
    const isCozinhaServico =
      /\b(cozinhas?|copas?|lavanderias?|gourmet)\b/.test(n) ||
      /areas?\s*(de\s*)?servico/.test(n);
    if (isCozinhaServico) {
      return { alinea: 'b', divisor: 3.5, fixa: null, descricao: 'Alínea b (cozinha/copa/serviço/lavanderia)' };
    }

    // Alínea 'd': em salas e dormitórios: 1 ponto para cada 5 m ou fração de perímetro (independente da área)
    if (/\b(salas?|dormitorios?|quartos?)\b/.test(n)) {
      return { alinea: 'd', divisor: 5, fixa: null, descricao: 'Alínea d (sala/dormitório)' };
    }

    // Locais análogos marcados como área molhada (não enquadrados em a/c/d) seguem alínea 'b'
    if (r.mol) {
      return { alinea: 'b', divisor: 3.5, fixa: null, descricao: 'Alínea b (local análogo em área molhada)' };
    }

    // Alínea 'e': demais cômodos e dependências de habitação
    if (a <= 2.25) {
      return { alinea: 'e_225', divisor: null, fixa: 1, descricao: 'Alínea e (área ≤ 2,25 m²)' };
    }
    if (a <= 6) {
      return { alinea: 'e_6', divisor: null, fixa: 1, descricao: 'Alínea e (2,25 m² < área ≤ 6 m²)' };
    }
    return { alinea: 'e_maior_6', divisor: 5, fixa: null, descricao: 'Alínea e (demais cômodos > 6 m²)' };
  },

  // Quantidade de tomadas de uso geral (TUG) do cômodo conforme NBR 5410 item 9.5.2.2.1 (alíneas 'a' a 'e')
  qtdTomadasComodo(r: { nome: string; area: number; perim: number; mol?: boolean }): number {
    if (!r.nome || !r.nome.trim()) return 0;
    const p = Number(r.perim) || 0;
    const regra = this.regraTomadaComodo(r);
    if (regra.fixa !== null) {
      return regra.fixa;
    }
    const divisor = regra.divisor || 5;
    return p > 0 ? Math.ceil(+(p / divisor).toFixed(6)) : 0;
  },

  // Texto explicativo da memória de cálculo TUG para o Memorial Descritivo
  memTugTexto(r: { nome: string; area: number; perim: number; mol: boolean }): string {
    const calc = this.comodoCalc(r);
    const regra = this.regraTomadaComodo(r);
    const p = Number(r.perim) || 0;
    const qtdTxt = calc.tomadas === 1 ? '1 tomada' : `${calc.tomadas} tomadas`;
    const potDetalhe = r.mol
      ? `${Math.min(calc.tomadas, this.limiteTomadas600())}×600 + ${Math.max(0, calc.tomadas - this.limiteTomadas600())}×100 = ${this.n(calc.tugVa)} VA`
      : `${calc.tomadas}×100 = ${this.n(calc.tugVa)} VA`;

    if (regra.fixa !== null) {
      return `${regra.descricao} → ${qtdTxt} (${potDetalhe})`;
    }
    const divTxt = this.n(regra.divisor || 5, regra.divisor === 3.5 ? 1 : 0);
    return `${regra.descricao}: ⌈${this.n(p, 2)} / ${divTxt}⌉ = ${qtdTxt} → Potência: ${potDetalhe}`;
  },

  // Total de tomadas no conjunto das áreas molhadas (NBR 5410 item 9.5.2.2.2 alínea 'a')
  totalTomadasMolhadas(): number {
    return this.cValidos()
      .filter(r => !!r.mol)
      .reduce((acc, r) => acc + this.qtdTomadasComodo(r), 0);
  },

  // Limite de tomadas de 600 VA por ambiente molhado (NBR 5410 item 9.5.2.2.2 alínea 'a'):
  // Se houver mais de 6 tomadas em áreas molhadas (> 6): no mínimo 600 VA até dois pontos (2), e 100 VA para os excedentes.
  // Se houver 6 tomadas ou menos (<= 6): no mínimo 600 VA até três pontos (3), e 100 VA para os excedentes.
  limiteTomadas600(): number {
    return this.totalTomadasMolhadas() > 6 ? 2 : 3;
  },

  comodoCalc(r: { nome: string; area: number; perim: number; mol: boolean }) {
    const a = Number(r.area) || 0;
    const isMolhada = !!r.mol;
    const regra = this.regraTomadaComodo(r);
    const umaTUG = regra.fixa === 1;

    let tomadas = 0;
    if (r.nome && r.nome.trim() !== '') {
      tomadas = this.qtdTomadasComodo(r);
    }

    // Carga de TUG (NBR 5410 item 9.5.2.2.2 alínea 'a'):
    // Áreas molhadas (banheiros, cozinhas, copas, áreas de serviço, lavanderias e locais análogos):
    // Se o conjunto de tomadas molhadas for > 6, até 2 tomadas de 600 VA cada (e 100 VA para as excedentes).
    // Se o conjunto de tomadas molhadas for <= 6, até 3 tomadas de 600 VA cada (e 100 VA para as excedentes).
    // Áreas secas: 100 VA por tomada.
    let tugVa = 0;
    if (isMolhada) {
      const limite600 = this.limiteTomadas600();
      const qtd600 = Math.min(tomadas, limite600);
      const qtd100 = Math.max(0, tomadas - limite600);
      tugVa = (qtd600 * 600) + (qtd100 * 100);
    } else {
      tugVa = tomadas * 100;
    }

    // Iluminação NBR 5410 (item 9.5.1):
    // Área <= 6 m²: 100 VA
    // Área > 6 m²: 100 VA + 60 VA a cada 4 m² inteiros excedentes
    let luzVa = 100;
    if (a > 6) {
      const inteiros = Math.floor(+((a - 6) / 4).toFixed(6));
      luzVa = 100 + (60 * inteiros);
    }

    return {
      umaTUG,
      tomadas,
      tugVa,
      pontosLuz: 1,
      luzVa
    };
  },

  // Somatórios dos cômodos
  totalArea(): number {
    return this.cValidos().reduce((acc, r) => acc + (Number(r.area) || 0), 0);
  },
  totalPerim(): number {
    return this.cValidos().reduce((acc, r) => acc + (Number(r.perim) || 0), 0);
  },
  totalTomadas(): number {
    return this.cValidos().reduce((acc, r) => acc + this.comodoCalc(r).tomadas, 0);
  },
  totalTugVa(): number {
    return this.cValidos().reduce((acc, r) => acc + this.comodoCalc(r).tugVa, 0);
  },
  totalPontosLuz(): number {
    return this.cValidos().length;
  },
  totalLuzVa(): number {
    return this.cValidos().reduce((acc, r) => acc + this.comodoCalc(r).luzVa, 0);
  },

  // Catálogo DIS-NOR-030
  catalogar(app: { nome: string; tab?: string }) {
    const nomeLimpo = app.nome.trim().toLowerCase();
    const item = CATALOGO_DIS_NOR_030.find(c => c.nome.toLowerCase() === nomeLimpo);
    if (item) {
      return { n: item.tab, it: item.item, sugestao: item.potSugerida };
    }
    const tabNum = Number(app.tab);
    if (tabNum) {
      return { n: tabNum, it: 'esp', sugestao: 1500 };
    }
    return null;
  },

  tabNumero(app: { nome: string; tab?: string }): number {
    const c = this.catalogar(app);
    return c ? c.n : (Number(app.tab) || 0);
  },

  // Adicionar Cômodo
  addComodo() {
    this.rooms.push({ nome: '', area: 0, perim: 0, mol: false });
    this.notificar('Novo cômodo adicionado! (Alt+C)');
  },

  // Atalho TAB no campo Perímetro (Observação 1)
  onPerimTab(e: KeyboardEvent) {
    if (e.shiftKey) return;
    e.preventDefault();
    this.addComodo();
    this.$nextTick(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.room-nome-input');
      if (inputs.length) {
        inputs[inputs.length - 1].focus();
      }
    });
  },

  removeComodo(idx: number) {
    this.rooms.splice(idx, 1);
  },

  // Adicionar Aparelho
  addApp() {
    this.apps.push({ nome: '', pot: 1500, qtd: 1, tab: '' });
    this.notificar('Novo aparelho adicionado! (Alt+A)');
  },

  // Atalho TAB no campo Quantidade do Aparelho (Observação 2)
  onQtdTab(e: KeyboardEvent) {
    if (e.shiftKey) return;
    e.preventDefault();
    this.addApp();
    this.$nextTick(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.app-nome-input');
      if (inputs.length) {
        inputs[inputs.length - 1].focus();
      }
    });
  },

  removeApp(idx: number) {
    this.apps.splice(idx, 1);
  },

  selecionarCatalogo(app: any, catalogoNome: string) {
    const c = CATALOGO_DIS_NOR_030.find(item => item.nome === catalogoNome);
    if (c) {
      app.nome = c.nome;
      if (!app.pot || app.pot === 0) {
        app.pot = c.potSugerida;
      }
    }
  },

  // Limpar / Pré-carregar Exemplos
  carregarExemplo() {
    this.rooms = [
      { nome: 'Sala de Estar', area: 30.20, perim: 12.80, mol: false },
      { nome: 'Sala de Jantar', area: 13.50, perim: 15.00, mol: false },
      { nome: 'Dormitório I', area: 11.55, perim: 13.60, mol: false },
      { nome: 'Dormitório II', area: 13.60, perim: 14.80, mol: false },
      { nome: 'Corredor', area: 1.00, perim: 4.00, mol: false },
      { nome: 'Varanda', area: 6.30, perim: 10.20, mol: false },
      { nome: 'Suíte', area: 3.64, perim: 8.20, mol: true },
      { nome: 'Banheiro', area: 3.64, perim: 8.20, mol: true },
      { nome: 'Cozinha', area: 7.84, perim: 11.20, mol: true }
    ];
    this.apps = [
      { nome: 'Ar-Condicionado', pot: 1550, qtd: 2, tab: '' },
      { nome: 'Chuveiro', pot: 4000, qtd: 1, tab: '' },
      { nome: 'Chuveiro', pot: 5000, qtd: 1, tab: '' },
      { nome: 'Micro-ondas', pot: 1500, qtd: 1, tab: '' },
      { nome: 'Forno Elétrico', pot: 1500, qtd: 1, tab: '' },
      { nome: 'Secadora de Roupa', pot: 1500, qtd: 1, tab: '' },
      { nome: 'Ferro Elétrico', pot: 1000, qtd: 2, tab: '' }
    ];
    this.notificar('Exemplo completo carregado com sucesso!');
  },

  limparDados() {
    if (confirm('Deseja realmente limpar todos os cômodos e aparelhos?')) {
      this.rooms = [{ nome: '', area: 0, perim: 0, mol: false }];
      this.apps = [{ nome: '', pot: 1500, qtd: 1, tab: '' }];
      this.notificar('Dados limpos.');
    }
  },

  // 3. Demanda DIS-NOR-030
  demandaCalculada() {
    // Grupo Tabela 6: Iluminação + TUG
    const potComodos = this.totalLuzVa() + this.totalTugVa();
    const grupos: Record<number, { n: number; nomes: string[]; p: number; q: number; desc: string }> = {
      6: {
        n: 6,
        nomes: ['Iluminação', 'TUG'],
        p: potComodos,
        q: 1,
        desc: 'Tomadas e Iluminação Residencial (conforme potência total instalada)'
      }
    };

    // Aparelhos agrupados por tabela
    this.apps
      .filter(a => a.nome.trim() !== '')
      .forEach(a => {
        const tab = this.tabNumero(a);
        if (!grupos[tab]) {
          grupos[tab] = {
            n: tab,
            nomes: [],
            p: 0,
            q: 0,
            desc: this.descricaoTabela(tab)
          };
        }
        grupos[tab].nomes.push(a.nome.trim());
        const potUnit = Number(a.pot) || 0;
        const qtd = Number(a.qtd) || 0;
        grupos[tab].p += potUnit * qtd;
        grupos[tab].q += qtd;
      });

    return Object.values(grupos)
      .sort((a, b) => a.n - b.n)
      .map(g => {
        const fn = FATOR_DEMANDA[g.n];
        const fator = fn ? fn(g.p, g.q) : 1.0;
        const corrigida = g.p * fator;
        return {
          ...g,
          nomesFormatados: g.nomes.join(' + '),
          fator,
          corrigida
        };
      });
  },

  descricaoTabela(t: number): string {
    switch (t) {
      case 6: return 'Iluminação e TUG Residencial';
      case 7: return 'Chuveiros, torneiras elétricas, aquecedores e ferros';
      case 8: return 'Aquecedor central ou boiler';
      case 9: return 'Secadora, lavadora, lava-louças, micro-ondas, forno elétrico';
      case 10: return 'Fogões elétricos e cooktops';
      case 12: return 'Condicionadores de ar';
      case 13: return 'Estações de recarga veicular (VE)';
      default: return `Equipamentos especiais (Tabela ${t})`;
    }
  },

  demandaTotal(): number {
    return this.demandaCalculada().reduce((acc, d) => acc + d.corrigida, 0);
  },

  potenciaInstaladaTotal(): number {
    return this.demandaCalculada().reduce((acc, d) => acc + d.p, 0);
  },

  // Categoria de Atendimento estimada da Neoenergia Coelba
  categoriaAtendimento(): { tipo: string; limite: string; status: string; cor: string } {
    const demKva = this.demandaTotal() / 1000;
    if (demKva <= 15) {
      return {
        tipo: 'Monofásico / Bifásico (Cat. Monofásica/Bifásica)',
        limite: 'Até 15 kVA',
        status: 'Instalação dentro da faixa residencial convencional. Padrão Monofásico ou Bifásico recomendado.',
        cor: 'text-emerald-700 bg-emerald-50 border-emerald-300'
      };
    } else if (demKva <= 25) {
      return {
        tipo: 'Bifásico / Trifásico',
        limite: '15 kVA a 25 kVA',
        status: 'Necessário ramal Bifásico ou Trifásico com disjuntor de entrada dimensionado conforme DIS-NOR-030.',
        cor: 'text-blue-700 bg-blue-50 border-blue-300'
      };
    } else if (demKva <= 75) {
      return {
        tipo: 'Trifásico (Cat. C1 a C4)',
        limite: '25 kVA a 75 kVA',
        status: 'Fornecimento obrigatoriamente Trifásico em baixa tensão. Necessário projeto de entrada aprovado.',
        cor: 'text-amber-700 bg-amber-50 border-amber-300'
      };
    } else {
      return {
        tipo: 'Média Tensão / Posto de Transformação Próprio',
        limite: 'Acima de 75 kVA',
        status: 'Demanda superior ao limite de fornecimento em baixa tensão individual. Necessária subestação própria.',
        cor: 'text-rose-700 bg-rose-50 border-rose-300'
      };
    }
  },

  // 4. Circuitos
  tabelaCondutores() {
    const isTri = this.inst === 'Trifásico';
    return CABOS_PVC_B1.map(([secao, monoBi, tri]) => ({
      secao,
      cap: isTri ? tri : monoBi
    }));
  },

  montarLinhaCircuito(tipo: string, desc: string, p: number, secaoMinima: number) {
    const ip =
      this.V === 380
        ? +(p / (Math.sqrt(3) * 380)).toFixed(2)
        : +(p / this.V).toFixed(2);
    const divisor = (Number(this.fca) || 0.57) * (Number(this.fct) || 1.00);
    const ic = +(ip / (divisor > 0 ? divisor : 1)).toFixed(2);

    const cabos = this.tabelaCondutores();
    const condutorEncontrado = cabos.find(c => c.secao >= secaoMinima && c.cap > ic);
    
    const secao = condutorEncontrado ? condutorEncontrado.secao : 2.5;
    const iz = condutorEncontrado ? condutorEncontrado.cap : 21;
    const izCorrigido = +(iz * divisor).toFixed(2);
    const disjuntor = sugerirDisjuntor(ip, izCorrigido);

    return {
      tipo,
      desc,
      p,
      ip,
      ic,
      secao,
      iz,
      izCorrigido,
      disjuntor,
      fase: 'R',
      fases: ['R'] as string[]
    };
  },

  // Balanceamento automático de fases (Monofásico: R | Bifásico: R, S | Trifásico: R, S, T)
  // Regra: um único aparelho eletrônico não pode ser dividido entre duas ou mais fases,
  // exceto quando a instalação for Bifásica (duas fases).
  aplicarBalanceamentoFases(circuitos: any[]) {
    if (!circuitos.length) return circuitos;

    if (!this.balanceamentoAtivo) {
      return circuitos.map(c => ({
        ...c,
        fase: '—',
        fases: [] as string[]
      }));
    }

    if (this.inst === 'Monofásico') {
      return circuitos.map(c => ({
        ...c,
        fase: 'R',
        fases: ['R']
      }));
    }

    const ordenados = circuitos
      .map((c, idx) => ({ c, idx }))
      .sort((a, b) => b.c.p - a.c.p || a.idx - b.idx);

    const resultado = circuitos.map(c => ({ ...c }));

    if (this.inst === 'Bifásico') {
      const cargas: Record<'R' | 'S', number> = { R: 0, S: 0 };
      const totalP = circuitos.reduce((acc, c) => acc + c.p, 0);

      ordenados.forEach(({ c, idx }) => {
        const isTUE = c.tipo === 'Tomada Específica (TUE)';
        const menorFase: 'R' | 'S' = cargas.R <= cargas.S ? 'R' : 'S';
        const diffSeUnica = Math.abs(
          (cargas[menorFase] + c.p) - cargas[menorFase === 'R' ? 'S' : 'R']
        );

        // Em instalação bifásica, aparelhos específicos (TUE) de maior potência,
        // em 220V (Fase-Fase) ou que desequilibrariam uma fase única podem usar R+S.
        const deveUsarDuasFases =
          isTUE &&
          (this.V === 220 ||
            c.p >= 2500 ||
            (totalP > 0 && diffSeUnica > totalP * 0.15));

        if (deveUsarDuasFases) {
          cargas.R += c.p / 2;
          cargas.S += c.p / 2;
          resultado[idx].fase = 'R+S';
          resultado[idx].fases = ['R', 'S'];
        } else {
          cargas[menorFase] += c.p;
          resultado[idx].fase = menorFase;
          resultado[idx].fases = [menorFase];
        }
      });

      return resultado;
    }

    // Trifásico (127 V, 220 V ou 380 V): cada circuito/aparelho vai integralmente para 1 única fase (R, S ou T)
    const cargasTri: Record<'R' | 'S' | 'T', number> = { R: 0, S: 0, T: 0 };
    const chaves: Array<'R' | 'S' | 'T'> = ['R', 'S', 'T'];

    ordenados.forEach(({ c, idx }) => {
      let menorFase: 'R' | 'S' | 'T' = 'R';
      for (const f of chaves) {
        if (cargasTri[f] < cargasTri[menorFase]) {
          menorFase = f;
        }
      }
      cargasTri[menorFase] += c.p;
      resultado[idx].fase = menorFase;
      resultado[idx].fases = [menorFase];
    });

    return resultado;
  },

  resumoBalanceamentoFases() {
    const circuitos = this.circuitosCalculados();
    const fasesAtivas: Array<'R' | 'S' | 'T'> =
      this.inst === 'Monofásico'
        ? ['R']
        : this.inst === 'Bifásico'
          ? ['R', 'S']
          : ['R', 'S', 'T'];

    const itens = fasesAtivas.map(f => {
      let potencia = 0;
      let corrente = 0;
      let qtdCircuitos = 0;

      circuitos.forEach(c => {
        if (c.fases && c.fases.includes(f)) {
          const fatorDiv = c.fases.length || 1;
          potencia += c.p / fatorDiv;
          qtdCircuitos += 1;
          if (fatorDiv === 1) {
            corrente += c.ip;
          } else if (this.V === 220) {
            // Bifásico 220V (Fase-Fase): corrente nominal passa pelos dois condutores fase
            corrente += c.ip;
          } else {
            corrente += c.ip / fatorDiv;
          }
        }
      });

      return {
        nome: f,
        potencia: Math.round(potencia),
        corrente: +corrente.toFixed(2),
        qtdCircuitos,
        percentual: 0
      };
    });

    const totalPot = itens.reduce((acc, it) => acc + it.potencia, 0);
    itens.forEach(it => {
      it.percentual = totalPot > 0 ? +((it.potencia / totalPot) * 100).toFixed(1) : 0;
    });

    let desequilibrio = 0;
    if (fasesAtivas.length > 1 && totalPot > 0) {
      const pots = itens.map(it => it.potencia);
      const media = totalPot / fasesAtivas.length;
      const max = Math.max(...pots);
      const min = Math.min(...pots);
      desequilibrio = +(((max - min) / media) * 100).toFixed(1);
    }

    let status = 'Equilibrado';
    let cor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (fasesAtivas.length === 1) {
      status = 'Fase Única';
      cor = 'bg-slate-100 text-slate-700 border-slate-300';
    } else if (desequilibrio > 15) {
      status = 'Desequilibrado (> 15%)';
      cor = 'bg-rose-100 text-rose-800 border-rose-300';
    } else if (desequilibrio > 10) {
      status = 'Atenção (10–15%)';
      cor = 'bg-amber-100 text-amber-800 border-amber-300';
    }

    return {
      fases: itens,
      totalPot,
      desequilibrio,
      status,
      cor
    };
  },

  circuitosCalculados() {
    const maxP = this.potenciaMaxCircuito();
    const comodos = this.cValidos().map((r, i) => ({
      c: r.nome.trim(),
      m: !!r.mol,
      i,
      ...this.comodoCalc(r)
    }));

    // 1. Iluminação (seção mín 1.5mm²)
    // Circuitos de iluminação limitados à corrente de projeto máxima de 10 A (maxP = V * 10),
    // agrupando cômodos inteiros para que nenhum cômodo tenha sua iluminação dividida em mais de um circuito.
    const listaLuz: ItemCircuito[] = comodos
      .map(x => ({ c: x.c, p: x.luzVa, i: x.i }))
      .sort((a, b) => b.p - a.p || (a.i ?? 0) - (b.i ?? 0));

    const totalLuz = soma(listaLuz);
    const blocosLuz = dividirEquilibrado(listaLuz, totalLuz, maxP);
    const circuitosLuz = blocosLuz.map(bloco => {
      const nomes = bloco.map(x => x.c).join(', ');
      const potBloco = soma(bloco);
      return this.montarLinhaCircuito('Iluminação', nomes, potBloco, 1.5);
    });

    // 2. Tomadas TUG (seção mín 2.5mm²)
    const listaTug = comodos
      .map(x => ({ c: x.c, m: x.m, t: x.tomadas, p: x.tugVa, i: x.i }))
      .sort((a, b) => b.p - a.p || (a.i ?? 0) - (b.i ?? 0));

    // Tomadas molhadas - NBR 5410 itens 9.5.2.2.2 (alínea 'a') e 9.5.3.2:
    // "Os pontos de tomada de cozinhas, copas, copas-cozinhas, áreas de serviço, lavanderias e locais
    // análogos devem ser atendidos por circuitos exclusivamente destinados à alimentação de tomadas desses locais."
    // Cada área molhada DEVE ter seu(s) circuito(s) individual(is), nunca mesclados entre si ou com áreas secas.
    // As potências de 600 VA seguem o limite (2 se total molhadas > 6, ou 3 se total molhadas <= 6).
    const limite600 = this.limiteTomadas600();
    const molhados = listaTug
      .filter(x => x.m)
      .sort((a, b) => b.p - a.p || (a.i ?? 0) - (b.i ?? 0));

    const circuitosMolhados: any[] = [];
    molhados.forEach(x => {
      const cargas = [
        ...Array(Math.min(x.t, limite600)).fill(600),
        ...Array(Math.max(x.t - limite600, 0)).fill(100)
      ];

      let blocoComodo: number[] = [];
      cargas.forEach(cPot => {
        const somaAtual = blocoComodo.reduce((acc, v) => acc + v, 0);
        if (blocoComodo.length > 0 && somaAtual + cPot > maxP) {
          circuitosMolhados.push(
            this.montarLinhaCircuito('Tomadas (TUG)', x.c, somaAtual, 2.5)
          );
          blocoComodo = [];
        }
        blocoComodo.push(cPot);
      });

      if (blocoComodo.length > 0) {
        const somaAtual = blocoComodo.reduce((acc, v) => acc + v, 0);
        circuitosMolhados.push(
          this.montarLinhaCircuito('Tomadas (TUG)', x.c, somaAtual, 2.5)
        );
      }
    });

    // Tomadas secas (salas, dormitórios, corredores, varandas):
    // Agrupamento equilibrado com limite máximo de 10 A x V (maxP)
    const listaSecas: ItemCircuito[] = listaTug
      .filter(x => !x.m)
      .map(x => ({ c: x.c, p: x.p }))
      .sort((a, b) => b.p - a.p);

    const blocosSecos = dividirEquilibrado(listaSecas, soma(listaSecas), maxP);
    const circuitosSecos = blocosSecos.map(bloco => {
      const comodosAgrupados = Array.from(new Set(bloco.map(x => x.c))).join(', ');
      const potBloco = soma(bloco);
      return this.montarLinhaCircuito('Tomadas (TUG)', comodosAgrupados, potBloco, 2.5);
    });

    const circuitosTug = [...circuitosMolhados, ...circuitosSecos];

    // 3. Tomadas TUE (seção mín 2.5mm² - circuito individual para cada unidade)
    const circuitosTue: any[] = [];
    this.apps
      .filter(a => a.nome.trim() !== '')
      .forEach(a => {
        const qtd = Math.max(1, Math.floor(Number(a.qtd) || 1));
        const pot = Number(a.pot) || 0;
        for (let j = 0; j < qtd; j++) {
          const sufixo = qtd > 1 ? ` (${j + 1}/${qtd})` : '';
          circuitosTue.push(
            this.montarLinhaCircuito('Tomada Específica (TUE)', `${a.nome.trim()}${sufixo}`, pot, 2.5)
          );
        }
      });

    // Aplicar balanceamento automático de fases e enumerar os circuitos consecutivamente
    const balanceados = this.aplicarBalanceamentoFases([
      ...circuitosLuz,
      ...circuitosTug,
      ...circuitosTue
    ]);

    return balanceados.map((circ, idx) => ({
      ...circ,
      n: idx + 1
    }));
  },

  // Exportação e Impressão
  imprimir(modo: 'rel' | 'mem') {
    document.body.dataset.print = modo;
    // Pequeno timeout para os elementos renderizarem antes do print
    setTimeout(() => {
      window.print();
    }, 150);
  },

  // Exportar texto do memorial para a área de transferência
  copiarMemorial() {
    const el = document.getElementById('print-memorial');
    if (el) {
      const texto = el.innerText;
      navigator.clipboard.writeText(texto).then(() => {
        this.notificar('Memorial copiado para a área de transferência!');
      }).catch(() => {
        this.notificar('Selecione e copie o texto manualmente.');
      });
    }
  },

  // Exportar dados preenchidos da planilha em formato JSONC (JSON com comentários)
  exportarJSONC() {
    const agora = new Date();
    const dataPt = agora.toLocaleString('pt-BR');
    const slug = (this.projeto.nome || 'dimensionamento')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'dimensionamento';

    const conteudoJsonc = [
      '// ============================================================================',
      '// DimensionaElétrico - Planilha de Dimensionamento Elétrico',
      '// Normas: ABNT NBR 5410:2004 & DIS-NOR-030 (Neoenergia Coelba)',
      `// Exportado em: ${dataPt}`,
      '// Formato: JSONC (JSON com comentários) - compatível com Importar > JSON',
      '// ============================================================================',
      '{',
      '  "versao": "1.0",',
      `  "exportadoEm": ${JSON.stringify(agora.toISOString())},`,
      '',
      '  // Identificação do Projeto e ART/RRT',
      `  "projeto": ${JSON.stringify(this.projeto, null, 2).replace(/\n/g, '\n  ')},`,
      '',
      '  // Parâmetros elétricos gerais (Passo 4 - Divisão de Circuitos)',
      '  "parametros": {',
      `    "V": ${Number(this.V) || 127}, // 127 | 220 | 380 (Fase-Fase-Fase)`,
      `    "inst": ${JSON.stringify(this.inst)}, // "Monofásico" | "Bifásico" | "Trifásico"`,
      `    "fca": ${Number(this.fca) || 0.57}, // Fator de Correção por Agrupamento`,
      `    "fct": ${Number(this.fct) || 1.0}, // Fator de Correção por Temperatura`,
      `    "balanceamentoAtivo": ${Boolean(this.balanceamentoAtivo)} // true | false`,
      '  },',
      '',
      '  // Passo 1: Cômodos (nome, area em m², perim em metros, mol = área molhada)',
      `  "rooms": ${JSON.stringify(this.rooms, null, 2).replace(/\n/g, '\n  ')},`,
      '',
      '  // Passo 2: Aparelhos de Uso Específico TUE (nome, pot em VA, qtd, tab DIS-NOR-030)',
      `  "apps": ${JSON.stringify(this.apps, null, 2).replace(/\n/g, '\n  ')}`,
      '}',
      ''
    ].join('\n');

    const blob = new Blob([conteudoJsonc], { type: 'application/jsonc;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.jsonc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.notificar(`Planilha exportada em JSONC (${slug}.jsonc)!`);
  },

  // Importar dados preenchidos a partir de arquivo JSON ou JSONC
  async importarJSON(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const cleaned = stripJsonComments(rawText).trim();
      const data = JSON.parse(cleaned);

      if (!data || typeof data !== 'object') {
        throw new Error('Estrutura JSON inválida.');
      }

      // 1. Dados do projeto
      if (data.projeto && typeof data.projeto === 'object') {
        this.projeto = {
          nome: typeof data.projeto.nome === 'string' ? data.projeto.nome : this.projeto.nome,
          cliente: typeof data.projeto.cliente === 'string' ? data.projeto.cliente : this.projeto.cliente,
          responsavel: typeof data.projeto.responsavel === 'string' ? data.projeto.responsavel : this.projeto.responsavel,
          art: typeof data.projeto.art === 'string' ? data.projeto.art : this.projeto.art,
          local: typeof data.projeto.local === 'string' ? data.projeto.local : this.projeto.local
        };
      }

      // 2. Parâmetros elétricos (aceita objeto "parametros" ou propriedades na raiz)
      const params = data.parametros && typeof data.parametros === 'object' ? data.parametros : data;
      if ([127, 220, 380].includes(Number(params.V))) {
        this.V = Number(params.V);
      }
      if (['Monofásico', 'Bifásico', 'Trifásico'].includes(params.inst)) {
        this.inst = params.inst;
      }
      if (this.V === 380 && this.inst !== 'Trifásico') {
        this.inst = 'Trifásico';
      }
      if (typeof params.fca === 'number' && params.fca > 0 && params.fca <= 2) {
        this.fca = params.fca;
      }
      if (typeof params.fct === 'number' && params.fct > 0 && params.fct <= 2) {
        this.fct = params.fct;
      }
      if (typeof params.balanceamentoAtivo === 'boolean') {
        this.balanceamentoAtivo = params.balanceamentoAtivo;
      }

      // 3. Cômodos (aceita "rooms" ou "comodos")
      const rawRooms = Array.isArray(data.rooms)
        ? data.rooms
        : Array.isArray(data.comodos)
          ? data.comodos
          : null;
      if (rawRooms) {
        const sanitizedRooms = rawRooms
          .filter((r: any) => r && typeof r === 'object')
          .map((r: any) => ({
            nome: String(r.nome ?? ''),
            area: Number(r.area) || 0,
            perim: Number(r.perim) || 0,
            mol: Boolean(r.mol)
          }));
        this.rooms = sanitizedRooms.length > 0
          ? sanitizedRooms
          : [{ nome: '', area: 0, perim: 0, mol: false }];
      }

      // 4. Aparelhos (aceita "apps" ou "aparelhos")
      const rawApps = Array.isArray(data.apps)
        ? data.apps
        : Array.isArray(data.aparelhos)
          ? data.aparelhos
          : null;
      if (rawApps) {
        const sanitizedApps = rawApps
          .filter((a: any) => a && typeof a === 'object')
          .map((a: any) => ({
            nome: String(a.nome ?? ''),
            pot: Number(a.pot) || 0,
            qtd: Math.max(0, Number(a.qtd) || 0),
            tab: String(a.tab ?? '')
          }));
        this.apps = sanitizedApps.length > 0
          ? sanitizedApps
          : [{ nome: '', pot: 1500, qtd: 1, tab: '' }];
      }

      this.notificar(
        `Dados importados com sucesso! (${this.cValidos().length} cômodos e ${this.apps.filter(a => a.nome.trim()).length} aparelhos)`
      );
    } catch {
      this.notificar('Erro ao importar arquivo: verifique se é um JSON/JSONC válido.');
    } finally {
      input.value = '';
      this.openImportMenu = false;
    }
  }
}));

Alpine.start();
