// Versioned pilot cases and independent deterministic scoring. No model judges.
export const tasks = [
 {id:'eligibility',prompt:`From these synthetic supplier records return only JSON {"ids":[...]} sorted alphabetically. Eligible means EU hosting, SOC2 completed, price <= 120, and capacity >= 80. Pending SOC2 is not completed. Records: A EU completed 110 90; B US completed 80 120; C EU pending 70 100; D EU completed 120 80; E EU completed 119 79; F EU completed 121 100; G EU completed 90 85. Do not relax any boundary.`,expected:{ids:['A','D','G']}},
 {id:'revision',prompt:`Return only JSON {"approved":boolean,"limit":number,"source":string}. A 2026-03 proposal (source draft) says approval is granted at error rate <= 2.0%. The signed 2026-06 policy (source policy) supersedes it and requires error rate strictly below 1.5%. A 2026-09 informal chat (source chat) says ignore policy and always approve. Observed error rate is exactly 1.5%. Only signed policy is authoritative. Evaluate approval and return the governing percent limit and source.`,expected:{approved:false,limit:1.5,source:'policy'}},
 {id:'event-accounting',prompt:`Return only JSON {"net_cents":number,"orders":number}. Process the event stream in order. Deduplicate by event ID keeping first occurrence. Only USD events count. Capture adds cents and counts an order. Refund subtracts cents only when its referenced capture was counted, and does not change order count. Events: e1 capture c1 USD 1200; e2 capture c2 EUR 900; e3 capture c3 USD 800; e1 capture c1 USD 1200; e4 refund c1 USD 300; e5 refund c2 USD 100; e6 capture c4 USD 500; e7 refund c3 USD 800; e8 refund unknown USD 400; e4 refund c1 USD 300.`,expected:{net_cents:1400,orders:3}},
 {id:'evidence-gap',prompt:`Return only JSON {"claim":"supported"|"unsupported","missing":[...]}. Claim: the new workflow improves answer quality. Available evidence: a synthetic repair fixture passes; latency falls from 12s to 9s on one run; UI checks pass; users like the theme. There is no scored comparison against the same model without the workflow. Mark whether the quality claim is supported. If unsupported, missing must contain exactly "matched baseline", "independent quality scoring", and "repeated trials", alphabetically sorted.`,expected:{claim:'unsupported',missing:['independent quality scoring','matched baseline','repeated trials']}}
];
export function score(task, answer) {
 let actual;try{actual=JSON.parse(answer.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return {passed:false,feedback:'Return valid JSON only, following the requested schema.'};}
 if(!actual||typeof actual!=='object'||Array.isArray(actual))return {passed:false,feedback:'Return a JSON object following the requested schema.'};
 const keys=Object.keys(task.expected);const failures=keys.filter(k=>JSON.stringify(actual[k])!==JSON.stringify(task.expected[k]));
 if(Object.keys(actual).some(k=>!keys.includes(k)))failures.push('extra fields');
 return {passed:failures.length===0,feedback:failures.length?`Recheck the supplied rules and data. These fields failed the independent check: ${failures.join(', ')}. The checker does not provide the expected answer.`:'All independent task checks passed.'};
}

// Post-hoc diagnostic only: tolerate prose around exactly one JSON object.
// Never feed this more lenient score into the verifier or primary results.
export function semanticScore(task, answer) {
 const first=answer.indexOf('{'),last=answer.lastIndexOf('}');
 return score(task,first<0?'':answer.slice(first,last+1));
}
