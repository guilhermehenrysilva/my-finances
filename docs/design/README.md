# Design (Claude Design)

Cópia dos mockups do app feitos no Claude Design. A versão oficial é esta, do repo: mude aqui e publique de novo no
canvas.

- Canvas: https://claude.ai/artifact/KxAx11Uhqamtz9YcTuayJS (privado; só abre para quem tem acesso)
- Todos os dados dos mockups são fictícios.

## Arquivos

| Arquivo | Quadro |
|---|---|
| `project/canvas.json` | Índice do canvas: posição e tamanho de cada quadro, páginas e notas |
| `project/Main.dc.html` | Dashboard (novo visual) |
| `project/Lancamentos.dc.html` | Lançamentos |
| `project/Fontes-Dashboard.dc.html` | Dashboard com o Meu Pluggy: "Dos bancos" × "Cadastrado por você" |
| `project/Fontes-SemPluggy.dc.html` | Dashboard sem banco conectado |
| `project/Fontes-Historico.dc.html` | Histórico com as colunas agrupadas por origem |
| `project/Fontes-Previsao.dc.html` | Previsão com as colunas agrupadas por origem |
| `project/Artboard-zktf.dc.html` | Quadro vazio da "Page 2" (criado pelo editor) |
| `project/Escuro-Dashboard.dc.html` | Página "Escuro · celular e web": Dashboard web no tema escuro |
| `project/Escuro-Paleta.dc.html` | Paleta escura (grafite e verde), botões, campos e etiquetas |
| `project/Mobile-Inicio.dc.html` | Celular: Início |
| `project/Mobile-Contas.dc.html` | Celular: Contas a pagar (marcar como paga funciona no Play) |
| `project/Mobile-Lancamentos.dc.html` | Celular: Lançamentos por dia, com filtro por meio |
| `project/Mobile-Lancamento.dc.html` | Celular: lançamento aberto num painel que sobe de baixo |
| `project/Mobile-Previsao.dc.html` | Celular: Previsão em cartões por mês |
| `project/Mobile-Mais.dc.html` | Celular: Mais (Entradas, Histórico, Bancos, Configurações, Aparência) |

Os quadros do celular são ligados entre si: no Play, a barra de abas navega entre as telas.

## Editar

- Cada `.dc.html` é um HTML comum, com o estilo direto nos elementos (`style="…"`). Dá para editar à mão ou pedir ao
  Claude para mudar e publicar de novo no mesmo canvas (o link continua o mesmo).
- Novo quadro: crie o `.dc.html` em `project/` e adicione a entrada em `boards` e em `order` no `canvas.json`.
- Não apague a linha `<script src="./support.js"></script>`: o Claude Design precisa dela para mostrar o quadro.

## Cuidados

- **Repo e canvas não se sincronizam sozinhos.** Se alguém editar direto no Claude Design, peça ao Claude para baixar
  os arquivos do canvas para esta pasta antes de mudar qualquer coisa aqui.
- Aberto direto no navegador, o quadro aparece quase igual, mas os controles do editor não funcionam.
- Os mockups são a referência do visual. O app em `web/src` pode ter pequenas diferenças de texto e espaçamento.
