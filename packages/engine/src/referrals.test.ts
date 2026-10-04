// Referrals through the real engine modules, an in-memory repo and a scripted AI: a happy guest
// gets a code to pass on, and a new guest who quotes it is linked to them (Noor sees "rafiki wa").
import { describe, expect, it } from "vitest";
import { createContext } from "./context";
import { createEngine } from "./engine";
import type { IngestedReview } from "./feedback";
import { ensureReferralCode, findReferrer, followUpFeedback, referralCode } from "./referrals";
import { fakeAi, guestSays } from "./testing/fake-ai";
import { memoryRepo } from "./testing/memory-repo";
import type { Contact } from "./types";

const THANKS = "Thank you so much for your feedback — Noor will read every word.";
const OPTIONS = "Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine";

const review = (sentiment: IngestedReview["sentiment"]): IngestedReview => ({
  id: "review-1",
  sentiment,
  language: "de",
});

/** Picks alphabet positions in turn (0 is "A", 1 is "B"), standing in for Math.random. */
function rolls(...positions: number[]) {
  const queue = [...positions];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("out of rolls");
    return (next + 0.5) / 32;
  };
}

function setup() {
  const clock = () => new Date("2026-10-15T08:00:00Z");
  const { repo, data, noor } = memoryRepo(clock);
  const script = fakeAi();
  const deps = { repo, ai: script.ai, now: clock };
  const engine = createEngine(deps);
  const ctx = createContext(deps);
  let guests = 0;

  const guest = (name: string, email = `guest${++guests}@example.com`) =>
    repo.createGuest({ name, email, language: "de" });
  const guestWithCode = async (name: string, code: string, email?: string) => {
    const g = await guest(name, email);
    await repo.claimReferralCode(g.id, code);
    return repo.contact(g.id);
  };
  /** A booking of `who`; by default one whose visit has happened. */
  const visit = async (who: Contact, status = "VISITED") => {
    const b = await repo.createBooking(who.id, "A visit");
    return repo.updateBooking(b.id, { status });
  };
  /** A guest writes in; the AI reads it as `overrides` say (by default, a complete request). */
  const ask = (
    from: string,
    name: string,
    text: string,
    overrides: Parameters<typeof guestSays>[0] = {},
  ) => {
    script.guest(guestSays(overrides));
    return engine.handleInbound({
      channel: "email",
      sender: from,
      sender_name: name,
      text,
      provider_msg_id: crypto.randomUUID(),
    });
  };
  const outTo = (id: string) =>
    data.messages.filter((m) => m.direction === "out" && m.contact_id === id);
  const emailsTo = (who: Contact) => outTo(who.id).map((m) => m.text_original);
  const toNoor = () => outTo(noor.id).map((m) => m.text_original);
  const toNoorEn = () => outTo(noor.id).map((m) => m.text_en);
  const booking = (id: number) => data.bookings.find((b) => b.id === id);

  return { repo, ctx, guest, guestWithCode, visit, ask, emailsTo, toNoor, toNoorEn, booking };
}

