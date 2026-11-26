/**
 * Constantes
 */

// Abas
const ABA_COMODOS = 'Cômodos';
const ABA_APARELHOS = 'Aparelhos';
const ABA_DEMANDA = 'Demanda';
const ABA_CIRCUITOS = 'Circuitos';

// Tabelas
const TABELA_COMODOS = 'Tabela 6';
const TABELA_DADOS = 'Dados';

// Ranges
const RANGE_TABELA_DADOS = 'K2:L8';

// Linhas
const LINHA_INICIAL_COMODOS = 2;
const LINHA_FINAL_COMODOS = 100;

// Cargas
const CARGAS_COMODOS = [
  { aparelho: 'Iluminação', coluna: 8 },
  { aparelho: 'TUG', coluna: 6 }
];

// Instações
const INSTALACAO_TRIFASICA = 'Trifásico';

/**
 * Configurações
 */

const COLUNAS_DEMANDA = [
  'Tabela',
  'Aparelhos',
  'Soma de Potência (VA)',
  'Quantidade de Aparelhos',
  'Fator de Demanda',
  'Pot. Corrigida (VA)'
];

/**
 * Fatores de demanda (Tabelas)
 */

// Tabela 6 – Tomadas e iluminação residencial
const FAIXAS_TABELA_6 = [
  [1000, 0.86],
  [2000, 0.75],
  [3000, 0.66],
  [4000, 0.59],
  [5000, 0.52],
  [6000, 0.45],
  [7000, 0.40],
  [8000, 0.35],
  [9000, 0.31],
  [10000, 0.27]
];

// Tabela 7 – Chuveiros, torneiras, aquecedores de passagem e ferros elétricos
const FATORES_TABELA_7 = [
  1, 1, 0.84, 0.76, 0, 70, 0.65, 0.60, 0.57, 0.54, 0.52, 0.49,
  0.48, 0.46, 0.45, 0.44, 0.43, 0.42, 0.41, 0.40, 0.40, 0.39, 0.39, 0.39
];

// Tabela 8 – Aquecedor central ou boiler
const FATORES_TABELA_8 = [1, 0.72];

// Tabela 9 – Secadora, forno elétrico, lavadora, lava-louça e micro-ondas
const FAIXAS_TABELA_9 = [
  [1, 1],
  [4, 0.70],
  [6, 0.60]
];

// Tabela 10 – Fogões elétricos
const FATORES_TABELA_10 = [
  1, 0.60, 0.48, 0.40, 0.37, 0.35, 0.33, 0.32,
  0.31, 0.30, 0.30, 0.28, 0.28, 0.28, 0.28
];

// Tabela 12 – Condicionadores de ar
// Tabela 13 – Estações de recarga
const FAIXAS_TABELA_12 = [
  [10, 1],
  [20, 0.90],
  [30, 0.82],
  [40, 0.80],
  [50, 0.77]
];

// Cada tabela sabe calcular o próprio fator. Para incluir uma nova tabela, basta adicionar uma entrada aqui.
const CALCULO_FATOR_POR_TABELA = {
  'Tabela 6': carga => buscaPorFaixa(FAIXAS_TABELA_6, carga.potencia, 0.24),
  'Tabela 7': carga => buscaPorIndice(FATORES_TABELA_7, carga.quantidade, 0.38),
  'Tabela 8': carga => buscaPorIndice(FATORES_TABELA_8, carga.quantidade, 0.38),
  'Tabela 9': carga => buscaPorFaixa(FAIXAS_TABELA_9, carga.quantidade, 0.50),
  'Tabela 10': carga => buscaPorIndice(FATORES_TABELA_10, carga.quantidade, 0.26),
  'Tabela 12': carga => buscaPorFaixa(FAIXAS_TABELA_12, carga.quantidade, 0.75),
  'Tabela 13': carga => buscaPorFaixa(FAIXAS_TABELA_12, carga.quantidade, 0.75)
};

/**
 * Funções de Fator de Demanda por tabela
 */

// Retorna o fator da primeira faixa cujo limite superior é maior que o valor.
function buscaPorFaixa(faixas, valor, padrao) {
  const faixa = faixas.find(([limite]) => valor < limite);
  Logger.log(faixas, valor, faixa)
  return faixa ? faixa[1] : padrao;
}

