/**
 * Référentiel officiel utilisé pour contrôler le rattachement pédagogique des
 * activités. Source consultée le 3 septembre 2026 :
 * https://cdn-contenu.quebec.ca/cdn-contenu/education/pfeq/secondaire/programmes/PFEQ-histoire-quebec-canada-secondaire.pdf
 *
 * Les « connaissances » reprennent les éléments explicitement énumérés dans
 * les précisions du programme. Ce référentiel ne prétend pas remplacer le
 * jugement professionnel de l'enseignant ni fournir un récit historique
 * complet.
 */

export type NiveauPFEQ = 3 | 4;

export type RealitePFEQ = {
  id: number;
  niveau: NiveauPFEQ;
  periode: string;
  titre: string;
  question: string;
  concepts: readonly string[];
  rubriques: readonly string[];
  connaissances: readonly string[];
};

export const PFEQ_REALITES: readonly RealitePFEQ[] = [
  {
    id: 1,
    niveau: 3,
    periode: "Des origines à 1608",
    titre: "L’expérience des Autochtones et le projet de colonie",
    question: "Expliquer comment les relations entre les peuples autochtones et leur connaissance du territoire ont contribué à l’exploitation de ses ressources par les Français ainsi qu’à leurs tentatives d’établissement.",
    concepts: ["Alliance", "Échange", "Environnement"],
    rubriques: [
      "Premiers occupants du territoire",
      "Rapports sociaux chez les Autochtones",
      "Prise de décision chez les Autochtones",
      "Réseaux d'échange autochtones",
      "Alliances et rivalités au sein des Premières Nations",
      "Premiers contacts",
      "Exploration et occupation du territoire par les Français",
    ],
    connaissances: [
      "Migrations à l'origine du peuplement du nord-est de l'Amérique",
      "Familles linguistiques",
      "Premières Nations et nation inuite",
      "Territoire occupé",
      "Modes de vie",
      "Structures matrilinéaire et patrilinéaire",
      "Tradition chamanique",
      "Éducation des enfants",
      "Partage des biens",
      "Tradition orale",
      "Don et contre-don",
      "Désignation des chefs",
      "Rôle des chefs et des aînés",
      "Activités économiques",
      "Échanges entre nations",
      "Étendue des réseaux d'échange sur le continent",
      "Utilisation des voies d'eau",
      "Système d'alliances",
      "Objets de rivalité",
      "Guerres",
      "Sort des prisonniers",
      "Conjoncture européenne",
      "Explorations européennes en Amérique",
      "Pêcheries européennes et chasse à la baleine",
      "Produits échangés entre des Autochtones et des Européens",
      "Perspective des Autochtones",
      "Premiers voyages de Jacques Cartier",
      "Colonie de peuplement sur le cap Rouge",
      "Autres tentatives de colonisation par la France dans le nord-est de l'Amérique",
      "Alliance franco-amérindienne de 1603",
    ],
  },
  {
    id: 2,
    niveau: 3,
    periode: "1608-1760",
    titre: "L’évolution de la société coloniale sous l’autorité de la métropole française",
    question: "Expliquer les relations entre la société coloniale et la France.",
    concepts: ["Adaptation", "Évangélisation", "Mercantilisme"],
    rubriques: [
      "Monopole des compagnies",
      "Gouvernement royal",
      "Territoire français en Amérique",
      "Guerre et diplomatie chez les Premières Nations",
      "Commerce des fourrures",
      "Église catholique",
      "Croissance de la population",
      "Villes du Canada",
      "Régime seigneurial",
      "Diversification économique",
      "Adaptation des colons",
      "Populations autochtones",
      "Guerres intercoloniales",
      "Guerre de la Conquête",
    ],
    connaissances: [
      "Privilèges et obligations des compagnies",
      "Mercantilisme",
      "Premiers gouverneurs",
      "Absolutisme de droit divin",
      "Secrétaire d'État à la marine",
      "Gouverneur",
      "Organisation militaire",
      "Intendant",
      "Conseil souverain",
      "Premiers établissements dans la vallée du Saint-Laurent",
      "Territoire de pêche",
      "Territoire revendiqué",
      "Territoire occupé",
      "Possessions britanniques",
      "Traité de Saint-Germain-en-Laye (1632)",
      "Alliances avec les Européens",
      "Guerres iroquoises",
      "Grande Paix de Montréal",
      "Exploitation de la ressource",
      "Exploration du territoire",
      "Rôle des agents",
      "Congé de traite",
      "Communautés religieuses",
      "Évangélisation des Autochtones",
      "Services sociaux et soins de santé",
      "Rôle de l'évêque",
      "Encadrement des colons",
      "Établissement de paroisses",
      "Origines sociales et géographiques des immigrants",
      "Politique de peuplement",
      "Filles du Roy",
      "Accroissement naturel",
      "Occupation du sol",
      "Population urbaine",
      "Esclavage",
      "Centre administratif et culturel",
      "Place publique",
      "Organisation sociale",
      "Organisation territoriale",
      "Diversité sociale des seigneurs",
      "Vie quotidienne",
      "Obstacles à la diversification de l'économie",
      "Mesures des intendants",
      "Activités agricoles",
      "Activités artisanales",
      "Commerce triangulaire",
      "Empreinte culturelle européenne",
      "Éloignement géographique de la métropole",
      "Acclimatation",
      "Relations avec des Autochtones",
      "Domiciliés",
      "Acculturation",
      "Métissage",
      "Choc microbien",
      "Empires coloniaux",
      "Objets des rivalités coloniales",
      "Rapports de force",
      "Traité d'Utrecht",
      "Guerre de Sept Ans",
      "Affrontements en Ohio",
      "Déportation des Acadiens",
      "Prise de Louisbourg",
      "Avancées britanniques dans la vallée du Saint-Laurent",
      "Siège de Québec",
      "Bataille des Plaines d'Abraham",
      "Bataille de Sainte-Foy",
      "Milice canadienne",
    ],
  },
  {
    id: 3,
    niveau: 3,
    periode: "1760-1791",
    titre: "La Conquête et le changement d’empire",
    question: "Expliquer comment le changement d’empire a marqué la société coloniale.",
    concepts: ["Allégeance", "Assimilation", "Constitution"],
    rubriques: [
      "Régime militaire",
      "Proclamation royale",
      "Statut des Indiens",
      "Instructions au gouverneur Murray",
      "Mouvements de revendication",
      "Acte de Québec",
      "Invasion américaine",
      "Loyalistes",
      "Économie coloniale",
      "Situation sociodémographique",
      "Église catholique",
      "Église anglicane",
    ],
    connaissances: [
      "Capitulation de Montréal",
      "Émigration de Canadiens",
      "Reconstruction de la colonie",
      "Administration militaire de la colonie",
      "Conditions imposées aux Canadiens",
      "Traité de Paris (1763)",
      "Structures politiques, juridiques et administratives",
      "Territoire de la Province de Québec",
      "Droits territoriaux des Indiens",
      "Autres colonies britanniques en Amérique du Nord",
      "Révolte de Pontiac",
      "Département des Affaires indiennes",
      "Revendications des Premières Nations",
      "Instauration du gouvernement civil",
      "Assimilation des Canadiens",
      "Serment du Test",
      "Concessions accordées aux Canadiens",
      "Groupes d'influence",
      "Objets des pétitions",
      "Religion et droits civils",
      "Pouvoirs exécutif, législatif et judiciaire",
      "Rôle du gouverneur",
      "Réactions des différents groupes",
      "Territoire de la Province de Québec",
      "Lois intolérables ou Coercive Acts",
      "Lettres aux Canadiens",
      "Occupation de Montréal et siège de Québec",
      "Déclaration d'indépendance des États-Unis",
      "Territoire de la Province de Québec et des États-Unis à la suite de l'adoption du traité de Paris (1783)",
      "Migration de populations autochtones",
      "Conditions de vie des migrants",
      "Établissement des colons",
      "Politique économique britannique",
      "Contrôle des marchands britanniques",
      "Commerce des fourrures",
      "Production agricole",
      "Pêche",
      "Immigration britannique",
      "Réfugiés acadiens",
      "Composition de la population",
      "Usage de la langue française",
      "Accroissement naturel des Canadiens",
      "Bourgeoisie professionnelle canadienne",
      "Clergé",
      "Communautés religieuses",
      "Écoles",
      "Hôpitaux",
      "Lieux de culte",
    ],
  },
  {
    id: 4,
    niveau: 3,
    periode: "1791-1840",
    titre: "Les revendications et les luttes nationales",
    question: "Expliquer la montée du nationalisme dans une colonie en quête d’autonomie politique.",
    concepts: ["Bourgeoisie", "Nationalisme", "Parlementarisme"],
    rubriques: [
      "Acte constitutionnel",
      "Débats parlementaires",
      "Nationalismes",
      "Idées libérales et républicaines",
      "Population",
      "Soulèvements de 1837-1838",
      "Capitaux et infrastructures",
      "Agriculture",
      "Commerce des fourrures",
      "Commerce du bois",
      "Mouvements migratoires",
      "Guerre anglo-américaine de 1812",
      "Église anglicane",
      "Rapport Durham",
    ],
    connaissances: [
      "Chambre d'assemblée et Conseil législatif",
      "Gouverneur et Conseil exécutif",
      "Droit de vote et d'éligibilité des hommes et des femmes",
      "Territoires du Bas-Canada et du Haut-Canada",
      "Autorité du gouverneur",
      "Sujets débattus à la Chambre d'assemblée",
      "Partis politiques",
      "Dualité linguistique",
      "Nationalisme britannique",
      "Nationalisme canadien",
      "Mouvement occidental de libération nationale",
      "Libéralisme politique",
      "Républicanisme",
      "Presse écrite",
      "Composition de la population du Bas-Canada et du Haut-Canada",
      "Accroissement de la population du Bas-Canada et du Haut-Canada",
      "Groupes sociaux",
      "Agents des Indiens",
      "Abolition de l'esclavage",
      "Les 92 résolutions",
      "Les résolutions Russell",
      "Assemblées populaires",
      "Mesures de répression prises par l'État colonial",
      "Haut et bas clergés catholiques",
      "Conflit armé",
      "Déclaration d'indépendance du Bas-Canada",
      "Suspension de la constitution",
      "Rébellions au Haut-Canada",
      "Création des banques",
      "Construction de routes et de ponts",
      "Construction de canaux",
      "Construction de chemins de fer",
      "Organisation du territoire",
      "Corn Laws",
      "Culture intensive du blé",
      "Crise des années 1830",
      "Expansion des territoires exploités",
      "Marché de la fourrure",
      "Fusion des compagnies",
      "Tarifs préférentiels",
      "Blocus continental",
      "Transformation du bois",
      "Construction navale",
      "Métiers",
      "Territoires exploités",
      "Conditions sociales et économiques en Grande-Bretagne",
      "Épidémies et quarantaine",
      "Lieux d'établissement des immigrants",
      "Émigration vers les États-Unis",
      "Migration vers les villes",
      "Régions de colonisation",
      "Alliance avec des Premières Nations",
      "Église catholique",
      "Participation des Canadiens",
      "Diocèse de Québec",
      "Participation de l'évêque aux conseils",
      "Réserves du clergé",
      "Écoles publiques gratuites",
      "Exercice du pouvoir",
      "Crise raciale",
      "Union des deux Canada",
      "Assimilation des Canadiens",
      "Responsabilité ministérielle",
    ],
  },
  {
    id: 5,
    niveau: 4,
    periode: "1840-1896",
    titre: "La formation du régime fédéral canadien",
    question: "Expliquer la mise en place d'un cadre politique dans une période de bouleversements sociodémographiques et économiques.",
    concepts: ["Fédéralisme", "Industrialisation", "Migration"],
    rubriques: [
      "Acte d'Union",
      "Économie coloniale",
      "Gouvernement responsable",
      "Affaires indiennes",
      "Acte de l'Amérique du Nord britannique",
      "Relations fédérales-provinciales",
      "Politique nationale",
      "Migrations",
      "Rôle des femmes",
      "Présence de l'Église catholique",
      "Manifestations socioculturelles",
      "Première phase d'industrialisation",
      "Industrie forestière",
      "Exploitations agricoles",
    ],
    connaissances: [
      "Contexte sociopolitique et économique",
      "Structure politique",
      "Dispositions administratives",
      "Territoire de la Province du Canada",
      "Adoption du libre-échange par le Royaume-Uni",
      "Traité de réciprocité avec les États-Unis",
      "Alliance des Réformistes",
      "Fonctionnement du gouvernement responsable",
      "Instabilité ministérielle",
      "Création des réserves indiennes au Bas-Canada",
      "Missions catholiques et protestantes",
      "Loi sur les Indiens",
      "Grande Coalition",
      "Conférences",
      "Structure du fédéralisme canadien",
      "Territoire du Dominion du Canada",
      "Champs de compétence",
      "Répartition des revenus",
      "Conférence interprovinciale",
      "Soulèvements des Métis",
      "Écoles catholiques hors Québec",
      "Crise économique de 1873",
      "Politique tarifaire",
      "Chemin de fer transcontinental du Canadien Pacifique",
      "Colonisation des terres de l'Ouest",
      "Exode rural",
      "Émigration vers les États-Unis",
      "Ouverture de régions de colonisation",
      "Immigration transatlantique",
      "Statuts juridique et politique",
      "Secteurs d'activité",
      "Communautés religieuses féminines",
      "Organisations féminines anglophones",
      "Ultramontanisme",
      "Anticléricalisme",
      "Nationalisme de survivance",
      "Dualisme confessionnel des institutions sociales",
      "Oeuvres patriotiques",
      "Émergence de la littérature féminine",
      "Enseignement supérieur",
      "Capitalisme industriel",
      "Réseau de transport continental de l'est",
      "Secteurs de production",
      "Division du travail",
      "Conditions de vie et de travail des hommes, des femmes et des enfants",
      "Mouvement ouvrier",
      "Urbanisation",
      "Régions d'exploitation",
      "Industrie du bois de sciage",
      "Production laitière",
      "Mécanisation",
      "Droits seigneuriaux",
    ],
  },
  {
    id: 6,
    niveau: 4,
    periode: "1896-1945",
    titre: "Les nationalismes et l’autonomie du Canada",
    question: "Expliquer le maintien des particularités linguistiques et culturelles du Québec alors que se redéfinit l’autonomie politique, économique et socioculturelle du Canada.",
    concepts: ["Impérialisme", "Libéralisme", "Urbanisation"],
    rubriques: [
      "Statut du Canada dans l'Empire britannique",
      "Clérico-nationalisme",
      "Politique intérieure canadienne",
      "Deuxième phase d'industrialisation",
      "Milieux urbains",
      "Culture de masse",
      "Luttes des femmes",
      "Mouvement syndical",
      "Église catholique",
      "Éducation et formation technique",
      "Flux migratoires",
      "Première Guerre mondiale",
      "Grande dépression",
      "Remise en question du capitalisme",
      "Seconde Guerre mondiale",
    ],
    connaissances: [
      "Impérialisme",
      "Nationalisme canadien-français",
      "Soutien militaire canadien",
      "Statut de Westminster",
      "L'Action française",
      "Programme de restauration sociale",
      "Rôle des francophones dans l'économie",
      "Ère libérale",
      "Pouvoirs fiscaux",
      "Minorité franco-catholique",
      "Gouverne des populations des Premières Nations et de la nation inuite",
      "Territoire canadien",
      "Ressources naturelles",
      "Production manufacturière et domestique",
      "Industrie de guerre",
      "Capitalisme de monopole",
      "Investissements étrangers",
      "Rôle de l'État",
      "Échanges commerciaux",
      "Santé publique",
      "Infrastructures",
      "Services",
      "Radio",
      "Cinéma",
      "Romans du terroir",
      "Sport professionnel",
      "Cabarets",
      "Accès à l'éducation",
      "Marché du travail",
      "Reconnaissance juridique",
      "Droit de vote et d'éligibilité",
      "Syndicats américains et catholiques",
      "Grèves",
      "Législation ouvrière",
      "Importance de l'effectif religieux",
      "Influence morale et culturelle",
      "Coopératives",
      "Fréquentation scolaire des francophones et des anglophones",
      "Législation",
      "Scolarisation des garçons et des filles",
      "Perfectionnement des pratiques agricoles",
      "Origines ethniques des immigrants",
      "Structures d'accueil",
      "Contrôle de l'immigration",
      "Montée de la xénophobie",
      "Intérêts nationaux européens",
      "Gouvernement de guerre",
      "Crise de la conscription",
      "Effort de guerre des hommes et des femmes",
      "Rétablissement civil des soldats",
      "Société des Nations",
      "Krach boursier de 1929",
      "Problèmes socioéconomiques",
      "Colonisation",
      "Mesures des gouvernements fédéral et provincial",
      "Keynesianisme",
      "Idéologies sociopolitiques",
      "Climat politique et économique européen",
      "Plébiscite sur la conscription",
      "Démobilisation",
    ],
  },
  {
    id: 7,
    niveau: 4,
    periode: "1945-1980",
    titre: "La modernisation du Québec et la Révolution tranquille",
    question: "Expliquer l'évolution des mœurs des Québécois au rythme de la transformation des institutions du Québec et du rôle de l'État.",
    concepts: ["État-providence", "Féminisme", "Laïcisation"],
    rubriques: [
      "Rapports de force en Occident",
      "Agglomération urbaine",
      "Accroissement naturel",
      "Nouveaux arrivants",
      "Développement régional",
      "Fédération canadienne",
      "Pensionnats indiens au Québec",
      "Société de consommation",
      "Période duplessiste",
      "Néonationalisme",
      "Révolution tranquille",
      "Féminisme",
      "Effervescence socioculturelle",
      "Affirmation des nations autochtones",
      "Relations patronales-syndicales",
    ],
    connaissances: [
      "Guerre froide",
      "Souveraineté canadienne dans l'Arctique",
      "Luttes sociales aux États-Unis et en France",
      "Banlieue",
      "Infrastructures",
      "Bébé-boum",
      "Dénatalité",
      "Taux de natalité de la population autochtone",
      "Communautés culturelles",
      "Création du ministère de l'Immigration du Québec",
      "Accueil de réfugiés",
      "Modernisation de l'agriculture",
      "Protection du territoire agricole",
      "Exploitation des ressources naturelles",
      "Programmes fédéraux dans le domaine social",
      "Continentalisation de l'économie",
      "Commission Laurendeau-Dunton",
      "Négociations constitutionnelles",
      "Régime des pensionnats indiens du Canada",
      "Organisation socio-institutionnelle",
      "Activités éducatives",
      "Influence de la culture américaine",
      "Publicité",
      "Augmentation du pouvoir d'achat",
      "Libéralisme économique",
      "Conservatisme social",
      "Autonomie provinciale",
      "Cléricalisme",
      "Financement de l'éducation et de la santé",
      "Contestation",
      "Mouvement de décolonisation",
      "Identité territoriale",
      "Mouvement indépendantiste",
      "Création du Parti québécois",
      "Mesures économiques et sociales progressistes",
      "Création de ministères et de sociétés d'État",
      "Réforme des institutions démocratiques",
      "Protection de la langue française",
      "Droits et libertés de la personne",
      "Délégation du Québec à l'étranger",
      "Déconfessionnalisation",
      "Gains juridiques",
      "Autonomie économique",
      "Droits sexuels et reproductifs",
      "Métiers non traditionnels et activités professionnelles",
      "Chanson d'expression française",
      "Émergence du théâtre québécois",
      "Lieux de diffusion culturelle",
      "Diversité des manifestations culturelles",
      "Revendications territoriales et politiques",
      "Reconnaissance des droits ancestraux",
      "Politique indienne du Gouvernement du Canada",
      "Gouvernance",
      "Syndicalisation des employés de l'État",
      "Conflits",
      "Fronts communs",
      "Action sociale et politique des syndicats",
    ],
  },
  {
    id: 8,
    niveau: 4,
    periode: "De 1980 à nos jours",
    titre: "Les choix de société dans le Québec contemporain",
    question: "Expliquer les circonstances culturelles, économiques, politiques, sociales et territoriales qui ont amené, qui amènent ou qui amèneront les Québécois à faire d'importants choix démographiques, environnementaux, technologiques, etc.",
    concepts: ["Néolibéralisme", "Société civile", "Souverainisme"],
    rubriques: [
      "Redéfinition du rôle de l'État",
      "Droits des Autochtones",
      "Mondialisation de l'économie",
      "Statut politique du Québec",
      "Évolution sociodémographique",
      "Égalité hommes-femmes",
      "Industrie culturelle",
      "Question linguistique",
      "Préoccupations environnementales",
      "Dévitalisation de localités",
      "Relations internationales",
      "Ère de l'information",
    ],
    connaissances: [
      "Politiques néolibérales",
      "Financement des programmes sociaux",
      "Économie sociale",
      "Société civile",
      "Consultations publiques",
      "Neutralité de l'État",
      "Loi constitutionnelle de 1982",
      "Crise d'Oka",
      "Ententes et conventions",
      "Commission de vérité et réconciliation du Canada",
      "Québec inc.",
      "Accords de libre-échange",
      "Secteurs d'exportation",
      "Référendum sur la souveraineté-association",
      "Rapatriement de la Constitution",
      "Accord du lac Meech",
      "Commission Bélanger-Campeau",
      "Rapport Allaire",
      "Accord de Charlottetown",
      "Référendum sur la souveraineté",
      "Actions postréférendaires",
      "Vieillissement de la population",
      "Politique familiale",
      "Appartenance ethnoculturelle",
      "Santé publique",
      "Conditions de vie dans les collectivités autochtones",
      "Équité salariale",
      "Parité",
      "Conciliation travail-famille",
      "Financement de la culture",
      "Diffusion de la culture",
      "Politique culturelle",
      "Langue d'affichage",
      "Langue d'enseignement",
      "Langues autochtones",
      "Contrôle des normes environnementales",
      "Exploitation des ressources",
      "Villes mono-industrielles",
      "Services de proximité",
      "Mouvements migratoires",
      "Relève agricole",
      "Poids politique",
      "Représentation dans les organisations et conférences internationales",
      "Missions économiques",
      "Missions à l'étranger de l'armée canadienne",
      "Utilisation d'Internet",
      "Information continue",
      "Intégration et concentration des médias",
    ],
  },
] as const;

