# RoomPlan Scanner Server

Server to receive and display room scans from the BabylonJS app.

## Start

```bash
cd server
npm install
npm start
```

The server will be available at `http://localhost:3001`.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload scan files (.usdz + .json) |
| GET | `/api/scans` | List all scans |
| GET | `/api/scans/:name/:file` | Download a single file |
| DELETE | `/api/scans/:name` | Delete a scan |

## Web Dashboard

Open `http://localhost:3001` in your browser to view the dashboard with the table of received scans.

## Configuration

Make sure to update the server IP in `demo/src/constants.ts`:

```typescript
export const ROOM_SCAN_SERVER_URL = 'http://YOUR_NGROK_URL';
```
