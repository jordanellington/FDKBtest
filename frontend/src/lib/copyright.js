// Copyright classification engine for FDKB POC
// Rule-based heuristics — designed to be swapped for a real clearinghouse API later

const PUBLIC_PATH_PATTERNS = [
  'FDA Publications',
  'FDA Speeches',
  'GAO Reports',
  'Surgeon General',
  'Guidance Documents',
];

const INTERNAL_PATH_PATTERNS = [
  'FD Court Documents',
  'FD Docket Files',
  'Memorandum of Law',
  'Tobacco Litigation',
];

// Simple deterministic hash to create a realistic mix for the POC
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function classifyDocument(item) {
  if (!item) return { status: 'restricted', label: 'Restricted', color: 'red', tooltip: 'Not cleared for distribution' };

  const path = item.path?.name || '';
  const name = item.name || '';

  // Path-based rules first (highest confidence)
  for (const pattern of PUBLIC_PATH_PATTERNS) {
    if (path.includes(pattern)) {
      return {
        status: 'external',
        label: 'External',
        color: 'green',
        tooltip: `Public domain — ${pattern}`,
      };
    }
  }

  for (const pattern of INTERNAL_PATH_PATTERNS) {
    if (path.includes(pattern)) {
      return {
        status: 'internal',
        label: 'Internal',
        color: 'amber',
        tooltip: `Internal use only — ${pattern}`,
      };
    }
  }

  // For remaining docs, use a deterministic hash to simulate clearinghouse results
  // This creates a ~30% external, ~35% internal, ~35% restricted mix
  const hash = simpleHash(name);
  const bucket = hash % 100;

  if (bucket < 30) {
    return {
      status: 'external',
      label: 'External',
      color: 'green',
      tooltip: 'Cleared for external distribution — copyright clearinghouse verified',
    };
  }
  if (bucket < 65) {
    return {
      status: 'internal',
      label: 'Internal',
      color: 'amber',
      tooltip: 'Internal use only — limited distribution rights',
    };
  }

  return { status: 'restricted', label: 'Restricted', color: 'red', tooltip: 'Not cleared for distribution' };
}

export function extractMetadata(item) {
  if (!item) return { author: '—', date: '—', topic: '—', publisher: '—' };

  const props = item.properties || {};
  const path = item.path?.name || '';

  // Author: try cm:author, then cm:creator, then createdByUser
  const author = props['cm:author']
    || item.createdByUser?.displayName
    || '—';

  // Date: try cm:created, then createdAt, then modifiedAt
  const rawDate = props['cm:created'] || item.createdAt || item.modifiedAt;
  const date = rawDate
    ? new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  // Topic: derive from parent folder in path
  const segments = path
    .replace('/Company Home/Sites/FDKB-staging/documentlibrary/', '')
    .split('/');
  const topic = segments[0] || '—';

  // Publisher: derive from path or properties
  const publisher = props['cm:publisher'] || derivePublisher(path, item.name);

  return { author, date, topic, publisher };
}

const MOCK_PUBLISHERS = [
  'Federal Register',
  'FDA Office of Regulatory Affairs',
  'Department of Justice',
  'FDA Center for Drug Evaluation',
  'New England Journal of Medicine',
  'FDA Office of Compliance',
  'HHS Office of Inspector General',
  'Government Accountability Office',
  'Congressional Research Service',
  'FDA Center for Devices',
  'FDA Center for Veterinary Medicine',
  'Federal Trade Commission',
  'Department of Health and Human Services',
  'Office of the Surgeon General',
  'FDA Center for Biologics',
  'National Institutes of Health',
  'New York Journal of Medicine',
];

function derivePublisher(path, name) {
  if (path.includes('FDA Publications') || path.includes('FDA Speeches')) return 'FDA';
  if (path.includes('GAO Reports')) return 'GAO';
  if (path.includes('Surgeon General')) return 'Office of the Surgeon General';
  if (path.includes('Guidance Documents')) return 'FDA';
  // Deterministic mock publisher for POC
  const hash = simpleHash(name || path);
  return MOCK_PUBLISHERS[hash % MOCK_PUBLISHERS.length];
}
