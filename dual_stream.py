import time
import cv2
import websocket  # pip install websocket-client

# ---- CONFIG ----
SERVER_WS = "ws://192.168.1.148:8080/ws"  # твой сервер (или IP, если не на том же устройстве)
TOKEN = "super_secret"
STREAM_A  = "A"                        # цветной поток
STREAM_B  = "B"                        # Ч/Б поток
CAM_INDEX = 0
WIDTH, HEIGHT = 640, 480
JPEG_QUALITY_COLOR = 80               # качество JPEG для цветного
JPEG_QUALITY_GRAY  = 80               # качество JPEG для ч/б
FPS_LIMIT = 20                        # 0 = без ограничения
# ---------------

def open_camera(index=0, width=None, height=None):
    cap = cv2.VideoCapture(index)
    if width:  cap.set(cv2.CAP_PROP_FRAME_WIDTH,  width)
    if height: cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    # попытка форснуть MJPG (быстрее на USB)
    try:
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    except Exception:
        pass
    return cap

def open_ws(stream_id):
    url = f"{SERVER_WS}?role=ingest&stream={stream_id}&token={TOKEN}"
    return websocket.create_connection(url, timeout=10)

def main():
    cap = open_camera(CAM_INDEX, WIDTH, HEIGHT)
    if not cap.isOpened():
        raise RuntimeError("Cannot open camera")

    ws_a, ws_b = None, None
    backoff_a = backoff_b = 1.0
    last_ts = 0.0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.01)
                continue
            print(frame)
            # ограничение FPS
            if FPS_LIMIT > 0:
                now = time.time()
                need = 1.0 / FPS_LIMIT
                if now - last_ts < need:
                    time.sleep(max(0, need - (now - last_ts)))
                last_ts = time.time()

            # ---- encode color (A)
            okA, bufA = cv2.imencode(
                ".jpg", frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY_COLOR]
            )
            if not okA:
                continue
            dataA = bufA.tobytes()

            # ---- encode grayscale (B)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)  # 1-канальный
            okB, bufB = cv2.imencode(
                ".jpg", gray,
                [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY_GRAY]
            )
            if not okB:
                continue
            dataB = bufB.tobytes()

            # ---- send A
            try:
                if ws_a is None:
                    ws_a = open_ws(STREAM_A)
                    backoff_a = 1.0
                ws_a.send_binary(dataA)
            except Exception:
                try:
                    if ws_a: ws_a.close()
                finally:
                    ws_a = None
                time.sleep(backoff_a)
                backoff_a = min(backoff_a * 2.0, 10.0)

            # ---- send B
            try:
                if ws_b is None:
                    ws_b = open_ws(STREAM_B)
                    backoff_b = 1.0
                ws_b.send_binary(dataB)
            except Exception:
                try:
                    if ws_b: ws_b.close()
                finally:
                    ws_b = None
                time.sleep(backoff_b)
                backoff_b = min(backoff_b * 2.0, 10.0)

    except KeyboardInterrupt:
        pass
    finally:
        for ws in (ws_a, ws_b):
            try:
                if ws: ws.close()
            except: 
                pass
        cap.release()

if __name__ == "__main__":
    main()
