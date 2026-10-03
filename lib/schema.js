import Ajv from 'ajv';

export const competences = ['comune_di_milano', 'atm', 'trenord_rfi', 'green_space_operator', 'local_police', 'unknown'];
const string = (maxLength = 1200) => ({ type: 'string', maxLength });
export const reportSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    category: string(100), short_description: string(300), location_text: string(300),
    affected_people: { type: 'array', uniqueItems: true, maxItems: 8, items: { type: 'string', enum: ['wheelchair_user', 'low_vision', 'elderly', 'non_italian_speaker', 'hearing_impairment', 'mobility_impairment', 'everyone', 'none'] } },
    urgency_score: { type: 'integer', minimum: 1, maximum: 5 }, urgency_reason: string(),
    competence: { type: 'string', enum: competences }, confidence: { type: 'number', minimum: 0, maximum: 1 },
    missing_info: { type: 'array', maxItems: 6, items: string(300) },
    draft_message_it: string(4000), draft_message_en: string(4000)
  },
  required: ['category', 'short_description', 'location_text', 'affected_people', 'urgency_score', 'urgency_reason', 'competence', 'confidence', 'missing_info', 'draft_message_it', 'draft_message_en']
};
export const aiSchema = { type: 'object', additionalProperties: false, properties: { report: reportSchema, contains_personal_data: { type: 'boolean' } }, required: ['report', 'contains_personal_data'] };
const ajv = new Ajv({ allErrors: true });
export const validReport = ajv.compile(reportSchema);
export const validAI = ajv.compile(aiSchema);
export const needsClarification = report => report.confidence < 0.7 || report.missing_info.length > 0 || report.competence === 'unknown' || !report.location_text.trim();
export function obviousPersonalData(text) {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+\d[\d ()-]{7,}\d)|\b\d{9,15}\b|\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/i.test(text);
}
