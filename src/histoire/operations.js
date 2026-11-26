const OPERATIONS_BASE = [
  {
    id: "faits",
    num: "1",
    nom: "Établir des faits",
    def: "Identifier un fait — un événement, une action ou une situation vérifiable et appuyé par une preuve — à partir d’un ou plusieurs documents. C’est la base de toutes les autres opérations intellectuelles.",
    consigneType: `identifier ou vérifier un fait précis à partir d'un document fourni.

Respecte impérativement ce style (exemple, à ne jamais réutiliser tel quel):
"« À l’aide du document ci-dessous, énoncez un fait concernant l’arrivée des Loyalistes au Québec après 1783. »"

Règles de style à respecter absolument:
1. La consigne demande UN SEUL fait précis, pas une liste de faits.
2. Le fait demandé ne doit PAS être écrit ou paraphrasé nulle part ailleurs dans la consigne — l'élève doit le trouver dans le document, pas le recopier depuis la question.`,
     formatAttendu: "Un mot-clé, une date, un nom ou une courte phrase factuelle qui énonce un seul fait exact; ajouter une preuve seulement si la consigne le demande.",
     bareme: { points: 1, detail: "1 point pour le fait exact identifié." },
    criteresObligatoires: [
      "Identifier un seul acteur, groupe, institution, gouvernement, action, mesure, loi, rôle, territoire, activité économique, mouvement de pensée ou phénomène historique.",
       "Associer le fait à un aspect politique, économique, social, culturel ou territorial seulement si la consigne le demande explicitement.",
      "Appuyer le fait sur un indice précis du document sans révéler la réponse dans la consigne."
    ]
  },
  {
    id: "espace-temps",
    num: "2",
    nom: "Situer dans le temps et dans l’espace",
    def: "Lier un fait au bon territoire (à l’aide d’une carte) ou le placer au bon moment sur une ligne du temps.",
    consigneType: `situer un fait dans l’espace (lieu/territoire) à l’aide d’une carte OU le situer dans le temps (période/date) à l’aide de documents textuels.

Respecte impérativement ce style (exemple, à ne jamais réutiliser tel quel):
"« À l’aide du document ci-dessous, situez dans le temps le moment où la Loi sur les mesures de guerre a été adoptée. »"

Règles de style à respecter absolument:
1. Précise clairement si la tâche porte sur le TEMPS (une date, une période) ou sur L’ESPACE (un lieu, un territoire) — jamais les deux en même temps dans une même consigne.
2. Le document fourni doit contenir l'indice nécessaire (une date, un repère géographique) sans que la réponse exacte soit donnée en toutes lettres dans la consigne elle-même.`,
    formatAttendu: "Pour l’espace, localiser précisément un territoire sur la carte; pour le temps, donner une indication temporelle ou classer les éléments selon le repère demandé.",
    bareme: { pointsParElement: 1, pointsEspace: 1, pointsTemps: 4, detail: "1 point par élément correctement situé; 0,5 point si l’époque est correcte mais le repère reste inexact." },
    criteresObligatoires: [
      "Choisir une seule dimension par question : temps ou espace.",
      "Pour le temps : ordonner, situer, établir l’antériorité, la postériorité, la simultanéité ou la durée.",
      "Pour l’espace : localiser un territoire, l’associer à une période et utiliser des repères ou limites géographiques pertinents."
    ],
    marqueursRecommandes: [
      { typeLien: "Temps", marqueurs: "antérieur à, postérieur à, simultanément, avant, après, auparavant, au même moment" },
      { typeLien: "Espace", marqueurs: "au nord de, au sud de, à proximité de, le long de" }
    ]
  },
  {
    id: "mise-en-relation",
    num: "3",
    nom: "Mettre en relation des faits",
    def: "Associer un concept ou un fait historique abstrait à sa manifestation concrète ou à sa preuve descriptive dans un document source.",
    consigneType: `Dans un même thème historique, associez chaque fait ou réalité générale à la manifestation concrète qui l'illustre dans les documents. Pour chaque fait, inscrivez le numéro du document correspondant. Établissez deux ou trois associations distinctes; ne construisez pas une relation de cause à effet.

Cette opération sert à :
- regrouper des faits qui appartiennent à une même réalité historique;
- associer un fait général à un exemple, une manifestation ou une description concrète;
- justifier chaque association à l’aide d’un indice précis tiré du document.

Les faits peuvent être des actions, des événements, des mesures, des idéologies ou des activités économiques. Ils doivent tous éclairer un même thème ou une même affirmation historique. Chaque document doit présenter une manifestation concrète apparentée à un seul fait, avec un acteur, une action, une mesure, un lieu, une date ou un résultat observable. Le document ne doit jamais être une simple paraphrase du fait. La relation doit être fondée sur le sens historique, jamais sur une ressemblance de mots et jamais sur une explication de cause à effet.

Respecte impérativement ce style (voici un exemple du format attendu, à ne jamais réutiliser tel quel — invente un tout autre sujet historique):
"« À Ville-Marie, le projet missionnaire des fondateurs obtient des résultats contrastés. Pour chacun des faits généraux suivants, inscrivez le numéro du document qui présente une manifestation concrète apparentée :
- Les fondateurs veulent évangéliser et sédentariser les Autochtones.
- Le projet missionnaire obtient peu de résultats durables après quelques années. »"

Règles de style à respecter absolument:
1. Commence TOUJOURS par une brève mise en contexte qui nomme le thème commun, sans révéler les associations.
2. Les deux ou trois faits doivent appartenir à ce même thème. N'assemble jamais des événements indépendants seulement parce qu'ils se produisent dans la même période.
3. Formule les faits au niveau général et les documents au niveau concret. Un document doit illustrer le fait avec des indices historiques, pas le reformuler.
4. Chaque document doit correspondre à un seul fait et chaque fait à un seul document.
5. N’exige pas une explication causale et ne demande pas de construire une chaîne de causes et de conséquences.`,
     formatAttendu: "Un tableau, des flèches ou une liste explicite de correspondances; inscrire le numéro du document pour chaque fait et utiliser chaque numéro une seule fois; ne pas expliquer une cause ou une conséquence.",
     bareme: { pointsParElement: 1, pointsMinimum: 2, pointsMaximum: 3, detail: "1 point par association correcte; total de 2 ou 3 points selon le nombre d’éléments." },
    criteresObligatoires: [
      "Reconnaître le thème ou la réalité historique commune aux faits proposés.",
      "Associer chaque fait général à une manifestation concrète et distinctive présentée dans un document.",
      "Justifier l’association par un indice historique précis plutôt que par des mots identiques.",
      "Ne pas transformer cette opération en lien de causalité, en cause ou en conséquence."
    ],
    marqueursRecommandes: [
      { typeLien: "Relation significative", marqueurs: "est associé à, est lié à, correspond à, s’inscrit dans, illustre, témoigne de, contribue à, est caractéristique de" }
    ]
  },
  {
    id: "comparaisons",
    num: "4",
    nom: "Établir des comparaisons",
    def: "Dégager les ressemblances et les différences entre deux faits, situations ou points de vue d’acteurs historiques.",
    consigneType: `comparer deux faits, situations ou points de vue d’acteurs historiques présentés dans les documents, en identifiant au moins une ressemblance et une différence.

Respecte impérativement ce style (exemple, à ne jamais réutiliser tel quel):
"« À l’aide des documents ci-dessous, comparez la position du gouvernement provincial et celle du gouvernement fédéral à l’égard de la gestion des ressources naturelles. Nommez une ressemblance et une différence entre les deux positions. »"

Règles de style à respecter absolument:
1. Nomme clairement les DEUX éléments à comparer (deux acteurs, deux situations, deux groupes) — jamais de façon vague ("comparez les deux documents").
2. Les documents doivent présenter des positions ou situations suffisamment distinctes pour permettre une vraie comparaison, mais NE DOIS PAS énoncer toi-même la ressemblance ou la différence dans la consigne — c'est à l'élève de la découvrir.`,
    formatAttendu: "Deux phrases ou un court paragraphe qui présente les deux pôles selon le même critère, avec une similitude et une différence explicites.",
    bareme: { points: 2, detail: "1 point pour l’élément A et 1 point pour l’élément B; un seul pôle correctement décrit vaut 1 point." },
    criteresObligatoires: [
      "Nommer exactement deux éléments à comparer.",
      "Utiliser le même critère pour les deux éléments : conditions de vie, droits, pouvoir, activités économiques, revendications, idées ou autre critère historique explicite.",
      "Présenter au moins une similitude et une différence sans les révéler dans la consigne."
    ],
    marqueursRecommandes: [
      { typeLien: "Similitude", marqueurs: "tout comme, de même que, également, ont en commun" },
      { typeLien: "Différence", marqueurs: "alors que, contrairement à, tandis que, en revanche" }
    ]
  },
  {
    id: "causes-consequences",
    num: "5",
    nom: "Déterminer des causes et des conséquences",
    def: "Identifier ce qui a causé un événement historique, ou ce que cet événement a entraîné comme conséquence.",
    consigneType: `identifier UNE cause OU UNE conséquence d’un événement historique précis présenté dans le document — pas les deux à la fois, et pas une chaîne de plusieurs éléments (ça, c’est l’opération « Établir des liens de causalité »).

Respecte impérativement ce style (exemple, à ne jamais réutiliser tel quel):
"« À l’aide du document ci-dessous, nommez une conséquence de la construction du chemin de fer transcontinental sur le développement économique de l’Ouest canadien. »"

Règles de style à respecter absolument:
 1. Nomme clairement l'événement historique servant de point de départ (la cause si on demande une conséquence, ou l'événement dont on cherche la cause).
2. Précise EXPLICITEMENT si l'élève doit trouver une CAUSE ou une CONSÉQUENCE — jamais les deux, et jamais de façon ambiguë.
 3. Ne révèle jamais la cause ou la conséquence attendue dans la consigne elle-même — le document doit contenir l'indice, pas la question.
 4. Pour la version évaluée ici, demande aussi une brève justification du lien afin que le barème soit de 2 points.`,
      formatAttendu: "Une réponse courte qui identifie une cause OU une conséquence, suivie d’une brève justification si elle est demandée.",
      bareme: { points: 2, pointsSansJustification: 1, detail: "1 point pour la cause ou conséquence exacte; 1 point supplémentaire si la justification demandée est correcte." },
    criteresObligatoires: [
      "Demander une cause ou une conséquence, jamais les deux dans la même consigne.",
      "Nommer l’événement historique servant de point de départ.",
       "Préciser l’aspect politique, économique, social, culturel ou territorial du facteur ou de l’effet seulement si la consigne le demande."
    ],
    marqueursRecommandes: [
      { typeLien: "Cause", marqueurs: "parce que, puisque, à cause de, en raison de, étant donné que" },
      { typeLien: "Conséquence", marqueurs: "donc, ainsi, par conséquent, ce qui entraîne, ce qui provoque, il en résulte que" }
    ]
  },
  {
    id: "liens-causalite",
    num: "6",
    nom: "Établir des liens de causalité",
    def: "Lier trois faits ensemble en chaîne: le premier au deuxième, puis le deuxième au troisième (fait A → fait B → fait C). Aussi appelée « la question à trois picots ».",
    consigneType: `établir une chaîne de causalité entre trois énoncés fournis dans la question (sous forme de trois picots) et les lier avec les informations distinctes tirées des documents (A entraîne B, qui entraîne C). Pose la question puis donne les trois picots (aspects à lier pour répondre correctement).

Respecte impérativement ce style (voici un exemple du format attendu, à ne jamais réutiliser tel quel — invente un tout autre sujet historique):
"Expliquez comment l'action du gouvernement fédéral, suite à la mobilisation de la population, entraîne une réaction de la population québécoise. Dans votre réponse, vous devez préciser chacun des éléments ci-dessous et les lier entre eux.
- la mobilisation de la population lors de la guerre
- l'action du gouvernement fédéral
- la réaction de la population québécoise"

Règles de style à respecter absolument:
1. La phrase principale doit NOMMER directement les trois éléments à lier (jamais "le premier fait", "le deuxième élément", etc.)
2. Les trois picots doivent être de COURTES expressions nominales (quelques mots désignant un aspect général) — jamais des phrases complètes avec dates précises, noms propres détaillés ou événements très spécifiques.
3. La phrase principale doit indiquer seulement L'ORDRE des trois éléments (avec "suite à" ou "entraîne"), JAMAIS le mécanisme ou la raison du lien. N'utilise pas d'expressions qui expliquent déjà le COMMENT (comme "à travers", "par le biais de", "grâce à", "ce qui permet", "en raison de"). C'est justement ce que l'élève doit expliquer dans sa réponse — la question ne doit pas lui donner la réponse.
   MAUVAIS EXEMPLE (donne déjà le mécanisme): "un conflit armé, à travers le développement du commerce du bois, entraîne l'ouverture de nouvelles régions"
   BON EXEMPLE (indique seulement l'ordre): "le développement du commerce du bois, suite à un conflit armé en Europe, entraîne l'ouverture de nouvelles régions de colonisation"`,
     formatAttendu: "Un court paragraphe qui ordonne les trois faits et explique séparément A → B et B → C avec des marqueurs de relation.",
     bareme: { points: 3, detail: "1 point pour le lien A-B, 1 point pour le lien B-C, 1 point pour l’ordre chronologique et les marqueurs adéquats." },
    criteresObligatoires: [
      "Présenter exactement trois éléments : une cause initiale, un élément intermédiaire à la fois conséquence et cause, puis une conséquence finale.",
      "Expliquer séparément le lien A vers B et le lien B vers C.",
      "Ne pas confondre la chaîne causale avec une simple association de faits."
    ],
    marqueursRecommandes: [
      { typeLien: "Enchaînement causal", marqueurs: "ce qui entraîne, ce qui favorise, ce qui provoque, amène, par conséquent, donc, alors, engendre, a pour effet de" }
    ]
  },
  {
    id: "continuite-changement",
    num: "7",
    nom: "Déterminer des éléments de continuité et des changements",
    def: "En comparant une même réalité à deux moments différents dans l'histoire, identifier ce qui change et ce qui reste pareil (ou presque).",
    consigneType: `comparer une réalité précise à deux moments différents dans l'histoire du Québec, à l'aide des documents, en identifiant un élément de changement et un élément de continuité.

Respecte impérativement ce style (exemple, à ne jamais réutiliser tel quel):
"À l'aide des documents ci-dessous, comparez le rôle de l'Église catholique dans le système scolaire québécois entre 1950 et 1970. Précisez un élément de changement et un élément de continuité."

Règles de style à respecter absolument:
1. Nomme clairement la réalité comparée (une institution, une pratique, un groupe social) et les deux moments précis à comparer (deux dates, deux périodes).
2. Les deux documents doivent chacun représenter un des deux moments, avec assez de détails concrets pour que l'élève identifie lui-même ce qui change et ce qui reste stable — sans que la consigne ne révèle déjà le changement ou la continuité attendue.`,
     formatAttendu: "Deux phrases distinctes et explicites : une phrase sur le changement et une phrase sur la continuité, avec les deux moments et des preuves.",
     bareme: { points: 2, detail: "1 point pour un changement exact et 1 point pour une continuité exacte." },
    criteresObligatoires: [
      "Comparer la même réalité à deux moments historiques clairement nommés.",
      "Identifier séparément un changement et une continuité.",
      "Justifier les deux constats par un repère temporel et des preuves documentaires."
    ],
    marqueursRecommandes: [
      { typeLien: "Changement", marqueurs: "désormais, alors que, évolue vers, se transforme en, laisse place à, passe de" },
      { typeLien: "Continuité", marqueurs: "demeure, persiste, reste inchangé, continue de, se maintient" }
    ]
  }
];