export const OPERATIONS_PFEQ = [
  "Établir des faits",
  "Situer dans le temps et dans l’espace",
  "Mettre en relation des faits",
  "Établir des comparaisons",
  "Déterminer des causes et des conséquences",
  "Établir des liens de causalité",
  "Déterminer des éléments de continuité et des changements",
] as const;

export const OPERATIONS_PFEQ_IDS = [
  "faits",
  "espace-temps",
  "mise-en-relation",
  "comparaisons",
  "causes-consequences",
  "liens-causalite",
  "continuite-changement",
] as const;

export const CRITERES_PFEQ = [
  "Utilisation appropriée de connaissances",
  "Représentation cohérente d’une période",
  "Rigueur de l’interprétation",
] as const;

export function trouverRealitePFEQ(periodeId: unknown): RealitePFEQ | undefined {
  const valeur = typeof periodeId === "number" || typeof periodeId === "string"
    ? Number(periodeId)
    : Number.NaN;
  return PFEQ_REALITES.find((realite) => realite.id === valeur);
}

export function filtrerResultatsPFEQParNiveau(
  resultats: readonly any[],
  niveau: NiveauPFEQ,
): any[] {
  return resultats.filter((resultat) => {
    const realite = trouverRealitePFEQ(resultat?.periodeId);
    return realite?.niveau === niveau;
  });
}

