# Quiet Vote

Quiet Vote helps small teams make a decision without letting the first opinion set the direction. A host defines two to four options and weighted criteria, then shares a room link. Participants score independently. The host reveals weighted group results, sees which option and criterion drew the widest spread, and records a decision, rationale, and next action.

The homepage has a complete interactive example using fictional participants. Create a room to use the real, persistent workflow with teammates. Anyone with the room link and a DeepSpace sign-in can join. Treat the link as an invitation and share it with the intended group.

## DeepSpace features

| Feature | Role in Quiet Vote |
| --- | --- |
| DeepSpace Auth | Verifies the caller in the worker. Room membership, one ballot per account, and host permissions use this identity. |
| DeepSpace `BaseRoom` | Manages the hibernating WebSocket lifecycle. A committed room change sends a one-byte notification so peers can fetch a fresh, caller-specific view. |
| DeepSpace `PresenceRoom` | Lists the room members who are currently connected. Online status is ephemeral and ballot submission is durable. |
| DeepSpace deploy and SQLite-backed Durable Object bindings | Provisions an isolated `DecisionRoom` for each room ID, preserving ballots and the final decision across reloads. |

## Design and tradeoffs

- The server stores one bounded SQLite snapshot per room and performs each read, phase check, and write synchronously in the same object. A late ballot is either committed before reveal or rejected after it. The public view never includes another person's ballot. After reveal, members get aggregates and notes without author labels. Small groups can sometimes infer authors from context or from the aggregates.
- The weighted result is the sum of each criterion's mean score multiplied by its weight, divided by the sum of the weights. The widest range is a prompt for discussion. The host can choose any option and records why.
- Room configuration is fixed once the room is created so every participant scores the same ballot. Reveal is final. The host can reveal after one submission and sees a confirmation if anyone is still waiting. Rooms support up to 12 participants.
- An unguessable link keeps sharing simple. A next step for repeated organizational use would be revocable invites and a room directory with retention controls. The core flow has no third-party API calls, external provider keys, or generated recommendations.

## Run and verify

Use Node 24 and npm 11.6 or newer.

```sh
npm ci
npx deepspace auth login
npx deepspace dev start
npm run validate
npx deepspace test run all
```

The two-browser test uses two local DeepSpace test accounts. Provision them using `npx deepspace test accounts create --help`, then run the suite. The test covers room creation, invite join, private ballots, an unauthorized reveal, live updates, late-vote rejection, results, and a saved decision after reload. The public smoke test exercises the example on a narrow viewport.

Use the homepage for a quick walkthrough. Select scores for the nine cells, submit the ballot, reveal results, and record a decision and next step. For the team path, repeat with two separate signed-in browser profiles.