const CADRES_OPERATION_INTELLECTUELLE = {
  faits: {
    num: "1",
    nom: "Établir des faits",
    def: "Identifier, extraire et nommer une information factuelle précise, vérifiable et exacte à partir d’un document source ou de ses connaissances.",
    consigneType: `Choisir l’une des formes de question suivantes selon le document fourni :
- question directe à réponse courte pour nommer un acteur, un groupe social, une mesure législative, une revendication, un traité, un événement ou une activité économique;
- question à choix multiple avec exactement quatre options A, B, C et D;
- relevé d’information guidé dans une affiche, une caricature ou un tableau statistique.

La consigne demande un ou deux faits distincts et indique clairement le nombre attendu. Elle ne révèle jamais le fait à trouver.`,
    formesQuestions: [
      {
        id: "reponse-courte",
        titre: "Question directe à réponse courte",
        description: "Nommer un ou deux faits précis à partir d’un document ou de ses connaissances.",
        exemple: "À partir du document 1, nommez une revendication des Patriotes en 1834.",
      },
      {
        id: "qcm",
        titre: "Question à choix multiple",
        description: "Identifier l’énoncé exact parmi quatre options A, B, C et D.",
      },
      {
        id: "releve-guide",
        titre: "Relevé d’information guidé",
        description: "Remplir une case ou extraire un fait précis d’une affiche, d’une caricature ou d’un tableau statistique.",
      },
    ],
    formesReponses: [
      "Un fait précis sous la forme d’un nom, d’une mesure, d’un événement ou d’une courte phrase factuelle.",
      "Deux faits distincts lorsque la consigne en exige deux.",
      "Une option A, B, C ou D pour le QCM.",
    ],
    formatAttendu: "Une réponse brève qui nomme exactement le ou les faits demandés; pour un QCM, une seule option parmi A, B, C ou D.",
    bareme: {
      pointsParFait: 1,
      pointsMinimum: 1,
      pointsMaximum: 2,
      points: 1,
      detail: "1 point pour un fait exact; 2 points lorsque deux faits distincts sont demandés, à raison de 1 point par fait.",
    },
    grilleEvaluation: [
      { points: 2, condition: "Deux faits distincts sont demandés et les deux sont exacts." },
      { points: 1, condition: "Un fait unique demandé est exact, ou un seul des deux faits demandés est exact." },
      { points: 0, condition: "Le ou les faits sont inexacts, non pertinents ou absents." },
    ],
    criteresObligatoires: [
      "Repérer l’information demandée dans le document ou dans ses connaissances.",
      "Nommer exactement le type de fait demandé.",
      "Fournir un fait précis, vérifiable et historiquement exact.",
      "Fournir deux faits distincts seulement lorsque la consigne en demande deux.",
    ],
  },
  "espace-temps": {
    num: "2",
    nom: "Situer dans le temps et dans l’espace",
    def: "Repérer, ordonner et localiser des réalités historiques dans leur cadre chronologique ou géographique et territorial.",
    consigneType: `Choisir une seule dimension par question.

Pour le temps :
- ordonner quatre faits historiques du plus ancien au plus récent;
- associer un événement à une période ou à une lettre sur une ligne du temps;
- déterminer si des faits se déroulent avant ou après un repère temporel.

Pour l’espace :
- associer un territoire, une frontière, une région de colonisation ou un tracé à une lettre sur une carte muette;
- choisir la carte correspondant au découpage territorial d’une date clé.`,
    formesQuestions: [
      { id: "ordre-chronologique", titre: "Ordonner chronologiquement", description: "Classer quatre faits du plus ancien au plus récent." },
      { id: "ligne-du-temps", titre: "Ligne du temps", description: "Associer un événement à une période ou à une lettre sur une frise graduée." },
      { id: "avant-apres", titre: "Antériorité et postériorité", description: "Indiquer si chaque fait survient avant ou après un repère donné." },
      { id: "carte-muette", titre: "Identification sur une carte", description: "Associer un territoire ou un tracé à une lettre sur une carte muette." },
      { id: "comparaison-cartes", titre: "Comparaison de cartes territoriales", description: "Identifier la carte correspondant au découpage d’une date clé." },
    ],
    formesReponses: [
      "Un ordre complet de quatre faits.",
      "Une lettre ou une période sur une ligne du temps.",
      "Une réponse avant ou après pour chaque fait.",
      "Une lettre ou une zone sélectionnée sur une carte.",
    ],
    formatAttendu: "Pour le temps, un classement, une association sur une frise ou un tableau avant/après; pour l’espace, une sélection sur une carte ou parmi des cartes territoriales.",
    bareme: {
      pointsQcm: 1,
      pointsEspace: 1,
      pointsTemps: 2,
      detail: "1 point pour un QCM sur carte ou frise; pour un reclassement chronologique, 2 points si l’ordre complet est exact, 1 point s’il est partiellement exact, 0 point sinon.",
    },
    grilleEvaluation: [
      { points: 2, condition: "L’ordre chronologique complet est exact." },
      { points: 1, condition: "L’ordre chronologique est partiellement exact, ou la réponse unique sur carte ou frise est exacte." },
      { points: 0, condition: "Le classement ou la localisation est inexact ou absent." },
    ],
    criteresObligatoires: [
      "Cibler uniquement le temps ou uniquement l’espace dans une même question.",
      "Utiliser le repère chronologique ou territorial fourni.",
      "Ordonner, associer ou localiser chaque élément selon la forme demandée.",
    ],
  },
  comparaisons: {
    num: "3",
    nom: "Dégager des différences et des similitudes",
    def: "Comparer la vision ou la position de trois acteurs historiques ou historiens sur un même enjeu afin de dégager leurs convergences et leurs divergences.",
    consigneType: `Présenter trois extraits textuels portant sur un même enjeu. Demander à l’élève :
1. d’identifier l’acteur dont la position se distingue de celle des deux autres;
2. d’expliquer la position de cet acteur;
3. d’expliquer la position commune ou comparable des deux autres acteurs;
4. d’utiliser des marqueurs comparatifs comme « tandis que », « alors que » ou « contrairement à ».

La consigne ne révèle ni l’acteur dissident ni les positions attendues.`,
    formesQuestions: [
      {
        id: "trois-points-de-vue",
        titre: "Comparer les points de vue de trois acteurs",
        description: "Identifier l’acteur qui se distingue des deux autres et confronter les positions sur un même enjeu.",
      },
    ],
    formesReponses: [
      "Un court texte qui identifie l’acteur dissident.",
      "Une explication de sa position et de la position des deux autres acteurs.",
      "Des marqueurs comparatifs explicites.",
    ],
    formatAttendu: "Un court paragraphe qui identifie l’acteur dissident et explique les deux positions opposées ou distinctes avec des marqueurs comparatifs.",
    bareme: {
      points: 3,
      detail: "3 points pour l’acteur dissident et les deux positions correctement expliquées; 2 points si une position est plus ou moins correcte; 1 point si une seule position est correcte ou si les deux sont imprécises; 0 point si l’acteur est incorrect ou si une seule position demeure imprécise.",
    },
    grilleEvaluation: [
      { points: 3, condition: "Acteur dissident correctement identifié et deux positions correctement expliquées." },
      { points: 2, condition: "Acteur dissident correctement identifié, une position correcte et une position plus ou moins correcte." },
      { points: 1, condition: "Acteur dissident correctement identifié avec deux positions imprécises ou une seule position correcte." },
      { points: 0, condition: "Acteur dissident incorrect ou omis, ou une seule position plus ou moins correcte." },
    ],
    criteresObligatoires: [
      "Comparer exactement trois acteurs ou historiens sur un même enjeu.",
      "Identifier l’acteur dont la position se distingue des deux autres.",
      "Expliquer correctement la position de l’acteur dissident.",
      "Expliquer correctement la position des deux autres acteurs.",
      "Employer un marqueur comparatif explicite.",
    ],
  },
  "causes-consequences": {
    num: "4",
    nom: "Déterminer des causes et des conséquences",
    def: "Distinguer l’origine d’une réalité historique de ce qui en résulte.",
    consigneType: `Choisir l’un des quatre modèles :
- déterminer une cause dans une réponse écrite à partir d’un document antérieur;
- déterminer une conséquence dans une réponse écrite à partir d’un document postérieur;
- retrouver deux documents qui illustrent deux causes;
- classer un document comme cause et un autre comme conséquence.

La consigne précise clairement ce qui est demandé sans révéler la réponse.`,
    formesQuestions: [
      { id: "cause-ecrite", titre: "Déterminer une cause", description: "Formuler un facteur explicatif à partir d’un document antérieur à l’événement." },
      { id: "consequence-ecrite", titre: "Déterminer une conséquence", description: "Formuler un effet direct à partir d’un document postérieur à l’événement." },
      { id: "deux-causes-documents", titre: "Déterminer deux causes", description: "Choisir les deux documents qui illustrent des causes." },
      { id: "cause-et-consequence-documents", titre: "Déterminer une cause et une conséquence", description: "Associer un document à la cause et un autre à la conséquence." },
    ],
    formesReponses: [
      "Une cause ou une conséquence formulée par écrit.",
      "Deux numéros de documents représentant deux causes.",
      "Un numéro de document pour la cause et un numéro pour la conséquence.",
    ],
    formatAttendu: "Une réponse écrite qui détermine une cause ou une conséquence, ou une sélection de deux documents selon la consigne.",
    bareme: {
      points: 2,
      detail: "Réponse écrite : 2 points si le facteur ou l’effet est correctement déterminé, 1 point s’il est plus ou moins correct, 0 point sinon. Sélection documentaire : 1 point par réponse exacte.",
    },
    grilleEvaluation: [
      { points: 2, condition: "Le facteur explicatif ou la conséquence est correctement déterminé, ou les deux sélections documentaires sont exactes." },
      { points: 1, condition: "Le facteur ou l’effet est plus ou moins correct, ou une sélection documentaire sur deux est exacte." },
      { points: 0, condition: "La réponse est inexacte, absente, ou aucune sélection n’est exacte." },
    ],
    criteresObligatoires: [
      "Distinguer une cause antérieure d’une conséquence postérieure.",
      "Déterminer précisément le facteur explicatif ou l’effet demandé.",
      "Appuyer la réponse sur le document pertinent.",
      "Classer correctement les deux documents lorsqu’une sélection documentaire est demandée.",
    ],
  },
  "continuite-changement": {
    num: "5",
    nom: "Déterminer des changements et des continuités",
    def: "Analyser l’évolution d’une réalité historique afin de déterminer ce qui s’est transformé ou ce qui est demeuré stable.",
    consigneType: `Choisir l’un des trois modèles :
- déterminer un changement en indiquant un fait qui démontre une rupture;
- déterminer une continuité en indiquant un fait qui démontre une persistance;
- prendre position entre changement et continuité à partir de deux documents représentant deux époques.

Pour la prise de position, l’élève doit répondre explicitement « changement » ou « continuité », justifier sa position avec des faits précis et fournir un repère temporel valide.`,
    formesQuestions: [
      { id: "changement", titre: "Déterminer un changement", description: "Indiquer un fait qui démontre une rupture." },
      { id: "continuite", titre: "Déterminer une continuité", description: "Indiquer un fait qui démontre la persistance d’une situation." },
      { id: "prise-position", titre: "Prendre position", description: "Déterminer s’il y a changement ou continuité entre deux époques et justifier la réponse." },
    ],
    formesReponses: [
      "Un fait précis démontrant un changement.",
      "Un fait précis démontrant une continuité.",
      "Une position explicite, des faits justificatifs et un repère de temps.",
    ],
    formatAttendu: "Une réponse qui nomme le changement ou la continuité; pour la prise de position, une position explicite suivie de faits précis et d’un repère temporel.",
    bareme: {
      points: 3,
      detail: "Jusqu’à 3 points selon la présence d’une position explicite, la qualité des faits historiques et la validité du repère temporel.",
    },
    grilleEvaluation: [
      { points: 3, condition: "Position explicite, faits corrects et précis, et repère temporel valide." },
      { points: 2, condition: "Position explicite avec faits corrects sans repère valide; faits imprécis avec repère valide; ou position omise malgré des faits exacts et un repère valide." },
      { points: 1, condition: "Position explicite avec faits imprécis sans repère valide; ou position omise avec faits partiellement exacts et repère valide." },
      { points: 0, condition: "Faits incorrects ou absents, ou réponse insuffisante selon la grille." },
    ],
    criteresObligatoires: [
      "Cibler une même réalité historique à deux moments distincts.",
      "Prendre explicitement position lorsqu’il faut choisir entre changement et continuité.",
      "Utiliser des faits historiques exacts et précis.",
      "Fournir un repère temporel valide.",
    ],
  },
  "mise-en-relation": {
    num: "6",
    nom: "Mettre en relation des faits",
    def: "Associer un concept ou un fait historique abstrait à sa manifestation concrète ou à sa preuve descriptive dans un document source.",
    consigneType: `Choisir l’un des deux modèles :
- demander à l’élève de retrouver, dans un dossier documentaire, les deux documents pertinents et d’inscrire leurs numéros;
- fournir quatre numéros de documents dans le libellé et demander de les apparier aux faits correspondants.

Les faits appartiennent à un même thème historique, sont formulés au niveau général et sont associés à des manifestations concrètes. Le document doit illustrer le fait, pas le reformuler. La tâche ne demande pas une cause ou une conséquence.`,
    formesQuestions: [
      { id: "deux-documents-a-trouver", titre: "Deux documents à trouver", description: "Retrouver de façon autonome les deux documents pertinents dans le dossier." },
      { id: "quatre-documents-imposes", titre: "Quatre documents imposés", description: "Apparier les quatre documents fournis aux faits ou énoncés correspondants." },
    ],
    formesReponses: [
      "Deux numéros de documents pertinents.",
      "Un appariement explicite entre les faits et les documents imposés.",
    ],
    formatAttendu: "Deux associations documentaires exactes, présentées sous forme de numéros ou d’appariements explicites; ne pas expliquer une cause ou une conséquence.",
    bareme: {
      points: 2,
      pointsParElement: 1,
      pointsMinimum: 2,
      pointsMaximum: 2,
      detail: "2 points au total, à raison de 1 point par association ou numéro exact.",
    },
    grilleEvaluation: [
      { points: 2, condition: "Les deux associations ou numéros sont exacts." },
      { points: 1, condition: "Une association ou un numéro sur deux est exact." },
      { points: 0, condition: "Aucune association n’est exacte ou la réponse est absente." },
    ],
    criteresObligatoires: [
      "Reconnaître le concept ou le fait abstrait à mettre en relation.",
      "Repérer sa manifestation concrète dans les documents.",
      "Choisir exactement deux documents ou réaliser les appariements imposés.",
      "Fonder chaque association sur le sens historique plutôt que sur une ressemblance de mots.",
    ],
  },
  "liens-causalite": {
    num: "7",
    nom: "Établir des liens de causalité",
    def: "Expliquer l’enchaînement logique complet qui relie trois faits historiques successifs.",
    consigneType: `Présenter une question à trois éléments, aussi appelée question à trois picots. L’élève doit :
- préciser chacun des trois éléments avec des faits exacts tirés des documents et de ses connaissances;
- expliquer le lien du premier élément vers le deuxième;
- expliquer le lien du deuxième élément vers le troisième;
- rédiger un texte fluide avec des connecteurs logiques de causalité.

La consigne nomme les trois composantes sans fournir le mécanisme causal attendu.`,
    formesQuestions: [
      { id: "trois-picots", titre: "Question à trois éléments", description: "Préciser trois composantes historiques et expliquer les deux liens qui les unissent." },
    ],
    formesReponses: [
      "Un texte fluide qui précise les trois éléments.",
      "Deux liens de causalité distincts : A vers B et B vers C.",
      "Des connecteurs logiques de causalité.",
    ],
    formatAttendu: "Un court texte qui précise les trois éléments historiques et formule les deux liens de causalité dans le bon ordre.",
    bareme: {
      points: 3,
      detail: "3 points pour trois éléments précisés et deux liens corrects; 2 points pour trois éléments et un lien, ou deux éléments et un lien; 1 point pour trois ou deux éléments sans lien correct; 0 point pour un seul élément ou aucun.",
    },
    grilleEvaluation: [
      { points: 3, condition: "Trois éléments historiques précisés et deux liens de causalité corrects." },
      { points: 2, condition: "Trois éléments précisés avec un lien correct, ou deux éléments précisés avec un lien correct." },
      { points: 1, condition: "Trois ou deux éléments précisés sans lien de causalité correct." },
      { points: 0, condition: "Un seul élément précisé ou aucun, peu importe la causalité." },
    ],
    criteresObligatoires: [
      "Préciser les trois éléments historiques avec des faits exacts.",
      "Formuler correctement le lien causal A vers B.",
      "Formuler correctement le lien causal B vers C.",
      "Respecter l’ordre de l’enchaînement causal.",
    ],
  },
};