// Retorna o fator correspondente à quantidade
function buscaPorIndice(fatores, quantidade, padrao) {
  return fatores[quantidade - 1] ?? padrao;
}

function numeroDaTabela(nomeTabela) {
  return Number(nomeTabela.split(' ')[1]);
}

/**
 * Leitura das planilhas
 */
function somaColuna(aba, coluna) {
  const numeroDeLinhas = LINHA_FINAL_COMODOS - LINHA_INICIAL_COMODOS + 1;

  return aba
    .getRange(LINHA_INICIAL_COMODOS, coluna, numeroDeLinhas, 1)
    .getValues()
    .reduce((soma, [valor]) => soma + Number(valor), 0);
}

function lerCargasComodos(planilha) {
  const aba = planilha.getSheetByName(ABA_COMODOS);

  return CARGAS_COMODOS.map(({ aparelho, coluna }) => ({
    aparelho,
    tabela: TABELA_COMODOS,
    potencia: somaColuna(aba, coluna),
    quantidade: 1
  }));
}

function lerCargasAparelhos(planilha) {
  const aba = planilha.getSheetByName(ABA_APARELHOS);

  return aba
    .getRange('A2:E')
    .getValues()
    .filter(([aparelho]) => !!aparelho)
    .map(([aparelho, tabela, , potencia, quantidade]) => ({
      aparelho,
      tabela,
      potencia,
      quantidade
    }));
}

/**
 * Regras de cálculo
 */

// Agrupa as cargas por tabela, somando potência e quantidade.
function agruparPorTabela(cargas) {
  const grupos = new Map();

  for (const carga of cargas) {
    if (!grupos.has(carga.tabela)) {
      grupos.set(carga.tabela, {
        tabela: carga.tabela,
        aparelhos: [],
        potencia: 0,
        quantidade: 0
      });
    }

    const grupo = grupos.get(carga.tabela);
    grupo.aparelhos.push(carga.aparelho);
    grupo.potencia += carga.potencia * carga.quantidade;
    grupo.quantidade += carga.quantidade;

    if (carga.tabela == TABELA_COMODOS) {
      grupo.quantidade = 1;
    }
  }

  return [...grupos.values()].map(grupo => ({
    ...grupo,
    aparelhos: grupo.aparelhos.join(' + ')
  }));
}

// Aplica o fator de demanda e calcula a potência corrigida.
function calculaDemanda(cargas) {
  return cargas.map(carga => {
    const calcularFator = CALCULO_FATOR_POR_TABELA[carga.tabela];
    const fatorDeDemanda = calcularFator ? calcularFator(carga) : 1;

    return {
      ...carga,
      fatorDeDemanda,
      potenciaCorrigida: carga.potencia * fatorDeDemanda
    };
  });
}

function compararPorTabela(a, b) {
  return numeroDaTabela(a.tabela) - numeroDaTabela(b.tabela);
}

/**
 * Formata e insere os dados na planilha
 */
function limpaAba(aba) {
  aba.clear();
  aba.getBandings().forEach(banding => banding.remove());
}

function escreveDados(aba, cargas) {
  const linhas = cargas.map(carga => [
    carga.tabela,
    carga.aparelhos,
    carga.potencia,
    carga.quantidade,
    carga.fatorDeDemanda,
    carga.potenciaCorrigida
  ]);

  aba
    .getRange(1, 1, linhas.length + 1, COLUNAS_DEMANDA.length)
    .setValues([COLUNAS_DEMANDA, ...linhas]);
}

function formataTabela(aba) {
  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();

  aba
    .getRange(1, 1, ultimaLinha, ultimaColuna)
    .setWrap(true)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center');

  aba.setFrozenRows(1);
  aba.autoResizeRows(1, ultimaLinha);

  aba
    .getRange(1, 1, 1, ultimaColuna)
    .setBackground('#356854')
    .setFontColor('#FFF')
    .setFontWeight('bold');

  aba.getRange(2, 5, ultimaLinha, 2).setNumberFormat('0.00');
}

// Gera tabela na página Demanda
function gerarTabelaDemanda() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const abaDemanda = planilha.getSheetByName(ABA_DEMANDA);

  limpaAba(abaDemanda);

  const cargas = [
    ...lerCargasComodos(planilha),
    ...lerCargasAparelhos(planilha)
  ];

  const demanda = calculaDemanda(agruparPorTabela(cargas)).sort(compararPorTabela);

  escreveDados(abaDemanda, demanda);
  formataTabela(abaDemanda);
}

