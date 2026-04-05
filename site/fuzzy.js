// Fuzzy matcher for demo library
// Uses Levenshtein distance + word overlap scoring
// Returns the best-matching demo or null if no good match

// ── Utility: Levenshtein distance ────────────────────────────────────────────

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

// ── Utility: Normalize text for comparison ───────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
  'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'it', 'its', 'we', 'our', 'my', 'your', 'they', 'their',
  'about', 'up', 'if', 'when', 'where', 'why', 'all', 'any'
]);

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantWords(text) {
  return normalize(text)
    .split(' ')
    .filter(function (w) { return w.length > 3 && !STOP_WORDS.has(w); });
}

// ── Core: Score a query against a single library entry ───────────────────────

function scoreEntry(queryWords, queryNorm, entry) {
  var entryWords = significantWords(entry.question);
  var entryNorm = normalize(entry.question);

  // Word overlap: Jaccard-like — shared significant words / total unique words
  var querySet = {};
  var entrySet = {};
  var shared = 0;

  queryWords.forEach(function (w) { querySet[w] = true; });
  entryWords.forEach(function (w) { entrySet[w] = true; });

  Object.keys(querySet).forEach(function (w) {
    if (entrySet[w]) shared++;
  });

  var totalUnique = Object.keys(
    Object.assign({}, querySet, entrySet)
  ).length;

  var wordOverlap = totalUnique > 0 ? shared / totalUnique : 0;

  // Normalized Levenshtein distance (0 = identical, 1 = completely different)
  var maxLen = Math.max(queryNorm.length, entryNorm.length);
  var levDist = maxLen > 0 ? levenshtein(queryNorm, entryNorm) / maxLen : 0;

  // Composite score: word overlap weighted heavily, Levenshtein as tiebreaker
  var score = 0.7 * wordOverlap + 0.3 * (1 - levDist);

  return score;
}

// ── Public: Find best matching demo ──────────────────────────────────────────

function fuzzyMatchDemo(query, library) {
  if (!query || !library || library.length === 0) return null;

  var queryWords = significantWords(query);
  var queryNorm = normalize(query);

  if (queryWords.length === 0) return null;

  var bestScore = 0;
  var bestEntry = null;

  for (var i = 0; i < library.length; i++) {
    var score = scoreEntry(queryWords, queryNorm, library[i]);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = library[i];
    }
  }

  // Threshold: require minimum 0.15 score to avoid nonsense matches
  if (bestScore > 0.15 && bestEntry) {
    return { match: bestEntry, score: bestScore };
  }

  return null;
}

// ── Public: Template fallback for unmatched queries ──────────────────────────

function templateFallback(query) {
  var words = significantWords(query);

  // Pick 2-3 most significant keywords (longest words tend to be most specific)
  var keywords = words
    .slice()
    .sort(function (a, b) { return b.length - a.length; })
    .slice(0, 3);

  if (keywords.length === 0) {
    keywords = ['this approach'];
  }

  var topic = keywords.join(' ');
  var topicCap = topic.charAt(0).toUpperCase() + topic.slice(1);
  var kw0 = keywords[0];
  var kw0Cap = kw0.charAt(0).toUpperCase() + kw0.slice(1);

  var claims = [
    {
      id: 'r001',
      type: 'constraint',
      tier: 'stated',
      text: 'When evaluating ' + topic + ', teams must consider existing infrastructure dependencies, team expertise, and migration costs before committing to a direction.'
    },
    {
      id: 'r002',
      type: 'factual',
      tier: 'stated',
      text: topicCap + ' adoption has grown significantly in the past 2 years, with increasing production usage across mid-size and enterprise engineering organizations.'
    },
    {
      id: 'r003',
      type: 'risk',
      tier: 'stated',
      text: 'A key risk of ' + topic + ' is that early adopter enthusiasm can outpace organizational readiness, leading to partial rollouts that create maintenance burden.'
    },
    {
      id: 'r004',
      type: 'recommendation',
      tier: 'stated',
      text: 'For most teams, ' + kw0 + ' works best when introduced incrementally — start with a single non-critical service or project to validate assumptions before broader adoption.'
    },
    {
      id: 'r005',
      type: 'estimate',
      tier: 'stated',
      text: 'Migration to ' + kw0 + ' typically requires 4-8 weeks for an initial proof of concept, with full adoption spanning 2-4 months depending on team size and codebase complexity.'
    }
  ];

  return {
    question: query,
    claims: claims,
    isTemplate: true
  };
}

// ── Self-test ────────────────────────────────────────────────────────────────

if (typeof require !== 'undefined' || typeof process !== 'undefined') {
  // Load demos for testing
  var fs;
  try { fs = require('fs'); } catch (e) { fs = null; }

  if (fs) {
    var demos = JSON.parse(
      fs.readFileSync(__dirname + '/demos.json', 'utf8')
    );

    console.log('Loaded ' + demos.length + ' demos\n');

    // Test 1: Exact topic match
    var result1 = fuzzyMatchDemo('monorepo vs polyrepo', demos);
    console.log('Test 1: "monorepo vs polyrepo"');
    console.log('  Match: ' + (result1 ? result1.match.question : 'NONE'));
    console.log('  Score: ' + (result1 ? result1.score.toFixed(3) : 'N/A'));
    console.log();

    // Test 2: Partial match
    var result2 = fuzzyMatchDemo('should we use kubernetes or ecs', demos);
    console.log('Test 2: "should we use kubernetes or ecs"');
    console.log('  Match: ' + (result2 ? result2.match.question : 'NONE'));
    console.log('  Score: ' + (result2 ? result2.score.toFixed(3) : 'N/A'));
    console.log();

    // Test 3: Loose match
    var result3 = fuzzyMatchDemo('redis caching strategy', demos);
    console.log('Test 3: "redis caching strategy"');
    console.log('  Match: ' + (result3 ? result3.match.question : 'NONE'));
    console.log('  Score: ' + (result3 ? result3.score.toFixed(3) : 'N/A'));
    console.log();

    // Test 4: AI topic
    var result4 = fuzzyMatchDemo('LLM chatbot production deployment', demos);
    console.log('Test 4: "LLM chatbot production deployment"');
    console.log('  Match: ' + (result4 ? result4.match.question : 'NONE'));
    console.log('  Score: ' + (result4 ? result4.score.toFixed(3) : 'N/A'));
    console.log();

    // Test 5: No match — should fall back to template
    var result5 = fuzzyMatchDemo('quantum computing for drug discovery', demos);
    console.log('Test 5: "quantum computing for drug discovery"');
    console.log('  Match: ' + (result5 ? result5.match.question : 'NONE'));
    console.log('  Score: ' + (result5 ? result5.score.toFixed(3) : 'N/A'));
    if (!result5) {
      var fallback = templateFallback('quantum computing for drug discovery');
      console.log('  Fallback question: ' + fallback.question);
      console.log('  Fallback claims: ' + fallback.claims.length);
      console.log('  isTemplate: ' + fallback.isTemplate);
      console.log('  First claim: ' + fallback.claims[0].text);
    }
    console.log();

    // Test 6: TypeScript match
    var result6 = fuzzyMatchDemo('typescript migration from javascript', demos);
    console.log('Test 6: "typescript migration from javascript"');
    console.log('  Match: ' + (result6 ? result6.match.question : 'NONE'));
    console.log('  Score: ' + (result6 ? result6.score.toFixed(3) : 'N/A'));
    console.log();

    console.log('All tests complete.');
  }
}
