import { extractGraphTopologyAndStrip } from '../workflow-engine.js';

describe('extractGraphTopologyAndStrip', () => {
  test('extracts topology at end and preserves options', () => {
    const text = [
      'Narrative text',
      '===ALL_AVAILABLE_OPTIONS===',
      '- Option A',
      '- Option B',
      '===GRAPH_TOPOLOGY===',
      JSON.stringify({ nodes: [{ id: 'a', label: 'A', theme: 't', supporters: [1], support_count: 1 }], edges: [] })
    ].join('\n');
    const res = extractGraphTopologyAndStrip(text);
    expect(res.topology).toBeTruthy();
    expect(res.text).toContain('===ALL_AVAILABLE_OPTIONS===');
    expect(res.text).toContain('Option A');
  });

  test('extracts topology before options and preserves following content', () => {
    const text = [
      'Intro',
      '===GRAPH_TOPOLOGY===',
      JSON.stringify({ nodes: [], edges: [] }),
      '===ALL_AVAILABLE_OPTIONS===',
      '- X',
      '- Y'
    ].join('\n');
    const res = extractGraphTopologyAndStrip(text);
    expect(res.topology).toBeTruthy();
    expect(res.text.startsWith('Intro')).toBe(true);
    expect(res.text).toContain('===ALL_AVAILABLE_OPTIONS===');
    expect(res.text).toContain('- X');
  });

  test('returns original text when delimiter missing', () => {
    const text = 'No topology here';
    const res = extractGraphTopologyAndStrip(text);
    expect(res.topology).toBeNull();
    expect(res.text).toBe(text);
  });
});
