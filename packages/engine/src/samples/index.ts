// Sample reviews for the demo and the eval: 42 multilingual reviews written for Noor's farm.
//
// These are WRITTEN EXAMPLES, not real visitor reviews. They mention only what the farm really
// offers (two tours a day, up to 8 people, 25,000 TZS each, roasting beans over a fire, the
// tasting, the road from Moshi) and invent no other facilities or prices.
//
// What they plant, as shares of the 42 reviews, so the counts an insights page shows mean something:
//   loved   roasting their own beans (coffee_process) ~45%, Noor's warmth and stories (host) ~40%,
//           the view and the walk (landscape) ~30%, the tasting ~30%, farm life ~15%
//   wished  finding the farm (access) ~25%, a slope that is too steep or has no shade or rest stop
//           (landscape, facilities) ~20%, no food ~15%, toilets ~8%, slow booking replies ~8%
//   ideas   sell roasted beans to take home ~20%, a lunch with farm food ~15%, a longer
//           harvest-season experience or stay ~8%, a shorter tour for children ~5%, and two one-offs
//   tone    ~70% positive, ~20% neutral (mixed), ~10% negative
// Hard cases: praise and a complaint about the same aspect (r36), no specific aspect (r38, r40),
// an idea phrased as a question (r05, r17), a very short review (r18) and a long one (r24).
//
// `labels` are the eval's ground truth: they record only what the text itself says. Conventions:
//  - Roasting beans over the fire is coffee_process; a steep or long slope is landscape; shade,
//    seats and toilets are facilities.
//  - A wish says something was missing or bad. An idea suggests something new to offer, so "you
//    should sell the beans" is an idea only, while "there was no shade" is a wish only.
//  - Sentiment is the overall tone; reviews that weigh praise against complaints are neutral.
import type { Aspect, ReviewAnalysis } from "../ai/types";

export interface SampleReview {
  id: string;
  lang: string;
  text: string;
  /** Ground truth for the eval: what a careful reader finds in the review. */
  labels: {
    sentiment: "positive" | "neutral" | "negative";
    loved: Aspect[];
    wished: Aspect[];
    /** Short English descriptions of the visitor's suggestions. */
    ideas: string[];
  };
  /** A verified model analysis, so loading the samples costs no tokens. Filled by a script. */
  analysis?: ReviewAnalysis;
}

// The four planted ideas keep one wording each, so counting labels gives the planted counts.
const SELL_BEANS = "sell roasted beans to take home";
const FARM_LUNCH = "offer a lunch with farm food";
const HARVEST_STAY = "offer a longer harvest-season experience or stay at the farm";
const KIDS_TOUR = "offer a shorter tour suitable for children";

