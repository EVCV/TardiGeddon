// News: release notes (what changed), what's coming, and known problems being
// fixed. One list, shown in the game (the News page, src/ui/news.ts) and on
// the website (tardigeddon.com/news). The website's build also publishes it
// as /news.json, which the game fetches (src/news/feed.ts), so the apps show
// new posts without an app update. See docs/NEWS.md.
//
// To post: add an entry at the top, in all six languages (tests/news.test.ts
// checks), and merge: the website deploy puts it everywhere. Plain text only:
// a line starting "- " is a bullet point. Never reuse or change an id (it
// marks a post as read).

import type { Lang } from '../i18n/i18n';

/** update: release notes; coming: on its way; issue: a known problem (with `fixed` once it is). */
export type NewsKind = 'update' | 'coming' | 'issue';

export interface NewsText {
  title: string;
  /** Paragraphs; a line starting "- " is a bullet point. */
  body: string[];
}

export interface NewsPost {
  /** Unique and never changed: "2026-10-28-cpu". */
  id: string;
  /** YYYY-MM-DD: when it was released or posted; for "coming", when it's expected. */
  date: string;
  kind: NewsKind;
  /** A known problem: the day it was fixed (it then shows as fixed). */
  fixed?: string;
  text: Record<Lang, NewsText>;
}

export const NEWS_LANGS: Lang[] = ['en', 'es', 'pt-BR', 'de', 'fr', 'ja'];

