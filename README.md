# JS Stream Server (4-Quadrant UI)

Features:
- 2 video streams (A/B) via WebSocket ingest/view (binary JPEG)
- Quadrant UI: Stream A, Stream B, Robot Control (WASD/Arrows), Logs
- JWT login (/auth/login)
- REST: POST /api/robot/:id/control (action, speed)
- WS roles: ?role=ingest|view|logs|robot on /ws
- GUI selectors: WS Base URL, Stream IDs (A/B), Robot ID

## Run

```bash
# unzip and enter folder
npm i
export SECRET_KEY='super_secret'
export ADMIN_USER='arsen'
export ADMIN_PASS='s3curePass!'
npm run dev
# open http://localhost:8080/public/login.html
```

## Raspberry Pi ingest

Connect your JPEG sender to:
```
ws://SERVER:8080/ws?role=ingest&stream=A&token=<JWT>
ws://SERVER:8080/ws?role=ingest&stream=B&token=<JWT>
```

## Robot WS client

Connect your robot receiver to:
```
ws://SERVER:8080/ws?role=robot&robot_id=r1&token=<JWT>
```
Then parse JSON `{robot_id, action, speed}` and drive GPIO/motors accordingly.

## Notes
- Put Nginx/Caddy with TLS for HTTPS/WSS in production.
- Token roles/expiry can be extended if needed.
# 4GUI_opencv
