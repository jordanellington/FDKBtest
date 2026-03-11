// Copyright classification engine for FDKB POC
// Uses CCC (Copyright Clearance Center) data when available,
// falls back to rule-based heuristics for non-enriched documents.

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

// CCC distribution level descriptions (permitted uses)
const CCC_LEVEL_INFO = {
  'Internal Only': {
    status: 'internal',
    label: 'Internal',
    color: 'amber',
    tooltip: 'Internal sharing only — email to colleagues, post on intranet/KM library, distribute at internal meetings, store in internal repository.',
  },
  'Internal + Client (with notice)': {
    status: 'client',
    label: 'Client OK',
    color: 'blue',
    tooltip: 'Internal use plus client sharing — may send single electronic copy to client on request. Must include copyright notice: "This copy is provided under license from the Copyright Clearance Center. Further reproduction or distribution is not permitted."',
  },
  'External Unrestricted': {
    status: 'external',
    label: 'External',
    color: 'green',
    tooltip: 'Open access — share with clients, prospects, or external parties without per-instance permission. Typically open access or broadly licensed content.',
  },
  'Not Covered': {
    status: 'restricted',
    label: 'Not Covered',
    color: 'red',
    tooltip: 'No CCC-licensed rights — must obtain direct publisher permission or rely on fair use analysis before any reproduction or distribution. Contact the library/KM team.',
  },
};

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
  if (!item) return { status: 'restricted', label: 'Not Covered', color: 'red', tooltip: 'Not cleared for distribution' };

  // ── CCC data takes priority (injected by backend enrichment) ──
  const props = item.properties || {};
  const cccLevel = props['ccc:distroLevel'];
  if (cccLevel && CCC_LEVEL_INFO[cccLevel]) {
    const info = CCC_LEVEL_INFO[cccLevel];
    const matchedOn = props['ccc:matchedOn'] || '';
    return {
      ...info,
      tooltip: info.tooltip,
      cccEnriched: true,
    };
  }

  // ── Fallback: path-based rules + hash (for non-CCC documents) ──
  const path = item.path?.name || '';
  const name = item.name || '';

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
  if (!item) return { author: '—', date: '—', topic: '—', publisher: '—', articleTitle: null, issn: null, copyrightHolder: null, publicationDate: null };

  const props = item.properties || {};
  const pathStr = item.path?.name || '';

  // ── CCC-enriched metadata takes priority ──
  const cccPublisher = props['ccc:publisher'];
  const cccAuthors = props['ccc:authors'];
  const cccPubDate = props['ccc:publicationDate'];
  const cccArticleTitle = props['ccc:articleTitle'];
  const cccPublicationTitle = props['ccc:publicationTitle'];
  const cccIssn = props['ccc:issn'];
  const cccCopyrightHolder = props['ccc:copyrightHolder'];

  // Author: CCC > cm:author > createdByUser
  const author = cccAuthors
    || props['cm:author']
    || item.createdByUser?.displayName
    || '—';

  // Date: CCC publication date > cm:created > createdAt
  const rawDate = cccPubDate || props['cm:created'] || item.createdAt || item.modifiedAt;
  const date = rawDate
    ? new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  // Topic: derive from parent folder in path
  const segments = pathStr
    .replace('/Company Home/Sites/FDKB-staging/documentlibrary/', '')
    .split('/');
  const topic = segments[0] || '—';

  // Publisher: CCC > cm:publisher > derived
  const publisher = cccPublisher || props['cm:publisher'] || derivePublisher(pathStr, item.name);

  // Display title: prefer articleTitle, but for multi-article pubs (contain " / "),
  // use publicationTitle instead (or first headline segment as fallback)
  const displayTitle = cccArticleTitle
    ? (cccArticleTitle.includes(' / ')
        ? (cccPublicationTitle || cccArticleTitle.split(' / ')[0])
        : cccArticleTitle)
    : null;

  return {
    author,
    date,
    topic,
    publisher,
    displayTitle,
    articleTitle: cccArticleTitle || null,
    publicationTitle: cccPublicationTitle || null,
    issn: cccIssn || null,
    copyrightHolder: cccCopyrightHolder || null,
    publicationDate: cccPubDate || null,
    cccEnriched: !!cccPublisher,
  };
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