// ===== Configuração =====
// Usa constantes definidas em outro arquivo do projeto:
// ABA_CIRCUITOS, ABA_COMODOS, ABA_APARELHOS e RANGE_TABELA_DADOS.

const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();

const PRIMEIRA_LINHA_CIRCUITOS = 2;
const NUMERO_COLUNAS_CIRCUITO = 9;

const SECAO_MINIMA_ILUMINACAO = 1.5;
const SECAO_MINIMA_TUG = 2.5;
const SECAO_MINIMA_TUE = 2.5;

// Usados quando nenhum condutor atende à corrente do circuito
const SECAO_PADRAO = 2.5;
const CORRENTE_PADRAO = 17.5;

// Índices das colunas da aba Cômodos (A = 0)
const COL_COMODOS = {
  nome: 0,               // A
  areaMolhada: 1,        // B
  tomadas: 4,            // E
  potenciaTug: 5,        // F
  potenciaIluminacao: 7, // H
};

const SECAO_CONDUTOR_PVC = {
  b1: [
    { secao: 0.5, mono_bi: 9, tri: 8 },
    { secao: 0.75, mono_bi: 11, tri: 10 },
    { secao: 1, mono_bi: 14, tri: 12 },
    { secao: 1.5, mono_bi: 17.5, tri: 15.5 },
    { secao: 2.5, mono_bi: 24, tri: 21 },
    { secao: 4, mono_bi: 32, tri: 28 },
    { secao: 6, mono_bi: 41, tri: 36 },
    { secao: 10, mono_bi: 57, tri: 50 },
    { secao: 16, mono_bi: 76, tri: 68 },
    { secao: 25, mono_bi: 101, tri: 89 },
  ],
};

// ===== Orquestração =====

function dividirCircuitos() {
  const config = lerConfiguracao();
  const aba = SPREADSHEET.getSheetByName(ABA_CIRCUITOS);

  // Cada bloco é gravado antes do próximo ser calculado.
  // A TUG depende da coluna E já atualizada pela iluminação.
  let linha = PRIMEIRA_LINHA_CIRCUITOS;
  linha = gravaCircuitos(aba, linha, calculaCircuitosIluminacao(config));
  linha = gravaCircuitos(aba, linha, calculaCircuitosTug(config));
  gravaCircuitos(aba, linha, calculaCircuitosTue(config));

  formataTabelaCircuitos(aba);
}

// ===== Leitura =====

function lerConfiguracao() {
  const tabela = SPREADSHEET.getSheetByName(ABA_CIRCUITOS).getRange(RANGE_TABELA_DADOS);
  const valor = linha => tabela.getCell(linha, 2).getValue();

  return {
    tensao: valor(1),
    instalacao: valor(2),
    isolacao: valor(3),
    referencia: valor(4),
    fca: valor(5),
    fct: valor(6),
    potenciaMaxima: valor(7),
  };
}

/** Lê as linhas de dados da aba Cômodos (colunas A a H), sem o cabeçalho. */
function lerLinhasComodos() {
  const aba = SPREADSHEET.getSheetByName(ABA_COMODOS);
  const numeroDeLinhas = aba.getLastRow() - 1;

  if (numeroDeLinhas < 1) return [];
  return aba.getRange(2, 1, numeroDeLinhas, 8).getValues();
}

// ===== Cálculo dos circuitos =====

function calculaCircuitosIluminacao(config) {
  const linhas = lerLinhasComodos();

  const potenciaTotal = linhas.reduce(
    (soma, linha) => soma + Number(linha[COL_COMODOS.potenciaIluminacao]),
    0
  );

  const comodos = linhas
    .filter(linha => !!linha[COL_COMODOS.nome])
    .map(linha => ({
      comodo: linha[COL_COMODOS.nome],
      potencia: Number(linha[COL_COMODOS.potenciaIluminacao]),
    }))
    .sort(ordenaPorPotenciaLuz);

  const circuitos = dividirEmCircuitos(comodos, potenciaTotal, config.potenciaMaxima);
  const condutores = condutoresPorLinha(SECAO_MINIMA_ILUMINACAO, config);

  return circuitos.map(circuito => montaLinha({
    tipo: 'Iluminação',
    descricao: nomesDoCircuito(circuito),
    potencia: somaPotencias(circuito),
    condutores,
    config,
  }));
}