export const NEWS: NewsPost[] = [
  {
    id: '2026-10-31-launch',
    date: '2026-10-31',
    kind: 'coming',
    text: {
      en: {
        title: 'Launch day: 31 October',
        body: [
          'TardiGeddon opens to everyone on 31 October: in your browser, and as apps for Android, iPhone and iPad.',
          '- Make an account by 31 October to get the Founder pack.',
          '- The first 1,000 players also get the Early bird pack.',
        ],
      },
      es: {
        title: 'Día del lanzamiento: 31 de octubre',
        body: [
          'TardiGeddon se abre a todo el mundo el 31 de octubre: en tu navegador y como app para Android, iPhone y iPad.',
          '- Crea una cuenta antes del 31 de octubre para conseguir el Pack Fundador.',
          '- Los primeros 1000 jugadores también reciben el Pack Madrugador.',
        ],
      },
      'pt-BR': {
        title: 'Dia do lançamento: 31 de outubro',
        body: [
          'O TardiGeddon abre para todos em 31 de outubro: no seu navegador e como app para Android, iPhone e iPad.',
          '- Crie uma conta até 31 de outubro para ganhar o Pacote Fundador.',
          '- Os primeiros 1.000 jogadores também ganham o Pacote Madrugador.',
        ],
      },
      de: {
        title: 'Starttag: 31. Oktober',
        body: [
          'TardiGeddon startet am 31. Oktober für alle: im Browser und als App für Android, iPhone und iPad.',
          '- Erstelle bis zum 31. Oktober ein Konto, um das Gründerpaket zu bekommen.',
          '- Die ersten 1.000 Spieler bekommen außerdem das Frühaufsteher-Paket.',
        ],
      },
      fr: {
        title: 'Jour du lancement : 31 octobre',
        body: [
          'TardiGeddon ouvre à tout le monde le 31 octobre : dans ton navigateur, et en appli pour Android, iPhone et iPad.',
          '- Crée un compte avant le 31 octobre pour obtenir le Pack Fondateur.',
          '- Les 1 000 premiers joueurs reçoivent aussi le Pack Lève-tôt.',
        ],
      },
      ja: {
        title: 'リリース日：10月31日',
        body: [
          'TardiGeddonは10月31日に一般公開されます。ブラウザでも、Android・iPhone・iPadのアプリでも遊べます。',
          '- 10月31日までにアカウントを作ると、ファウンダーパックがもらえます。',
          '- 最初の1,000人には、アーリーバードパックもプレゼント。',
        ],
      },
    },
  },
  {
    id: '2026-10-28-cpu-sky',
    date: '2026-10-28',
    kind: 'update',
    text: {
      en: {
        title: 'A fairer CPU, a spooky sky and some fixes',
        body: [
          '- The CPU takes its time like a person: it looks around, then picks a weapon, aims and fires.',
          '- Normal is a closer fight: no more wild misses, and it uses the Fire Punch when you’re right next to it.',
          '- Spooky season: bats and leaves drift across the menu’s sky.',
          '- Fixed: a tardigrade wedged between two bits of land no longer hangs in the air and stops the game.',
          '- Fixed: tardigrades at the edge of the screen no longer hide under the touch buttons.',
        ],
      },
      es: {
        title: 'Una CPU más justa, un cielo de miedo y algunos arreglos',
        body: [
          '- La CPU se toma su tiempo como una persona: mira alrededor, elige un arma, apunta y dispara.',
          '- En Normal la pelea es más reñida: se acabaron los fallos absurdos, y usa el Puñetazo de Fuego cuando estás justo a su lado.',
          '- Temporada de sustos: murciélagos y hojas cruzan el cielo del menú.',
          '- Arreglado: un tardígrado atascado entre dos trozos de tierra ya no se queda flotando y no detiene la partida.',
          '- Arreglado: los tardígrados en el borde de la pantalla ya no se esconden bajo los botones táctiles.',
        ],
      },
      'pt-BR': {
        title: 'Uma CPU mais justa, um céu assustador e algumas correções',
        body: [
          '- A CPU leva o seu tempo, como uma pessoa: olha em volta, escolhe uma arma, mira e atira.',
          '- No Normal a luta é mais equilibrada: chega de erros absurdos, e ela usa o Soco de Fogo quando você está bem do lado.',
          '- Temporada assustadora: morcegos e folhas passam pelo céu do menu.',
          '- Corrigido: um tardígrado preso entre dois pedaços de terra não fica mais flutuando e travando o jogo.',
          '- Corrigido: tardígrados na beira da tela não ficam mais escondidos atrás dos botões de toque.',
        ],
      },
      de: {
        title: 'Eine fairere CPU, ein gruseliger Himmel und ein paar Korrekturen',
        body: [
          '- Die CPU lässt sich Zeit wie ein Mensch: Sie schaut sich um, wählt dann eine Waffe, zielt und schießt.',
          '- Normal ist ein knapperer Kampf: keine wilden Fehlschüsse mehr, und sie setzt die Feuerfaust ein, wenn du direkt neben ihr stehst.',
          '- Gruselzeit: Fledermäuse und Blätter ziehen über den Himmel im Menü.',
          '- Behoben: Ein Bärtierchen, das zwischen zwei Landstücken klemmt, hängt nicht mehr in der Luft und hält das Spiel nicht mehr an.',
          '- Behoben: Bärtierchen am Bildschirmrand verstecken sich nicht mehr unter den Touch-Tasten.',
        ],
      },
      fr: {
        title: 'Un CPU plus juste, un ciel qui fait peur et quelques corrections',
        body: [
          '- Le CPU prend son temps comme une vraie personne : il regarde autour de lui, puis choisit une arme, vise et tire.',
          '- En Normal, le combat est plus serré : fini les tirs complètement ratés, et il utilise le Poing de feu quand tu es juste à côté.',
          '- La saison de la frousse : des chauves-souris et des feuilles traversent le ciel du menu.',
          '- Corrigé : un tardigrade coincé entre deux bouts de terrain ne reste plus suspendu en l’air en bloquant la partie.',
          '- Corrigé : les tardigrades au bord de l’écran ne se cachent plus sous les boutons tactiles.',
        ],
      },
      ja: {
        title: 'もっとフェアなCPU、こわい空、いくつかの修正',
        body: [
          '- CPUが人間のように時間をかけるようになりました。まわりを見てから、武器を選び、狙って撃ちます。',
          '- ノーマルはより接戦に。大はずれがなくなり、すぐ隣にいるとファイアパンチを使ってきます。',
          '- ハロウィンの季節：メニューの空にコウモリと落ち葉が舞います。',
          '- 修正：2つの地面のあいだに挟まったクマムシが、空中で止まってゲームが進まなくなる問題。',
          '- 修正：画面の端にいるクマムシが、タッチボタンの下に隠れてしまう問題。',
        ],
      },
    },
  },
  {
    id: '2026-10-25-rope-race',
    date: '2026-10-25',
    kind: 'update',
    text: {
      en: {
        title: 'Rope Race courses, a tidier weapons panel and more help',
        body: [
          '- Rope Race: real courses you can finish, with a different mix of easy and hard parts every time.',
          '- The weapons panel is in sections: thrown, shots and close up, drop and run, from the sky, getting about, and superweapons.',
          '- New power bar options for learning: slower charging, or a bar that goes back down.',
          '- More help during a match, with a switch in Settings to turn it off.',
          '- Tutorial: you always take the first turn, and you come straight back if you’re popped.',
        ],
      },
      es: {
        title: 'Recorridos de Carrera de Cuerda, un panel de armas más ordenado y más ayuda',
        body: [
          '- Carrera de Cuerda: recorridos de verdad que puedes terminar, con una mezcla distinta de partes fáciles y difíciles cada vez.',
          '- El panel de armas va por secciones: lanzadas, disparos y cuerpo a cuerpo, soltar y correr, desde el cielo, moverse y superarmas.',
          '- Nuevas opciones de la barra de potencia para aprender: carga más lenta, o una barra que vuelve a bajar.',
          '- Más ayuda durante la partida, con un interruptor en Ajustes para quitarla.',
          '- Tutorial: siempre juegas el primer turno, y vuelves enseguida si te revientan.',
        ],
      },
      'pt-BR': {
        title: 'Percursos de Corrida de Corda, um painel de armas mais organizado e mais ajuda',
        body: [
          '- Corrida de Corda: percursos de verdade que dá para terminar, com uma mistura diferente de partes fáceis e difíceis a cada vez.',
          '- O painel de armas agora tem seções: arremessadas, tiros e corpo a corpo, soltar e correr, do céu, locomoção e superarmas.',
          '- Novas opções da barra de força para aprender: carga mais lenta, ou uma barra que volta a descer.',
          '- Mais ajuda durante a partida, com uma opção em Ajustes para desligar.',
          '- Tutorial: você sempre joga o primeiro turno, e volta na hora se for estourado.',
        ],
      },
      de: {
        title: 'Seilrennen-Strecken, ein aufgeräumteres Waffenmenü und mehr Hilfe',
        body: [
          '- Seilrennen: echte Strecken, die man schaffen kann, jedes Mal mit einer anderen Mischung aus leichten und schweren Stellen.',
          '- Das Waffenmenü ist in Abschnitte geteilt: Wurfwaffen, Schüsse und Nahkampf, Ablegen und Weglaufen, vom Himmel, Fortbewegung und Superwaffen.',
          '- Neue Optionen für die Kraftanzeige zum Lernen: langsameres Aufladen oder eine Anzeige, die wieder runtergeht.',
          '- Mehr Hilfe während des Spiels, mit einem Schalter in den Einstellungen zum Ausschalten.',
          '- Tutorial: Du hast immer den ersten Zug und bist sofort wieder da, wenn du zerplatzt.',
        ],
      },
      fr: {
        title: 'Des parcours de Course à la corde, un panneau d’armes mieux rangé et plus d’aide',
        body: [
          '- Course à la corde : de vrais parcours que l’on peut finir, avec un mélange différent de passages faciles et difficiles à chaque fois.',
          '- Le panneau d’armes est rangé par sections : lancées, tirs et corps à corps, poser et fuir, venues du ciel, se déplacer, et superarmes.',
          '- Nouvelles options de la barre de puissance pour apprendre : une charge plus lente, ou une barre qui redescend.',
          '- Plus d’aide pendant la partie, avec un interrupteur dans les Paramètres pour la couper.',
          '- Tutoriel : tu joues toujours le premier tour, et tu reviens tout de suite si tu éclates.',
        ],
      },
      ja: {
        title: 'ロープレースのコース、整理された武器パネル、ヘルプの追加',
        body: [
          '- ロープレース：ちゃんとゴールできるコースに。やさしい所とむずかしい所の組み合わせが毎回変わります。',
          '- 武器パネルをセクションに分けました：投げる、撃つ・近接、置いて逃げる、空から、移動、スーパーウェポン。',
          '- 練習向けのパワーバー設定を追加：ゆっくりためる、または上がったら下がるバー。',
          '- 試合中のヘルプを増やしました。設定でオフにできます。',
          '- チュートリアル：必ず自分が先攻になり、やられてもすぐに戻ってきます。',
        ],
      },
    },
  },
];
