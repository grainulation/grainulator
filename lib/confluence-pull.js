/**
 * confluence-pull.js -- Reverse sync: read Confluence page, extract JSON code block,
 * write to local claims.json.
 *
 * Parses Confluence storage format (XHTML) to find the machine-readable JSON
 * code block embedded by confluence-sync.js, extracts it, and writes a valid
 * claims.json to the local sprint directory.
 *
 * Zero dependencies -- uses only Node.js built-ins.
 */

import fs from 'node:fs';
import path from 'node:path';

// ── JSON extraction from Confluence storage format ──────────────────────────

/**
 * Extract JSON from a Confluence page body.
 *
 * The sync module embeds JSON inside:
 *   <ac:structured-macro ac:name="code">
 *     <ac:parameter ac:name="language">json</ac:parameter>
 *     <ac:plain-text-body><![CDATA[ ... ]]></ac:plain-text-body>
 *   </ac:structured-macro>
 *
 * This function finds the CDATA section inside a json code macro and parses it.
 * It does NOT require an XML parser -- the format is predictable enough for regex.
 *
 * @param {string} storageBody - Confluence page body in storage format (XHTML)
 * @returns {object|null} Parsed JSON object, or null if not found
 */
export function extractJsonFromStorage(storageBody) {
  if (!storageBody || typeof storageBody !== 'string') {
    return null;
  }

  // Look for CDATA blocks inside code macros with language=json
  const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let match;

  while ((match = cdataPattern.exec(storageBody)) !== null) {
    const candidate = match[1].trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Validate that extracted data looks like a claims.json structure.
 *
 * @param {object} data - Parsed JSON object
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateClaimsStructure(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Extracted data is not an object' };
  }

  if (!data.schema_version) {
    return { valid: false, reason: 'Missing schema_version field' };
  }

  if (!data.meta || typeof data.meta !== 'object') {
    return { valid: false, reason: 'Missing or invalid meta field' };
  }

  if (!Array.isArray(data.claims)) {
    return { valid: false, reason: 'Missing or invalid claims array' };
  }

  for (let i = 0; i < data.claims.length; i++) {
    const claim = data.claims[i];
    if (!claim.id) {
      return { valid: false, reason: `Claim at index ${i} missing id` };
    }
    if (!claim.type) {
      return { valid: false, reason: `Claim ${claim.id} missing type` };
    }
  }

  return { valid: true };
}

/**
 * Write extracted claims data to local sprint directory.
 *
 * @param {string} wheatRoot - Path to .wheat directory
 * @param {string} sprintSlug - Sprint slug
 * @param {object} claimsData - Validated claims.json structure
 * @param {object} [opts]
 * @param {boolean} [opts.backup] - If true, back up existing claims.json before overwriting
 * @returns {{ written: string, backed_up?: string }}
 */
export function writeLocalClaims(wheatRoot, sprintSlug, claimsData, opts = {}) {
  const sprintDir = path.join(wheatRoot, 'sprints', sprintSlug);
  const claimsPath = path.join(sprintDir, 'claims.json');
  const result = { written: claimsPath };

  fs.mkdirSync(sprintDir, { recursive: true });

  if (opts.backup && fs.existsSync(claimsPath)) {
    const backupPath = path.join(
      sprintDir,
      `claims.backup.${Date.now()}.json`
    );
    fs.copyFileSync(claimsPath, backupPath);
    result.backed_up = backupPath;
  }

  fs.writeFileSync(
    claimsPath,
    JSON.stringify(claimsData, null, 2) + '\n',
    'utf8'
  );

  return result;
}

// ── MCP tool call builders ──────────────────────────────────────────────────

/**
 * Build the MCP tool call descriptor to fetch a Confluence page by ID.
 */
export function mcpGetPage({ pageId }) {
  return {
    tool: 'mcp__claude_ai_Atlassian__getConfluencePage',
    params: {
      pageId,
    },
  };
}

/**
 * Build the MCP tool call descriptor to search for wheat sprint pages.
 */
export function mcpSearchWheatPages({ spaceKey, sprintSlug }) {
  const cqlParts = [];
  if (spaceKey) cqlParts.push(`space = "${spaceKey}"`);
  cqlParts.push('label = "wheat-active"');
  if (sprintSlug) cqlParts.push(`title ~ "${sprintSlug}"`);
  return {
    tool: 'mcp__claude_ai_Atlassian__searchConfluenceUsingCql',
    params: {
      cql: cqlParts.join(' AND '),
    },
  };
}

/**
 * Plan a pull operation.
 *
 * @param {object} opts
 * @param {string} opts.wheatRoot - Path to .wheat directory
 * @param {string} opts.sprintSlug - Sprint slug to write to locally
 * @param {string} opts.pageBody - Confluence page body (storage format)
 * @param {boolean} [opts.backup] - Back up existing claims.json
 * @returns {object} Pull result
 */
export function planPull({ wheatRoot, sprintSlug, pageBody, backup = true }) {
  const extracted = extractJsonFromStorage(pageBody);

  if (!extracted) {
    throw new Error(
      'Could not extract JSON from Confluence page. ' +
      'The page may not have been created by /sync, or the JSON code block was modified.'
    );
  }

  const validation = validateClaimsStructure(extracted);

  if (!validation.valid) {
    throw new Error(
      `Extracted JSON is not a valid claims structure: ${validation.reason}`
    );
  }

  return {
    sprintSlug,
    claimsData: extracted,
    claimCount: extracted.claims.length,
    backup,
  };
}

/**
 * Execute the local write portion of a pull.
 */
export function executePull({ wheatRoot, sprintSlug, claimsData, backup }) {
  return writeLocalClaims(wheatRoot, sprintSlug, claimsData, { backup });
}