function calculaCircuitosTug(config) {
  const comodos = lerLinhasComodos()
    .filter(linha => !!linha[COL_COMODOS.nome])
    .map(linha => ({
      comodo: linha[COL_COMODOS.nome],
      areaMolhada: linha[COL_COMODOS.areaMolhada],
      tomadas: linha[COL_COMODOS.tomadas],
      potencia: Number(linha[COL_COMODOS.potenciaTug]),
    }))
    .sort(ordenaPorPotenciaLuz);

  const molhados = comodos.filter(ehAreaMolhada);
  const secos = comodos.filter(ehAreaSeca).sort(ordenaPorPotenciaSecas);

  const circuitos = [
    ...agrupaTomadasMolhadas(molhados, config.potenciaMaxima),
    ...dividirEmCircuitos(secos, somaPotencias(secos), config.potenciaMaxima),
  ];

  const condutores = condutoresPorLinha(SECAO_MINIMA_TUG, config);

  return circuitos.map(circuito => montaLinha({
    tipo: 'Tomadas (TUG)',
    descricao: nomesDoCircuito(circuito),
    potencia: somaPotencias(circuito),
    condutores,
    config,
  }));
}

function calculaCircuitosTue(config) {
  const aba = SPREADSHEET.getSheetByName(ABA_APARELHOS);
  const numeroDeLinhas = aba.getLastRow() - 1;

  if (numeroDeLinhas < 1) return [];

  const linhas = aba.getRange(2, 1, numeroDeLinhas, aba.getLastColumn()).getValues();
  const condutores = listaCondutores(SECAO_MINIMA_TUE, config);

  return linhas
    .filter(([nome]) => !!nome)
    .flatMap(([nome, , , potencia, quantidade]) => {
      const linha = montaLinha({
        tipo: 'Tomada (TUE)',
        descricao: nome,
        potencia,
        condutores,
        config,
      });

      return Array.from({ length: quantidadeDeItens(quantidade) }, () => linha);
    });
}

// ===== Divisão em circuitos =====

/**
 * Agrupa itens em pares do maior com o menor, até atingir a média de potência por circuito.
 */
function dividirEmCircuitos(itens, potenciaTotal, potenciaMaxima) {
  const numeroDeCircuitos = Math.ceil(potenciaTotal / potenciaMaxima);
  const potenciaPorCircuito = potenciaTotal / numeroDeCircuitos;

  const fila = [...itens];
  const circuitos = [];
  let parcial = [];

  while (fila.length) {
    if (!parcial.length) parcial.push(fila.shift());

    if (somaPotencias(parcial) < potenciaPorCircuito && fila.length) {
      parcial.push(fila.pop());
    } else {
      circuitos.push(parcial);
      parcial = [];
    }
  }

  if (parcial.length) circuitos.push(parcial);
  return circuitos;
}

/**
 * Preenche circuitos com as cargas de tomadas das áreas molhadas,
 * em sequência, sem ultrapassar a potência máxima.
 */
function agrupaTomadasMolhadas(comodos, potenciaMaxima) {
  const circuitos = [];
  let parcial = [];

  for (const { comodo, tomadas } of comodos) {
    for (const potencia of cargasDeTomadas(tomadas)) {
      if (parcial.length && !cabe(parcial, potencia, potenciaMaxima)) {
        circuitos.push(parcial);
        parcial = [];
      }

      parcial.push({ comodo, potencia });
    }
  }

  if (parcial.length) circuitos.push(parcial);
  return circuitos;
}

/** Cargas de um cômodo molhado: 600 VA por tomada (até 3 ou 2, conforme a quantidade) e 100 VA nas demais. */
function cargasDeTomadas(quantidade) {
  const total = Number(quantidade) || 0;
  const qtd600 = total > 1 ? (total > 6 ? 2 : 3) : total;
  const qtd100 = Math.max(total - qtd600, 0);

  return [...Array(qtd600).fill(600), ...Array(qtd100).fill(100)];
}

function cabe(circuito, potencia, limite) {
  return somaPotencias(circuito) + potencia < limite;
}

