const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/i;
/**
 * International form, then bare Italian numbers: mobiles start with 3, landlines with 0.
 * The old `\d{9,15}` branch matched any long digit run, so an ordinary reference like
 * "ticket 202610051234" was refused as a phone number.
 */
const PHONE = /(?:\+|\b00)\d[\d ()-]{7,}\d|\b3\d{8,9}\b|\b0\d{7,10}\b/;
/** Italian plates (AB 123 CD). Case-sensitive so ordinary words around numbers ("al 123 di") never match. */
const ITALIAN_PLATE = /\b[A-Z]{2} ?\d{3} ?[A-Z]{2}\b/;

/** Cheap first line of defence against obvious contact details and plates in free text. */
export function containsObviousPersonalData(text: string): boolean {
  return EMAIL.test(text) || PHONE.test(text) || ITALIAN_PLATE.test(text);
}