export function compterResultatsPFEQNonRattaches(resultats: readonly any[]): number {
  return filtrerResultatsPFEQNonRattaches(resultats).length;
}

/**
 * Conserve les résultats historiques dont la période ne correspond à aucune
 * réalité officielle. Ces données restent consultables, mais ne doivent pas
 * être attribuées à un niveau ou à une période PFEQ par déduction.
 */
export function filtrerResultatsPFEQNonRattaches(resultats: readonly any[]): any[] {
  return resultats.filter((resultat) => !trouverRealitePFEQ(resultat?.periodeId));
}

export type LigneExportResultatPFEQNonRattache = {
  groupe: string;
  eleve: string;
  date: string;
  operation: string;
  periodeDisponible: string;
};

export const STATUT_EXPORT_RESULTAT_PFEQ_NON_RATTACHE =
  "Aucun rattachement PFEQ n’a été déduit";

function echapperValeurCSV(valeur: string): string {
  return `"${String(valeur).replace(/"/g, '""')}"`;
}

/**
 * Prépare un export d’archives lisible dans un tableur. Le statut est répété
 * sur chaque ligne afin que l’absence de rattachement PFEQ reste explicite
 * même lorsque le fichier est trié ou partagé sans sa notice.
 */
export function genererCSVResultatsPFEQNonRattaches(
  lignes: readonly LigneExportResultatPFEQNonRattache[],
): string {
  const notice = [
    ["Statut PFEQ", STATUT_EXPORT_RESULTAT_PFEQ_NON_RATTACHE],
    ["Note", "Les données historiques sont conservées telles qu’elles étaient disponibles; aucune période PFEQ n’a été déduite."],
    [],
    ["Groupe", "Élève", "Date", "Opération", "Libellé de période disponible", "Rattachement PFEQ déduit"],
  ];
  const donnees = lignes.map((ligne) => [
    ligne.groupe,
    ligne.eleve,
    ligne.date,
    ligne.operation,
    ligne.periodeDisponible,
    "Non",
  ]);

  return "\uFEFF" + [...notice, ...donnees]
    .map((ligne) => ligne.map((valeur) => echapperValeurCSV(valeur || "")).join(";"))
    .join("\r\n") + "\r\n";
}

