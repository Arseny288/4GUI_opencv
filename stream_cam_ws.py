# stream_cam_ws.py
import time
import cv2
import websocket  # pip install websocket-client

# ✅ изменённые строки
SERVER_WS = "ws://localhost:8080/ws"  # твой сервер (или IP, если не на том же устройстве)
TOKEN     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhcnNlbiIsImlhdCI6MTc2MjkwNDI0MiwiZXhwIjoxNzYzNTA5MDQyfQ.l_fG5Isgcgm2KZIv04kdfyE5y0mqixnLIRCJj1__Si0"
STREAM_ID = "A"
CAM_INDEX = 0                                # номер камеры в системе
WIDTH, HEIGHT = 640, 480                     # желаемое разрешение
JPEG_QUALITY = 80                            # 1..100
FPS_LIMIT = 20                               # ограничение FPS (0 = без ограничения)

def open_camera(index=0, width=None, height=None):
    cap = cv2.VideoCapture(index)
    if width:  cap.set(cv2.CAP_PROP_FRAME_WIDTH,  width)
    if height: cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    return cap

def open_ws():
    url = f"{SERVER_WS}?role=ingest&stream={STREAM_ID}&token={TOKEN}"
    ws = websocket.create_connection(url, timeout=10)
    return ws

def main():
    cap = open_camera(CAM_INDEX, WIDTH, HEIGHT)
    if not cap.isOpened():
        raise RuntimeError("Cannot open camera")

    backoff = 1.0
    ws = None
    last_ts = 0.0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.05)
                continue

            # FPS throttle
            if FPS_LIMIT > 0:
                now = time.time()
                if now - last_ts < 1.0 / FPS_LIMIT:
                    time.sleep(max(0, 1.0/FPS_LIMIT - (now - last_ts)))
                last_ts = time.time()

            # Encode to JPEG
            ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            if not ok:
                continue
            data = buf.tobytes()

            # Lazy connect / reconnect
            try:
                if ws is None:
                    ws = open_ws()
                    backoff = 1.0
                ws.send_binary(data)
            except Exception:
                try:
                    if ws:
                        ws.close()
                finally:
                    ws = None
                time.sleep(backoff)
                backoff = min(backoff * 2.0, 10.0)
    except KeyboardInterrupt:
        pass
    finally:
        if ws:
            try: ws.close()
            except: pass
        cap.release()

if __name__ == "__main__":
    main()

