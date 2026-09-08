"use strict";

/**
 * json-ld-common.js — Shared JSON-LD vocabulary for mill
 *
 * Both the ESM format (formats/json-ld.js) and the CJS exporter
 * (exporters/json-ld.js) use the same schema.org/Report structure.
 * This module is the single source of truth for that vocabulary.
 *
 * CJS module so both CJS exporters and ESM formats can consume it.
 */

const CONTEXT = {
  "@vocab": "https://schema.org/",
  wheat: "https://grainulation.com/ns/wheat#",
  claim: "wheat:Claim",
  confidence: "wheat:confidence",
  evidenceTier: "wheat:evidenceTier",
  claimType: "wheat:claimType",
  sprintId: "wheat:sprintId",
};

function claimToJsonLd(claim) {
  const body = claim.content || claim.text || "";
  const evidenceTier =
    typeof claim.evidence === "string"
      ? claim.evidence
      : (claim.evidence?.tier ?? claim.evidence_tier ?? null);

  return {
    "@type": "claim",
    "@id": `wheat:claim/${claim.id}`,
    identifier: claim.id,
    claimType: claim.type,
    text: body,
    description: body,
    confidence: claim.confidence ?? null,
    evidenceTier,
    dateCreated: claim.created || claim.timestamp || null,
    ...(claim.tags?.length ? { keywords: claim.tags.join(", ") } : {}),
    ...(claim.status ? { status: claim.status } : {}),
  };
}

function buildReport(meta, claims, certificate) {
  return {
    "@context": CONTEXT,
    "@type": "Report",
    "@id": `wheat:sprint/${meta.sprint || "unknown"}`,
    name: meta.sprint || meta.question || "Wheat Sprint Report",
    description: meta.question || "",
    dateCreated:
      (certificate && certificate.compiled_at) || new Date().toISOString(),
    ...(meta.audience
      ? { audience: { "@type": "Audience", name: meta.audience } }
      : {}),
    hasPart: {
      "@type": "ItemList",
      numberOfItems: claims.length,
      itemListElement: claims.map((claim, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: claimToJsonLd(claim),
      })),
    },
    ...(certificate && certificate.sha256
      ? {
          identifier: {
            "@type": "PropertyValue",
            name: "certificate-sha256",
            value: certificate.sha256,
          },
        }
      : {}),
  };
}

module.exports = { CONTEXT, claimToJsonLd, buildReport };