export function conceptsPFEQAutorises(periodeId: unknown): readonly string[] {
  return trouverRealitePFEQ(periodeId)?.concepts || [];
}

export function connaissancesPFEQAutorisees(periodeId: unknown): readonly string[] {
  return trouverRealitePFEQ(periodeId)?.connaissances || [];
}

/**
 * Nettoie les balises générées avant validation. Une sortie Gemini peut
 * conserver une balise officielle et en ajouter une autre qui ne provient
 * pas de la période; on garde alors uniquement les balises autorisées.
 * Lorsqu'une balise est entièrement absente, le premier élément officiel
 * fournit un rattachement déterministe plutôt qu'un écran d'erreur.
 */
export function normaliserRattachementPFEQ(question: any, periodeId = question?.periodeId): any {
  const realite = trouverRealitePFEQ(periodeId);
  if (!realite || !question || typeof question !== "object") return question;
  const concepts = Array.isArray(question.conceptsPfeq)
    ? [...new Set(question.conceptsPfeq.map(String).filter((concept: string) => realite.concepts.includes(concept)))]
    : [];
  const connaissances = Array.isArray(question.connaissancesPfeq)
    ? [...new Set(question.connaissancesPfeq.map(String).filter((connaissance: string) => realite.connaissances.includes(connaissance)))]
    : [];
  return {
    ...question,
    periodeId: question.periodeId ?? realite.id,
    conceptsPfeq: concepts.length > 0 ? concepts : [realite.concepts[0]],
    connaissancesPfeq: connaissances.length > 0 ? connaissances : [realite.connaissances[0]],
  };
}

