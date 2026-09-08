// Deliberately wrong first response: deterministic protocol fixture, not a model.
let input = ''; for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
process.stdout.write(JSON.stringify({ answer: request.feedback ? '42' : '41' }) + '\n');
