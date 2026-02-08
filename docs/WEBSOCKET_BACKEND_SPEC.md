# WEBSOCKET_BACKEND_SPEC

## Cliente -> servidor

### session.hello
```json
{ "type": "session.hello", "payload": { "playerId": "opcional", "name": "opcional" } }
```

### session.ping
```json
{ "type": "session.ping", "payload": { "sentAt": 1730000000000 } }
```

### lobby.create_private
```json
{ "type": "lobby.create_private", "payload": { "name": "Player 1" } }
```

### lobby.join_by_code
```json
{ "type": "lobby.join_by_code", "payload": { "roomCode": "AB12CD", "name": "Player 2" } }
```

### lobby.select_character
```json
{ "type": "lobby.select_character", "payload": { "characterId": "pyra_blaze" } }
```

### lobby.ready
```json
{ "type": "lobby.ready", "payload": { "ready": true } }
```

### match.input
```json
{ "type": "match.input", "payload": { "seq": 10, "moveX": 0.5, "moveZ": -0.2, "power": 0.9, "spin": 0.1 } }
```

### ability.activate
```json
{ "type": "ability.activate", "payload": { "abilityId": "flame_drive" } }
```

## Servidor -> cliente

### lobby.room_state
```json
{
  "type": "lobby.room_state",
  "payload": {
    "roomId": "uuid",
    "roomCode": "AB12CD",
    "status": "waiting",
    "players": [
      { "playerId": "p1", "name": "Player 1", "slot": 1, "ready": false, "characterId": null }
    ]
  }
}
```

### match.state_snapshot
```json
{
  "type": "match.state_snapshot",
  "payload": {
    "tick": 123,
    "ball": { "x": 0, "y": 1, "z": 0, "vx": 0.02, "vy": 0, "vz": 0.03, "spin": 0.1 },
    "players": [
      { "playerId": "p1", "x": 2, "z": 1, "abilityCooldownMs": 0 },
      { "playerId": "p2", "x": -1, "z": 0, "abilityCooldownMs": 5000 }
    ],
    "score": {
      "sets": [0, 0],
      "games": [1, 0],
      "points": ["30", "15"],
      "serverPlayerId": "p1"
    }
  }
}
```