export function contextePFEQ(periodeIds: readonly number[]): string {
  return PFEQ_REALITES
    .filter((realite) => periodeIds.includes(realite.id))
    .map((realite) => [
      `Période ${realite.id} — ${realite.periode}`,
      `Réalité officielle : ${realite.titre}`,
      `Question : ${realite.question}`,
      `Concepts prescrits : ${realite.concepts.join(", ")}`,
      `Rubriques officielles : ${realite.rubriques.join(", ")}`,
      `Connaissances officielles à cibler sans élargir le programme : ${realite.connaissances.join(", ")}`,
    ].join("\n"))
    .join("\n\n");
}

export type CouverturePFEQ = {
  niveau: NiveauPFEQ;
  periodes: Array<{
    periodeId: number;
    conceptsCouverts: string[];
    conceptsManquants: string[];
    connaissancesCiblees: string[];
    operationsCouverts: string[];
    operationsManquants: string[];
    activitesEnregistrees: number;
    activitesAvecBalises: number;
    activitesSansBalises: number;
    donneesInsuffisantes: boolean;
  }>;
};

export type GroupeResultatsPFEQ = {
  id: string;
  codes?: readonly string[];
};

function normaliserCodeResultat(code: unknown): string {
  return String(code || "").trim().toUpperCase();
}

