# RoomPlan Scanner Server

Server per ricevere e visualizzare le scansioni delle stanze dall'app BabylonJS.

## Avvio

```bash
cd server
npm install
npm start
```

Il server sarà disponibile su `http://localhost:3001`.

## API

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/api/upload` | Upload file di scansione (.usdz + .json) |
| GET | `/api/scans` | Lista tutte le scansioni |
| GET | `/api/scans/:name/:file` | Download singolo file |
| DELETE | `/api/scans/:name` | Elimina una scansione |

## Dashboard Web

Apri `http://localhost:3001` nel browser per visualizzare la dashboard con la tabella delle scansioni ricevute.

## Configurazione

Assicurati di aggiornare l'IP del server nel file `demo/src/constants.ts`:

```typescript
export const ROOM_SCAN_SERVER_URL = 'http://TUO_IP:3001';
```