export const SAMPLE_REVIEWS: SampleReview[] = [
  {
    id: "r01",
    lang: "de",
    text: "Ein Highlight unserer Tansania-Reise! Wir durften die Bohnen selbst über dem Feuer rösten, und der Duft war unbeschreiblich. Noor erzählt so lebendig von ihrem Leben als Kaffeebäuerin, dass man ihr ewig zuhören könnte. Mein Tipp: Verkauft doch die frisch gerösteten Bohnen zum Mitnehmen, ich hätte sofort drei Packungen als Mitbringsel gekauft.",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "host"],
      wished: [],
      ideas: [SELL_BEANS],
    },
  },
  {
    id: "r02",
    lang: "en",
    text: "It took three days to get a reply to my booking email, so I was a bit nervous. But the walk up through the coffee trees is gorgeous and Noor is such a warm, funny guide. Would do it again!",
    labels: {
      sentiment: "positive",
      loved: ["landscape", "host"],
      wished: ["communication"],
      ideas: [],
    },
  },
  {
    id: "r03",
    lang: "ja",
    text: "ヌールさんはとても親切で、コーヒーの話も勉強になりました。ただ、農園までの道がわかりにくく、緑の「Kahawa」の看板を見逃して何度も行き過ぎてしまいました。また、斜面の途中に日陰や休める場所がなく、午後の回は少しつらかったです。全体としては、良かった点と残念だった点が半々でした。",
    labels: {
      sentiment: "neutral",
      loved: ["host"],
      wished: ["access", "facilities"],
      ideas: [],
    },
  },
  {
    id: "r04",
    lang: "fr",
    text: "Une matinée inoubliable ! Noor nous a parlé de sa vie de caféicultrice avec beaucoup de chaleur, puis nous avons torréfié nos propres grains sur le feu, un moment magique, avant de déguster un café incroyable. Vous devriez proposer un séjour de quelques jours à la saison de la récolte, pour cueillir les cerises avec elle et dormir à la ferme : je réserve tout de suite !",
    labels: {
      sentiment: "positive",
      loved: ["host", "coffee_process", "tasting"],
      wished: [],
      ideas: [HARVEST_STAY],
    },
  },
  {
    id: "r05",
    lang: "es",
    text: "Noor es encantadora y cuenta sus historias con mucho cariño. Tostar los granos nosotros mismos sobre el fuego fue lo mejor de la mañana. Una sugerencia: ¿y si ofrecieran un almuerzo con los frijoles y el maíz de la propia finca? Sería el cierre perfecto.",
    labels: {
      sentiment: "positive",
      loved: ["host", "coffee_process"],
      wished: [],
      ideas: [FARM_LUNCH],
    },
  },
  {
    id: "r06",
    lang: "de",
    text: "Leider kein schöner Start: Auf unsere E-Mail kam erst nach vier Tagen eine Antwort, und dann haben wir die Farm erst nach einer Stunde Suchen gefunden. Das grüne Schild nach der Schule ist winzig, wir sind an der Abzweigung vorbeigefahren und haben die Tour um 9 Uhr verpasst. Noor war zwar freundlich und hat uns in die Nachmittagsgruppe gesteckt, aber der Tag war für uns gelaufen. Eher keine Empfehlung.",
    labels: {
      sentiment: "negative",
      loved: ["host"],
      wished: ["communication", "access"],
      ideas: [],
    },
  },
  {
    id: "r07",
    lang: "nl",
    text: "Zelf koffiebonen roosteren boven het vuur was echt top! En de koffie smaakte daarna veel beter dan thuis. Alleen de weg ernaartoe was lastig te vinden, dat groene bordje na de basisschool is zo makkelijk te missen.",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "tasting"],
      wished: ["access"],
      ideas: [],
    },
  },
  {
    id: "r08",
    lang: "it",
    text: "Che bella mattinata! Abbiamo tostato i chicchi sul fuoco, un'esperienza fantastica, e poi assaggiato il caffè: un profumo e un sapore che non dimenticherò. Un consiglio: vendete anche i chicchi tostati in piccoli sacchetti, ne avrei comprati volentieri un paio da portare a casa.",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "tasting"],
      wished: [],
      ideas: [SELL_BEANS],
    },
  },
  {
    id: "r09",
    lang: "ja",
    text: "自分たちで生豆を焚き火で焙煎する体験が、旅行のハイライトになりました。焙煎したての豆で淹れたコーヒーは香りが全然違い、思わず感動しました。ヌールさんは終始笑顔で、いろいろなエピソードを話してくれて、とても温かい気持ちになりました。",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "tasting", "host"],
      wished: [],
      ideas: [],
    },
  },
  {
    id: "r10",
    lang: "en",
    text: "Tour was okay, roasting the beans over the fire was the best part. we got lost for 20 mins looking for the turn after the school tho, and after the 2pm tour we were starving with nothing to eat nearby. a lunch made with whatever grows on the farm would really round it off",
    labels: {
      sentiment: "neutral",
      loved: ["coffee_process"],
      wished: ["access", "food"],
      ideas: [FARM_LUNCH],
    },
  },
  {
    id: "r11",
    lang: "de",
    text: "Wir haben viel über das Leben auf dem Land gelernt: Weiter unten wachsen Mais und Bohnen, und Noor hat uns erzählt, was es bedeutet, Mitglied der Kaffee-Genossenschaft zu sein. Sehr ehrlich und nahbar! Nach dem Rundgang hatten wir allerdings richtig Hunger, und in der Nähe gab es nichts zu essen. Ein einfaches Mittagessen mit Bohnen und Mais vom eigenen Feld wäre die perfekte Ergänzung.",
    labels: {
      sentiment: "positive",
      loved: ["farm_life", "host"],
      wished: ["food"],
      ideas: [FARM_LUNCH],
    },
  },
  {
    id: "r12",
    lang: "sw",
    text: "Nimefurahi sana kutembelea shamba la Dada Noor! Alitukaribisha kwa moyo mkunjufu na kutusimulia hadithi nyingi za maisha yake kama mkulima. Nimependa pia kuona maisha ya shambani: mahindi na maharage chini ya mteremko, na chama cha ushirika wa kahawa anachoshiriki. Kukaanga kahawa wenyewe kwenye moto ndiyo sehemu niliyoipenda zaidi, na ladha yake ilikuwa ya kipekee. Nitawaleta wazazi wangu wakati mwingine.",
    labels: {
      sentiment: "positive",
      loved: ["host", "farm_life", "coffee_process", "tasting"],
      wished: [],
      ideas: [],
    },
  },
  {
    id: "r13",
    lang: "nl",
    text: "Interessant om te zien hoe het leven op een koffieboerderij eruitziet, met maïs en bonen lager op de helling en de coöperatie waar Noor lid van is. We moesten alleen erg lang wachten op antwoord op onze boekingsmail, en na afloop was er niets te eten. Al met al gemengde gevoelens: ik zou het misschien nog eens doen als dat beter geregeld is.",
    labels: {
      sentiment: "neutral",
      loved: ["farm_life"],
      wished: ["communication", "food"],
      ideas: [],
    },
  },
  {
    id: "r14",
    lang: "pt",
    text: "Como brasileira, achei incrível ver o café sendo torrado na fogueira e ainda poder torrar os meus próprios grãos! A Noor é uma anfitriã super simpática. Fica a dica: vendam pacotinhos do café torrado (eu levaria vários!) e, quem sabe, ofereçam um almoço com comida da roça no final.",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "host"],
      wished: [],
      ideas: [SELL_BEANS, FARM_LUNCH],
    },
  },
  {
    id: "r15",
    lang: "fr",
    text: "tres bonne expérience, la balade entre les caféiers est top et la vue aussi. on a torréfié nos grains sur le feu, un super moment, et le café à la fin etait délicieux. seul bémol : pas de toilettes sur place, pensez-y avant de monter !",
    labels: {
      sentiment: "positive",
      loved: ["landscape", "coffee_process", "tasting"],
      wished: ["facilities"],
      ideas: [],
    },
  },
  {
    id: "r16",
    lang: "es",
    text: "Me gustó ver cómo es la vida en una finca de café: el maíz y los frijoles más abajo, la cooperativa de la que Noor forma parte, el ritmo de la gente. Lo que no me gustó es que no había nada para comer al terminar y a esa hora ya teníamos mucha hambre. En conjunto, una experiencia regular. Sería interesante añadir una visita a la cooperativa.",
    labels: {
      sentiment: "neutral",
      loved: ["farm_life"],
      wished: ["food"],
      ideas: ["add a visit to the local coffee cooperative"],
    },
  },
  {
    id: "r17",
    lang: "en",
    text: "Noor was a wonderful host and the coffee we tasted at the end was the best I've had on this trip. Have you ever thought about selling the roasted beans? I'd happily have bought a kilo to take home!",
    labels: {
      sentiment: "positive",
      loved: ["host", "tasting"],
      wished: [],
      ideas: [SELL_BEANS],
    },
  },
  {
    id: "r18",
    lang: "ja",
    text: "焙煎体験が最高でした！",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process"],
      wished: [],
      ideas: [],
    },
  },
  {
    id: "r19",
    lang: "fr",
    text: "Déçue. Le panneau vert « Kahawa » est minuscule, nous nous sommes perdus deux fois, et la piste de terre jusqu'à la ferme est franchement mauvaise. Pas une zone d'ombre sur toute la montée, ni un endroit où s'asseoir. L'organisation laisse vraiment à désirer.",
    labels: {
      sentiment: "negative",
      loved: [],
      wished: ["access", "facilities"],
      ideas: [],
    },
  },
  {
    id: "r20",
    lang: "de",
    text: "war richtig cool! das rösten übers feuer hat total spaß gemacht und der kaffe danach schmeckt echt anders als alles was ich kenne. die aussicht von oben ist auch der hammer, nur schatten gibts auf dem weg nach oben null. gerne wieder",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "tasting", "landscape"],
      wished: ["facilities"],
      ideas: [],
    },
  },
  {
    id: "r21",
    lang: "zh",
    text: "坡上的景色太美了，穿过咖啡树一路往上走，心情特别好。最有意思的是自己在火上烘焙咖啡豆，香味扑鼻。唯一的遗憾是结束后附近没有地方吃饭，肚子饿得咕咕叫。如果能买到烘焙好的咖啡豆带回家就更好了。",
    labels: {
      sentiment: "positive",
      loved: ["landscape", "coffee_process"],
      wished: ["food"],
      ideas: [SELL_BEANS],
    },
  },
  {
    id: "r22",
    lang: "es",
    text: "Las vistas desde la ladera son preciosas y el café que probamos al final estaba buenísimo. Eso sí, encontrar la finca nos costó: el cartel verde de «Kahawa» después de la escuela primaria es pequeño y pasamos de largo dos veces. Aun así, volveríamos.",
    labels: {
      sentiment: "positive",
      loved: ["landscape", "tasting"],
      wished: ["access"],
      ideas: [],
    },
  },
  {
    id: "r23",
    lang: "it",
    text: "Esperienza nella media: Noor è molto accogliente e ci ha spiegato tutto con pazienza, ma con due bambini piccoli la salita è stata davvero faticosa. Un giro più breve pensato per le famiglie sarebbe un'ottima idea.",
    labels: {
      sentiment: "neutral",
      loved: ["host"],
      wished: ["landscape"],
      ideas: [KIDS_TOUR],
    },
  },
  {
    id: "r24",
    lang: "en",
    text: "We booked this tour on a whim while staying in Moshi and it ended up being the best day of our two weeks in Tanzania. Noor was a wonderful guide: she met us where the track ends and walked us up the slope between the coffee trees, explaining everything from picking to pulping to drying, and the views over the valley kept getting better. Lower down she showed us the maize and beans and told us about the cooperative she belongs to, which gave us a real sense of what a farming year looks like here. Then we roasted our own beans over a fire, which was the highlight for me, and drank the result: honestly the best cup of coffee I've had in years. The only hiccup was finding the place: the green Kahawa sign after the primary school is easy to miss and the dirt track beyond it looks like it leads nowhere. One idea: sell small bags of the roasted beans and maybe offer a few days at harvest time, because half our group wanted to take some home and the other half wanted to come back and pick.",
    labels: {
      sentiment: "positive",
      loved: ["host", "coffee_process", "landscape", "tasting", "farm_life"],
      wished: ["access"],
      ideas: [SELL_BEANS, HARVEST_STAY],
    },
  },
  {
    id: "r25",
    lang: "ja",
    text: "斜面を登りながら見渡す景色が本当に素晴らしかったです。もしできるなら、焙煎した豆を小分けにしてお土産として買えるようになると、もっとうれしいです。",
    labels: {
      sentiment: "positive",
      loved: ["landscape"],
      wished: [],
      ideas: [SELL_BEANS],
    },
  },
  {
    id: "r26",
    lang: "de",
    text: "Das Rösten über dem offenen Feuer war richtig gut, keine Frage. Aber der Aufstieg am Hang ist steil, und unterwegs gibt es weder Schatten noch eine Bank zum Ausruhen. Bei der Tour um 14 Uhr in der prallen Sonne war das für meine Mutter (68) ziemlich anstrengend. Unterm Strich ein gemischter Eindruck.",
    labels: {
      sentiment: "neutral",
      loved: ["coffee_process"],
      wished: ["landscape", "facilities"],
      ideas: [],
    },
  },
  {
    id: "r27",
    lang: "pt",
    text: "Passeio lindíssimo pelo meio dos cafeeiros, com uma vista que vale a viagem. Tivemos alguma dificuldade em encontrar a quinta, porque o letreiro verde depois da escola é pequeno, mas torrar nós próprios os grãos ao lume foi o ponto alto do dia. Voltaremos!",
    labels: {
      sentiment: "positive",
      loved: ["landscape", "coffee_process"],
      wished: ["access"],
      ideas: [],
    },
  },
  {
    id: "r28",
    lang: "fr",
    text: "J'ai adoré voir le quotidien d'une ferme de café : le maïs et les haricots plus bas sur la pente, la coopérative dont Noor fait partie, le rythme des journées. Petite suggestion : proposez un déjeuner avec les produits de la ferme à la fin de la visite, je suis sûre que beaucoup de visiteurs en seraient ravis.",
    labels: {
      sentiment: "positive",
      loved: ["farm_life"],
      wished: [],
      ideas: [FARM_LUNCH],
    },
  },
  {
    id: "r29",
    lang: "sw",
    text: "Kahawa ilikuwa tamu sana, ila tulipata shida kulifikia shamba. Kibao cha kijani cha «Kahawa» baada ya shule ya msingi ni kidogo, tukakipita mara mbili. Baada ya ziara hatukupata chakula chochote, na tulikuwa na njaa. Ingependeza kama mngetoa chakula cha mchana kwa kutumia mazao ya shamba lenyewe. Kwa ujumla ilikuwa sawa tu.",
    labels: {
      sentiment: "neutral",
      loved: ["tasting"],
      wished: ["access", "food"],
      ideas: [FARM_LUNCH],
    },
  },
  {
    id: "r30",
    lang: "de",
    text: "Der Weg zur Farm war ein kleines Abenteuer: Nach der Grundschule haben wir das grüne Kahawa-Schild gleich zweimal übersehen, und der Feldweg zum Schluss sieht aus, als würde er ins Nichts führen. Aber oben wurden wir mit einer traumhaften Aussicht über die Hügel belohnt – es hat sich absolut gelohnt.",
    labels: {
      sentiment: "positive",
      loved: ["landscape"],
      wished: ["access"],
      ideas: [],
    },
  },
  {
    id: "r31",
    lang: "nl",
    text: "Prachtige wandeling tussen de koffieplanten, en Noor vertelt met zoveel warmte dat je aan haar lippen hangt. Voor onze kinderen van 5 en 7 was de rondleiding wel een beetje te lang. Een kortere versie voor gezinnen met kleine kinderen zou fantastisch zijn!",
    labels: {
      sentiment: "positive",
      loved: ["landscape", "host"],
      wished: ["timing"],
      ideas: [KIDS_TOUR],
    },
  },
  {
    id: "r32",
    lang: "en",
    text: "Honestly disappointed. After the drive from Moshi there was no toilet at the farm, and nowhere to sit or get out of the sun on the way up. For 25,000 TZS each I expected a lot more comfort, so I can't really recommend it.",
    labels: {
      sentiment: "negative",
      loved: [],
      wished: ["facilities", "value"],
      ideas: [],
    },
  },
  {
    id: "r33",
    lang: "ko",
    text: "Noor 씨가 정말 따뜻하게 맞아 주셨고, 직접 불에 원두를 볶아 본 것도 오래 기억에 남을 것 같아요. 다만 산비탈이 꽤 가팔라서 올라가는 길이 조금 힘들었어요.",
    labels: {
      sentiment: "positive",
      loved: ["host", "coffee_process"],
      wished: ["landscape"],
      ideas: [],
    },
  },
  {
    id: "r34",
    lang: "es",
    text: "que experiencia!! me encanto tostar los granos en el fuego y el cafe recien hecho estaba buenisimo. ojala vendieran bolsitas de cafe tostado para llevar, yo compraba 3 jaja",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "tasting"],
      wished: [],
      ideas: [SELL_BEANS],
    },
  },
  {
    id: "r35",
    lang: "it",
    text: "Un'esperienza autentica: Noor ci ha accolti come amici e ci ha fatto sentire a casa. Sarebbe bellissimo poter fermarsi qualche giorno in fattoria durante la raccolta e aiutarla con le ciliegie di caffè: se organizzate qualcosa del genere, noi ci siamo!",
    labels: {
      sentiment: "positive",
      loved: ["host"],
      wished: [],
      ideas: [HARVEST_STAY],
    },
  },
  {
    id: "r36",
    lang: "fr",
    text: "La vue sur les collines est magnifique, c'est certain, mais la montée est vraiment raide et il n'y a ni ombre ni banc pour souffler. Avec ma mère de 70 ans, nous avons dû nous arrêter plusieurs fois en plein soleil. Magnifique, mais éprouvant.",
    labels: {
      sentiment: "neutral",
      loved: ["landscape"],
      wished: ["landscape", "facilities"],
      ideas: [],
    },
  },
  {
    id: "r37",
    lang: "ja",
    text: "最大8人の少人数制なので質問もしやすく、ゆったり楽しめました。最後に飲んだコーヒーは酸味と甘みのバランスがよく、とても美味しかったです。家でも美味しく淹れられるように、淹れ方のミニ講座などがあったらさらに嬉しいです。",
    labels: {
      sentiment: "positive",
      loved: ["group", "tasting"],
      wished: [],
      ideas: ["teach visitors how to brew coffee at home"],
    },
  },
  {
    id: "r38",
    lang: "en",
    text: "Great, thanks! Would recommend.",
    labels: { sentiment: "positive", loved: [], wished: [], ideas: [] },
  },
  {
    id: "r39",
    lang: "es",
    text: "No lo recomiendo. Pagamos 25.000 TZS por persona y me pareció caro para lo que se ofrece: una subida muy empinada y poco más. Me fui con la sensación de que no valió la pena.",
    labels: {
      sentiment: "negative",
      loved: [],
      wished: ["value", "landscape"],
      ideas: [],
    },
  },
  {
    id: "r40",
    lang: "de",
    text: "Hat uns sehr gut gefallen, danke!",
    labels: { sentiment: "positive", loved: [], wished: [], ideas: [] },
  },
  {
    id: "r41",
    lang: "fr",
    text: "Torréfier soi-même le café sur le feu, c'était génial, et pour 25 000 TZS par personne on en a largement pour son argent !",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process", "value"],
      wished: [],
      ideas: [],
    },
  },
  {
    id: "r42",
    lang: "de",
    text: "Landschaftlich wunderschön, und Noor ist eine tolle Gastgeberin. Die Buchung per Mail hat allerdings ewig gedauert: Erst nach einer Woche kam eine SMS, da hatten wir fast schon woanders gebucht. Und nach der langen Anfahrt gab es oben nicht einmal eine Toilette. Gemischte Gefühle.",
    labels: {
      sentiment: "neutral",
      loved: ["landscape", "host"],
      wished: ["communication", "facilities"],
      ideas: [],
    },
  },
];
