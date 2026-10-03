// Example visitors for the landing-page wizard. Their first emails use relative dates
// ("next Saturday") so the demo always asks for a date in the future.
export interface Persona {
  id: string;
  name: string;
  language: string;
  domain: string;
  message: string;
  english: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "anna",
    name: "Anna Becker",
    language: "German",
    domain: "example.de",
    message:
      "Hallo Noor,\n\nwir sind zu dritt und würden gerne nächsten Samstag vormittags eure Kaffeefarm besuchen. Geht das?\n\nViele Grüße\nAnna",
    english:
      "There are three of us and we'd love to visit your coffee farm next Saturday morning. Is that possible?",
  },
  {
    id: "claire",
    name: "Claire Dubois",
    language: "French",
    domain: "example.fr",
    message:
      "Bonjour Noor,\n\nNous sommes deux et nous aimerions visiter votre ferme de café samedi prochain dans l'après-midi. Est-ce possible ?\n\nMerci,\nClaire",
    english:
      "There are two of us and we'd like to visit your coffee farm next Saturday afternoon. Is that possible?",
  },
  {
    id: "kenji",
    name: "Kenji Sato",
    language: "Japanese",
    domain: "example.jp",
    message:
      "ノールさん、こんにちは。\n\n来週の土曜日の午前中に、4人でコーヒー農園を見学したいです。可能でしょうか？\n\n佐藤健",
    english:
      "We are four and would like to visit the coffee farm next Saturday morning. Is that possible?",
  },
  {
    id: "lucia",
    name: "Lucía García",
    language: "Spanish",
    domain: "example.es",
    message:
      "¡Hola Noor!\n\nSomos dos y nos encantaría visitar la finca el próximo sábado por la mañana. ¿Es posible?\n\nUn saludo,\nLucía",
    english:
      "There are two of us and we'd love to visit the farm next Saturday morning. Is it possible?",
  },
];

export const personaById = (id: string | undefined) => PERSONAS.find((p) => p.id === id);

// A fresh address per run, so each wizard run starts a new conversation instead of
// continuing an earlier booking by the same visitor.
export const demoEmail = (p: Persona) => `${p.id}.${Date.now().toString(36).slice(-5)}@${p.domain}`;