describe("the reply to a review", () => {
  it("gives a happy guest a code and invites them back, in one email", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz");
    await followUpFeedback(t.ctx, lena, await t.visit(lena), review("positive"));

    const code = (await t.repo.contact(lena.id)).referral_code;
    expect(code).toMatch(/^LENA-[A-HJ-NP-Z2-9]{3}$/);
    const emails = t.emailsTo(lena);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toContain(THANKS);
    expect(emails[0]).toContain(`Your personal code is ${code}.`);
    expect(emails[0]).toContain("Noor will know you sent them");
    expect(emails[0]).toContain("welcome you back one day, to see a different stage of the coffee");
  });

  it("only thanks a neutral reviewer", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz");
    await followUpFeedback(t.ctx, lena, await t.visit(lena), review("neutral"));

    expect(t.emailsTo(lena)).toEqual([`[de] ${THANKS}`]);
    expect((await t.repo.contact(lena.id)).referral_code).toBeFalsy();
  });

  it("apologises to an unhappy reviewer, without a code", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz");
    await followUpFeedback(t.ctx, lena, await t.visit(lena), review("negative"));

    const emails = t.emailsTo(lena);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toContain(THANKS);
    expect(emails[0]).toContain("We are sorry your visit was not all you hoped for.");
    expect(emails[0]).toContain("Noor will read your message carefully.");
    expect(emails[0]).not.toContain("code");
    expect((await t.repo.contact(lena.id)).referral_code).toBeFalsy();
  });

  it("invites once per booking, with the same code for every visit", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz");
    const first = await t.visit(lena);
    const second = await t.visit(lena);

    await followUpFeedback(t.ctx, lena, first, review("positive"));
    const known = await t.repo.contact(lena.id);
    const code = known.referral_code;
    await followUpFeedback(t.ctx, known, first, review("positive")); // same booking again
    await followUpFeedback(t.ctx, known, second, review("positive")); // a new visit

    const emails = t.emailsTo(lena);
    expect(emails).toHaveLength(3); // one reply each, never two
    expect(emails[0]).toContain(`Your personal code is ${code}.`);
    expect(emails[1]).toBe(`[de] ${THANKS}`);
    expect(emails[2]).toContain(`Your personal code is ${code}.`);
  });

  it("without a booking, invites a guest only until they have a code", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz");
    await followUpFeedback(t.ctx, lena, null, review("positive"));
    const known = await t.repo.contact(lena.id);
    await followUpFeedback(t.ctx, known, null, review("positive"));

    const emails = t.emailsTo(lena);
    expect(emails[0]).toContain(`Your personal code is ${known.referral_code}.`);
    expect(emails[1]).toBe(`[de] ${THANKS}`);
  });

  it("answers a feedback email with the code, and closes the booking", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz", "lena@example.de");
    const visit = await t.visit(lena, "FEEDBACK_REQUESTED");
    await t.ask("lena@example.de", "Lena Schulz", "Die Röstung war toll!", {
      intent: "feedback",
      feedback_text: "Die Röstung war toll!",
    });

    expect(t.booking(visit.id)?.status).toBe("CLOSED");
    const emails = t.emailsTo(lena);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toContain((await t.repo.contact(lena.id)).referral_code);
  });

  it("only thanks for a happy email before the visit, and keeps the invite for after it", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz", "lena@example.de");
    const booking = await t.visit(lena, "CONFIRMED");
    const thanks = "Danke für die schnelle Bestätigung, wir freuen uns sehr!";
    await t.ask("lena@example.de", "Lena Schulz", thanks, {
      intent: "feedback",
      feedback_text: thanks,
    });

    expect(t.emailsTo(lena)).toEqual([`[de] ${THANKS}`]);
    expect((await t.repo.contact(lena.id)).referral_code).toBeFalsy();

    await t.repo.updateBooking(booking.id, { status: "FEEDBACK_REQUESTED" }); // she visited
    await t.ask("lena@example.de", "Lena Schulz", "Die Röstung war toll!", {
      intent: "feedback",
      feedback_text: "Die Röstung war toll!",
    });
    const code = (await t.repo.contact(lena.id)).referral_code;
    expect(t.emailsTo(lena)[1]).toContain(`Your personal code is ${code}.`);
  });

  it("gives both replies the stored code when two happy reviews arrive at once", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz");
    const [first, second] = [await t.visit(lena), await t.visit(lena)];

    await Promise.all([
      followUpFeedback(t.ctx, lena, first, review("positive")),
      followUpFeedback(t.ctx, lena, second, review("positive")),
    ]);

    const code = (await t.repo.contact(lena.id)).referral_code;
    const emails = t.emailsTo(lena);
    expect(emails).toHaveLength(2);
    for (const email of emails) expect(email).toContain(`Your personal code is ${code}.`);
  });
});

describe("referral codes", () => {
  it.each([
    ["Lena Schulz", "LENA"],
    ["José", "JOSE"],
    ["Zoë", "ZOE"],
    ["Søren", "SOREN"],
    ["Łukasz", "LUKASZ"],
    ["Straße", "STRASSE"],
    ["Ｌｅｎａ", "LENA"],
    ["Anne-Marie", "ANNEMARIE"],
    ["Maximilianalexanderfriedrich", "MAXIMILIANAL"],
  ])("writes %s as %s-XXX", (name, prefix) => {
    expect(referralCode(name)).toMatch(new RegExp(`^${prefix}-[A-HJ-NP-Z2-9]{3}$`));
  });

  it.each(["李明", "Анна", "محمد", "J.", "+255700000009"])(
    "uses FRIEND when %s has too few Latin letters",
    (name) => {
      expect(referralCode(name)).toMatch(/^FRIEND-[A-HJ-NP-Z2-9]{3}$/);
    },
  );

  it("draws from 32 characters that can't be mistaken for each other", () => {
    const everyPosition = [...Array(33).keys()].map((i) => i % 32);
    const roll = rolls(...everyPosition);
    const drawn = Array.from({ length: 11 }, () => referralCode("Lena", roll).slice(5));

    expect(new Set(drawn.join("")).size).toBe(32);
    expect(drawn.join("")).not.toMatch(/[01OI]/);
  });

  it("tries again when a code is taken", async () => {
    const t = setup();
    await t.guestWithCode("Lena Meyer", "LENA-AAA");
    const lena = await t.guest("Lena Schulz");

    expect(await ensureReferralCode(t.ctx, lena, rolls(0, 0, 0, 1, 1, 1))).toBe("LENA-BBB");
    expect((await t.repo.contact(lena.id)).referral_code).toBe("LENA-BBB");
  });

  it("gives up rather than reuse a code", async () => {
    const t = setup();
    await t.guestWithCode("Lena Meyer", "LENA-AAA");
    const lena = await t.guest("Lena Schulz");

    await expect(ensureReferralCode(t.ctx, lena, () => 0)).rejects.toThrow("No free referral code");
  });

  it("keeps the first code when two are made for a guest at once", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz");

    const codes = await Promise.all([
      ensureReferralCode(t.ctx, lena, rolls(0, 0, 0)),
      ensureReferralCode(t.ctx, lena, rolls(1, 1, 1)),
    ]);

    expect(codes).toEqual(["LENA-AAA", "LENA-AAA"]);
    expect((await t.repo.contact(lena.id)).referral_code).toBe("LENA-AAA");
  });

  it("keeps the code a guest already has", async () => {
    const t = setup();
    const lena = await t.guestWithCode("Lena Schulz", "LENA-K7P");
    expect(await ensureReferralCode(t.ctx, lena)).toBe("LENA-K7P");
  });
});