/**
 * Rattache les résultats Firestore aux seuls codes des groupes de l'enseignant.
 * Le filtre « Tous » reste borné à la liste de groupes reçue : il ne doit jamais
 * transformer la collection globale des résultats en historique de l'enseignant.
 */
export function filtrerResultatsPFEQParGroupe(
  resultats: readonly any[],
  groupes: readonly GroupeResultatsPFEQ[],
  groupeId = "Tous",
): any[] {
  const groupesVisibles = groupeId === "Tous"
    ? groupes
    : groupes.filter((groupe) => groupe.id === groupeId);
  const codesVisibles = new Set(groupesVisibles.flatMap((groupe) => (groupe.codes || []).map(normaliserCodeResultat)));
  return resultats.filter((resultat) => codesVisibles.has(normaliserCodeResultat(resultat?.codeUtilise)));
}

/**
 * Audit indépendant de la forme des activités : il indique ce qui a été
 * explicitement ciblé et ce qui ne l'a pas encore été dans un corpus généré.
 */
export function auditerCouverturePFEQ(
  activites: readonly any[],
  niveau: NiveauPFEQ,
): CouverturePFEQ {
  const periodes = PFEQ_REALITES.filter((realite) => realite.niveau === niveau).map((realite) => {
    const correspondantes = activites.filter((activite) =>
      Number(activite?.periodeId) === realite.id,
    );
    const balisees = correspondantes.filter((activite) =>
      Array.isArray(activite?.conceptsPfeq) && activite.conceptsPfeq.length > 0
      && activite.conceptsPfeq.some((concept: unknown) => realite.concepts.includes(String(concept)))
      && Array.isArray(activite?.connaissancesPfeq) && activite.connaissancesPfeq.length > 0
      && activite.connaissancesPfeq.some((connaissance: unknown) => realite.connaissances.includes(String(connaissance))),
    );
    const conceptsCouverts = [...new Set(balisees.flatMap((activite) =>
      Array.isArray(activite?.conceptsPfeq) ? activite.conceptsPfeq : [],
    ))].filter((concept) => realite.concepts.includes(concept));
    const connaissancesCiblees = [...new Set(balisees.flatMap((activite) =>
      Array.isArray(activite?.connaissancesPfeq) ? activite.connaissancesPfeq : [],
    ))].filter((connaissance) => realite.connaissances.includes(connaissance));
    const operationsCouverts = [...new Set(balisees
      .map((activite) => operationPFEQCanonique(activite))
      .filter((operation): operation is string => Boolean(operation)))];
    return {
      periodeId: realite.id,
      conceptsCouverts,
      conceptsManquants: realite.concepts.filter((concept) => !conceptsCouverts.includes(concept)),
      connaissancesCiblees,
      operationsCouverts,
      operationsManquants: OPERATIONS_PFEQ.filter((operation) => !operationsCouverts.includes(operation)),
      activitesEnregistrees: correspondantes.length,
      activitesAvecBalises: balisees.length,
      activitesSansBalises: correspondantes.length - balisees.length,
      donneesInsuffisantes: balisees.length === 0,
    };
  });
  return { niveau, periodes };
}

function operationPFEQCanonique(activite: any): string | undefined {
  const operationId = String(activite?.operationId || "").trim();
  const indexParId = OPERATIONS_PFEQ_IDS.indexOf(operationId as (typeof OPERATIONS_PFEQ_IDS)[number]);
  if (indexParId >= 0) return OPERATIONS_PFEQ[indexParId];

  const operation = String(activite?.operation || "").trim().toLocaleLowerCase("fr");
  return OPERATIONS_PFEQ.find((nom) => nom.toLocaleLowerCase("fr") === operation);
}