# /next — Show next actions

Read the active sprint’s current status. Refresh stale compilation using `grainulator compile --dir <sprint>` or `grainulator.compile`. Use the resulting `next_actions` with the user’s current scope and authorization. Output only the two Auto and Manual lists below, with no recap, status counters or offer to continue. Continue useful Auto work already authorized by the active task.

## Next-step output

After a meaningful pass, use the current compiler's `next_actions` to present exactly two bullet lists labeled **Auto** and **Manual**. Auto is work the agent can continue under existing authorization. Manual is only work requiring the user's decision, access, or action. Classify using the current request and constraints; compiler suggestions never grant permission. Continue authorized Auto work without asking again.

Keep 2–3 useful actions total when available, use short concrete labels and commands where useful, and show `None.` for an empty group. Do not invent work to fill a quota. Never omit next steps merely because compilation is ready or the answer should be brief. Refresh stale compilation first and exclude work the user removed from scope. When the user asks only for next steps, output only these two lists: no findings recap, counts, reasons, or offer to continue.