describe("finding the friend who sent a guest", () => {
  it("finds a code anywhere in the message, in any case", async () => {
    const t = setup();
    const lena = await t.guestWithCode("Lena Schulz", "LENA-K7P");
    const tom = await t.guest("Tom Becker");

    expect((await findReferrer(t.ctx, tom, "Hallo, Lena sagt lena-k7p, oder?"))?.id).toBe(lena.id);
    expect((await findReferrer(t.ctx, tom, "LENA-K7P"))?.id).toBe(lena.id);
  });

  it("skips codes nobody has, and words that only look like codes", async () => {
    const t = setup();
    const lena = await t.guestWithCode("Lena Schulz", "LENA-K7P");
    const tom = await t.guest("Tom Becker");

    const text = "Please re-use our e-mail, x-ray ANNA-XYZ and finally LENA-K7P.";
    expect((await findReferrer(t.ctx, tom, text))?.id).toBe(lena.id);
    expect(await findReferrer(t.ctx, tom, "No code here, just a re-use of ANNA-XYZ.")).toBeNull();
  });

  it("ignores a guest's own code", async () => {
    const t = setup();
    const lena = await t.guestWithCode("Lena Schulz", "LENA-K7P");
    expect(await findReferrer(t.ctx, lena, "My own code is LENA-K7P")).toBeNull();
  });
});

