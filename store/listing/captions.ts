// The words on the store screenshots (scripts/store-art.ts): a headline and a
// line under it, in every language the game speaks. Names of weapons, modes
// and realms are the game's own translations (src/i18n/locales). No prices,
// rankings or "download now": the stores' listing rules forbid them.

export const LANGS = ['en', 'es', 'pt-BR', 'de', 'fr', 'ja'] as const;
export type Lang = (typeof LANGS)[number];
export type Shot = 'battle' | 'crater' | 'weapons' | 'rope' | 'strike' | 'teams' | 'dressup' | 'realms';

export const CAPTIONS: Record<Lang, Record<Shot, [string, string]> & { tagline: string }> = {
  en: {
    tagline: 'Tiny. Indestructible. Armed.',
    battle: ['Tiny. Indestructible. Armed.', 'Turn-based artillery battles'],
    crater: ['Blow the world to bits', 'Every blast digs a crater'],
    weapons: ['20+ silly weapons', 'Spore Bazooka, Pebble Grenade and more'],
    rope: ['Swing on the Silk Rope', 'Race to the flag in Rope Race'],
    strike: ['Call in a Raindrop Strike', 'Pick a spot and watch it pour'],
    teams: ['Up to 10 teams', 'Play the computer, friends or online'],
    dressup: ['Dress up your team', 'Hats, skins and victory dances'],
    realms: ['7 wild realms', 'Twin Isles, Caverns, Sky Realms and more'],
  },
  es: {
    tagline: 'Diminutos. Indestructibles. Armados.',
    battle: ['Diminutos. Indestructibles. Armados.', 'Batallas de artillería por turnos'],
    crater: ['Haz volar el mundo', 'Cada explosión abre un cráter'],
    weapons: ['Más de 20 armas absurdas', 'Bazuca de Esporas, Granada Guijarro y más'],
    rope: ['Balancéate con la Cuerda de Seda', 'Llega a la bandera en la Carrera de Cuerda'],
    strike: ['Pide un Ataque de Gotas', 'Elige un sitio y mira cómo llueve'],
    teams: ['Hasta 10 equipos', 'Contra el ordenador, con amigos u online'],
    dressup: ['Viste a tu equipo', 'Sombreros, pieles y bailes de victoria'],
    realms: ['7 reinos salvajes', 'Islas Gemelas, Cavernas, Reinos del Cielo y más'],
  },
  'pt-BR': {
    tagline: 'Minúsculo. Indestrutível. Armado.',
    battle: ['Minúsculo. Indestrutível. Armado.', 'Batalhas de artilharia por turnos'],
    crater: ['Exploda o mundo em pedaços', 'Cada explosão abre uma cratera'],
    weapons: ['Mais de 20 armas malucas', 'Bazuca de Esporos, Granada de Pedrinha e mais'],
    rope: ['Balance na Corda de Seda', 'Chegue à bandeira na Corrida de Corda'],
    strike: ['Chame um Ataque de Gotas', 'Escolha um ponto e veja chover'],
    teams: ['Até 10 equipes', 'Contra o computador, amigos ou online'],
    dressup: ['Vista sua equipe', 'Chapéus, visuais e danças da vitória'],
    realms: ['7 reinos selvagens', 'Ilhas Gêmeas, Cavernas, Reinos do Céu e mais'],
  },
  de: {
    tagline: 'Winzig. Unzerstörbar. Bewaffnet.',
    battle: ['Winzig. Unzerstörbar. Bewaffnet.', 'Rundenbasierte Artillerie-Schlachten'],
    crater: ['Sprenge die Welt', 'Jede Explosion reißt einen Krater'],
    weapons: ['Über 20 verrückte Waffen', 'Sporen-Bazooka, Kiesel-Granate und mehr'],
    rope: ['Schwing dich am Seidenseil', 'Ab zur Flagge im Seilrennen'],
    strike: ['Ruf einen Regentropfen-Angriff', 'Ziel wählen und zusehen, wie es schüttet'],
    teams: ['Bis zu 10 Teams', 'Gegen den Computer, Freunde oder online'],
    dressup: ['Style dein Team', 'Hüte, Looks und Siegestänze'],
    realms: ['7 wilde Welten', 'Zwillingsinseln, Höhlen, Himmelsreiche und mehr'],
  },
  fr: {
    tagline: 'Minuscule. Indestructible. Armé.',
    battle: ['Minuscule. Indestructible. Armé.', 'Des batailles d’artillerie au tour par tour'],
    crater: ['Fais tout sauter', 'Chaque explosion creuse un cratère'],
    weapons: ['Plus de 20 armes loufoques', 'Bazooka à spores, Grenade caillou et plus'],
    rope: ['Balance-toi à la Corde de soie', 'File au drapeau dans la Course à la corde'],
    strike: ['Lance une Frappe de gouttes', 'Choisis un endroit et regarde pleuvoir'],
    teams: ['Jusqu’à 10 équipes', 'Contre l’ordinateur, entre amis ou en ligne'],
    dressup: ['Habille ton équipe', 'Chapeaux, looks et danses de victoire'],
    realms: ['7 mondes sauvages', 'Îles jumelles, Cavernes, Royaumes célestes et plus'],
  },
  ja: {
    tagline: 'ちっちゃい。不死身。武装済み。',
    battle: ['ちっちゃい。不死身。武装済み。', 'ターン制の砲撃バトル'],
    crater: ['世界をふっとばせ', '爆発のたびにクレーターができる'],
    weapons: ['20種類以上のおかしな武器', '胞子バズーカ、小石グレネードなど'],
    rope: ['シルクロープでスイング', 'ロープレースで旗をめざせ'],
    strike: ['雨つぶストライクを呼べ', '場所を選んで、ふりそそぐのを見よう'],
    teams: ['最大10チーム', 'コンピューター、友だち、オンラインで対戦'],
    dressup: ['チームをおしゃれに', '帽子、スキン、勝利のダンス'],
    realms: ['7つのワイルドな世界', 'ふたご島、洞くつ、空の王国など'],
  },
};
