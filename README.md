# 📘 Full Guide: Multi-Stream Video Server + Raspberry Pi Ingest (Node.js + WebSockets)

This guide explains how to:

- Install Node.js on macOS  
- Run a secure WebSocket video ingest server  
- Configure environment variables  
- Stream two video feeds (A and B) from a Raspberry Pi  
- View video streams in a dashboard  
- Use a simple token-based authentication system  

Designed for a Raspberry Pi + macOS setup.

---

## 🚀 1. Install Node.js on macOS

### Option 1 — Install via Homebrew (recommended)
```
brew update
brew install node
```

Verify installation:
```
node -v
npm -v
```

### Option 2 — Install using NVM
```
# Download and install nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# in lieu of restarting the shell
\. "$HOME/.nvm/nvm.sh"

# Download and install Node.js:
nvm install 24

# Verify the Node.js version:
node -v # Should print "v24.11.1".

# Verify npm version:
npm -v # Should print "11.6.2".

```

---

## 📂 2. Clone Your GitHub Repository
```
git clone https://github.com/Arseny288/4GUI_opencv
cd js-stream
```

---

## 🔧 3. Install Project Dependencies
```
npm install
```

---

## 🔐 4. Create .env File
```
touch .env
```

Add:
```
SECRET_KEY=super_secret
ADMIN_USER=arsen
ADMIN_PASS=s3curePass!
PORT=8080
```

---

## 🖥 5. Project Structure
```
js-stream/
│ server.js
│ .env
│ package.json
│ package-lock.json
│ README.md
└── public/
    │ dashboard.html
    │ login.html
```

---

## 🟣 6. Start the Node.js Server

```
npm run dev
```

Expected output:
```
Server started on 0.0.0.0:8080
```

Dashboard URL:
```
http://<your-mac-ip>:8080/public/dashboard.html
```

Example:
```
http://192.168.1.148:8080/public/dashboard.html
```

---

## 🟢 7. Raspberry Pi Setup

### 7.1 Install Python & venv
```
sudo apt update
sudo apt install python3 python3-venv python3-pip -y
```

### 7.2 Create venv
```
python3 -m venv venv
source venv/bin/activate
```

### 7.3 Install packages
```
pip install opencv-python websocket-client
```

---

## 📹 8. Raspberry Pi Dual Video Stream Script

Create file `dual_stream.py`:

```python
import time
import cv2
import websocket

SERVER_WS = "ws://<MAC_IP>:8080/ws"
TOKEN = "super_secret"
STREAM_A = "A"
STREAM_B = "B"
CAM_INDEX = 0
WIDTH, HEIGHT = 640, 480
JPEG_QUALITY_COLOR = 80
JPEG_QUALITY_GRAY = 80
FPS_LIMIT = 20

def open_camera(index, width, height):
    cap = cv2.VideoCapture(index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    return cap

def open_ws(stream_id):
    url = f"{SERVER_WS}?role=ingest&stream={stream_id}&token={TOKEN}"
    return websocket.create_connection(url, timeout=10)

def main():
    cap = open_camera(CAM_INDEX, WIDTH, HEIGHT)

    if not cap.isOpened():
        raise RuntimeError("Cannot open camera")

    ws_a = ws_b = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok: continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            okA, bufA = cv2.imencode(".jpg", frame, [1, JPEG_QUALITY_COLOR])
            okB, bufB = cv2.imencode(".jpg", gray, [1, JPEG_QUALITY_GRAY])

            if not (okA and okB):
                continue

            dataA = bufA.tobytes()
            dataB = bufB.tobytes()

            if ws_a is None:
                ws_a = open_ws(STREAM_A)
            try:
                ws_a.send_binary(dataA)
            except:
                ws_a = None

            if ws_b is None:
                ws_b = open_ws(STREAM_B)
            try:
                ws_b.send_binary(dataB)
            except:
                ws_b = None

            time.sleep(1.0 / FPS_LIMIT)

    except KeyboardInterrupt:
        pass
    finally:
        if ws_a: ws_a.close()
        if ws_b: ws_b.close()
        cap.release()

if __name__ == "__main__":
    main()
```

Replace `<MAC_IP>` with your actual IP, example:
```
192.168.1.148
```

---

## ▶️ 9. Running Raspberry Pi Streamer

```
source venv/bin/activate
python3 dual_stream.py
```

Server output should show:
```
ingest connected: stream=A
ingest connected: stream=B
```

---

## 🖼 10. Viewing Video Streams

Open:
```
http://192.168.1.148:8080/public/dashboard.html
```

In dashboard:
```
<img src="/api/snapshot/A?token=super_secret">
<img src="/api/snapshot/B?token=super_secret">
```

---

# 🎉 DONE!

Your system is now working:

- Raspberry Pi streams two channels  
- Node.js server receives frames  
- Dashboard displays them live  
- Authentication via token works  
- Everything runs on the local network  

If you want, I can also generate:  
✅ `dashboard.html`  
✅ Tailwind-based UI  
✅ full admin panel  

Just say **"create dashboard"**.
