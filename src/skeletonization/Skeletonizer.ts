import nlp from 'compromise';

export function skeletonize(text: string): string {
  if (!text || typeof text !== 'string') return '···';

  const trimmed = text.trim();
  if (trimmed.length === 0) return '···';

  try {
    const doc = nlp(trimmed);

    doc.match('#Verb').remove();
    doc.match('#Adverb').remove();
    doc.match('#Adjective').remove();
    doc.match('#Conjunction').remove();
    doc.match('#Preposition').remove();
    doc.match('#Determiner').remove();
    doc.match('#Pronoun').remove();
    doc.match('#Modal').remove();
    doc.match('#Auxiliary').remove();
    doc.match('#Copula').remove();
    doc.match('#Negative').remove();
    doc.match('#QuestionWord').remove();

    let skeleton = doc.text('normal');
    skeleton = skeleton.replace(/\s+/g, ' ').trim();

    return skeleton.length > 0 ? skeleton : '···';
  } catch (err) {
    console.warn('[Skeletonizer] compromise.js failed:', err);
    return '···';
  }
}