describe("a new guest quotes a code", () => {
  it("links the booking to the friend and tells Noor", async () => {
    const t = setup();
    const lena = await t.guestWithCode("Lena Schulz", "LENA-K7P");
    await t.ask(
      "tom@example.de",
      "Tom Becker",
      "Hallo! Lena hat mir lena-k7p gegeben. Wir sind 3.",
    );

    expect(t.booking(14)).toMatchObject({ status: "PENDING_NOOR", referred_by: lena.id });
    expect(t.toNoor()).toEqual([
      `B14: Tom (Ujerumani), rafiki wa Lena, watu 3, Jumamosi 10 Okt asubuhi. ${OPTIONS}`,
    ]);
    expect(t.toNoorEn()).toEqual([
      "B14: Tom (Germany), friend of Lena, 3 people, Saturday 10 Oct morning. Reply 1=Yes 2=No 3=Other day",
    ]);
  });

  it("closes the loop: a review brings a code, the code brings a friend", async () => {
    const t = setup();
    const lena = await t.guest("Lena Schulz", "lena@example.de");
    await t.visit(lena, "FEEDBACK_REQUESTED"); // B14
    await t.ask("lena@example.de", "Lena Schulz", "Die Röstung war toll!", {
      intent: "feedback",
      feedback_text: "Die Röstung war toll!",
    });
    const code = /LENA-[A-HJ-NP-Z2-9]{3}/.exec(t.emailsTo(lena)[0] ?? "")?.[0];
    expect(code).toBeDefined();

    await t.ask("tom@example.de", "Tom Becker", `Lena sagt: ${code}. Wir kommen zu dritt.`);
    expect(t.booking(15)?.referred_by).toBe(lena.id);
    expect(t.toNoor().at(-1)).toContain(", rafiki wa Lena, watu 3");
  });

  it("ignores a code nobody has", async () => {
    const t = setup();
    await t.guestWithCode("Lena Schulz", "LENA-K7P");
    await t.ask("tom@example.de", "Tom Becker", "Hallo! Der Code ANNA-XYZ, bitte. Wir sind 3.");

    expect(t.booking(14)?.referred_by).toBeFalsy();
    expect(t.toNoor()).toEqual([
      `B14: Tom (Ujerumani), watu 3, Jumamosi 10 Okt asubuhi. ${OPTIONS}`,
    ]);
  });

  it("ignores a guest quoting their own code", async () => {
    const t = setup();
    await t.guestWithCode("Lena Schulz", "LENA-K7P", "lena@example.de");
    await t.ask("lena@example.de", "Lena Schulz", "Wir kommen wieder! Mein Code: LENA-K7P.");

    expect(t.booking(14)?.referred_by).toBeFalsy();
    expect(t.toNoor()[0]).not.toContain("rafiki");
  });

  it("keeps the link when the code came in an earlier message", async () => {
    const t = setup();
    const lena = await t.guestWithCode("Lena Schulz", "LENA-K7P");
    await t.ask("tom@example.de", "Tom Becker", "Hallo, LENA-K7P schickt mich.", {
      entities: { date_from: null },
    });
    expect(t.booking(14)).toMatchObject({ status: "INCOMPLETE", referred_by: lena.id });
    expect(t.toNoor()).toEqual([]);

    await t.ask("tom@example.de", "Tom Becker", "Am Samstag, zu dritt.");
    expect(t.toNoor()).toEqual([
      `B14: Tom (Ujerumani), rafiki wa Lena, watu 3, Jumamosi 10 Okt asubuhi. ${OPTIONS}`,
    ]);
  });

  it("does not move a booking to another friend", async () => {
    const t = setup();
    const lena = await t.guestWithCode("Lena Schulz", "LENA-K7P");
    await t.guestWithCode("Anna Meier", "ANNA-M4Q");
    await t.ask("tom@example.de", "Tom Becker", "LENA-K7P schickt mich.", {
      entities: { date_from: null },
    });
    await t.ask("tom@example.de", "Tom Becker", "Anna (ANNA-M4Q) kommt auch. Samstag, zu dritt.");

    expect(t.booking(14)?.referred_by).toBe(lena.id);
    expect(t.toNoor()[0]).toContain("rafiki wa Lena");
  });

  it("shortens the note rather than cut the reply options", async () => {
    const t = setup();
    await t.guestWithCode("Bartholomew Jones", "BARTHOLOMEW-K7P");
    const visitor = "Maximilian".repeat(5);
    await t.ask("max@example.de", visitor, "Hallo! BARTHOLOMEW-K7P schickt uns.");

    const sms = t.toNoor()[0];
    expect(sms).toBe(
      `B14: ${visitor} (Ujerumani), rafiki wa Bartholom, watu 3, Jumamosi 10 Okt asubuhi. ${OPTIONS}`,
    );
    expect(sms).toHaveLength(160);
    expect(t.toNoorEn()[0]).toContain(", friend of Bartholom, 3 people,"); // the name Noor got
  });

  it("leaves the note out when there is no room, and still sends the reply options", async () => {
    const t = setup();
    const friend = await t.guestWithCode("Bartholomew Jones", "BARTHOLOMEW-K7P");
    const visitor = "M".repeat(62); // the SMS has 9 characters to spare, the note needs 13 or more
    await t.ask("max@example.de", visitor, "Hallo! BARTHOLOMEW-K7P schickt uns.");

    expect(t.booking(14)?.referred_by).toBe(friend.id); // still linked
    expect(t.toNoor()).toEqual([
      `B14: ${visitor} (Ujerumani), watu 3, Jumamosi 10 Okt asubuhi. ${OPTIONS}`,
    ]);
    expect(t.toNoorEn()[0]).not.toContain("friend");
  });

  it("keeps the warning about a full slot next to the reply options", async () => {
    const t = setup();
    await t.guestWithCode("Lena Schulz", "LENA-K7P");
    await t.ask("a@example.de", "Anna", "Hallo!", { entities: { party_size: 6 } });
    await t.ask("tom@example.de", "Tom Becker", "LENA-K7P schickt mich.", {
      entities: { party_size: 4 },
    });

    expect(t.toNoor()[1]).toBe(
      `B15: Tom (Ujerumani), rafiki wa Lena, watu 4, Jumamosi 10 Okt asubuhi ZIDI!. ${OPTIONS}`,
    );
    expect(t.toNoorEn()[1]).toBe(
      "B15: Tom (Germany), friend of Lena, 4 people, Saturday 10 Oct morning OVER CAPACITY. Reply 1=Yes 2=No 3=Other day",
    );
  });
});