export const OPERATIONS = OPERATIONS_BASE
  .map((operation) => ({
    ...operation,
    ...CADRES_OPERATION_INTELLECTUELLE[operation.id],
    consigneType: `${CADRES_OPERATION_INTELLECTUELLE[operation.id]?.consigneType || operation.consigneType || ""}\n\nCONTRAT DE LA TÂCHE À RÉALISER : formule une seule question historique directement liée aux documents (ou à la carte et aux documents pour une activité spatiale), avec un point d’interrogation. La question doit nommer explicitement les documents (par exemple « D’après les documents, … ? »). Ne décris pas la procédure à suivre et n’emploie pas de verbe directif dans cette question.`,
  }))
  .sort((operationA, operationB) => Number(operationA.num) - Number(operationB.num));

// Ces formulations font partie de l'interface pédagogique de l'activité
// « Situer dans le temps et dans l'espace ». Elles ne doivent pas dépendre de
// la formulation variable produite par le modèle.
export const CONSIGNES_ESPACE_TEMPS = Object.freeze({
  ordre: "Quelle suite chronologique les quatre événements décrits dans les documents forment-ils, du plus ancien au plus récent ?",
  "avant-apres": "Les faits décrits dans les quatre documents surviennent-ils avant ou après l’événement de référence ?",
  "suite-chronologique": "Quelle proposition présente la suite chronologique exacte des quatre événements décrits dans les documents, du plus ancien au plus récent ?",
});