// Célula vazia ou em texto conta como 1 aparelho (comportamento original)
function quantidadeDeItens(quantidade) {
  return typeof quantidade === 'number' ? quantidade : 1;
}

// ===== Condutores e montagem das linhas =====

function listaCondutores(secaoMinima, config) {
  const tipoInstalacao = config.instalacao.toLowerCase() === 'trifásico' ? 'tri' : 'mono_bi';
  const tabela = SECAO_CONDUTOR_PVC[config.referencia.toLowerCase()];
  const isolacaoPvc = config.isolacao.toUpperCase() === 'PVC';

  if (!isolacaoPvc || !Array.isArray(tabela)) return [];

  return tabela
    .filter(item => item.secao >= secaoMinima)
    .map(item => ({ secao: item.secao, correnteMax: item[tipoInstalacao] }));
}

/**
 * Para cada linha da coluna E da aba Circuitos, devolve o primeiro condutor cuja capacidade
 * supera a corrente ali escrita. Usa o estado atual da planilha, como no original (ver observações).
 */
function condutoresPorLinha(secaoMinima, config) {
  const aba = SPREADSHEET.getSheetByName(ABA_CIRCUITOS);
  const numeroDeLinhas = Math.max(aba.getLastRow() - 1, 1);
  const candidatos = listaCondutores(secaoMinima, config);

  return aba
    .getRange(2, 5, numeroDeLinhas, 1)
    .getValues()
    .map(([corrente]) => candidatos.find(condutor => condutor.correnteMax > corrente));
}

function calculaCorrentes(potencia, config) {
  const correnteProjeto = (potencia / config.tensao).toFixed(2);
  const correnteCorrigida = (correnteProjeto / (config.fca * config.fct)).toFixed(2);

  return { correnteProjeto, correnteCorrigida };
}

function montaLinha({ tipo, descricao, potencia, condutores, config }) {
  const { correnteProjeto, correnteCorrigida } = calculaCorrentes(Number(potencia), config);
  const condutor = condutores.find(item => item?.correnteMax > correnteCorrigida);

  return [
    tipo,
    '=ROW()-1',
    descricao,
    potencia,
    correnteProjeto,
    correnteCorrigida,
    condutor?.secao ?? SECAO_PADRAO,
    condutor?.correnteMax ?? CORRENTE_PADRAO,
    0,
  ];
}

// ===== Ordenação e utilitários =====

// Os dois comparadores desempatam de forma diferente. Mantidos para a ordem não mudar.
function ordenaPorPotenciaLuz(a, b) {
  return a.potencia < b.potencia ? 1 : -1;
}

function ordenaPorPotenciaSecas(a, b) {
  return a.potencia > b.potencia ? -1 : 1;
}

// Comparação solta, como no original (aceita valores como 1 ou "")
function ehAreaMolhada(comodo) {
  return comodo.areaMolhada == true;
}

function ehAreaSeca(comodo) {
  return comodo.areaMolhada == false;
}

function somaPotencias(itens) {
  return itens.reduce((soma, item) => soma + item.potencia, 0);
}

function nomesDoCircuito(circuito) {
  return circuito.map(item => item.comodo).join(',');
}

// ===== Escrita e formatação =====

function gravaCircuitos(aba, linhaInicial, linhas) {
  if (!linhas.length) return linhaInicial;

  aba
    .getRange(linhaInicial, 1, linhas.length, NUMERO_COLUNAS_CIRCUITO)
    .clear()
    .setValues(linhas);

  return linhaInicial + linhas.length;
}

function formataTabelaCircuitos(aba) {
  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();
  const linhasDeDados = Math.max(ultimaLinha - 1, 1);

  // Coluna "Número do circuito" (B) e colunas de potência, corrente e condutor (D a I)
  [aba.getRange(1, 2, ultimaLinha), aba.getRange(1, 4, ultimaLinha, 6)].forEach(intervalo =>
    intervalo
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center')
      .setWrap(true)
  );

  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, ultimaColuna);
  aba.autoResizeRows(2, linhasDeDados);
  aba.getRange(2, 5, linhasDeDados, 3).setNumberFormat('0.00');
}

// Cria Menu no Google Sheets
function criaMenu() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Dimensionamento')
    .addItem('Calcular Demanda', 'gerarTabelaDemanda')
    .addItem('Dividir Circuitos', 'dividirCircuitos')
    .addToUi();
}